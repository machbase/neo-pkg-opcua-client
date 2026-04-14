# Collector CGI API

`cgi-bin/api/` 하위의 CGI 스크립트가 제공하는 HTTP API 명세입니다.
모든 요청/응답 본문은 `application/json`입니다.

collector service 이름은 다른 패키지와 충돌하지 않도록 항상 `_opc_{name}` 형식을 사용합니다.

## 동작 방식

이 API는 **CGI** 방식으로 동작합니다. HTTP 서버 역할은 machbase-neo가 담당하며, 각 요청마다 해당 경로의 jsh 스크립트를 실행합니다.

| 역할 | 담당 |
|------|------|
| HTTP 수신 및 라우팅 | machbase-neo (CGI 호스트) |
| 요청 전달 방식 | 환경변수(`REQUEST_METHOD`, `QUERY_STRING`) + stdin(요청 본문) |
| 응답 방식 | stdout에 `Content-Type:` 헤더 + 본문 출력 |
| 스크립트 실행 환경 | jsh (goja 기반 JS 엔진, Node.js 아님) |

## 공통 응답 형식

성공: `{ "ok": true, "data": { ... } }`

실패: `{ "ok": false, "reason": "오류 메시지" }`

## jsh 직접 실행 (테스트용)

```bash
# 실행 위치: /home/machbase/neo-pkg-opcua-client
# 주의: -e 플래그는 반드시 스크립트 파일 앞에 위치해야 함

../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET cgi-bin/api/collector/list.js

../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET -e QUERY_STRING=name=collector-a cgi-bin/api/collector.js

echo '{
  "name": "collector-a",
  "config": {
    "opcua": {
      "endpoint": "opc.tcp://192.168.1.100:53530/OPCUA/SimulationServer",
      "readRetryInterval": 100,
      "interval": 5000,
      "nodes": [{ "nodeId": "ns=3;i=1001", "name": "sensor.tag1", "add": -273.15, "multiply": 1.0 }]
    },
    "db": "my-server",
    "dbTable": "TAG",
    "valueColumn": "VALUE",
    "log": { "level": "info", "maxFiles": 7 }
  }
}' | ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/collector.js

echo '{
  "opcua": {
    "endpoint": "opc.tcp://192.168.1.100:53530/OPCUA/SimulationServer",
    "readRetryInterval": 100,
    "interval": 5000,
    "nodes": [{ "nodeId": "ns=3;i=1001", "name": "sensor.tag1", "add": -273.15, "multiply": 1.0 }]
  },
  "db": "my-server",
  "dbTable": "TAG",
  "valueColumn": "VALUE",
  "log": { "level": "info", "maxFiles": 7 }
}' | ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=PUT -e QUERY_STRING=name=collector-a cgi-bin/api/collector.js

../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=DELETE -e QUERY_STRING=name=collector-a cgi-bin/api/collector.js

../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST -e QUERY_STRING=name=collector-a cgi-bin/api/collector/install.js
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET  -e QUERY_STRING=name=collector-a cgi-bin/api/collector/last-time.js
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST -e QUERY_STRING=name=collector-a cgi-bin/api/collector/start.js
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST -e QUERY_STRING=name=collector-a cgi-bin/api/collector/stop.js

echo '{ "name": "my-server", "host": "127.0.0.1", "port": 5656, "user": "sys", "password": "manager" }' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/db/server.js

../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET cgi-bin/api/db/server/list.js
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET -e QUERY_STRING=server=my-server cgi-bin/api/db/connect.js

echo '{ "server": "my-server", "table": "TAGDATA" }' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/db/table/create.js

../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET -e QUERY_STRING=server=my-server\&table=TAG cgi-bin/api/db/table/columns.js

../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET cgi-bin/api/log/list.js
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET -e QUERY_STRING=file=repli.log cgi-bin/api/log/content.js

../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET \
  -e QUERY_STRING=endpoint=opc.tcp://localhost:4840\&nodes=ns=3;i=1001 \
  cgi-bin/api/opcua/read.js

echo '{"endpoint": "opc.tcp://localhost:4840", "writes": [{"node": "ns=3;i=1001", "value": 42.0}]}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/opcua/write.js

echo '{"endpoint": "opc.tcp://localhost:4840", "node": "ns=0;i=85"}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/opcua/node/descendants.js
```

---

## GET /cgi-bin/api/collector/list

`conf.d/{name}.json` 이 존재하는 collector 목록을 반환합니다. service에 등록되지 않은 항목도 포함되며, 이 경우 `installed: false` 입니다.

**응답**

```json
{
  "ok": true,
  "data": [
    { "name": "collector-a", "installed": true, "running": false }
  ]
}
```

---

## POST /cgi-bin/api/collector

새 collector를 등록합니다. config 저장 후 `_opc_{name}` service를 install 합니다.

**요청 본문**

```json
{
  "name": "collector-a",
  "config": {
    "opcua": {
      "endpoint": "opc.tcp://192.168.1.100:53530/OPCUA/SimulationServer",
      "readRetryInterval": 100,
      "interval": 5000,
      "nodes": [{ "nodeId": "ns=3;i=1001", "name": "sensor.tag1", "add": -273.15, "multiply": 1.0 }]
    },
    "db": "my-server",
    "dbTable": "TAG",
    "valueColumn": "VALUE",
    "log": { "level": "info", "maxFiles": 7 }
  }
}
```

> `config.db`는 `/cgi-bin/api/db/server` 로 등록한 DB 서버 이름입니다. config 필드 전체는 [configuration.md](configuration.md)를 참조하세요.

**응답 (성공):** `{ "ok": true, "data": { "name": "collector-a" } }`

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| `config` 누락 | `"config is required"` |
| 동일한 `name` 이미 존재 | `"collector 'xxx' already exists"` |

---

## GET /cgi-bin/api/collector?name={name}

특정 collector의 config를 조회합니다. `db.password`는 반환하지 않습니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "collector-a",
    "config": {
      "opcua": {
        "endpoint": "opc.tcp://192.168.1.100:53530/OPCUA/SimulationServer",
        "readRetryInterval": 100,
        "interval": 5000,
        "nodes": [{ "nodeId": "ns=3;i=1001", "name": "sensor.tag1", "add": -273.15, "multiply": 1.0 }]
      },
      "db": "my-server",
      "dbTable": "TAG",
      "valueColumn": "VALUE",
      "log": { "level": "info", "maxFiles": 7 }
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

## PUT /cgi-bin/api/collector?name={name}

collector config를 수정합니다. 요청 본문 전체가 새 config로 덮어씌워집니다. service가 실행 중이면 `stop → start`를 수행합니다.

`db.password`가 없거나 `""` 이면 기존 password를 유지합니다.

**요청 본문** — `config` 객체 전체 (`name` 제외)

```json
{
  "opcua": {
    "endpoint": "opc.tcp://192.168.1.100:53530/OPCUA/SimulationServer",
    "readRetryInterval": 100,
    "interval": 5000,
    "nodes": [{ "nodeId": "ns=3;i=1001", "name": "sensor.tag1", "add": -273.15, "multiply": 1.0 }]
  },
  "db": "my-server",
  "dbTable": "TAG",
  "valueColumn": "VALUE",
  "log": { "level": "info", "maxFiles": 7 }
}
```

**응답 (성공):** `{ "ok": true, "data": { "name": "collector-a" } }`

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 해당 collector 없음 | `"collector 'xxx' not found"` |

---

## DELETE /cgi-bin/api/collector?name={name}

collector를 삭제합니다. 실행 중이면 stop → uninstall → config 삭제 순으로 처리합니다.

**응답 (성공):** `{ "ok": true }`

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 해당 collector 없음 | `"collector 'xxx' not found"` |

---

## POST /cgi-bin/api/collector/install?name={name}

config는 있지만 service가 없는 collector에 service install만 수행합니다.

**응답 (성공):** `{ "ok": true, "data": { "name": "collector-a" } }`

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 해당 collector 없음 | `"collector 'xxx' not found"` |
| service 이미 설치됨 | `"collector 'xxx' service already installed"` |

---

## GET /cgi-bin/api/collector/last-time?name={name}

마지막 성공 수집 시간 (epoch ms)을 반환합니다. 수집 성공 시에만 갱신되며, service가 없거나 아직 수집 전이면 `null`을 반환합니다.

**응답 (성공)**

```json
{ "ok": true, "data": { "name": "collector-a", "lastCollectedAt": 1775645400000 } }
```

---

## POST /cgi-bin/api/collector/start?name={name}

등록된 collector service를 시작합니다.

**응답 (성공):** `{ "ok": true, "data": { "name": "collector-a" } }`

---

## POST /cgi-bin/api/collector/stop?name={name}

등록된 collector service를 종료합니다.

**응답 (성공):** `{ "ok": true, "data": { "name": "collector-a" } }`

---

## POST /cgi-bin/api/db/server

DB 서버 접속 정보를 등록합니다. `password`는 조회 시 반환하지 않습니다.

**요청 본문**

```json
{ "name": "my-server", "host": "127.0.0.1", "port": 5656, "user": "sys", "password": "manager" }
```

**응답 (성공):** `{ "ok": true, "data": { "name": "my-server" } }`

**응답 (실패)**

| 조건 | reason |
|------|--------|
| 필드 누락 (`name`/`host`/`port`/`user`/`password`) | `"xxx is required"` |
| 동일한 `name` 이미 존재 | `"server 'xxx' already exists"` |

---

## GET /cgi-bin/api/db/server?name={name}

DB 서버 접속 정보를 단건 조회합니다. `password`는 반환하지 않습니다.

**응답 (성공)**

```json
{ "ok": true, "data": { "name": "my-server", "config": { "host": "127.0.0.1", "port": 5656, "user": "sys" } } }
```

---

## PUT /cgi-bin/api/db/server?name={name}

DB 서버 접속 정보를 수정합니다. `password`가 없거나 `""` 이면 기존 값을 유지합니다.

**요청 본문:** `{ "host": "...", "port": 5656, "user": "...", "password": "..." }`

**응답 (성공):** `{ "ok": true, "data": { "name": "my-server" } }`

---

## DELETE /cgi-bin/api/db/server?name={name}

DB 서버 접속 정보를 삭제합니다.

**응답 (성공):** `{ "ok": true }`

---

## GET /cgi-bin/api/db/server/list

등록된 DB 서버 목록을 반환합니다.

**응답 (성공)**

```json
{ "ok": true, "data": [{ "name": "my-server", "config": { "host": "127.0.0.1", "port": 5656, "user": "sys" } }] }
```

---

## GET /cgi-bin/api/db/connect?server={name}

등록된 서버로 Machbase 연결을 시도해 유효성을 검사합니다.

**응답 (성공)**

```json
{ "ok": true, "data": { "connected": true, "host": "127.0.0.1", "port": 5656, "user": "sys" } }
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `server` 누락 | `"server is required"` |
| 해당 서버 없음 | `"server 'xxx' not found"` |
| 연결 실패 | Machbase 연결 오류 메시지 |

---

## POST /cgi-bin/api/db/table/create

지정한 서버에 연결해 TAG 테이블을 생성합니다.

```sql
CREATE TAG TABLE ${table} (
  NAME VARCHAR(100) PRIMARY KEY,
  TIME DATETIME BASETIME,
  VALUE DOUBLE SUMMARIZED
);
```

**요청 본문:** `{ "server": "my-server", "table": "TAGDATA" }`

**응답 (성공):** `{ "ok": true, "data": { "table": "TAGDATA", "created": true } }`

**응답 (실패)**

| 조건 | reason |
|------|--------|
| 필드 누락 | `"xxx is required"` |
| 해당 서버 없음 | `"server 'xxx' not found"` |
| 테이블 이미 존재 | `"table 'xxx' already exists"` |

---

## GET /cgi-bin/api/db/table/columns?server={name}&table={table}

테이블 컬럼 목록을 조회합니다. TAG 테이블만 허용됩니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "table": "TAG",
    "columns": [
      { "name": "NAME",  "type": "VARCHAR(100)", "primaryKey": true,  "basetime": false, "summarized": false, "metadata": false },
      { "name": "TIME",  "type": "DATETIME",     "primaryKey": false, "basetime": true,  "summarized": false, "metadata": false },
      { "name": "VALUE", "type": "DOUBLE",       "primaryKey": false, "basetime": false, "summarized": true,  "metadata": false }
    ]
  }
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| 필드 누락 | `"xxx is required"` |
| 해당 서버 없음 | `"server 'xxx' not found"` |
| TAG 테이블이 아님 | `"table 'xxx' is not a TAG table"` |

---

## GET /cgi-bin/api/log/list

`$HOME/public/logs/{패키지명}/` 의 `.log` 파일 이름 목록을 반환합니다. 파일이 없으면 빈 배열을 반환합니다.

**응답 (성공):** `{ "ok": true, "data": ["repli.log", "repli_0001.log"] }`

---

## GET /cgi-bin/api/log/content?file={filename}

지정한 로그 파일의 내용을 반환합니다. 경로 구분자(`/`, `\`, `..`)는 허용하지 않습니다.

**응답 (성공)**

```json
{ "ok": true, "data": { "file": "repli.log", "content": "[INFO] ..." } }
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `file` 누락 | `"file is required"` |
| 경로 구분자 포함 | `"invalid file name"` |
| 파일 없음 | `"file not found: xxx"` |

---

## GET /cgi-bin/api/opcua/read?endpoint={url}&nodes={ids}

OPC UA 서버에서 노드 값을 일회성으로 읽습니다. `nodes`는 쉼표 구분 노드 ID 목록입니다.

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

## POST /cgi-bin/api/opcua/write

OPC UA 서버 노드에 값을 일회성으로 씁니다.

**요청 본문**

```json
{
  "endpoint": "opc.tcp://192.168.1.100:53530/OPCUA/SimulationServer",
  "writes": [{ "node": "ns=3;i=1001", "value": 42.0 }]
}
```

**응답 (성공):** `data`는 OPC UA 서버가 반환한 `WriteResult` 원본 객체입니다.

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `endpoint` 누락 | `"endpoint is required"` |
| `writes` 누락/빈 배열 | `"writes is required and must be a non-empty array"` |
| 항목에 `node` 없음 | `"each write entry must have a node"` |
| 항목에 `value` 없음 | `"value is required for node 'xxx'"` |
| 연결 실패 | `"connect failed: <endpoint>"` |

---

## POST /cgi-bin/api/opcua/node/descendants

OPC UA 서버의 지정 노드 하위를 BFS로 탐색합니다. `opcua.children()`이 일부 서버에서 Variable 노드를 누락하는 문제로 `browse()` 기반으로 구현되었습니다.

**요청 본문**

```json
{ "endpoint": "opc.tcp://...", "node": "ns=0;i=85", "nodeClassMask": 0 }
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `endpoint` | Y | OPC UA 서버 주소 |
| `node` | Y | 탐색 시작 노드 ID |
| `nodeClassMask` | N | 반환할 노드 클래스 비트마스크 (`opcua.NodeClass`) |

**응답 (성공)**

```json
{
  "ok": true,
  "data": [
    {
      "nodeId": "ns=3;i=1001",
      "browseName": "Simulation",
      "displayName": "Simulation",
      "nodeClass": 1,
      "referenceTypeId": "ns=0;i=35",
      "isForward": true,
      "typeDefinition": "ns=0;i=61"
    }
  ]
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `endpoint`/`node` 누락 | `"xxx is required"` |
| 연결 실패 | `"connect failed: <endpoint>"` |

---

## OpcuaClient API

`cgi-bin/src/opcua/opcua-client.js`

### `new OpcuaClient(endpoint, readRetryInterval?)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `endpoint` | string | OPC UA 서버 주소 |
| `readRetryInterval` | number | 읽기 재시도 간격 (ms). 기본값 `100` |

### `open()` → boolean

연결 시도. 이미 연결된 경우 no-op. 실패 시 `false` 반환 (예외 없음).

### `read(nodeIds)` → ReadResult[]

| ReadResult 필드 | 타입 | 설명 |
|-----------------|------|------|
| `value` | any | 읽은 값 |
| `type` | string | 값 타입 (예: `Double`) |
| `status` | number | OPC UA 상태 코드 |
| `statusText` | string | 상태 텍스트 |
| `statusCode` | string | 상태 코드 이름 (예: `StatusGood`) |
| `sourceTimestamp` | number | 소스 타임스탬프 (epoch ms). 없으면 `null` |
| `serverTimestamp` | number | 서버 타임스탬프 (epoch ms) |

**throws:** 미연결 시 `"not connected"`, 실패 시 원본 예외

### `write(...writes)` → WriteResult

`writes[].node` (string), `writes[].value` (any).

**throws:** 미연결 시 `"not connected"`, 실패 시 원본 예외

### `browse(request)` → BrowseResult[]

| 파라미터 | 설명 |
|----------|------|
| `request.nodes` | 브라우즈할 노드 ID 목록 |
| `request.browseDirection` | 탐색 방향 (`opcua.BrowseDirection`). 기본값 `Forward` |
| `request.referenceTypeId` | 따라갈 참조 타입 노드 ID (예: `"ns=0;i=31"`) |
| `request.includeSubtypes` | 하위 타입 포함 여부. 기본값 `true` |
| `request.nodeClassMask` | 반환할 노드 클래스 비트마스크 (`opcua.NodeClass`) |
| `request.resultMask` | 반환할 필드 비트마스크 (`opcua.BrowseResultMask`). 기본값 `All` |
| `request.requestedMaxReferencesPerNode` | 노드당 최대 반환 수. `0`이면 무제한 |

### `browseNext(request)` → BrowseResult[]

| 파라미터 | 설명 |
|----------|------|
| `request.continuationPoints` | 이전 결과의 continuationPoint 목록 (base64) |
| `request.releaseContinuationPoints` | `true`면 서버 측 continuation point 해제 |

### `children(request)` → ChildrenResult[]

`request.node` (string), `request.nodeClassMask` (number, optional).

### `close()`

연결 종료. 이미 닫혀 있으면 no-op.

---

## Logger API

`cgi-bin/src/lib/logger.js`

### `init(config)` / `getInstance()`

| 파라미터 | 기본값 | 설명 |
|----------|--------|------|
| `config.disable` | `false` | `true`이면 모든 출력 비활성화 |
| `config.level` | `"info"` | 최소 로그 레벨. `trace`\|`debug`\|`info`\|`warn`\|`error` |
| `config.maxFiles` | `10` | 보관할 최대 파일 개수 |

로그 파일: `$HOME/public/logs/{패키지명}/repli.log` → 10 MB 초과 시 `repli_0001.log` 순환.

### 로그 메서드

```js
logger.trace(stage, fields?)
logger.debug(stage, fields?)
logger.info(stage, fields?)
logger.warn(stage, fields?)
logger.error(stage, fields?)
logger.banner(msg)
```

`stage`: 이벤트명 (예: `"collect"`), `fields`: 추가 키-값. `fields.msg`는 메시지로 처리됩니다.

---

## Collector API

`cgi-bin/src/collector.js`

### `new Collector(config, deps?)`

| 파라미터 | 설명 |
|----------|------|
| `config` | [설정](configuration.md) 전체 객체 |
| `deps.opcuaClient` | (테스트용) OpcuaClient 인스턴스 주입 |
| `deps.db` | (테스트용) `{ client, stream }` 주입 |
| `deps.collectorName` | (테스트용) collector 이름 주입 |
| `deps.lastCollectedAtWriter` | (테스트용) `lastCollectedAt` 갱신 콜백 주입 |

### `start()`

DB 연결 후 `setInterval`로 수집 루프 시작. 이미 실행 중이면 no-op.

### `collect()`

1. DB 미연결 시 재연결 시도. 실패 시 주기 건너뜀
2. `OpcuaClient.open()`. 실패 시 주기 건너뜀
3. `OpcuaClient.read(nodeIds)`. 예외 시 OpcuaClient + DB close → 주기 건너뜀
4. boolean 값 → 0/1 변환
5. `MachbaseStream.append([[name, time, value], ...])`
6. 성공 시 `service.details.lastCollectedAt` 갱신

### `close()`

`clearInterval` → OpcuaClient, MachbaseStream, MachbaseClient 순 close.
