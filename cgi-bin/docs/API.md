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
    "db": {
      "table": "TAG",
      "host": "127.0.0.1",
      "port": 5656,
      "user": "sys",
      "password": "manager"
    },
    "log": {
      "level": "INFO",
      "output": "console",
      "format": "json",
      "file": {
        "path": "./logs",
        "maxSize": "10MB",
        "maxFiles": 7,
        "rotate": "size"
      }
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
  "db": {
    "table": "TAG",
    "host": "127.0.0.1",
    "port": 5656,
    "user": "sys",
    "password": "manager"
  },
  "log": {
    "level": "INFO",
    "output": "console",
    "format": "json",
    "file": {
      "path": "./logs",
      "maxSize": "10MB",
      "maxFiles": 7,
      "rotate": "size"
    }
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

# POST DB connect test
echo '{
  "host": "127.0.0.1",
  "port": 5656,
  "user": "sys",
  "password": "manager"
}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/db/connect.js

# POST DB table create
echo '{
  "host": "127.0.0.1",
  "port": 5656,
  "user": "sys",
  "password": "manager",
  "table": "TAGDATA"
}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/db/table/create.js

# POST node children (OPC UA 노드 자식 목록 조회)
echo '{"endpoint": "opc.tcp://localhost:4840", "node": "ns=0;i=85"}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/node/children.js
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
> `running` 은 service status를 우선 사용하고, 필요 시 pid 파일 상태를 fallback으로 사용합니다.

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
    "db": {
      "table": "TAG",
      "host": "127.0.0.1",
      "port": 5656,
      "user": "sys",
      "password": "manager"
    },
    "log": {
      "level": "INFO",
      "output": "console",
      "format": "json",
      "file": {
        "path": "./logs/collector-a.log",
        "maxSize": "10MB",
        "maxFiles": 7,
        "rotate": "size"
      }
    }
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
| `config` 누락 | `"config is required"` |
| 동일한 `name` 이미 존재 | `"collector 'xxx' already exists"` |

---

## GET /cgi-bin/api/collector?name={name}

특정 collector의 config를 조회합니다.

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
      "db": {
        "table": "TAG",
        "host": "127.0.0.1",
        "port": 5656,
        "user": "sys",
        "password": "manager"
      },
      "log": {
        "level": "INFO",
        "output": "console",
        "format": "json",
        "file": {
          "path": "./logs/collector-a.log",
          "maxSize": "10MB",
          "maxFiles": 7,
          "rotate": "size"
        }
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
`GET /cgi-bin/api/collector` 응답에서는 `db.password` 가 제거되므로, `PUT` 요청에서 `db.password` 키가 없거나 값이 `""` 이면 기존 password를 유지합니다.

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
  "db": {
    "table": "TAG",
    "host": "127.0.0.1",
    "port": 5656,
    "user": "sys",
    "password": "manager"
  },
  "log": {
    "level": "INFO",
    "output": "console",
    "format": "json",
    "file": {
      "path": "./logs/collector-a.log",
      "maxSize": "10MB",
      "maxFiles": 7,
      "rotate": "size"
    }
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

등록된 collector service를 종료합니다. 성공 시 pid 파일도 함께 정리합니다.

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

---

## POST /cgi-bin/api/node/children

OPC UA 서버에 연결하여 지정한 노드의 browse reference 목록을 반환합니다.
현재 프론트엔드 node browser는 이 endpoint를 사용합니다.

`opcua.children()` 는 일부 서버/노드 조합에서 Variable 노드를 누락할 수 있어, UI 탐색용 endpoint는 `opcua.browse()` 기반으로 구현되어 있습니다.
예를 들어 `ns=1;s=Plant1.Line1` 노드에서는 `browse()` 에서 `Temperature`, `Pressure`, `Counter` 가 보이지만, `children()` 에서는 누락되는 현상을 확인했습니다.

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
| `node` | string | Y | browse reference를 조회할 OPC UA 노드 ID |
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
| 연결 실패 | `"connect failed"` |
| 조회 실패 | browse 오류 메시지 |

**jsh 직접 실행 (테스트용)**

```bash
echo '{"endpoint": "opc.tcp://localhost:4840", "node": "ns=0;i=85"}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/node/children.js
```

---

## POST /cgi-bin/api/node/children-native

OPC UA 서버에 연결하여 JSH `opcua.Client#children()` 결과를 그대로 반환합니다.
JSH native 동작을 확인하거나 `browse()` 결과와 비교할 때 사용합니다.

주의:
- 일부 서버/노드 조합에서는 `browse()` 에 비해 Variable 노드가 누락될 수 있습니다.
- `ns=1;s=Plant1.Line1` 테스트 서버에서는 `children-native` 가 `Line1` 만 반환하고, `Temperature`, `Pressure`, `Counter` 는 반환하지 않았습니다.

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
| `node` | string | Y | 자식을 조회할 OPC UA 노드 ID |
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
| 연결 실패 | `"connect failed"` |
| 조회 실패 | native children 오류 메시지 |

**jsh 직접 실행 (테스트용)**

```bash
echo '{"endpoint": "opc.tcp://localhost:4840", "node": "ns=0;i=85"}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/node/children-native.js
```

---

## POST /cgi-bin/api/db/connect

입력된 DB 접속 정보로 Machbase 연결을 한 번 시도해 유효성을 검사합니다.

요청 body는 collector 설정의 `db` 섹션과 같은 형식을 사용합니다.
`table` 필드는 필요하지 않습니다.

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
| `host` 누락 | `"db.host is required"` |
| `port` 누락 | `"db.port is required"` |
| `user` 누락 | `"db.user is required"` |
| `password` 누락 | `"db.password is required"` |
| 연결 실패 | Machbase 연결 오류 메시지 |

**jsh 직접 실행 (테스트용)**

```bash
echo '{
  "host": "127.0.0.1",
  "port": 5656,
  "user": "sys",
  "password": "manager"
}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/db/connect.js
```

---

## POST /cgi-bin/api/db/table/create

입력된 DB 접속 정보로 Machbase에 연결해 TAG 테이블을 생성합니다.

요청 body는 collector 설정의 `db` 섹션과 같은 형식을 사용합니다.

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
  "host": "127.0.0.1",
  "port": 5656,
  "user": "sys",
  "password": "manager",
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
| `host` 누락 | `"db.host is required"` |
| `port` 누락 | `"db.port is required"` |
| `user` 누락 | `"db.user is required"` |
| `password` 누락 | `"db.password is required"` |
| `table` 누락 | `"db.table is required"` |
| 테이블 이미 존재 | Machbase 오류 메시지 |
| 생성 실패 | Machbase 오류 메시지 |

**jsh 직접 실행 (테스트용)**

```bash
echo '{
  "host": "127.0.0.1",
  "port": 5656,
  "user": "sys",
  "password": "manager",
  "table": "TAGDATA"
}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST cgi-bin/api/db/table/create.js
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

`db` 섹션 전체를 생략하면 아래 기본값으로 연결합니다.

| 필드 | 타입 | 기본값 | 필수 | 설명 |
|------|------|--------|------|------|
| `table` | string | — | Y | 데이터를 저장할 Machbase 테이블명 |
| `host` | string | `"127.0.0.1"` | N | Machbase 호스트 |
| `port` | number | `5656` | N | Machbase 포트 |
| `user` | string | `"sys"` | N | 사용자명 |
| `password` | string | `"manager"` | N | 비밀번호 |

### log

| 필드 | 타입 | 기본값 | 필수 | 설명 |
|------|------|--------|------|------|
| `level` | string | `"INFO"` | N | 최소 로그 레벨. `DEBUG` \| `INFO` \| `WARN` \| `ERROR` |
| `output` | string | `"console"` | N | 출력 대상. `console` \| `file` \| `both` |
| `format` | string | `"json"` | N | 출력 형식. `json` \| `text` |
| `file.path` | string | — | `output`이 `file`/`both`일 때 Y | 로그 디렉토리 경로. collector 실행 시 실제 파일명은 `{설정이름}.log` |
| `file.maxSize` | string | `"10MB"` | N | 파일 최대 크기. 단위: `B` \| `KB` \| `MB` \| `GB` |
| `file.maxFiles` | number | `7` | N | 보관할 로그 파일 최대 개수 |
| `file.rotate` | string | `"size"` | N | 로테이션 방식. `size` \| `daily` |

`output`이 `console`이면 `file` 섹션은 무시됩니다.
