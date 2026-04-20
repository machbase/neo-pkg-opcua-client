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
│     └─ _openDb()                                            │
│     └─ setInterval(interval)                                │
│          └─ collect()                                       │
│               ├─ _isDbOpen() check                          │
│               ├─ opcua.open()                               │
│               ├─ opcua.read(nodeIds)                        │
│               ├─ dbStream.append(matrix)                    │
│               └─ _recordLastCollectedAt()                   │
│   close()                                                   │
└──────┬──────────────┬──────────────────────────────────────┘
       │              │
       ▼              ▼
┌──────────────┐  ┌──────────────────────────────┐
│ OpcuaClient  │  │ MachbaseClient + MachbaseStream│
│              │  │                               │
│ open()       │  │ client.connect()              │
│ read()       │  │ stream.open(client, table)    │
│ close()      │  │ stream.append(matrix)         │
│              │  │ stream.close()                │
└──────┬───────┘  └────────┬──────────────────────┘
       │                   │
       ▼                   ▼
┌──────────────┐  ┌──────────────────┐
│  OPC UA      │  │  Machbase DB     │
│  Server      │  │  (TAG table)     │
└──────────────┘  └──────────────────┘
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
    │  stream.append([[name, time, value], ...])
    ▼
MachbaseStream
    │
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
    │   │   ├── server.js       # POST/GET/PUT/DELETE  /cgi-bin/api/db/server
    │   │   ├── server/
    │   │   │   └── list.js     # GET    /cgi-bin/api/db/server/list
    │   │   ├── connect.js      # GET    /cgi-bin/api/db/connect?server=xxx
    │   │   └── table/
    │   │       ├── create.js   # POST   /cgi-bin/api/db/table/create
    │   │       ├── list.js     # GET    /cgi-bin/api/db/table/list?server=xxx
    │   │       └── columns.js  # GET    /cgi-bin/api/db/table/columns?server=xxx&table=xxx
    │   ├── log/
    │   │   ├── all.js          # GET    /cgi-bin/api/log/all
    │   │   ├── list.js         # GET    /cgi-bin/api/log/list?name=xxx
    │   │   ├── content.js      # GET    /cgi-bin/api/log/content?name=xxx
    │   │   └── content/
    │   │       └── all.js      # GET    /cgi-bin/api/log/content/all?name=xxx
    │   └── opcua/
    │       ├── read.js         # GET    /cgi-bin/api/opcua/read?endpoint=xxx&nodes=id1,id2
    │       ├── write.js        # POST   /cgi-bin/api/opcua/write
    │       └── node/
    │           └── descendants.js # POST /cgi-bin/api/opcua/node/descendants
    ├── conf.d/
    │   └── collector-a.json    # 수집기 설정 파일
    ├── src/
    │   ├── cgi/
    │   │   ├── cgi_util.js         # CGI 유틸 (parseQuery, readBody, reply, config CRUD, server config CRUD)
    │   │   ├── handler.js          # API 비즈니스 로직
    │   │   └── service.js          # service lifecycle wrapper
    │   ├── collector.js            # Collector 클래스
    │   ├── lib/
    │   │   └── logger.js           # Logger / LogRotator 클래스
    │   ├── db/
    │   │   ├── client.js           # MachbaseClient (connect / query / close)
    │   │   ├── stream.js           # MachbaseStream (open / append / close)
    │   │   ├── table.js            # TagTable / LogTable / TagDataTable
    │   │   └── types.js            # Column, TableSchema, ColumnType 등
    │   └── opcua/
    │       └── opcua-client.js     # OpcuaClient (open/read/write/browse/browseNext/close)
    ├── test/
    │   ├── index.js              # 테스트 진입점
    │   ├── runner.js             # 테스트 러너
    │   ├── logger.test.js
    │   ├── opcua-client.test.js
    │   ├── machbase-client.test.js
    │   ├── machbase-stream.test.js
    │   ├── collector.test.js
    │   └── handler.test.js
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
| PUT | `/cgi-bin/api/collector?name=xxx` | 수집기 설정 수정. 실행 중이면 service stop -> start |
| DELETE | `/cgi-bin/api/collector?name=xxx` | 수집기 삭제 + service uninstall |
| POST | `/cgi-bin/api/collector/install?name=xxx` | config-only 수집기의 service 설치 |
| GET | `/cgi-bin/api/collector/last-time?name=xxx` | 마지막 성공 수집 시간 조회 (epoch ms) |
| POST | `/cgi-bin/api/collector/start?name=xxx` | 등록된 service 시작 |
| POST | `/cgi-bin/api/collector/stop?name=xxx` | 등록된 service 종료 |
| POST | `/cgi-bin/api/db/server` | DB 서버 접속 정보 등록 (body: `{ name, host, port, user, password }`) |
| GET | `/cgi-bin/api/db/server?name=xxx` | DB 서버 단건 조회 |
| PUT | `/cgi-bin/api/db/server?name=xxx` | DB 서버 접속 정보 수정 |
| DELETE | `/cgi-bin/api/db/server?name=xxx` | DB 서버 삭제 |
| GET | `/cgi-bin/api/db/server/list` | DB 서버 목록 조회 |
| GET | `/cgi-bin/api/db/connect?server=xxx` | DB 접속 유효성 검사 |
| POST | `/cgi-bin/api/db/table/create` | TAG 테이블 생성 (body: `{ server, table }`) |
| GET | `/cgi-bin/api/db/table/columns?server=xxx&table=xxx` | 테이블 컬럼 목록 조회 |
| GET | `/cgi-bin/api/log/all` | 패키지 전체 로그 파일 목록 조회 (name, size 포함) |
| GET | `/cgi-bin/api/log/list?name=xxx` | 특정 collector 로그 파일 목록 조회 (name, size 포함) |
| GET | `/cgi-bin/api/log/content?name=xxx` | 로그 파일 내용 조회 (start/end 줄 범위 지원) |
| GET | `/cgi-bin/api/log/content/all?name=xxx` | 로그 파일 전체 내용 조회 |
| GET | `/cgi-bin/api/opcua/read?endpoint=xxx&nodes=id1,id2` | OPC UA 노드 일회성 읽기 |
| POST | `/cgi-bin/api/opcua/write` | OPC UA 노드 일회성 쓰기 (body: `{ endpoint, writes: [{ node, value }] }`) |
| POST | `/cgi-bin/api/opcua/node/descendants` | OPC UA 노드 BFS 하위 탐색 (body: `{ endpoint, node }`) |

## 테스트

```bash
machbase-neo jsh -v /app=<프로젝트 경로> /app/cgi-bin/test/index.js
```

## 문서

- [CGI API](cgi-bin/docs/API.md)
- [프로젝트 구조 · 설정](cgi-bin/docs/PROJECT.md)
- [개발 컨벤션](cgi-bin/docs/convention.md)
- [JSH Runtime Reference](cgi-bin/docs/JSH_REFERENCE.md)
- [machbase-neo cgi-bin 가이드](https://wiki.machbase.com/pages/viewpage.action?pageId=329352275)
