# neo-tools

machbase-neo JSH 환경에서 OPC UA 서버로부터 주기적으로 데이터를 수집하여 Machbase TAG 테이블에 저장하는 데이터 수집기입니다.

## 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    neo-collector.js                          │
│  config 로드 → logger 초기화 → Collector 시작 → shutdown    │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                      Collector                              │
│                                                             │
│   start()                                                   │
│     └─ open() each ─────────────┐                         │
│     └─ setInterval(interval)     │                         │
│          └─ collect()            │                         │
│               ├─ isOpen() check  │                         │
│               ├─ read(nodeIds)   │                         │
│               ├─ append() × N   │                         │
│               └─ flush()        │                         │
│   close()                        │                         │
└──────┬──────────────┬────────────┘                         │
       │              │                                       │
       ▼              ▼                                       │
┌──────────────┐  ┌──────────────────┐                       │
│ OpcuaClient  │  │ MachbaseAppender │                       │
│              │  │                  │                       │
│ open()       │  │ open()           │                       │
│ read()       │  │ isOpen()         │                       │
│ close()      │  │ append()         │                       │
│              │  │ flush()          │                       │
│              │  │ close()          │                       │
└──────┬───────┘  └────────┬─────────┘                       │
       │                   │                                  │
       ▼                   ▼                                  │
┌──────────────┐  ┌──────────────────┐                       │
│  OPC UA      │  │  Machbase DB     │                       │
│  Server      │  │  (TAG table)     │                       │
└──────────────┘  └──────────────────┘                       │
                                                              │
┌─────────────────────────────────────────────────────────────┘
│                       Logger
│
│  init(config)  ──→  전역 설정 초기화
│  getLogger(name)  ──→  모듈별 Logger 반환
│
│  level 필터 → format(json|text) → output(console|file|both)
│                                          └─ LogRotator
│                                               ├─ size rotate
│                                               └─ daily rotate
└─────────────────────────────────────────────────────────────
```

## 데이터 흐름

```
OPC UA Server
    │
    │  read(nodeIds)  [매 interval마다]
    ▼
OpcuaClient
    │
    │  ReadResult[] { value, sourceTimestamp }
    ▼
Collector.collect()
    │
    │  append(name, time, value)
    ▼
MachbaseAppender
    │
    │  flush()
    ▼
Machbase TAG Table
    │
    NAME          TIME                  VALUE
    sensor.tag1   2026-03-09 14:13:41   9.0
    sensor.tag2   2026-03-09 14:13:41   0.0
    ...
```

## 구조

```
neo-tools/
└── cgi-bin/
    ├── neo-collector.js        # 데몬 진입점
    ├── api/
    │   ├── collector.js        # POST/GET/PUT/DELETE  /cgi-bin/api/collector
    │   ├── collector/
    │   │   ├── list.js         # GET    /cgi-bin/api/collector/list
    │   │   ├── install.js      # POST   /cgi-bin/api/collector/install?name=xxx
    │   │   ├── last-time.js    # GET    /cgi-bin/api/collector/last-time?name=xxx
    │   │   ├── start.js        # POST   /cgi-bin/api/collector/start?name=xxx
    │   │   └── stop.js         # POST   /cgi-bin/api/collector/stop?name=xxx
    │   ├── db/
    │   │   ├── connect/
    │   │   │   └── test.js     # POST   /cgi-bin/api/db/connect/test
    │   │   └── table/
    │   │       └── create.js   # POST   /cgi-bin/api/db/table/create
    │   └── node/
    │       ├── children.js     # POST   /cgi-bin/api/node/children
    │       └── children-native.js # POST /cgi-bin/api/node/children-native
    ├── conf.d/
    │   └── collector-a.json    # 수집기 설정 파일
    ├── src/
    │   ├── cgi/
    │   │   └── cgi_util.js         # CGI 유틸 (parseQuery, readBody, reply, CRUD, isRunning)
    │   ├── collector.js            # Collector 클래스
    │   ├── logger.js               # Logger / LogRotator 클래스
    │   ├── db/
    │   │   ├── machbase-appender.js  # MachbaseAppender 클래스
    │   │   └── machbase-client.js    # DB connect / exec helper
    │   └── opcua/
    │       └── opcua-client.js       # OpcuaClient 클래스 (read/write/browse/browseNext/children)
    ├── test/
    │   ├── index.js              # 테스트 진입점
    │   ├── runner.js             # 테스트 러너
    │   ├── logger.test.js
    │   ├── opcua-client.test.js
    │   ├── machbase-client.test.js
    │   ├── machbase-appender.test.js
    │   └── collector.test.js
    └── docs/
```

## 실행

```bash
machbase-neo jsh -v /app=<프로젝트 경로> /app/cgi-bin/neo-collector.js <config 경로>
```

**예시:**
```bash
machbase-neo jsh -v /app=/path/to/neo-tools /app/cgi-bin/neo-collector.js /app/cgi-bin/conf.d/collector-a.json
```

## CGI 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/cgi-bin/api/collector/list` | 수집기 목록 조회 (`installed`, `running` 상태 포함) |
| POST | `/cgi-bin/api/collector` | 수집기 등록 + service install (body: `{ name, config }`) |
| GET | `/cgi-bin/api/collector?name=xxx` | 수집기 단건 조회 |
| PUT | `/cgi-bin/api/collector?name=xxx` | 수집기 설정 수정. 실행 중이면 service stop -> start. `db.password` 가 없거나 `""` 이면 기존 값을 유지 (body: config) |
| DELETE | `/cgi-bin/api/collector?name=xxx` | 수집기 삭제 + service uninstall |
| POST | `/cgi-bin/api/collector/install?name=xxx` | config-only 수집기의 service 설치 |
| GET | `/cgi-bin/api/collector/last-time?name=xxx` | 마지막 성공 수집 시간 조회 (`service.details.lastCollectedAt`, epoch ms) |
| POST | `/cgi-bin/api/collector/start?name=xxx` | 등록된 service 시작 |
| POST | `/cgi-bin/api/collector/stop?name=xxx` | 등록된 service 종료 |
| POST | `/cgi-bin/api/db/connect/test` | DB 접속 정보 유효성 검사 (body는 `config.db` 와 동일, `table` 제외 가능) |
| POST | `/cgi-bin/api/db/table/create` | TAG 테이블 생성 (body는 `config.db` 와 동일) |
| POST | `/cgi-bin/api/node/children` | OPC UA 노드 browse reference 목록 조회. UI 탐색용 endpoint (body: `{ endpoint, node }`) |
| POST | `/cgi-bin/api/node/children-native` | JSH `opcua.children()` 원형 결과 조회용 endpoint (body: `{ endpoint, node }`) |

## 테스트

```bash
machbase-neo jsh -v /app=<프로젝트 경로> /app/cgi-bin/test/index.js
```

## 문서

- [CGI API](cgi-bin/docs/API.md)
- [설정](cgi-bin/docs/configuration.md)
- [Logger](cgi-bin/docs/logger.md)
- [OpcuaClient](cgi-bin/docs/opcua-client.md)
- [MachbaseAppender](cgi-bin/docs/machbase-appender.md)
- [Collector](cgi-bin/docs/collector.md)
- [JSH Runtime Reference](cgi-bin/docs/JSH_REFERENCE.md)
- [machbase-neo cgi-bin 가이드](https://wiki.machbase.com/pages/viewpage.action?pageId=329352275)
