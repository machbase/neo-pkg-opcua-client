# CGI API Reference

모든 응답은 JSON이며 공통 구조는 다음과 같습니다.

```json
{ "ok": true,  "data": { ... } }
{ "ok": false, "reason": "오류 메시지" }
```

---

## Collector CRUD

### GET /cgi-bin/api/collector

수집기 설정을 단건 조회합니다. `db.password`는 반환하지 않습니다.

**Query**

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `name` | ✓ | 수집기 이름 |

**Response `data`**

```json
{
  "name": "collector-a",
  "config": {
    "opcua": {
      "endpoint": "opc.tcp://host:port/path",
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
      "user": "sys"
    },
    "log": {
      "level": "INFO",
      "output": "both",
      "format": "json",
      "file": {
        "path": "./logs/collector-a.log",
        "maxSize": "10MB",
        "maxFiles": 7,
        "rotate": "daily"
      }
    }
  }
}
```

---

### POST /cgi-bin/api/collector

수집기를 등록합니다.

**Body**

```json
{
  "name": "collector-a",
  "config": { ... }
}
```

**Response `data`**

```json
{ "name": "collector-a" }
```

---

### PUT /cgi-bin/api/collector

수집기 설정을 수정합니다.

**Query**

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `name` | ✓ | 수집기 이름 |

**Body** — 전체 config 객체 (GET 응답의 `config` 구조와 동일, `db.password` 포함)

**Response `data`**

```json
{ "name": "collector-a" }
```

---

### DELETE /cgi-bin/api/collector

수집기 설정을 삭제합니다.

**Query**

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `name` | ✓ | 수집기 이름 |

**Response** — `{ "ok": true }`

---

## Collector List

### GET /cgi-bin/api/collector/list

등록된 모든 수집기 목록과 실행 상태를 반환합니다.

**Response `data`**

```json
[
  { "name": "collector-a", "running": true },
  { "name": "collector-b", "running": false }
]
```

---

## Collector Control

> 데몬 직접 실행 방식은 현재 미지원입니다. 아래 두 엔드포인트는 수동 실행 안내를 반환합니다.

### POST /cgi-bin/api/collector/start

수집기를 시작합니다.

**Query**

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `name` | ✓ | 수집기 이름 |

**Response (현재)**

```json
{
  "ok": false,
  "reason": "daemon not supported yet. run manually: machbase-neo jsh cgi-bin/neo-collector.js cgi-bin/conf.d/<name>.json"
}
```

---

### POST /cgi-bin/api/collector/stop

수집기를 종료합니다.

**Query**

| 파라미터 | 필수 | 설명 |
|----------|------|------|
| `name` | ✓ | 수집기 이름 |

**Response (현재)**

```json
{
  "ok": false,
  "reason": "daemon not supported yet. stop manually: kill $(cat cgi-bin/run/<name>.pid)"
}
```

---

## OPC UA Node

### POST /cgi-bin/api/node/children

OPC UA 서버에 연결하여 지정한 노드의 자식 노드 목록을 조회합니다.

**Body**

```json
{
  "endpoint": "opc.tcp://localhost:4840",
  "node": "ns=0;i=85",
  "nodeClassMask": 0
}
```

| 필드 | 필수 | 설명 |
|------|------|------|
| `endpoint` | ✓ | OPC UA 서버 주소 |
| `node` | ✓ | 조회할 노드 ID |
| `nodeClassMask` | — | 반환할 노드 클래스 비트마스크 (`opcua.NodeClass`). 생략 시 전체 |

**Response `data`** — 자식 노드 배열 (OPC UA `ChildrenResult[]`)
