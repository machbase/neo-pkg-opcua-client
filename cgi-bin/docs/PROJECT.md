# PROJECT

## Collector (`src/collector.js`)
OPC UA 노드 값을 주기적으로 읽어 Machbase TAG 테이블에 저장. 연결 실패 시 다음 주기에 자동 재연결. `setInterval` 콜백 전체가 `try/catch`로 감싸져 루프 중단 없음.

**값 정규화 (`_normalizeValue`):** 기본 모드에서 `boolean` → 1/0, 그 외 숫자값은 `Number(value)` 강제 변환 후 `(num + bias) * multiplier` 적용 (calcOrder에 따라 순서 변경 가능).

**저장 모드:**
- 기본 모드: `valueColumn`이 숫자 컬럼이면 노드별로 1 row씩 append. 숫자와 boolean은 `valueColumn`에 저장하고, `stringValueColumn`이 있으면 숫자/boolean이 아닌 값은 문자열로 변환해 그 컬럼에 저장한다. TAG 제약 때문에 이 경우 `valueColumn`에는 `0` placeholder를 기록한다.
- JSON 모드: `valueColumn`이 JSON 컬럼이면 collector당 1 row씩 append. TAG primary key 컬럼은 collector 이름을 사용하고, payload key는 `opcua.nodes[].name`. boolean은 `true/false`를 유지한다. bad status source는 기본적으로 payload key를 만들지 않고, `badStatusPolicy: "ignore"`일 때만 statusCode를 무시하고 value를 저장한다.
- String-only 모드: `stringOnly: true`이면 `valueColumn` 없이 모든 노드 값을 `String(value)`로 변환해 `stringValueColumn`에 저장한다. `valueColumn`은 생략하거나 빈 문자열(`""`)로 보낼 수 있다. `stringValueColumn`은 필수 `VARCHAR` 컬럼이고, NULL이 불가능한 `SUMMARIZED` value 컬럼이 있는 테이블에는 사용할 수 없다.
- TAG key/time 컬럼: `MachbaseStream.open()`이 `FLAG_PRIMARY` / `FLAG_BASETIME`으로 primary key와 basetime 컬럼명을 감지한다. 플래그가 없을 때만 기존 호환용으로 `NAME` / `TIME` 컬럼명을 fallback으로 사용한다.

**Derived Tags:** `derivedTags[]`가 있으면 같은 `opcua.read()` cycle의 source tag 값으로 수식을 계산해 추가 tag를 생성한다. 기본 모드에서는 source row 뒤에 derived row를 추가 append하고, JSON 모드에서는 같은 payload에 derived key를 추가한다. `stringOnly` 모드에서는 지원하지 않는다. 수식은 `src/expression/evaluator.js`에서 `eval` 없이 compile/evaluate하며, 변수 alias는 `A`-`Z` 한 글자 대문자만 허용한다.

**시간 정책:** `timePolicy` 생략 시 `"sourceTime"`이다. `"sourceTime"`은 OPC UA `sourceTimestamp`를 우선 사용하고 없으면 해당 read 요청 직전의 system time을 사용한다. derived tag의 timestamp는 `timeSource` alias 또는 `"latest"` 기준으로 고른다. `"requestTime"`은 source/derived 전체 row에 한 read 요청 직전 system time을 동일하게 사용한다.

**Bad status 정책:** `badStatusPolicy` 생략 시 `"skip"`이다. `"skip"`은 bad status source row 또는 JSON payload key를 저장하지 않는다. `"ignore"`는 statusCode를 무시하고 value가 있으면 일반 값처럼 저장/연산에 사용한다. bad status source를 derived tag가 참조할 때 `"skip"`이면 입력값 누락으로 보고 `derivedTags[].onError` 정책을 적용한다.

**onChanged 초기값 로드:** 수집 성공 시마다 마지막 수집 시각을 `data/{name}.last-time.json`에 저장 (`close()` 시에도 한 번 더). 이 파일은 마지막 수집 시각 표시용이며 상태 복원 경계로 사용하지 않는다. `start()` 시 기본/string 모드는 `onChanged: true` source tag마다 `SCAN_BACKWARD + WHERE primary = ? + LIMIT 1`로 최신 저장값을 읽고, JSON 모드는 collector primary key의 최신 payload 1건을 읽어 `_previousValues`를 초기화한다. 저장값이 없거나 쿼리 실패 시 해당 상태는 빈 상태로 시작한다.

**Derived 상태 초기값 로드:** `derivedTags[].onError`가 `"previous"`이거나 `onChanged`가 `true`인 tag는 `start()` 시 DB에서 최신 값을 초기화한다. 기본 모드는 tag별로 `WHERE primary = ? LIMIT 1` 조회를 각각 실행하며 `IN` 조건을 쓰지 않는다. JSON 모드는 collector primary key의 최신 payload 1건에서 derived key를 읽는다. 같은 tag가 두 조건에 모두 해당하면 한 조회 결과로 previous와 onChanged 상태를 함께 초기화한다. 유한한 숫자만 `onError: "previous"` 값으로 인정한다.

**로그 레벨 원칙:**
- `error`: 현재 수집 cycle 자체가 실패한 경우
- `warn`: 자동 재시도, 부분 실패, 데이터 누락 가능성이 있는 경우
- `info`: 시작/종료/연결 성공 같은 상태 전이
- `debug`: 운영 기본 로그에는 과한 내부 상태 요약
- `trace`: per-cycle, per-node 상세

**반복 warn 정책:** 같은 원인이 반복되면 첫 발생은 즉시 `warn`으로 남기고, 이후에는 `suppressedCount`, `durationSec`, `repeated=true`를 포함한 요약 `warn`만 주기적으로 출력한다. OPC UA reconnect, DB reopen처럼 복구가 확인되면 `recovered=true`를 포함한 `info`를 남긴다.

## OpcuaClient (`src/opcua/opcua-client.js`)
OPC UA 서버 연결·읽기·쓰기·노드 탐색 클라이언트. `open()` 실패 시 `false` 반환, 나머지 메소드는 실패 시 예외 throw.

주요 메서드:

| 메서드 | 설명 |
|--------|------|
| `open()` | 서버 연결. 성공 `true`, 실패 `false` |
| `read(req)` | 노드 값 읽기 |
| `write(req)` | 노드 값 쓰기 |
| `browse(req)` | 지정 노드 직접 자식 목록 조회 (continuationPoint 포함) |
| `browseNext(req)` | browse continuationPoint 이어 조회 |
| `attributes(req)` | 노드 속성 일괄 조회 (`{ requests: [{node, attributeId}] }`) |
| `close()` | 연결 종료 |

`NodeClass`, `AttributeID` 상수는 `OpcuaClient.NodeClass`, `OpcuaClient.AttributeID` 로 export됨.

## Logger (`src/lib/logger.js`)
크기 기반 로테이션 파일 로거. 10 MB 초과 시 현재 파일을 datetime으로 rename(`repli_20260415_034234.log`)하고 새 `repli.log` 에 이어씀. `maxFiles` 초과 시 오래된 파일부터 삭제.

출력 형식: `[LEVEL] YYYY-MM-DD HH:MM:SS.sss  stage  msg  (key=value ...)`

## 설정 (`conf.d/{name}.json`) 주요 항목

설정 파일을 읽거나 저장할 때마다 새 기본 collector config를 만든 뒤 저장된 값을 중첩해서 덮어쓴다. 따라서 이전 버전 설정에 신규 필드가 없어도 `timePolicy`, `badStatusPolicy`, `derivedTags`, `opcua.interval`, `opcua.readRetryInterval`, `opcua.nodes`, `log.level`, `log.maxFiles` 기본값이 적용되며 새로 저장하는 파일에도 기본값이 기록된다. 원본 설정 객체와 중첩 배열은 공유하지 않는다.

Collector 수정 API는 `기본값 -> 기존 config -> 요청 config` 순서로 병합한다. FE가 알지 못하는 backend 설정과 향후 추가 필드는 요청에서 생략해도 유지된다. `opcua`와 `log`는 하위 필드 단위로 병합하고, 배열은 요청에 명시한 경우 전체 교체한다. 따라서 `derivedTags: []`는 계산 tag 전체 삭제를 뜻한다.

| 항목 | 설명 |
|------|------|
| `opcua.endpoint` | OPC UA 서버 주소 |
| `opcua.interval` | 수집 주기 (ms) |
| `opcua.nodes[].nodeId` | 수집 노드 ID |
| `opcua.nodes[].name` | 기본 모드에서는 Machbase TAG primary key 값, JSON 모드에서는 payload key |
| `opcua.nodes[].bias` / `multiplier` | 값 변환 오프셋·배율 |
| `opcua.nodes[].calcOrder` | 계산 순서. `"bm"` (기본): `(value+bias)*multiplier` / `"mb"`: `value*multiplier+bias` |
| `opcua.nodes[].onChanged` | `true`이면 이전 값과 달라졌을 때만 append (기본 false) |
| `timePolicy` | `"sourceTime"` 또는 `"requestTime"`. 생략 시 `"sourceTime"` |
| `badStatusPolicy` | `"skip"` 또는 `"ignore"`. 생략 시 `"skip"` |
| `derivedTags[].name` | 생성할 tag 이름. 기본 모드에서는 TAG primary key 값, JSON 모드에서는 payload key |
| `derivedTags[].expression` | alias 기반 수식 |
| `derivedTags[].variables` | alias-to-source-tag-name map. alias는 `A`-`Z` 한 글자 대문자 |
| `derivedTags[].timeSource` | `"latest"` 또는 variables alias. 생략 시 `"latest"` |
| `derivedTags[].onChanged` | `true`이면 derived 값이 달라졌을 때만 append |
| `derivedTags[].onError` | `"skip"`, `"null"`, `"value"`, `"previous"` |
| `derivedTags[].errorValue` | `onError: "value"`일 때 사용할 숫자 |
| `db` | 등록된 DB 서버 이름 |
| `dbTable` | 저장 테이블명 |
| `valueColumn` | 주 저장 컬럼. 숫자 컬럼 또는 JSON 컬럼 |
| `stringValueColumn` | 기본 모드에서 비숫자 값을 저장할 선택적 `VARCHAR` 컬럼 |
| `stringOnly` | `true`이면 `valueColumn` 없이 모든 값을 `stringValueColumn`에 저장 |
| `log.level` | trace·debug·info·warn·error (기본 info) |
| `log.maxFiles` | 보관 최대 파일 수 (기본 10) |

## 테스트 실행 구분

JSH 호환 단위 테스트는 `machbase-neo jsh .../cgi-bin/test/jsh-index.js`로 실행한다. `opcua-client`, `collector-logic`, `handler` suite는 Node의 module resolver/cache mocking을 사용하므로 Node 전체 runner(`node cgi-bin/test/index.js`)에서 실행한다. 실제 JSH의 OPC UA/DB/service 동작은 배포 API와 collector service 통합 테스트로 확인한다.

수식 hot path 성능은 `expression-benchmark.js`로 확인한다. 수식을 한 번 compile한 뒤 100만 회 평가하므로 collector의 실제 실행 방식과 같다.
