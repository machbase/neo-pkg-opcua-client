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
| GET    | [/collector/list](#get-collectorlist) | collector 목록 조회 |
| POST   | [/collector](#post-collector) | collector 등록 |
| GET    | [/collector?name=](#get-collectorname) | collector config 조회 |
| PUT    | [/collector?name=](#put-collectorname) | collector config 수정 |
| DELETE | [/collector?name=](#delete-collectorname) | collector 삭제 |
| POST   | [/collector/install?name=](#post-collectorinstallname) | service install |
| GET    | [/collector/last-time?name=](#get-collectorlast-timename) | 마지막 수집 시간 조회 |
| POST   | [/collector/start?name=](#post-collectorstartname) | collector 시작 |
| POST   | [/collector/stop?name=](#post-collectorstopname) | collector 중지 |
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
| GET    | [/log/content?name=](#get-logcontentname) | 로그 파일 내용 조회 (줄 범위 지정) |
| GET    | [/log/content/all?name=](#get-logcontentallname) | 로그 파일 전체 내용 조회 |
| GET    | [/opcua/read?endpoint=&nodes=](#get-opcuareadendpointnodes) | OPC UA 노드 읽기 |
| POST   | [/opcua/write](#post-opcuawrite) | OPC UA 노드 쓰기 |
| POST   | [/opcua/node/descendants](#post-opcuanodedescendants) | OPC UA 노드 트리 탐색 |

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

### POST /collector

새 collector를 등록합니다. config 저장 후 service install까지 수행합니다.

**요청 본문**

```json
{
  "name": "collector-a",
  "config": {
    "opcua": {
      "endpoint": "opc.tcp://192.168.1.100:4840",
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
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `name` | Y | collector 이름 |
| `config.opcua.endpoint` | Y | OPC UA 서버 주소 |
| `config.opcua.interval` | Y | 수집 주기 (ms) |
| `config.opcua.readRetryInterval` | N | 읽기 재시도 간격 (ms). 기본값 `100` |
| `config.opcua.nodes[].nodeId` | Y | OPC UA 노드 ID |
| `config.opcua.nodes[].name` | Y | TAG 이름 (DB에 저장될 NAME 값) |
| `config.opcua.nodes[].bias` | N | 값에 더할 오프셋. 기본값 `0` |
| `config.opcua.nodes[].multiplier` | N | 값에 곱할 배율. 기본값 `1.0` |
| `config.opcua.nodes[].calcOrder` | N | `"bm"` (기본값): `(value + bias) * multiplier` / `"mb"`: `value * multiplier + bias` |
| `config.opcua.nodes[].onChanged` | N | `true`이면 이전 값과 달라졌을 때만 append. 기본값 `false` |
| `config.db` | Y | DB 서버 이름 (`/db/server`로 등록한 이름) |
| `config.dbTable` | Y | 데이터를 저장할 TAG 테이블명 |
| `config.valueColumn` | N | 값을 저장할 컬럼명. 기본값 `"VALUE"`. SUMMARIZED 컬럼이어야 합니다 |
| `config.log.level` | N | 로그 레벨. `trace`\|`debug`\|`info`\|`warn`\|`error`. 기본값 `"info"` |
| `config.log.maxFiles` | N | 보관할 최대 로그 파일 수. 기본값 `10` |

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

---

### GET /collector?name=

collector config를 조회합니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "collector-a",
    "config": {
      "opcua": {
        "endpoint": "opc.tcp://192.168.1.100:4840",
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

collector config를 수정합니다. 요청 본문 전체가 새 config로 덮어씌워집니다.

- service가 실행 중이면 `stop → start` 자동 수행

**요청 본문**

```json
{
  "opcua": {
    "endpoint": "opc.tcp://192.168.1.100:4840",
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

DB 서버 접속 정보를 등록합니다. `password`는 저장되지만 조회 시 반환하지 않습니다.

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

`valueColumn` 설정 시 `summarized: true`인 컬럼 중 하나를 선택해야 합니다.

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
| `primaryKey` | TAG 이름 컬럼 |
| `basetime` | 기준 시간 컬럼 |
| `summarized` | 수집 값 컬럼. `valueColumn`으로 지정 가능한 컬럼 |
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

### GET /opcua/read?endpoint=&nodes=

OPC UA 서버에서 노드 값을 일회성으로 읽습니다.

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `endpoint` | Y | OPC UA 서버 주소 (예: `opc.tcp://192.168.1.100:4840`) |
| `nodes` | Y | 쉼표로 구분된 노드 ID 목록 (예: `ns=3;i=1001,ns=3;i=1002`) |

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
| `endpoint`/`nodes` 누락 | `"xxx is required"` |
| `nodes` 빈 값 | `"nodes is empty"` |
| 연결 실패 | `"connect failed: <endpoint>"` |

---

### POST /opcua/write

OPC UA 서버 노드에 값을 일회성으로 씁니다.

**요청 본문**

```json
{
  "endpoint": "opc.tcp://192.168.1.100:4840",
  "writes": [
    { "node": "ns=3;i=1001", "value": 42.0 }
  ]
}
```

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
| `endpoint` 누락 | `"endpoint is required"` |
| `writes` 누락/빈 배열 | `"writes is required and must be a non-empty array"` |
| 항목에 `node` 없음 | `"each write entry must have a node"` |
| 항목에 `value` 없음 | `"value is required for node 'xxx'"` |
| 연결 실패 | `"connect failed: <endpoint>"` |

---

### POST /opcua/node/descendants

OPC UA 서버의 지정 노드 하위를 BFS로 탐색합니다.

**요청 본문**

```json
{
  "endpoint": "opc.tcp://192.168.1.100:4840",
  "node": "ns=0;i=85",
  "nodeClassMask": 0
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `endpoint` | Y | OPC UA 서버 주소 |
| `node` | Y | 탐색 시작 노드 ID |
| `nodeClassMask` | N | 반환할 노드 클래스 필터 (`opcua.NodeClass` 비트마스크). `0`이면 전체 |

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
| `endpoint`/`node` 누락 | `"xxx is required"` |
| 연결 실패 | `"connect failed: <endpoint>"` |
