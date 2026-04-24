# PROJECT

## Collector (`src/collector.js`)
OPC UA 노드 값을 주기적으로 읽어 Machbase TAG 테이블에 저장. 연결 실패 시 다음 주기에 자동 재연결. `setInterval` 콜백 전체가 `try/catch`로 감싸져 루프 중단 없음.

**값 정규화 (`_normalizeValue`):** 기본 모드에서 `boolean` → 1/0, 그 외 숫자값은 `Number(value)` 강제 변환 후 `(num + bias) * multiplier` 적용 (calcOrder에 따라 순서 변경 가능).

**저장 모드:**
- 기본 모드: `valueColumn`이 숫자 컬럼이면 노드별로 1 row씩 append. 숫자와 boolean은 `valueColumn`에 저장하고, `stringValueColumn`이 있으면 숫자/boolean이 아닌 값은 문자열로 변환해 그 컬럼에 저장한다. TAG 제약 때문에 이 경우 `valueColumn`에는 `0` placeholder를 기록한다.
- JSON 모드: `valueColumn`이 JSON 컬럼이면 collector당 1 row씩 append. TAG primary key 컬럼은 collector 이름을 사용하고, payload key는 `opcua.nodes[].name`. boolean은 `true/false`를 유지하고, 개별 노드 읽기 실패는 해당 key를 `null`로 기록.
- String-only 모드: `stringOnly: true`이면 `valueColumn` 없이 모든 노드 값을 `String(value)`로 변환해 `stringValueColumn`에 저장한다. `valueColumn`은 생략하거나 빈 문자열(`""`)로 보낼 수 있다. `stringValueColumn`은 필수 `VARCHAR` 컬럼이고, NULL이 불가능한 `SUMMARIZED` value 컬럼이 있는 테이블에는 사용할 수 없다.
- TAG key/time 컬럼: `MachbaseStream.open()`이 `FLAG_PRIMARY` / `FLAG_BASETIME`으로 primary key와 basetime 컬럼명을 감지한다. 플래그가 없을 때만 기존 호환용으로 `NAME` / `TIME` 컬럼명을 fallback으로 사용한다.

**onChanged 초기값 로드:** 수집 성공 시마다 마지막 수집 시각을 `data/{name}.last-time.json`에 저장 (`close()` 시에도 한 번 더). `start()` 시 해당 파일을 읽어 basetime 컬럼 기준 `ORDER BY ... DESC` 단일 쿼리로 `onChanged: true` 노드의 최신 값을 일괄 조회해 `_previousValues`를 초기화. 파일 없거나 쿼리 실패 시 무시하고 빈 상태로 시작.

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

| 항목 | 설명 |
|------|------|
| `opcua.endpoint` | OPC UA 서버 주소 |
| `opcua.interval` | 수집 주기 (ms) |
| `opcua.nodes[].nodeId` | 수집 노드 ID |
| `opcua.nodes[].name` | 기본 모드에서는 Machbase TAG primary key 값, JSON 모드에서는 payload key |
| `opcua.nodes[].bias` / `multiplier` | 값 변환 오프셋·배율 |
| `opcua.nodes[].calcOrder` | 계산 순서. `"bm"` (기본): `(value+bias)*multiplier` / `"mb"`: `value*multiplier+bias` |
| `opcua.nodes[].onChanged` | `true`이면 이전 값과 달라졌을 때만 append (기본 false) |
| `db` | 등록된 DB 서버 이름 |
| `dbTable` | 저장 테이블명 |
| `valueColumn` | 주 저장 컬럼. 숫자 컬럼 또는 JSON 컬럼 |
| `stringValueColumn` | 기본 모드에서 비숫자 값을 저장할 선택적 `VARCHAR` 컬럼 |
| `stringOnly` | `true`이면 `valueColumn` 없이 모든 값을 `stringValueColumn`에 저장 |
| `log.level` | trace·debug·info·warn·error (기본 info) |
| `log.maxFiles` | 보관 최대 파일 수 (기본 10) |
