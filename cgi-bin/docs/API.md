# Collector CGI API

`cgi-bin/api/` 하위의 CGI 스크립트가 제공하는 HTTP API 명세입니다.
모든 요청/응답 본문은 `application/json`입니다.

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
        "path": "./logs/collector-a.log",
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
      "path": "./logs/collector-a.log",
      "maxSize": "10MB",
      "maxFiles": 7,
      "rotate": "size"
    }
  }
}' | \
  ../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=PUT -e QUERY_STRING=name=collector-a cgi-bin/api/collector.js

# DELETE 삭제
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=DELETE -e QUERY_STRING=name=collector-a cgi-bin/api/collector.js

# POST 시작 (현재 미구현 — 수동 실행 안내 반환)
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST -e QUERY_STRING=name=collector-a cgi-bin/api/collector/start.js

# POST 종료 (현재 미구현 — 수동 종료 안내 반환)
../machbase-neo/machbase-neo jsh -e REQUEST_METHOD=POST -e QUERY_STRING=name=collector-a cgi-bin/api/collector/stop.js
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

전체 collector 목록과 각 config, 실행 상태를 반환합니다.

**응답**

```json
{
  "ok": true,
  "data": [
    {
      "name": "collector-a",
      "running": false
    }
  ]
}
```

> `running`은 `cgi-bin/run/{name}.pid` 파일 존재 여부로 판단합니다.

---

## POST /cgi-bin/api/collector

새 collector를 등록합니다.

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

특정 collector의 config를 수정합니다. 요청 본문 전체가 새 config로 덮어씌워집니다.

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

특정 collector의 config 파일을 삭제합니다.

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

collector 실행을 요청합니다.

> **현재 미구현.** 데몬 연동이 구현되기 전까지는 `ok: false`를 반환합니다.
> 수동 실행: `machbase-neo jsh cgi-bin/neo-collector.js cgi-bin/conf.d/{name}.json`

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 해당 collector 없음 | `"collector 'xxx' not found"` |
| 데몬 미지원 (현재 항상) | `"daemon not supported yet. run manually: ..."` |

---

## POST /cgi-bin/api/collector/stop?name={name}

collector 종료를 요청합니다.

> **현재 미구현.** 데몬 연동이 구현되기 전까지는 `ok: false`를 반환합니다.
> 수동 종료: `kill $(cat cgi-bin/run/{name}.pid)`

**응답 (실패)**

| 조건 | reason |
|------|--------|
| `name` 누락 | `"name is required"` |
| 해당 collector 없음 | `"collector 'xxx' not found"` |
| 데몬 미지원 (현재 항상) | `"daemon not supported yet. stop manually: ..."` |

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
| `file.path` | string | — | `output`이 `file`/`both`일 때 Y | 로그 파일 경로 |
| `file.maxSize` | string | `"10MB"` | N | 파일 최대 크기. 단위: `B` \| `KB` \| `MB` \| `GB` |
| `file.maxFiles` | number | `7` | N | 보관할 로그 파일 최대 개수 |
| `file.rotate` | string | `"size"` | N | 로테이션 방식. `size` \| `daily` |

`output`이 `console`이면 `file` 섹션은 무시됩니다.
