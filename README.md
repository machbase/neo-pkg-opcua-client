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
    ├── collectors.js           # GET/POST  /cgi-bin/collectors
    ├── collector.js            # GET/PUT/DELETE  /cgi-bin/collector?name=xxx
    ├── collector-start.js      # POST  /cgi-bin/collector-start?name=xxx
    ├── collector-stop.js       # POST  /cgi-bin/collector-stop?name=xxx
    ├── conf.d/
    │   └── collector-a.json    # 수집기 설정 파일
    ├── src/
    │   ├── admin/
    │   │   └── cgi_util.js         # CGI 유틸 (parseQuery, readBody, reply, CRUD)
    │   ├── collector.js            # Collector 클래스
    │   ├── logger.js               # Logger / LogRotator 클래스
    │   ├── db/
    │   │   └── machbase-appender.js  # MachbaseAppender 클래스
    │   └── opcua/
    │       └── opcua-client.js       # OpcuaClient 클래스
    ├── test/
    │   ├── index.js              # 테스트 진입점
    │   ├── runner.js             # 테스트 러너
    │   ├── logger.test.js
    │   ├── opcua-client.test.js
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
| GET | `/cgi-bin/collectors` | 수집기 목록 조회 |
| POST | `/cgi-bin/collectors` | 수집기 등록 (body: `{ name, config }`) |
| GET | `/cgi-bin/collector?name=xxx` | 수집기 단건 조회 |
| PUT | `/cgi-bin/collector?name=xxx` | 수집기 설정 수정 (body: config) |
| DELETE | `/cgi-bin/collector?name=xxx` | 수집기 삭제 |
| POST | `/cgi-bin/collector-start?name=xxx` | 수집기 시작 (데몬 연동 예정) |
| POST | `/cgi-bin/collector-stop?name=xxx` | 수집기 종료 (데몬 연동 예정) |

## 테스트

```bash
machbase-neo jsh -v /app=<프로젝트 경로> /app/cgi-bin/test/index.js
```

## 문서

- [설정](cgi-bin/docs/configuration.md)
- [Logger](cgi-bin/docs/logger.md)
- [OpcuaClient](cgi-bin/docs/opcua-client.md)
- [MachbaseAppender](cgi-bin/docs/machbase-appender.md)
- [Collector](cgi-bin/docs/collector.md)
