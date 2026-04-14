# Collector CGI API

`cgi-bin/api/` 하위의 CGI 스크립트가 제공하는 HTTP API 명세입니다.
모든 요청/응답 본문은 `application/json`입니다.

collector service 이름은 다른 패키지와 충돌하지 않도록 항상 `_opc_{name}` 형식을 사용합니다.

## 동작 방식

이 API는 **CGI(Common Gateway Interface)** 방식으로 동작합니다.
HTTP 서버 역할은 **machbase-neo**가 담당하며, 각 요청마다 해당 경로의 jsh 스크립트를 실행합니다.
스크립트는 Node.js가 아닌 machbase-neo 내장 **jsh(goja 기반)** 런타임에서 실행됩니다.

| 역할 | 담당 |
|------|------|
| HTTP 수신 및 라우팅 | machbase-neo (CGI 호스트) |
| 요청 전달 방식 | 환경변수(`REQUEST_METHOD`, `QUERY_STRING`) + stdin(요청 본문) |
| 응답 방식 | stdout에 `Content-Type:` 헤더 + 본문 출력 |
| 스크립트 실행 환경 | jsh (goja 기반 JS 엔진, Node.js 아님) |

### jsh 직접 실행 (테스트용)

```bash
# 실행 위치: /home/machbase/neo-pkg-opcua-client
# 주의: -e 플래그는 반드시 스크립트 파일 앞에 위치해야 함

# GET 목록
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET cgi-bin/api/collector/list.js

# GET 단건
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET -e QUERY_STRING=name=collector-a cgi-bin/api/collector.js

# POST 등록
echo '{
  "name": "collector-a",
  "config": {
    "opcua": {
      "endpoint": "opc.tcp://192.168.1.100:53530/OPCUA/SimulationServer",
      "readRetryInterval": 100,
      "interval": 5000,
      "nodes": [
        { "nodeId": "ns=3;i=1001", "name": "sensor.tag1" }
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
}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/collector.js

# PUT 수정
echo '{
  "opcua": {
    "endpoint": "opc.tcp://192.168.1.100:53530/OPCUA/SimulationServer",
    "readRetryInterval": 100,
    "interval": 5000,
    "nodes": [
      { "nodeId": "ns=3;i=1001", "name": "sensor.tag1" }
    ]
  },
  "db": "my-server",
  "dbTable": "TAG",
  "valueColumn": "VALUE",
  "log": {
    "level": "info",
    "maxFiles": 7
  }
}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=PUT -e QUERY_STRING=name=collector-a cgi-bin/api/collector.js

# DELETE 삭제
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=DELETE -e QUERY_STRING=name=collector-a cgi-bin/api/collector.js

# POST service install
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST -e QUERY_STRING=name=collector-a cgi-bin/api/collector/install.js

# GET 마지막 성공 수집 시간
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET -e QUERY_STRING=name=collector-a cgi-bin/api/collector/last-time.js

# POST 시작
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST -e QUERY_STRING=name=collector-a cgi-bin/api/collector/start.js

# POST 종료
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST -e QUERY_STRING=name=collector-a cgi-bin/api/collector/stop.js

# POST DB server 등록
echo '{
  "name": "my-server",
  "host": "127.0.0.1",
  "port": 5656,
  "user": "sys",
  "password": "manager"
}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/db/server.js

# GET DB server 목록
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET cgi-bin/api/db/server/list.js

# GET DB connect test
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET -e QUERY_STRING=server=my-server cgi-bin/api/db/connect.js

# POST DB table create
echo '{ "server": "my-server", "table": "TAGDATA" }' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/db/table/create.js

# GET DB table columns
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET -e QUERY_STRING=server=my-server\&table=TAG cgi-bin/api/db/table/columns.js

# GET OPC UA read
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET -e QUERY_STRING=endpoint=opc.tcp://localhost:4840\&nodes=ns=3;i=1001 cgi-bin/api/opcua/read.js

# POST OPC UA write
echo '{"endpoint": "opc.tcp://localhost:4840", "writes": [{"node": "ns=3;i=1001", "value": 42.0}]}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/opcua/write.js

# POST OPC UA node descendants
echo '{"endpoint": "opc.tcp://localhost:4840", "node": "ns=0;i=85"}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/opcua/node/descendants.js
```

---

## 공통 응답 형식

### 성공

```json
{ "ok": true, "data": { ... } }
```

### 실패

```json
{ "ok": false, "reason": "오류 메시지" }
```

---

## GET /cgi-bin/api/collector/list

`conf.d/{name}.json` 이 존재하는 collector 목록을 반환합니다. `_opc_{name}` service에 등록되어 있지 않은 항목도 포함되며, 이 경우 `installed` 는 `false` 입니다.

**응답**

```json
{
  "ok": true,
  "data": [
    {
      "name": "collector-a",
      "installed": true,
      "running": false
    }
  ]
}
```

> config만 있고 service에 등록되지 않은 항목은 `installed: false` 로 반환됩니다.

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
      "nodes": [
        { "nodeId": "ns=3;i=1001", "name": "sensor.tag1" }
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

> `config.db`는 `/cgi-bin/api/db/server` 로 등록한 DB 서버 이름입니다.

**응답 (성공)**

```json
{ "ok": true, "data": { "name": "collector-a" } }
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| `config` 누락 | `"config is required"` |
| 동일한 `name` 이미 존재 | `"collector 'xxx' already exists"` |

---

## GET /cgi-bin/api/collector?name={name}

특정 collector의 config를 조회합니다. `db.password`는 반환하지 않습니다.

**쿼리 파라미터**

| 이름 | 필수 | 설명 |
|------|------|------|
| `name` | Y | collector 이름 |

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
        "nodes": [
          { "nodeId": "ns=3;i=1001", "name": "sensor.tag1" }
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

## PUT /cgi-bin/api/collector?name={name}

특정 collector의 config를 수정합니다. 요청 본문 전체가 새 config로 덮어씌워집니다. collector service가 현재 실행 중이면 config 저장 후 `stop -> start` 를 수행합니다. 실행 중이 아니면 config만 갱신합니다.

`config.db`가 인라인 object이고 `db.password` 키가 없거나 값이 `""` 이면 기존 password를 유지합니다.

**쿼리 파라미터**

| 이름 | 필수 | 설명 |
|------|------|------|
| `name` | Y | collector 이름 |

**요청 본문** — `config` 객체 전체

```json
{
  "opcua": {
    "endpoint": "opc.tcp://192.168.1.100:53530/OPCUA/SimulationServer",
    "readRetryInterval": 100,
    "interval": 5000,
    "nodes": [
      { "nodeId": "ns=3;i=1001", "name": "sensor.tag1" }
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
{ "ok": true, "data": { "name": "collector-a" } }
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 해당 collector 없음 | `"collector 'xxx' not found"` |

---

## DELETE /cgi-bin/api/collector?name={name}

특정 collector를 삭제합니다. 실행 중이면 먼저 service를 stop 하고, 이후 service uninstall, pid 삭제, config 삭제를 수행합니다.

**쿼리 파라미터**

| 이름 | 필수 | 설명 |
|------|------|------|
| `name` | Y | collector 이름 |

**응답 (성공)**

```json
{ "ok": true }
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 해당 collector 없음 | `"collector 'xxx' not found"` |

---

## POST /cgi-bin/api/collector/start?name={name}

등록된 collector service를 시작합니다.

**응답 (성공)**

```json
{ "ok": true, "data": { "name": "collector-a" } }
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 해당 collector 없음 | `"collector 'xxx' not found"` |
| service 시작 실패 | service controller 오류 메시지 |

---

## POST /cgi-bin/api/collector/install?name={name}

config는 있지만 `_opc_{name}` service가 아직 없는 collector에 대해 service install만 수행합니다.

**응답 (성공)**

```json
{ "ok": true, "data": { "name": "collector-a" } }
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 해당 collector 없음 | `"collector 'xxx' not found"` |
| service 이미 설치됨 | `"collector 'xxx' service already installed"` |
| service 설치 실패 | service controller 오류 메시지 |

---

## GET /cgi-bin/api/collector/last-time?name={name}

collector service details에 저장된 마지막 성공 수집 시간을 반환합니다.

- service details key: `lastCollectedAt`
- 수집 성공 시에만 갱신됩니다.
- collect 실패 시에는 이전 값이 유지됩니다.
- details가 아직 없거나 service가 install되지 않은 경우 `null` 을 반환합니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": {
    "name": "collector-a",
    "lastCollectedAt": 1775645400000
  }
}
```

details가 아직 없으면:

```json
{
  "ok": true,
  "data": {
    "name": "collector-a",
    "lastCollectedAt": null
  }
}
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 해당 collector 없음 | `"collector 'xxx' not found"` |
| details 조회 실패 | service controller 오류 메시지 |

---

## POST /cgi-bin/api/collector/stop?name={name}

등록된 collector service를 종료합니다.

**응답 (성공)**

```json
{ "ok": true, "data": { "name": "collector-a" } }
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 해당 collector 없음 | `"collector 'xxx' not found"` |
| service 종료 실패 | service controller 오류 메시지 |

---

## POST /cgi-bin/api/db/server

DB 서버 접속 정보를 등록합니다. `password`는 조회 시 반환하지 않습니다.

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

**응답 (성공)**

```json
{ "ok": true, "data": { "name": "my-server" } }
```

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| `host` 누락 | `"host is required"` |
| `port` 누락 | `"port is required"` |
| `user` 누락 | `"user is required"` |
| `password` 누락 | `"password is required"` |
| 동일한 `name` 이미 존재 | `"server 'xxx' already exists"` |

---

## GET /cgi-bin/api/db/server?name={name}

DB 서버 접속 정보를 단건 조회합니다.

**쿼리 파라미터**

| 이름 | 필수 | 설명 |
|------|------|------|
| `name` | Y | 서버 이름 |

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

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 해당 서버 없음 | `"server 'xxx' not found"` |

---

## PUT /cgi-bin/api/db/server?name={name}

DB 서버 접속 정보를 수정합니다. `password`가 없거나 `""`이면 기존 값을 유지합니다.

**쿼리 파라미터**

| 이름 | 필수 | 설명 |
|------|------|------|
| `name` | Y | 서버 이름 |

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
{ "ok": true, "data": { "name": "my-server" } }
```

---

## DELETE /cgi-bin/api/db/server?name={name}

DB 서버 접속 정보를 삭제합니다.

**쿼리 파라미터**

| 이름 | 필수 | 설명 |
|------|------|------|
| `name` | Y | 서버 이름 |

**응답 (성공)**

```json
{ "ok": true }
```

---

## GET /cgi-bin/api/db/server/list

등록된 DB 서버 목록을 반환합니다.

**응답 (성공)**

```json
{
  "ok": true,
  "data": [
    {
      "name": "my-server",
      "config": { "host": "127.0.0.1", "port": 5656, "user": "sys" }
    }
  ]
}
```

---

## GET /cgi-bin/api/db/connect?server={name}

등록된 서버 이름으로 Machbase 연결을 한 번 시도해 유효성을 검사합니다.

**쿼리 파라미터**

| 이름 | 필수 | 설명 |
|------|------|------|
| `server` | Y | 서버 이름 |

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

**jsh 직접 실행 (테스트용)**

```bash
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET -e QUERY_STRING=server=my-server cgi-bin/api/db/connect.js
```

---

## POST /cgi-bin/api/db/table/create

입력된 서버에 연결해 TAG 테이블을 생성합니다.

실행 SQL:

```sql
CREATE TAG TABLE ${table} (
  NAME VARCHAR(100) PRIMARY KEY,
  TIME DATETIME BASETIME,
  VALUE DOUBLE SUMMARIZED
);
```

이미 같은 이름의 테이블이 있으면 오류를 반환합니다.

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
| `server` 누락 | `"server is required"` |
| `table` 누락 | `"table is required"` |
| 해당 서버 없음 | `"server 'xxx' not found"` |
| 테이블 이미 존재 | `"table 'xxx' already exists"` |
| 생성 실패 | Machbase 오류 메시지 |

**jsh 직접 실행 (테스트용)**

```bash
echo '{ "server": "my-server", "table": "TAGDATA" }' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/db/table/create.js
```

---

## GET /cgi-bin/api/db/table/columns?server={name}&table={table}

등록된 서버의 테이블 컬럼 목록을 조회합니다.

**쿼리 파라미터**

| 이름 | 필수 | 설명 |
|------|------|------|
| `server` | Y | 서버 이름 |
| `table` | Y | 테이블 이름 |

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

TAG 테이블만 허용됩니다. LOG 등 다른 타입이나 존재하지 않는 테이블이면 오류를 반환합니다.

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `server` 누락 | `"server is required"` |
| `table` 누락 | `"table is required"` |
| 해당 서버 없음 | `"server 'xxx' not found"` |
| TAG 테이블이 아님 (없거나 다른 타입) | `"table 'xxx' is not a TAG table"` |

---

## GET /cgi-bin/api/opcua/read?endpoint={url}&nodes={ids}

OPC UA 서버에서 노드 값을 일회성으로 읽습니다.

**쿼리 파라미터**

| 이름 | 필수 | 설명 |
|------|------|------|
| `endpoint` | Y | OPC UA 서버 주소 |
| `nodes` | Y | 노드 ID 목록 (쉼표 구분) |

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
| `endpoint` 누락 | `"endpoint is required"` |
| `nodes` 누락 | `"nodes is required"` |
| `nodes` 빈 값 | `"nodes is empty"` |
| 연결 실패 | `"connect failed: <endpoint>"` |
| 읽기 실패 | OPC UA 오류 메시지 |

**jsh 직접 실행 (테스트용)**

```bash
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=GET \
  -e QUERY_STRING=endpoint=opc.tcp://localhost:4840\&nodes=ns=3;i=1001 \
  cgi-bin/api/opcua/read.js
```

---

## POST /cgi-bin/api/opcua/write

OPC UA 서버 노드에 값을 일회성으로 씁니다.

**요청 본문**

```json
{
  "endpoint": "opc.tcp://192.168.1.100:53530/OPCUA/SimulationServer",
  "writes": [
    { "node": "ns=3;i=1001", "value": 42.0 }
  ]
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `endpoint` | string | Y | OPC UA 서버 주소 |
| `writes` | array | Y | 쓰기 항목 목록 (1개 이상) |
| `writes[].node` | string | Y | 쓸 노드 ID |
| `writes[].value` | any | Y | 쓸 값 |

**응답 (성공)**

`data`는 OPC UA 서버가 반환한 `WriteResult` 원본 객체입니다.

```json
{ "ok": true, "data": { "statusCode": 0, "statusText": "Good" } }
```

> 정확한 `WriteResult` 구조는 JSH 런타임/OPC UA 서버 구현에 따라 다를 수 있습니다.

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `endpoint` 누락 | `"endpoint is required"` |
| `writes` 누락/빈 배열 | `"writes is required and must be a non-empty array"` |
| 항목에 `node` 없음 | `"each write entry must have a node"` |
| 항목에 `value` 없음 | `"value is required for node 'xxx'"` |
| 연결 실패 | `"connect failed: <endpoint>"` |
| 쓰기 실패 | OPC UA 오류 메시지 |

**jsh 직접 실행 (테스트용)**

```bash
echo '{"endpoint": "opc.tcp://localhost:4840", "writes": [{"node": "ns=3;i=1001", "value": 42.0}]}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/opcua/write.js
```

---

## POST /cgi-bin/api/opcua/node/descendants

OPC UA 서버에 연결하여 지정한 노드의 모든 하위 노드를 BFS로 탐색합니다.
프론트엔드 node browser가 이 endpoint를 사용합니다.

`opcua.children()` 은 일부 서버/노드 조합에서 Variable 노드를 누락할 수 있어, `browse()` 기반 BFS 탐색을 사용합니다.

**요청 본문**

```json
{
  "endpoint": "opc.tcp://192.168.1.100:53530/OPCUA/SimulationServer",
  "node": "ns=0;i=85",
  "nodeClassMask": 0
}
```

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `endpoint` | string | Y | OPC UA 서버 주소 |
| `node` | string | Y | 탐색 시작 노드 ID |
| `nodeClassMask` | number | N | 반환할 노드 클래스 비트마스크 (`opcua.NodeClass`) |

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
| `endpoint` 누락 | `"endpoint is required"` |
| `node` 누락 | `"node is required"` |
| 연결 실패 | `"connect failed: <endpoint>"` |
| 탐색 실패 | browse 오류 메시지 |

**jsh 직접 실행 (테스트용)**

```bash
echo '{"endpoint": "opc.tcp://localhost:4840", "node": "ns=0;i=85"}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/opcua/node/descendants.js
```

---

## Config 필드 레퍼런스

### opcua

| 필드 | 타입 | 기본값 | 필수 | 설명 |
|------|------|--------|------|------|
| `endpoint` | string | — | Y | OPC UA 서버 주소 (`opc.tcp://...`) |
| `readRetryInterval` | number | `100` | N | 읽기 재시도 간격 (ms) |
| `interval` | number | — | Y | 수집 주기 (ms) |
| `nodes` | array | — | Y | 수집할 노드 목록 |
| `nodes[].nodeId` | string | — | Y | OPC UA 노드 ID (예: `ns=3;i=1001`) |
| `nodes[].name` | string | — | Y | Machbase TAG 이름 (예: `sensor.tag1`) |

### db

| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `db` | string | Y | 등록된 DB 서버 이름 (`/cgi-bin/api/db/server` 로 관리) |
| `dbTable` | string | Y | 데이터를 저장할 테이블명 |
| `valueColumn` | string | N | 값을 저장할 컬럼명. 기본값 `"VALUE"` |

### log

| 필드 | 타입 | 기본값 | 필수 | 설명 |
|------|------|--------|------|------|
| `disable` | boolean | `false` | N | `true`이면 모든 로그 출력 비활성화 |
| `level` | string | `"info"` | N | 최소 로그 레벨. `trace` \| `debug` \| `info` \| `warn` \| `error` |
| `maxFiles` | number | `10` | N | 보관할 최대 로그 파일 개수 |

로그는 `$HOME/public/logs/{패키지명}/repli.log` 에 출력됩니다. 파일 크기가 10 MB를 초과하면 `repli_0001.log`, `repli_0002.log` 순으로 순환합니다.

---

## OpcuaClient API

`cgi-bin/src/opcua/opcua-client.js`

### `new OpcuaClient(endpoint, readRetryInterval?)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `endpoint` | string | OPC UA 서버 주소 (예: `opc.tcp://localhost:4840`) |
| `readRetryInterval` | number | 읽기 재시도 간격 (ms). 기본값 `100` |

### `open()`

OPC UA 서버에 연결합니다. 이미 연결된 경우 no-op.

**반환값:** 연결 성공(또는 이미 연결됨) 시 `true`, 실패 시 `false`. 예외를 던지지 않습니다.

### `read(nodeIds)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `nodeIds` | string[] | OPC UA 노드 ID 목록 |

**반환값:** `ReadResult[]`

**throws:** 미연결 시 `"not connected"`, 읽기 실패 시 원본 예외

#### ReadResult 필드

| 필드 | 타입 | 설명 |
|------|------|------|
| `value` | any | 읽은 값 |
| `type` | string | 값 타입 이름 (예: `Boolean`, `Int32`, `Double`) |
| `status` | number | OPC UA 상태 코드 (uint32) |
| `statusText` | string | 상태 텍스트 |
| `statusCode` | string | 상태 코드 이름 (예: `StatusGood`) |
| `sourceTimestamp` | number | 소스 타임스탬프 (Unix epoch ms). 없으면 `null` |
| `serverTimestamp` | number | 서버 타임스탬프 (Unix epoch ms) |

### `write(...writes)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `writes[].node` | string | 쓸 OPC UA 노드 ID |
| `writes[].value` | any | 쓸 값 |

**반환값:** `WriteResult` (JSH 런타임 원본 객체)

**throws:** 미연결 시 `"not connected"`, 쓰기 실패 시 원본 예외

### `browse(request)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `request.nodes` | string[] | 브라우즈할 OPC UA 노드 ID 목록 |
| `request.browseDirection` | number | 탐색 방향 (`opcua.BrowseDirection`). 기본값 `Forward` |
| `request.referenceTypeId` | string | 따라갈 참조 타입 노드 ID (예: `"ns=0;i=31"`) |
| `request.includeSubtypes` | boolean | 하위 타입 포함 여부. 기본값 `true` |
| `request.nodeClassMask` | number | 반환할 노드 클래스 비트마스크 (`opcua.NodeClass`) |
| `request.resultMask` | number | 반환할 필드 비트마스크 (`opcua.BrowseResultMask`). 기본값 `All` |
| `request.requestedMaxReferencesPerNode` | number | 노드당 최대 반환 참조 수. `0`이면 무제한 |

**반환값:** `BrowseResult[]`

**throws:** 미연결 시 `"not connected"`, 조회 실패 시 원본 예외

### `browseNext(request)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `request.continuationPoints` | string[] | 이전 결과의 `continuationPoint` 목록 (base64) |
| `request.releaseContinuationPoints` | boolean | `true`면 서버 측 continuation point 해제. 기본값 `false` |

**반환값:** `BrowseResult[]`

**throws:** 미연결 시 `"not connected"`, 조회 실패 시 원본 예외

### `children(request)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `request.node` | string | 자식을 조회할 OPC UA 노드 ID |
| `request.nodeClassMask` | number | 반환할 노드 클래스 비트마스크 (`opcua.NodeClass`) |

**반환값:** `ChildrenResult[]`

**throws:** 미연결 시 `"not connected"`, 조회 실패 시 원본 예외

### `close()`

서버 연결을 종료합니다. 이미 닫혀 있으면 no-op.

---

## Logger API

`cgi-bin/src/lib/logger.js`

### `init(config)`

전역 Logger 인스턴스를 교체합니다.

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `config.disable` | boolean | `true`이면 모든 출력 비활성화. 기본값 `false` |
| `config.level` | string | 최소 로그 레벨. `trace` \| `debug` \| `info` \| `warn` \| `error`. 기본값 `info` |
| `config.maxFiles` | number | 보관할 최대 파일 개수. 기본값 `10` |

### `getInstance()`

전역 Logger 인스턴스를 반환합니다.

### `new Logger(config?)`

독립 설정을 가진 Logger를 직접 생성합니다. `init()`/`getInstance()` 와 무관합니다. 파라미터는 `init(config)` 와 동일합니다.

### 로그 메서드

```js
logger.trace(stage, fields?)
logger.debug(stage, fields?)
logger.info(stage, fields?)
logger.warn(stage, fields?)
logger.error(stage, fields?)
```

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `stage` | string | 출력 단계 또는 이벤트명 (예: `"collect"`, `"db open"`) |
| `fields` | object | 추가 출력 필드. `msg` 키는 메시지로 처리됨 |

### `logger.banner(msg)`

구분선과 함께 타임스탬프를 포함한 배너를 출력합니다.

---

## Collector API

`cgi-bin/src/collector.js`

### `new Collector(config, deps?)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `config` | object | [설정](configuration.md) 전체 객체 |
| `config.db` | string | DB 서버 이름 (`CGI.getServerConfig(config.db)`로 접속 정보 조회) |
| `config.dbTable` | string | 데이터를 저장할 테이블명 |
| `config.valueColumn` | string | 값을 저장할 컬럼명. 기본값 `"VALUE"` |
| `deps.opcuaClient` | OpcuaClient | (테스트용) OpcuaClient 인스턴스 주입 |
| `deps.db` | `{ client, stream }` | (테스트용) MachbaseClient + MachbaseStream 인스턴스 주입 |
| `deps.collectorName` | string | (테스트용) collector 이름 주입 |
| `deps.lastCollectedAtWriter` | function | (테스트용) `lastCollectedAt` 갱신 콜백 주입 |

### `start()`

DB 연결(`_openDb()`)을 시도한 뒤 `setInterval`로 수집 루프를 시작합니다. 이미 실행 중이면 no-op. 초기 DB 연결 실패는 경고 로그만 출력하고, 다음 `collect()` 주기에 재연결을 시도합니다.

### `close()`

`setInterval`을 정지하고 OpcuaClient, MachbaseStream, MachbaseClient를 각각 `close()`합니다. 하나가 실패해도 나머지가 반드시 실행됩니다.

### `collect()`

노드 값을 읽어 DB에 저장하는 단위 작업입니다. `setInterval` 콜백에서 호출됩니다.

1. DB가 열려 있지 않으면 `_openDb()` 재연결 시도. 실패 시 주기 건너뜀
2. `OpcuaClient.open()` 호출. 실패 시 경고 로그 후 주기 건너뜀
3. `OpcuaClient.read(nodeIds)` 호출. 예외 발생 시 OpcuaClient + DB close 후 주기 건너뜀
4. 각 노드의 값을 `_normalizeValue(value)` 로 변환: boolean → 0/1
5. `MachbaseStream.append([[name, time, value], ...])` 호출
6. 성공 시 `_recordLastCollectedAt(lastTs)` 로 `service.details.lastCollectedAt` 갱신
