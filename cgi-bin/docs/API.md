# Collector CGI API

모든 요청/응답 본문은 `application/json`입니다.

**Base URL:** `/public/neo-pkg-opcua-client/cgi-bin/api`

**공통 응답 형식**

성공:
```json
{
  "ok": true,
  "data": {}
}
```

실패:
```json
{
  "ok": false,
  "reason": "오류 메시지"
}
```

---

## API 목록

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET    | [/health](#get-health) | 패키지 health 및 collector service 요약 |
| GET    | [/collector/list](#get-collectorlist) | collector 목록 조회 |
| POST   | [/collector/validate](#post-collectorvalidate) | collector config 저장 전 dry-run 검증 |
| POST   | [/collector](#post-collector) | collector 등록 |
| GET    | [/collector?name=](#get-collectorname) | collector config 조회 |
| PUT    | [/collector?name=](#put-collectorname) | collector config 수정 |
| DELETE | [/collector?name=](#delete-collectorname) | collector 삭제 |
| POST   | [/collector/install?name=](#post-collectorinstallname) | service install |
| GET    | [/collector/last-time?name=](#get-collectorlast-timename) | 마지막 수집 시간 조회 |
| POST   | [/collector/start?name=](#post-collectorstartname) | collector 시작 |
| POST   | [/collector/stop?name=](#post-collectorstopname) | collector 중지 |
| POST   | [/expression/validate](#post-expressionvalidate) | derived tag 수식 단독 검증 |
| POST   | [/db/server](#post-dbserver) | DB 서버 등록 |
| GET    | [/db/server?name=](#get-dbservername) | DB 서버 조회 |
| PUT    | [/db/server?name=](#put-dbservername) | DB 서버 수정 |
| DELETE | [/db/server?name=](#delete-dbservername) | DB 서버 삭제 |
| GET    | [/db/server/list](#get-dbserverlist) | DB 서버 목록 조회 |
| GET    | [/db/connect?server=](#get-dbconnectserver) | DB 연결 테스트 |
| POST   | [/db/table/create](#post-dbtablecreate) | TAG 테이블 생성 |
| GET    | [/db/table/list?server=](#get-dbtablelistserver) | TAG 테이블 목록 조회 |
| GET    | [/db/table/columns?server=&table=](#get-dbtablecolumnsservertable) | 테이블 컬럼 조회 |
| GET    | [/log/all](#get-logall) | 패키지 전체 로그 파일 목록 조회 |
| GET    | [/log/list?name=](#get-loglistname) | 특정 collector 로그 파일 목록 조회 |
| GET    | [/log/tail?name=&intervalMs=](#get-logtailnameintervalms) | active 로그 파일 SSE tail |
| GET    | [/log/content?name=](#get-logcontentname) | 로그 파일 내용 조회 (줄 범위 지정) |
| GET    | [/log/content/all?name=](#get-logcontentallname) | 로그 파일 전체 내용 조회 |
| POST   | [/opcua/server](#post-opcuaserver) | OPC UA 서버 등록 |
| GET    | [/opcua/server?name=](#get-opcuaservername) | OPC UA 서버 조회 |
| PUT    | [/opcua/server?name=](#put-opcuaservername) | OPC UA 서버 수정 |
| DELETE | [/opcua/server?name=](#delete-opcuaservername) | OPC UA 서버 삭제 |
| GET    | [/opcua/server/list](#get-opcuaserverlist) | OPC UA 서버 목록 조회 |
| POST   | [/opcua/connect](#post-opcuaconnect) | OPC UA 서버 접속 확인 |
| GET    | [/opcua/read?endpoint=&server=&nodes=](#get-opcuareadendpointservernodes) | OPC UA 노드 읽기 |
| POST   | [/opcua/write](#post-opcuawrite) | OPC UA 노드 쓰기 |
| POST   | [/opcua/node/descendants](#post-opcuanodedescendants) | OPC UA 노드 트리 탐색 |

---

## Health

### GET /health

패키지 상태 확인용 API입니다. `neo-pkg-opcua-client`는 패키지 단위의 메인 backend service가 없으므로 기존 공통 health 응답의 `status: "running"`과 `pid: 0`은 실제 collector process PID를 의미하지 않습니다.
실행 중인 collector service 요약은 `data.service_summary`에서 확인합니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "healthy": true,
    "status": "running",
    "pid": 0,
    "exit_code": null,
    "error": "",
    "service_summary": {
      "scope": "opcua-client",
      "total": 3,
      "running": 2,
      "errors": []
    }
  }
}
```

| 필드 | 설명 |
|------|------|
| `service_summary.scope` | service summary 대상 범위. OPC UA client는 `"opcua-client"` |
| `service_summary.total` | 설치된 OPC UA collector job service 전체 수 |
| `service_summary.running` | `RUNNING` 상태인 collector service 수 |
| `service_summary.errors` | service 조회 중 발생한 오류 목록 |

동작 기준:

- service 정보는 JSH `service.list()`를 우선 사용합니다.
- `service.list()`를 사용할 수 없거나 실패하면 service definition scan으로 fallback합니다.
- service 판별은 definition/config의 `executable`이 이 패키지의 `neo-collector.js`인지 먼저 확인합니다.
- `executable` 정보가 없으면 service name의 `"_opc_"` prefix를 fallback으로 사용합니다.
- service 조회 오류만으로 health API 자체를 실패 처리하지 않습니다. 조회 오류는 가능하면 `service_summary.errors`에 기록하고 `ok: true`를 유지합니다.

---

## Collector

### GET /collector/list

collector 목록을 반환합니다. config 파일 기준이며 service에 등록되지 않은 항목도 포함됩니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": [
    { "name": "collector-a", "installed": true,  "running": true  },
    { "name": "collector-b", "installed": false, "running": false }
  ]
}
```

| 필드 | 설명 |
|------|------|
| `installed` | service 등록 여부 |
| `running` | 현재 실행 중 여부 |

---

### POST /collector/validate

collector config를 저장하기 전에 dry-run으로 검증합니다. config 파일 저장, service install, table 생성, OPC UA server profile 자동 생성은 수행하지 않습니다. `POST /collector`, `PUT /collector?name=`도 같은 검증 규칙을 사용합니다. `mode: "update"`에서는 저장된 config에 요청 `config`를 병합한 결과를 검증하므로 변경할 필드만 전달할 수 있습니다.

**요청 본문**

```json
{
  "name": "collector-a",
  "mode": "create",
  "config": {
    "opcua": {
      "endpoint": "opc.tcp://127.0.0.1:4840",
      "interval": 5000,
      "nodes": [
        { "nodeId": "ns=1;s=Voltage", "name": "voltage" },
        { "nodeId": "ns=1;s=Current", "name": "current" }
      ]
    },
    "db": "my-server",
    "dbTable": "TAG",
    "valueColumn": "VALUE",
    "timePolicy": "sourceTime",
    "badStatusPolicy": "skip",
    "derivedTags": [
      {
        "name": "power",
        "expression": "A * B",
        "variables": {
          "A": "voltage",
          "B": "current"
        },
        "timeSource": "latest",
        "onError": "previous"
      }
    ]
  }
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `name` | Y | 검증할 collector 이름 |
| `mode` | N | `"create"` 또는 `"update"`. 기본값 `"create"` |
| `config` | Y | 검증할 collector config. `mode: "update"`이면 부분 config 허용 |

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "mode": "create",
    "effectiveTimePolicy": "sourceTime",
    "effectiveBadStatusPolicy": "skip",
    "derivedTags": [
      {
        "name": "power",
        "expression": "A * B",
        "variables": {
          "A": "voltage",
          "B": "current"
        },
        "usedVariables": ["A", "B"],
        "functions": [],
        "constants": [],
        "timeSource": "latest",
        "onChanged": false,
        "onError": "previous"
      }
    ],
    "warnings": [],
    "storage": {
      "storageMode": "default",
      "nullableDerived": true
    }
  }
}
```

`warnings`는 저장을 막지 않는 조건입니다. 예: expression에서 사용하지 않는 alias, `requestTime`에서 무시되는 `timeSource`.

---

### POST /expression/validate

Derived tag 수식만 단독으로 검증합니다. collector config, DB table, tag 존재 여부는 확인하지 않습니다. 화면에서 수식을 입력하는 동안 빠르게 검증할 때 사용합니다.

**요청 본문**

```json
{
  "expression": "A * B / C",
  "variables": {
    "A": "voltage",
    "B": "current",
    "C": "scale"
  },
  "sampleValues": {
    "A": 10,
    "B": 20,
    "C": 2
  }
}
```

`variables`는 collector config와 같은 alias-to-tag-name 형식입니다. `sampleValues`는 선택 항목이며, 지정하면 계산 preview 값이 `result`로 반환됩니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "result": 100,
    "usedVariables": ["A", "B", "C"],
    "functions": [],
    "constants": [],
    "supportedFunctions": ["abs", "ceil", "floor", "..."],
    "supportedConstants": ["<E>", "<PI>"]
  }
}
```

---

### POST /collector

새 collector를 등록합니다. config 저장 후 service install까지 수행합니다.

생략한 설정에는 backend 기본값을 적용하며, 정규화가 끝난 기본값까지 config 파일에 함께 저장합니다.

**요청 본문**

```json
{
  "name": "collector-a",
  "config": {
    "opcua": {
      "server": "opc-main",
      "interval": 5000,
      "readRetryInterval": 100,
      "nodes": [
        {
          "nodeId": "ns=3;i=1001",
          "name": "sensor.voltage",
          "bias": 0,
          "multiplier": 1.0,
          "onChanged": false
        },
        {
          "nodeId": "ns=3;i=1002",
          "name": "sensor.current",
          "bias": 0,
          "multiplier": 1.0,
          "onChanged": false
        }
      ]
    },
    "db": "my-server",
    "dbTable": "TAG",
    "autoCreateTable": false,
    "valueColumn": "VALUE",
    "stringValueColumn": "TEXT_VALUE",
    "timePolicy": "sourceTime",
    "badStatusPolicy": "skip",
    "derivedTags": [
      {
        "name": "sensor.power",
        "expression": "A * B",
        "variables": {
          "A": "sensor.voltage",
          "B": "sensor.current"
        },
        "timeSource": "latest",
        "onChanged": false,
        "onError": "skip"
      }
    ],
    "log": {
      "level": "info",
      "maxFiles": 7
    }
  }
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `name` | Y | collector 이름 |
| `config.opcua.server` | Y* | `/opcua/server`로 등록한 OPC UA 서버 이름 |
| `config.opcua.endpoint` | Y* | legacy 입력용 OPC UA 서버 주소. `server`가 없을 때만 사용하며, collector 저장 시 backend가 새 OPC UA server profile을 자동 생성하고 저장 config에서는 제거합니다 |
| `config.opcua.interval` | Y | 수집 주기 (ms) |
| `config.opcua.readRetryInterval` | N | 읽기 재시도 간격 (ms). 기본값 `100` |
| `config.opcua.nodes[].nodeId` | Y | OPC UA 노드 ID |
| `config.opcua.nodes[].name` | Y | 기본 모드에서는 TAG primary key 값, JSON 모드에서는 JSON key |
| `config.opcua.nodes[].bias` | N | 값에 더할 오프셋. 기본값 `0` |
| `config.opcua.nodes[].multiplier` | N | 값에 곱할 배율. 기본값 `1.0` |
| `config.opcua.nodes[].calcOrder` | N | `"bm"` (기본값): `(value + bias) * multiplier` / `"mb"`: `value * multiplier + bias` |
| `config.opcua.nodes[].onChanged` | N | `true`이면 이전 값과 달라졌을 때만 append. 기본값 `false` |
| `config.db` | Y | DB 서버 이름 (`/db/server`로 등록한 이름) |
| `config.dbTable` | Y | 데이터를 저장할 TAG 테이블명 |
| `config.autoCreateTable` | N | `true`이면 `config.dbTable` 이름의 TAG 테이블을 자동 생성합니다. 생략하면 `false`입니다 |
| `config.valueColumn` | N | 주 저장 컬럼명. 기본값 `"VALUE"`. 숫자 컬럼이면 기존 방식으로 append하고, JSON 컬럼이면 collector 단위 JSON row로 저장합니다 |
| `config.stringValueColumn` | N | 기본 모드에서 숫자/불린 외 값을 문자열로 저장할 `VARCHAR` 컬럼. TAG 제약 때문에 이 경우 `valueColumn`에는 `0` placeholder가 함께 저장됩니다 |
| `config.stringOnly` | N | `true`이면 `valueColumn` 없이 모든 값을 `stringValueColumn`에 문자열로 저장합니다. 이때 `stringValueColumn`은 필수이고, `valueColumn`은 생략하거나 빈 문자열(`""`)이어야 합니다 |
| `config.timePolicy` | N | source/derived tag timestamp 정책. `"sourceTime"` 또는 `"requestTime"`. 생략 시 `"sourceTime"` |
| `config.badStatusPolicy` | N | OPC UA bad status source 처리 정책. `"skip"` 또는 `"ignore"`. 생략 시 `"skip"` |
| `config.derivedTags[]` | N | 같은 OPC UA read cycle에서 읽은 source tag 값으로 계산해 추가 저장할 tag 정의 |
| `config.derivedTags[].name` | Y | 기본 모드에서는 생성할 TAG primary key 값, JSON 모드에서는 생성할 JSON key |
| `config.derivedTags[].expression` | Y | alias, 숫자, 연산자, 허용 함수, 상수로 구성된 수식 |
| `config.derivedTags[].variables` | Y | alias-to-source-tag-name map. alias는 `A`-`Z` 한 글자 대문자이며 값은 `config.opcua.nodes[].name` 중 하나 |
| `config.derivedTags[].timeSource` | N | `sourceTime`에서 derived tag timestamp 선택. `"latest"` 또는 variables alias. 생략 시 `"latest"` |
| `config.derivedTags[].onChanged` | N | `true`이면 이전에 저장한 derived 값과 달라졌을 때만 append. 기본값 `false` |
| `config.derivedTags[].onError` | N | 수식 계산 실패 처리. `"skip"`, `"null"`, `"value"`, `"previous"`. 기본값 `"skip"` |
| `config.derivedTags[].errorValue` | N | `onError: "value"`일 때 저장할 숫자 fallback |
| `config.log.level` | N | 로그 레벨. `trace`\|`debug`\|`info`\|`warn`\|`error`. 기본값 `"info"` |
| `config.log.maxFiles` | N | 보관할 최대 로그 파일 수. 기본값 `10` |

`config.opcua.server`와 `config.opcua.endpoint` 중 하나는 필요합니다. 둘 다 있으면 `server`가 우선이며 저장 config에서는 `endpoint`가 제거됩니다.

legacy `config.opcua.endpoint`만 전달하면 backend가 `{collectorName}-opcua` 이름의 OPC UA server profile을 자동 생성합니다. 같은 이름이 이미 있으면 `{collectorName}-opcua-2`, `{collectorName}-opcua-3` 순서로 비어 있는 이름을 사용합니다. 자동 생성된 profile의 `security.enabled`는 `false`입니다.

#### Derived Tags

`derivedTags`는 한 번의 `opcua.read()` 결과에서 읽은 source tag 값으로 새 tag 값을 계산합니다. 다른 collector의 tag나 이전 cycle의 source tag 값은 참조하지 않습니다.

수식 규칙:

- 변수는 `variables`에 선언한 alias만 사용할 수 있습니다. alias는 `A`-`Z` 한 글자 대문자입니다.
- tag 이름은 수식에 직접 쓰지 않고 `variables` 값으로만 지정합니다.
- 지원 연산자는 `+`, `-`, `*`, `/`, `%`, 괄호, unary `+/-`입니다.
- 지원 상수는 `<PI>`, `<E>`입니다. plain `PI`, `E`는 사용하지 않습니다.
- 지원 함수는 `abs`, `ceil`, `floor`, `round`, `trunc`, `min`, `max`, `sqrt`, `pow`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `log`, `log2`, `log10`, `exp`입니다.
- `stringOnly: true`에서는 `derivedTags`를 사용할 수 없습니다.

시간 정책:

- `timePolicy: "sourceTime"`: 기존 호환 기본값입니다. source tag는 OPC UA `sourceTimestamp`를 우선 사용하고, 없으면 해당 read 요청 시각을 사용합니다. derived tag는 `timeSource`를 따릅니다.
- `timePolicy: "requestTime"`: 한 read 요청 직전의 system time을 source/derived 전체 row에 동일하게 사용합니다. 이 경우 `timeSource`는 무시됩니다.
- `timeSource: "latest"`: 해당 derived tag의 `variables`에 선언된 source tag timestamp 중 가장 최근 시간을 사용합니다. expression에서 사용하지 않은 alias도 timestamp 선택에 참여할 수 있습니다.

Bad status 정책:

- `badStatusPolicy: "skip"`: 기본값입니다. OPC UA read 결과가 bad status이면 source row 또는 JSON payload key를 저장하지 않습니다. derived tag에서 해당 source를 사용하면 입력값 누락으로 보고 `derivedTags[].onError` 정책을 적용합니다.
- `badStatusPolicy: "ignore"`: OPC UA statusCode를 무시하고 read 결과의 `value`를 일반 값처럼 변환해 저장/연산에 사용합니다. value가 없거나 변환할 수 없으면 기존 unsupported value 처리 또는 `derivedTags[].onError`가 적용됩니다.

Derived 오류 정책:

- `onError: "skip"`: 계산 실패 시 append하지 않습니다.
- `onError: "null"`: 계산 실패 시 NULL을 저장합니다. `SUMMARIZED` value column에서는 사용할 수 없습니다.
- `onError: "value"`: 계산 실패 시 `errorValue` 숫자를 저장합니다.
- `onError: "previous"`: 마지막으로 계산에 성공한 derived 값을 저장합니다. collector 시작 시 DB에서 tag별 최신 값을 1건씩 조회해 초기화하며, 값이 없으면 `skip`처럼 동작합니다.
- `onChanged: true`인 derived tag도 collector 시작 시 DB의 최신 저장값으로 비교 상태를 복원합니다. `onError: "previous"`와 함께 사용하면 같은 조회 결과로 두 상태를 초기화합니다.
- source/derived tag 이름과 `variables`의 tag 이름은 저장 전에 앞뒤 공백을 제거합니다.

#### 자동 테이블 생성

`config.autoCreateTable`이 `true`이면 backend가 현재 DB 접속 사용자 소유의 live table만 확인합니다. `M$SYS_TABLES.DATABASE_ID = -1`인 테이블만 대상으로 하며, mounted backup table은 read-only이므로 기존 테이블로 간주하지 않습니다.

자동 생성되는 스키마는 다음과 같습니다.

```sql
CREATE TAG TABLE TABLE_NAME (
  NAME VARCHAR(N) PRIMARY KEY,
  TIME DATETIME BASETIME,
  VALUE DOUBLE SUMMARIZED,
  STR_VALUE VARCHAR(1024)
)
```

- `TABLE_NAME`은 `config.dbTable`을 대문자로 변환한 값입니다.
- `N`은 `max(80, config.opcua.nodes[].name 및 config.derivedTags[].name 최대 길이)`을 5 단위로 올림한 값입니다.
- 저장되는 collector config에서는 `autoCreateTable`이 제거되고, `dbTable`, `valueColumn`, `stringValueColumn`, `stringOnly`이 각각 `TABLE_NAME`, `"VALUE"`, `"STR_VALUE"`, `false`로 정규화됩니다.
- `autoCreateTable: true`인데 현재 사용자 소유 live table이 이미 있으면 collector 생성은 실패합니다.
- `autoCreateTable: true`에서 생성되는 `VALUE`는 `DOUBLE SUMMARIZED`이므로 `derivedTags[].onError: "null"`은 사용할 수 없습니다.
- table 생성에 실패하면 collector config 저장과 service install은 수행하지 않습니다.
- table 생성 후 service install에 실패하면 이번 요청에서 생성한 table만 `DROP TABLE TABLE_NAME CASCADE`로 정리합니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "collector-a"
  }
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| `config` 누락 | `"config is required"` |
| 동일한 이름 이미 존재 | `"collector 'xxx' already exists"` |
| `config.opcua.server`/`config.opcua.endpoint` 누락 | `"config.opcua.server or config.opcua.endpoint is required"` |
| 지정한 OPC UA server profile 없음 | `"opcua server 'xxx' not found"` |
| 자동 생성 대상 테이블 이미 존재 | `"table 'TABLE_NAME' already exists; select the existing table instead of auto-create"` |
| 자동 생성 실패 | `"create table failed: TABLE_NAME: ..."` |

---

### GET /collector?name=

collector config를 조회합니다. 저장 파일에 신규 설정이 없는 legacy config도 backend 기본값을 병합한 결과를 반환합니다. 이 조회 과정은 저장 파일 자체를 변경하지 않습니다.

기존 legacy config는 `opcua.endpoint`가 그대로 보일 수 있습니다. 조회 API는 endpoint를 server profile로 자동 변환하지 않으며, 생성/수정 저장 시에만 `opcua.server` 형식으로 정규화합니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "collector-a",
    "config": {
      "opcua": {
        "server": "opc-main",
        "interval": 5000,
        "readRetryInterval": 100,
        "nodes": [
          {
            "nodeId": "ns=3;i=1001",
            "name": "sensor.tag1",
            "bias": 0,
            "multiplier": 1.0,
            "onChanged": false
          }
        ]
      },
      "db": "my-server",
      "dbTable": "TAG",
      "valueColumn": "VALUE",
      "log": {
        "level": "info",
        "maxFiles": 7
      }
    }
  }
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 해당 collector 없음 | `"collector 'xxx' not found"` |

---

### PUT /collector?name=

collector config를 수정합니다. backend가 `기본값 -> 기존 config -> 요청 본문` 순서로 병합하므로 변경할 필드만 전달할 수 있습니다. FE가 알지 못하는 `derivedTags`, `timePolicy`, `badStatusPolicy` 등의 설정은 요청에서 생략해도 유지됩니다.

- service가 실행 중이면 `stop → start` 자동 수행
- `opcua`, `log`는 하위 필드 단위로 병합
- `opcua.nodes`, `derivedTags` 등 배열은 요청에 명시하면 배열 전체를 교체. `derivedTags: []`는 전체 삭제
- `opcua.server`를 전달하면 기존 `opcua.endpoint`를 제거하고, `opcua.endpoint`를 전달하면 기존 `opcua.server`를 제거한 뒤 legacy profile을 생성
- `valueColumn`을 전달하면 `stringOnly`를 `false`로 전환. `stringValueColumn`을 함께 전달하지 않으면 기존 보조 문자열 컬럼 설정을 제거
- `stringOnly: true`를 전달하면 기존 `valueColumn`을 제거

**요청 본문**

```json
{
  "opcua": {
    "server": "opc-main",
    "interval": 5000,
    "readRetryInterval": 100,
    "nodes": [
      {
        "nodeId": "ns=3;i=1001",
        "name": "sensor.tag1",
        "bias": 0,
        "multiplier": 1.0,
        "onChanged": false
      }
    ]
  },
  "db": "my-server",
  "dbTable": "TAG",
  "valueColumn": "VALUE",
  "log": {
    "level": "info",
    "maxFiles": 7
  }
}
```

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "collector-a"
  }
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 해당 collector 없음 | `"collector 'xxx' not found"` |
| `config.opcua.server`/`config.opcua.endpoint` 누락 | `"config.opcua.server or config.opcua.endpoint is required"` |
| 지정한 OPC UA server profile 없음 | `"opcua server 'xxx' not found"` |

---

### DELETE /collector?name=

collector를 삭제합니다. 실행 중이면 stop → uninstall → config 삭제 순으로 처리합니다.

**응답 (성공)**

```json
{
  "ok": true
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 해당 collector 없음 | `"collector 'xxx' not found"` |

---

### POST /collector/install?name=

config는 있지만 service가 없는 collector에 service install만 수행합니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "collector-a"
  }
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 해당 collector 없음 | `"collector 'xxx' not found"` |
| service 이미 설치됨 | `"collector 'xxx' service already installed"` |

---

### GET /collector/last-time?name=

마지막 수집 성공 시간을 epoch ms로 반환합니다. 아직 수집 전이거나 service가 없으면 `lastCollectedAt`이 `null`입니다.

**응답 (성공 — 수집 기록 있음)**

```json
{
  "ok": true,
  "data": {
    "name": "collector-a",
    "lastCollectedAt": 1775645400000
  }
}
```

**응답 (성공 — 수집 기록 없음)**

```json
{
  "ok": true,
  "data": {
    "name": "collector-a",
    "lastCollectedAt": null
  }
}
```

---

### POST /collector/start?name=

collector service를 시작합니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "collector-a"
  }
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| 해당 collector 없음 | `"collector 'xxx' not found"` |
| 이미 실행 중 | `"collector 'xxx' is already running"` |

---

### POST /collector/stop?name=

collector service를 중지합니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "collector-a"
  }
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| 해당 collector 없음 | `"collector 'xxx' not found"` |

---

## DB 서버

### POST /db/server

DB 서버 접속 정보를 등록합니다. `password`는 저장 파일에서 바로 보이지 않도록 obfuscation 형태로 저장되며, 조회 시 반환하지 않습니다.

**요청 본문**

```json
{
  "name": "my-server",
  "host": "127.0.0.1",
  "port": 5656,
  "user": "sys",
  "password": "manager"
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `name` | Y | 서버 식별 이름 |
| `host` | Y | Machbase 서버 주소 |
| `port` | Y | 포트 (기본값 `5656`) |
| `user` | Y | 사용자명 |
| `password` | Y | 비밀번호 |

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "my-server"
  }
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| 필드 누락 | `"xxx is required"` |
| 동일한 이름 이미 존재 | `"server 'xxx' already exists"` |

---

### GET /db/server?name=

DB 서버 접속 정보를 조회합니다. `password`는 반환하지 않습니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "my-server",
    "config": {
      "host": "127.0.0.1",
      "port": 5656,
      "user": "sys"
    }
  }
}
```

---

### PUT /db/server?name=

DB 서버 접속 정보를 수정합니다. `password`가 없거나 `""` 이면 기존 값을 유지합니다.

**요청 본문**

```json
{
  "host": "127.0.0.1",
  "port": 5656,
  "user": "sys",
  "password": "manager"
}
```

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "my-server"
  }
}
```

---

### DELETE /db/server?name=

DB 서버 접속 정보를 삭제합니다.

**응답 (성공)**

```json
{
  "ok": true
}
```

---

### GET /db/server/list

등록된 DB 서버 목록을 반환합니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": [
    {
      "name": "my-server",
      "config": {
        "host": "127.0.0.1",
        "port": 5656,
        "user": "sys"
      }
    }
  ]
}
```

---

### GET /db/connect?server=

등록된 서버로 연결을 시도해 유효성을 확인합니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "connected": true,
    "host": "127.0.0.1",
    "port": 5656,
    "user": "sys"
  }
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `server` 누락 | `"server is required"` |
| 해당 서버 없음 | `"server 'xxx' not found"` |
| 연결 실패 | Machbase 연결 오류 메시지 |

---

### POST /db/table/create

지정한 서버에 TAG 테이블을 생성합니다. 생성되는 테이블 구조는 아래와 같습니다.

```sql
CREATE TAG TABLE {table} (
  NAME  VARCHAR(100) PRIMARY KEY,
  TIME  DATETIME BASETIME,
  VALUE DOUBLE SUMMARIZED
);
```

**요청 본문**

```json
{
  "server": "my-server",
  "table": "TAGDATA"
}
```

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "table": "TAGDATA",
    "created": true
  }
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| 필드 누락 | `"xxx is required"` |
| 해당 서버 없음 | `"server 'xxx' not found"` |
| 테이블 이미 존재 | `"table 'xxx' already exists"` |

---

### GET /db/table/list?server=

지정한 서버의 TAG 테이블 목록을 조회합니다. 각 테이블의 소유 유저명을 함께 반환합니다.
Mounted backup database의 테이블은 쓰기 대상이 아니므로 목록에서 제외됩니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": [
    { "name": "TAG",    "user": "SYS"   },
    { "name": "SENSOR", "user": "ADMIN" }
  ]
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `server` 누락 | `"server is required"` |
| 해당 서버 없음 | `"server 'xxx' not found"` |
| DB 유저 없음 | `"user 'xxx' not found"` |

---

### GET /db/table/columns?server=&table=

테이블의 컬럼 목록을 조회합니다. TAG 테이블만 허용됩니다.

`table` 파라미터는 `TAG` 또는 `user.TAG` 형식을 지원합니다. `user.TAG` 형식으로 지정하면 해당 user 소유의 테이블만 조회합니다.

`valueColumn`은 숫자 컬럼 또는 JSON 컬럼이어야 합니다. `stringValueColumn`은 `VARCHAR` 컬럼이어야 합니다. `stringOnly: true`이면 `valueColumn`은 생략하거나 빈 문자열(`""`)로 보내고, 모든 값을 `stringValueColumn`에 문자열로 저장합니다.
수집 시 TAG primary key와 basetime 컬럼은 컬럼명 `NAME`/`TIME` 고정이 아니라 `primaryKey`/`basetime` 플래그 기준으로 감지합니다. 플래그가 없는 환경에서는 기존 호환을 위해 `NAME`/`TIME`으로 fallback합니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "table": "TAG",
    "columns": [
      { "name": "NAME",   "type": "VARCHAR(100)", "primaryKey": true,  "basetime": false, "summarized": false, "metadata": false },
      { "name": "TIME",   "type": "DATETIME",     "primaryKey": false, "basetime": true,  "summarized": false, "metadata": false },
      { "name": "VALUE",  "type": "DOUBLE",       "primaryKey": false, "basetime": false, "summarized": true,  "metadata": false },
      { "name": "VALUE2", "type": "DOUBLE",       "primaryKey": false, "basetime": false, "summarized": true,  "metadata": false }
    ]
  }
}
```

| 컬럼 플래그 | 설명 |
|-------------|------|
| `primaryKey` | TAG 이름/식별자 컬럼. 컬럼명은 `NAME`이 아닐 수 있습니다 |
| `basetime` | 기준 시간 컬럼 |
| `summarized` | 일반적인 숫자 수집 컬럼. `valueColumn` 후보를 판단할 때 함께 참고할 수 있는 플래그 |
| `metadata` | TAG 메타 정보 컬럼 |

**응답 (실패)**

| 조건 | reason |
|------|--------|
| 필드 누락 | `"xxx is required"` |
| 해당 서버 없음 | `"server 'xxx' not found"` |
| DB 유저 없음 | `"user 'xxx' not found"` |
| 테이블 없음 | `"table 'xxx' not found"` |
| TAG 테이블이 아님 | `"table 'xxx' is not a TAG table"` |

---

## 로그

### GET /log/all

패키지 전체 로그 파일 목록을 반환합니다. collector 구분 없이 모든 `.log` 파일을 반환합니다. 파일이 없으면 빈 배열입니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "files": [
      { "name": "collector-a.log",                    "size": 4096     },
      { "name": "collector-a_20260415_034234.log",    "size": 10485760 },
      { "name": "collector-b.log",                    "size": 2048     }
    ]
  }
}
```

| 필드 | 설명 |
|------|------|
| `data.files` | `.log` 파일 정보 목록 (이름순 정렬). 디렉토리가 없으면 빈 배열 |
| `data.files[].name` | 파일 이름 |
| `data.files[].size` | 파일 크기 (bytes) |

**응답 (실패)**

| 조건 | reason |
|------|--------|
| 디렉토리 읽기 실패 (권한 등) | 시스템 오류 메시지 |

---

### GET /log/list?name=

특정 collector에 속한 로그 파일 목록을 반환합니다. 현재 로그(`{name}.log`)와 rotated 파일(`{name}_YYYYMMDD_HHMMSS.log`)만 포함합니다. 파일이 없으면 빈 배열입니다.

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `name` | Y | collector 이름 |

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "files": [
      { "name": "collector-a.log",                    "size": 4096     },
      { "name": "collector-a_20260415_034234.log",    "size": 10485760 }
    ]
  }
}
```

| 필드 | 설명 |
|------|------|
| `data.files` | `.log` 파일 정보 목록 (이름순 정렬). 디렉토리가 없으면 빈 배열 |
| `data.files[].name` | 파일 이름 |
| `data.files[].size` | 파일 크기 (bytes) |

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 디렉토리 읽기 실패 (권한 등) | 시스템 오류 메시지 |

---

### GET /log/tail?name=&intervalMs=

SSE(`text/event-stream`) 기반 active 로그 tail API입니다.

- `name`은 로그 파일명이 아니라 collector 이름입니다.
- tail 대상은 내부적으로 active 로그 파일 `{name}.log`로 고정됩니다.
- 기존 로그 내용은 전송하지 않고, 연결 이후 append되는 최신 로그 라인만 전송합니다.
- 로그 파일이 아직 없으면 연결을 유지하고, 파일이 생성된 뒤부터 follow 합니다.
- `intervalMs`는 polling 주기이며 기본값은 `500`입니다. 허용 범위는 `250`부터 `5000`까지입니다.
- event 이름은 `line`이고, payload는 JSON이 아닌 로그 라인 문자열입니다.
- 기존 `/log/list`, `/log/content`, `/log/content/all`은 그대로 유지됩니다.

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `name` | Y | collector 이름 |
| `intervalMs` | N | polling 주기 (ms). 기본값 `500`, 범위 `250..5000` |

**응답 헤더**

```http
Content-Type: text/event-stream
```

**SSE 예시**

```text
: tail collector-a.log

event: line
data: [INFO] 2026-04-24 10:00:00.000  collector-a  starting

event: line
data: [INFO] 2026-04-24 10:00:01.000  collector-a  opcua connected
```

프론트엔드 사용 예시:

```js
const es = new EventSource(
  `${API_BASE}/log/tail?name=${encodeURIComponent(collectorId)}&intervalMs=500`
);

es.addEventListener("line", (event) => {
  appendLine(event.data);
});
```

**시작 전 오류 응답**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 경로 구분자 포함 등 잘못된 collector 이름 | `"invalid log name"` |

---

### GET /log/content?name=

로그 파일 내용을 줄 단위로 반환합니다. 경로 구분자(`/`, `\`, `..`)는 허용하지 않습니다.

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `name` | Y | 파일 이름 |
| `start` | N | 시작 줄 번호 (1-based). 생략 시 첫 번째 줄 |
| `end` | N | 끝 줄 번호 (inclusive). 생략 시 마지막 줄 |

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "collector-a.log",
    "start": 1,
    "end": 3,
    "totalLines": 120,
    "lines": [
      "[INFO]  2026-04-15 10:00:00.000  collector-a  starting  table=TAG endpoint=opc.tcp://192.168.1.100:4840",
      "[INFO]  2026-04-15 10:00:00.050  collector-a  opcua connected  endpoint=opc.tcp://192.168.1.100:4840",
      "[DEBUG] 2026-04-15 10:00:00.100  collector-a  collected  count=2"
    ]
  }
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 경로 구분자 포함 | `"invalid file name"` |
| 파일 없음 | `"file not found: xxx"` |
| `start`/`end` 유효하지 않음 | `"invalid start/end"` |

---

### GET /log/content/all?name=

로그 파일 전체 내용을 문자열로 반환합니다. 경로 구분자(`/`, `\`, `..`)는 허용하지 않습니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "collector-a.log",
    "content": "[INFO]  2026-04-15 10:00:00.000  collector-a  starting  table=TAG endpoint=opc.tcp://192.168.1.100:4840\n[DEBUG] 2026-04-15 10:00:00.100  collector-a  collected  count=2"
  }
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 경로 구분자 포함 | `"invalid file name"` |
| 파일 없음 | `"file not found: xxx"` |

---

## OPC UA

### POST /opcua/server

OPC UA 서버 profile을 등록합니다. Collector와 one-shot OPC UA API는 `server` 이름을 받으면 이 profile의 endpoint와 security 설정을 사용합니다.

**요청 본문**

```json
{
  "name": "opc-main",
  "endpoint": "opc.tcp://192.168.1.100:4840",
  "readBatchSize": 32,
  "capabilities": {
    "maxNodesPerRead": 32,
    "maxNodesPerReadSource": "server",
    "checkedAt": "2026-06-08T00:00:00.000Z"
  },
  "security": {
    "enabled": true,
    "securityPolicy": "Basic256Sha256",
    "messageSecurityMode": "SignAndEncrypt",
    "authMode": "UserName",
    "username": "opcuser",
    "password": "secret",
    "certificatePem": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n",
    "keyPem": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
  }
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `name` | Y | OPC UA 서버 profile 이름 |
| `endpoint` | Y | OPC UA 서버 endpoint |
| `readBatchSize` | N | 한 번의 OPC UA ReadRequest에 포함할 최대 node 수. 사용자가 수정 가능한 값입니다 |
| `capabilities.maxNodesPerRead` | N | `/opcua/connect`에서 조회한 서버의 `MaxNodesPerRead` 값. 서버가 제공하지 않으면 `null`입니다 |
| `capabilities.maxNodesPerReadSource` | N | `"server"` 또는 `"default"`. 서버에서 조회한 값인지 backend 기본값인지 구분합니다 |
| `capabilities.checkedAt` | N | capability를 확인한 시각 ISO 문자열 |
| `security.enabled` | N | 보안 설정 사용 여부. 생략하면 `false`로 저장됩니다 |
| `security.securityPolicy` | N | `None`, `Basic128Rsa15`, `Basic256`, `Basic256Sha256`, `Aes128_Sha256_RsaOaep`, `Aes256_Sha256_RsaPss` |
| `security.messageSecurityMode` | N | `None`, `Sign`, `SignAndEncrypt` |
| `security.authMode` | N | `Anonymous`, `UserName` |
| `security.username` | N | `authMode=UserName`일 때 필요 |
| `security.password` | N | `authMode=UserName`일 때 필요. 저장 파일에는 obfuscation 처리되며 API 응답에는 반환되지 않습니다 |
| `security.certificatePem` | N | client certificate PEM. secure mode에서 필요 |
| `security.keyPem` | N | client private key PEM. `certificatePem`과 함께 전달해야 합니다 |

`security.enabled=false`이면 상세 security 필드는 사용하지 않습니다. `messageSecurityMode`가 `Sign` 또는 `SignAndEncrypt`이면 `securityPolicy=None`은 허용되지 않으며, client certificate/key가 필요합니다.

`Sign` only 모드는 OPC UA 서버와 JSH OPC UA client 조합에 따라 연결이 실패할 수 있습니다. 서버 profile 등록 후 `/opcua/connect` 또는 `/opcua/read`로 실제 연결 가능 여부를 확인하는 것을 권장합니다.

`readBatchSize`는 collector와 `/opcua/read`가 여러 node를 읽을 때 내부적으로 chunking하는 기준입니다. 서버에서 `MaxNodesPerRead`를 조회한 경우 `readBatchSize`는 그 값을 초과할 수 없습니다. 서버가 값을 제공하지 않으면 backend는 기본값 `32`를 적용하고, `readBatchSize`도 `32`를 초과할 수 없습니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "opc-main"
  }
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| `endpoint` 누락 | `"config.endpoint is required"` |
| 동일한 이름 이미 존재 | `"opcua server 'xxx' already exists"` |
| security 조합 오류 | `"security.xxx ..."` |

---

### POST /opcua/certificate/self-signed

OPC UA secure mode에서 사용할 self-signed client certificate/key를 발급합니다. 이 API는 Neo Web `/web/api/keys`를 사용하지 않고 package `cgi-bin`에서 직접 발급합니다.

이 기능은 Neo 런타임의 JSH `crypto.generateAuthKeyPair('rsa')`, `crypto.generateX509Certificate(...)` API가 필요합니다.

**요청 본문**

```json
{
  "name": "opc-main",
  "days": 3650
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `name` | Y | 인증서 `CN`, `SAN DNS`, `SAN URI`에 사용할 이름 |
| `days` | N | 인증서 유효기간 일 수. 생략하면 `3650`입니다 |

생성되는 인증서는 RSA self-signed 인증서입니다. subject에는 필요한 값만 넣습니다.

| 인증서 항목 | 값 |
|------------|----|
| `CN` | 요청 `name` |
| `SAN DNS` | 요청 `name` |
| `SAN URI` | `urn:machbase:neo-pkg-opcua-client:${name}` |

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "certificatePem": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n",
    "keyPem": "-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----\n",
    "certificateDer": "MIIC...",
    "applicationUri": "urn:machbase:neo-pkg-opcua-client:opc-main",
    "commonName": "opc-main"
  }
}
```

`certificatePem`과 `keyPem`은 `/opcua/server`의 `security.certificatePem`, `security.keyPem`에 그대로 전달하면 됩니다.
패키지 UI는 `${name}_certificate.zip` 파일 하나로 다운로드하며, ZIP 안에는 `${name}_cert.pem`, `${name}_key.pem` 두 파일이 들어갑니다.

`certificateDer`는 DER 바이너리가 필요한 외부 trust 등록 흐름에서 사용할 수 있도록 base64로 함께 반환합니다.

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 경로 구분자 또는 `..` 포함 | `"invalid certificate name"` |
| Neo 런타임에 JSH crypto 생성 API 없음 | `"JSH crypto certificate generation API is required"` |

---

### GET /opcua/server?name=

OPC UA 서버 profile을 조회합니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "opc-main",
    "config": {
      "endpoint": "opc.tcp://192.168.1.100:4840",
      "readBatchSize": 32,
      "capabilities": {
        "maxNodesPerRead": 32,
        "maxNodesPerReadSource": "server",
        "checkedAt": "2026-06-08T00:00:00.000Z"
      },
      "security": {
        "enabled": true,
        "securityPolicy": "Basic256Sha256",
        "messageSecurityMode": "SignAndEncrypt",
        "authMode": "UserName",
        "username": "opcuser",
        "hasPassword": true,
        "hasCertificateFile": true,
        "hasKeyFile": true,
        "certificateUpdatedAt": "2026-06-05T06:00:00.000Z",
        "keyUpdatedAt": "2026-06-05T06:00:01.000Z"
      }
    }
  }
}
```

`password`, `certificateFile`, `keyFile` 원문은 응답하지 않습니다. 등록 여부는 `hasPassword`, `hasCertificateFile`, `hasKeyFile`로 확인합니다. Certificate/key가 package 관리 디렉터리에 등록되어 있으면 마지막 수정 시각을 `certificateUpdatedAt`, `keyUpdatedAt` ISO 문자열로 반환합니다.

---

### PUT /opcua/server?name=

OPC UA 서버 profile을 수정합니다. 요청 본문은 POST와 동일합니다. `password`, `certificatePem`, `keyPem`을 생략하면 기존 값을 유지합니다.

`readBatchSize`는 수정 가능합니다. 같은 endpoint에서 `capabilities`를 생략하면 기존 capability 정보를 유지합니다. endpoint를 바꾸거나 `/opcua/connect`를 다시 수행한 경우에는 새 capability 정보를 함께 전달하는 것을 권장합니다.

민감정보 삭제가 필요하면 다음 플래그를 사용합니다.

```json
{
  "endpoint": "opc.tcp://192.168.1.100:4840",
  "security": {
    "enabled": true,
    "securityPolicy": "None",
    "messageSecurityMode": "None",
    "authMode": "Anonymous",
    "clearPassword": true,
    "clearCertificate": true
  }
}
```

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "opc-main"
  }
}
```

---

### DELETE /opcua/server?name=

OPC UA 서버 profile을 삭제합니다.

```json
{
  "ok": true
}
```

주의: 이 API는 collector config의 참조 여부를 검사하지 않습니다. 사용 중인 profile을 삭제하면 해당 collector 실행 또는 one-shot 호출에서 `"opcua server 'xxx' not found"` 오류가 발생합니다. profile 삭제 시 package가 관리하는 client certificate/key 파일도 삭제합니다.

---

### GET /opcua/server/list

OPC UA 서버 profile 목록을 반환합니다.

```json
{
  "ok": true,
  "data": [
    {
      "name": "opc-main",
      "config": {
        "endpoint": "opc.tcp://192.168.1.100:4840",
        "readBatchSize": 32,
        "capabilities": {
          "maxNodesPerRead": 32,
          "maxNodesPerReadSource": "server",
          "checkedAt": "2026-06-08T00:00:00.000Z"
        },
        "security": {
          "enabled": true,
          "securityPolicy": "Basic256Sha256",
          "messageSecurityMode": "SignAndEncrypt",
          "authMode": "UserName",
          "username": "opcuser",
          "hasPassword": true,
          "hasCertificateFile": true,
          "hasKeyFile": true,
          "certificateUpdatedAt": "2026-06-05T06:00:00.000Z",
          "keyUpdatedAt": "2026-06-05T06:00:01.000Z"
        }
      }
    }
  ]
}
```

---

### POST /opcua/connect

OPC UA 서버에 접속 가능한지 확인합니다. 노드 읽기나 브라우즈는 수행하지 않고 연결 성공 여부만 확인한 뒤 즉시 연결을 종료합니다. `server`가 있으면 등록된 OPC UA server profile의 endpoint와 security 설정을 사용합니다. `endpoint`를 직접 사용할 때는 저장 전 connection test를 위해 `security`를 함께 전달할 수 있습니다.

**요청 본문**

```json
{
  "server": "opc-main",
  "readRetryInterval": 100
}
```

저장 전 security 설정을 직접 테스트하는 예:

```json
{
  "endpoint": "opc.tcp://192.168.1.100:4840",
  "security": {
    "enabled": true,
    "securityPolicy": "Basic256Sha256",
    "messageSecurityMode": "SignAndEncrypt",
    "authMode": "Anonymous",
    "certificatePem": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----\n",
    "keyPem": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
  },
  "readRetryInterval": 100
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `server` | Y* | 등록된 OPC UA server profile 이름 |
| `endpoint` | Y* | OPC UA 서버 주소 |
| `security` | N | `endpoint` 직접 테스트 시 사용할 security 설정. 형식은 `/opcua/server`의 `security`와 동일합니다 |
| `readRetryInterval` | N | 읽기 재시도 간격 (ms). 생략 시 기본값 `100` |

`server`와 `endpoint` 중 하나는 필요합니다. 둘 다 있으면 `server`가 우선합니다. `server`를 사용하면 요청 본문의 `security`는 사용하지 않고 해당 profile의 security 설정을 적용합니다.

`endpoint` 직접 테스트에서 `certificatePem`/`keyPem`을 전달하면 backend가 임시 파일로 저장한 뒤 연결 테스트 종료 후 삭제합니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "endpoint": "opc.tcp://192.168.1.100:4840",
    "connected": true,
    "readBatchSize": 32,
    "capabilities": {
      "maxNodesPerRead": 32,
      "maxNodesPerReadSource": "server",
      "checkedAt": "2026-06-08T00:00:00.000Z"
    }
  }
}
```

`/opcua/connect`는 연결 성공 후 OPC UA standard OperationLimits의 `MaxNodesPerRead`를 best-effort로 읽습니다. 성공하면 `capabilities.maxNodesPerReadSource`가 `"server"`이고 `readBatchSize`는 해당 값으로 반환됩니다. 읽을 수 없으면 `capabilities.maxNodesPerRead`는 `null`, source는 `"default"`, `readBatchSize`는 `32`입니다.

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `endpoint`/`server` 누락 | `"endpoint or server is required"` |
| `server` 없음 | `"opcua server 'xxx' not found"` |
| 연결 실패 | `"connect failed: <endpoint>"` |

---

### GET /opcua/read?endpoint=&server=&nodes=

OPC UA 서버에서 노드 값을 일회성으로 읽습니다.

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `server` | Y* | 등록된 OPC UA server profile 이름 |
| `endpoint` | Y* | OPC UA 서버 주소 (예: `opc.tcp://192.168.1.100:4840`) |
| `nodes` | Y | 쉼표로 구분된 노드 ID 목록 (예: `ns=3;i=1001,ns=3;i=1002`) |

`server`와 `endpoint` 중 하나는 필요합니다. 둘 다 있으면 `server`가 우선합니다. `server`를 사용하면 해당 profile의 security 설정도 적용됩니다.

등록된 server profile에 `readBatchSize`가 있으면 여러 node를 읽을 때 해당 크기대로 나누어 순차 ReadRequest를 수행합니다. batch 중 하나라도 실패하면 전체 read 요청은 실패합니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": [
    {
      "nodeId": "ns=3;i=1001",
      "value": 3.14,
      "type": "Double",
      "status": 0,
      "statusText": "Good",
      "statusCode": "StatusGood",
      "sourceTimestamp": 1744621200000,
      "serverTimestamp": 1744621200001
    }
  ]
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `endpoint`/`server` 누락 | `"endpoint or server is required"` |
| `nodes` 누락 | `"nodes is required"` |
| `nodes` 빈 값 | `"nodes is empty"` |
| `server` 없음 | `"opcua server 'xxx' not found"` |
| 연결 실패 | `"connect failed: <endpoint>"` |

---

### POST /opcua/write

OPC UA 서버 노드에 값을 일회성으로 씁니다.

**요청 본문**

```json
{
  "server": "opc-main",
  "writes": [
    { "node": "ns=3;i=1001", "value": 42.0 }
  ]
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `server` | Y* | 등록된 OPC UA server profile 이름 |
| `endpoint` | Y* | OPC UA 서버 주소 |
| `writes` | Y | 쓰기 요청 배열 |

`server`와 `endpoint` 중 하나는 필요합니다. 둘 다 있으면 `server`가 우선합니다. `server`를 사용하면 해당 profile의 security 설정도 적용됩니다.

**응답 (성공)** — `data`는 OPC UA 서버가 반환한 WriteResult 원본 배열입니다.

```json
{
  "ok": true,
  "data": [
    { "statusCode": 0 }
  ]
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `endpoint`/`server` 누락 | `"endpoint or server is required"` |
| `writes` 누락/빈 배열 | `"writes is required and must be a non-empty array"` |
| 항목에 `node` 없음 | `"each write entry must have a node"` |
| 항목에 `value` 없음 | `"value is required for node 'xxx'"` |
| `server` 없음 | `"opcua server 'xxx' not found"` |
| 연결 실패 | `"connect failed: <endpoint>"` |

---

### POST /opcua/node/descendants

OPC UA 서버의 지정 노드 하위를 BFS로 탐색합니다.

**요청 본문**

```json
{
  "server": "opc-main",
  "node": "ns=0;i=85",
  "nodeClassMask": 0
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `server` | Y* | 등록된 OPC UA server profile 이름 |
| `endpoint` | Y* | OPC UA 서버 주소 |
| `node` | Y | 탐색 시작 노드 ID |
| `nodeClassMask` | N | 반환할 노드 클래스 필터 (`opcua.NodeClass` 비트마스크). `0`이면 전체 |

`server`와 `endpoint` 중 하나는 필요합니다. 둘 다 있으면 `server`가 우선합니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": [
    {
      "nodeId": "ns=3;i=1001",
      "browseName": "Temperature",
      "displayName": "Temperature",
      "nodeClass": 2,
      "referenceTypeId": "i=47",
      "isForward": true,
      "typeDefinition": "BaseDataVariableType",
      "dataType": "Double"
    }
  ]
}
```

| 필드 | 설명 |
|------|------|
| `nodeId` | 노드 ID |
| `browseName` | 브라우즈 이름 |
| `displayName` | 표시 이름 |
| `nodeClass` | 노드 클래스 코드 (`1`=Object, `2`=Variable, `4`=Method, ...) |
| `referenceTypeId` | 부모와의 참조 타입 |
| `isForward` | 순방향 참조 여부 |
| `typeDefinition` | 타입 정의 이름 (browse reference 원본 값) |
| `dataType` | 값 타입 이름 (`"Double"`, `"Boolean"`, `"String"` 등). 모든 노드에 항상 포함. `attributes()` 조회 결과 `status === StatusCode.Good`이면 채워지고, 그 외는 `""` |

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `endpoint`/`server` 누락 | `"endpoint or server is required"` |
| `node` 누락 | `"node is required"` |
| `server` 없음 | `"opcua server 'xxx' not found"` |
| 연결 실패 | `"connect failed: <endpoint>"` |
