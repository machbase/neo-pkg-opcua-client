# CLAUDE.md

## 프로젝트 개요

Machbase Neo JSH 환경에서 OPC UA 서버 데이터를 주기적으로 읽어 Machbase TAG 테이블에 적재하는 collector 패키지.

핵심 축은 아래 3가지다.

1. collector 설정 CRUD
2. Machbase Neo `service` 기반 lifecycle 제어
3. OPC UA node browse / read 와 Machbase append
4. DB connection test / TAG table create utility API

## 현재 상태 요약

- 런타임: Machbase Neo JSH
- 모듈 스타일: CommonJS `require(...)`
- service 이름 규칙: `_opc_${collectorName}`
- collector 설정 파일: `cgi-bin/conf.d/${name}.json`
- pid 파일: `cgi-bin/run/${name}.pid`
- 로그 파일:
  - `log.file.path` 를 디렉토리로 입력하면 collector 실행 시 `${name}.log` 생성
  - 예: `${CWD}/log` + `collector-a` -> `<package_root>/log/collector-a.log`
  - legacy 호환: `.../name.log` 형태를 직접 넣으면 그대로 사용
- 로그 API 경로: `~/public/logs/<pkg-name>/` (log list/content API 기준)
- rotate 파일명:
  - size: `collector-a.2026-04-08T03-42-34-064Z.log`
  - daily: `collector-a.2026-04-08.log`

## 실행 환경 메모

- 일반 Node.js처럼 생각하면 안 된다.
- `fs`, `process`, `console`, `service` 동작이 Node.js와 다를 수 있다.
- 특히 `machbase-neo jsh ...` 호출 형식은 환경/버전에 따라 다를 수 있다.
- 실제 실행 전에는 항상 사용자에게 `machbase-neo` 경로를 확인한다.
- service / CGI / mounted path 검증은 가능한 실제 JSH 환경에서 확인한다.

## 핵심 파일 구조

```text
cgi-bin/
├── neo-collector.js              # collector 실행 진입점
├── conf.d/                       # collector 설정 파일
├── run/                          # pid 파일
├── api/
│   ├── collector.js              # POST/GET/PUT/DELETE /cgi-bin/api/collector
│   ├── collector/
│   │   ├── list.js               # GET    /cgi-bin/api/collector/list
│   │   ├── install.js            # POST   /cgi-bin/api/collector/install?name=xxx
│   │   ├── last-time.js          # GET    /cgi-bin/api/collector/last-time?name=xxx
│   │   ├── start.js              # POST   /cgi-bin/api/collector/start?name=xxx
│   │   └── stop.js               # POST   /cgi-bin/api/collector/stop?name=xxx
│   ├── db/
│   │   ├── connect.js            # GET    /cgi-bin/api/db/connect?server=xxx
│   │   ├── server.js             # POST/GET/PUT/DELETE /cgi-bin/api/db/server
│   │   ├── server/
│   │   │   └── list.js           # GET    /cgi-bin/api/db/server/list
│   │   └── table/
│   │       ├── create.js         # POST   /cgi-bin/api/db/table/create
│   │       ├── list.js           # GET    /cgi-bin/api/db/table/list?server=xxx
│   │       └── columns.js        # GET    /cgi-bin/api/db/table/columns?server=xxx&table=xxx
│   ├── log/
│   │   ├── list.js               # GET    /cgi-bin/api/log/list
│   │   └── content.js            # GET    /cgi-bin/api/log/content?file=xxx
│   └── opcua/
│       ├── read.js               # GET    /cgi-bin/api/opcua/read?endpoint=&nodes=
│       ├── write.js              # POST   /cgi-bin/api/opcua/write
│       └── node/
│           └── descendants.js    # POST   /cgi-bin/api/opcua/node/descendants
├── src/
│   ├── collector.js              # polling loop
│   ├── lib/logger.js             # logger / rotator
│   ├── cgi/cgi_util.js           # config, pid, service helper
│   ├── cgi/handler.js            # API 핸들러 함수 모음
│   ├── cgi/service.js            # service lifecycle 래퍼
│   ├── db/client.js              # DB connect / query / execute
│   ├── db/stream.js              # Machbase append 스트림 래퍼
│   ├── db/table.js               # TagTable / LogTable / TagDataTable
│   ├── db/types.js               # ColumnType, Column, TableSchema, FLAG_*
│   └── opcua/opcua-client.js     # opcua 래퍼
└── test/
    ├── index.js
    ├── runner.js
    ├── handler.test.js
    ├── machbase-client.test.js
    └── *.test.js
```

## Collector API 규칙

### POST `/cgi-bin/api/collector`

- body: `{ name, config }`
- 설정 파일 생성
- service install 수행
- install 실패 시 config rollback

### GET `/cgi-bin/api/collector?name=xxx`

- 설정 단건 조회
- collector config의 `db` 필드는 server 이름 string이므로 password 제거 불필요

### PUT `/cgi-bin/api/collector?name=xxx`

- 설정 파일 수정
- service가 현재 `RUNNING` 일 때만 `stop -> start`
- install되지 않았거나 running이 아니면 config만 수정
- collector config의 `db` 필드는 server 이름 string이므로 password 병합 불필요

### DELETE `/cgi-bin/api/collector?name=xxx`

- 설정이 있으면 처리
- running service면 stop
- installed service면 uninstall
- missing service 오류는 정상 정리 케이스로 허용
- 마지막에 service definition / pid / config 삭제

### POST `/cgi-bin/api/collector/install?name=xxx`

- config-only collector에 대해 service만 install
- config가 없으면 실패
- 이미 install되어 있으면 실패

### GET `/cgi-bin/api/collector/last-time?name=xxx`

- service details의 `lastCollectedAt` 조회 (epoch milliseconds)
- 값이 없거나 service가 install되지 않았으면 `null`
- collector 수집 성공 시에만 갱신되고, 실패 시에는 갱신하지 않음

### POST `/cgi-bin/api/collector/start?name=xxx`

- install된 service start

### POST `/cgi-bin/api/collector/stop?name=xxx`

- install된 service stop

### GET `/cgi-bin/api/collector/list`

- 기준은 `conf.d` 목록
- 각 항목에 대해 `installed`, `running` 상태를 분리해서 반환
- 즉 config-only 항목도 list에 나타날 수 있음

응답 예:

```json
[
  { "name": "collector-a", "installed": true,  "running": true  },
  { "name": "collector-b", "installed": false, "running": false }
]
```

### GET `/cgi-bin/api/db/connect?server=xxx`

- 등록된 server 이름으로 연결 확인
- 성공 시 `{ connected: true, host, port, user }`

### POST `/cgi-bin/api/db/table/create`

- body: `{ server: "server-name", table: "TAGDATA" }`
- 등록된 server에 연결해 TAG 테이블 생성
- 생성 SQL은 아래 구조로 고정

```sql
CREATE TAG TABLE ${table} (
  NAME VARCHAR(100) PRIMARY KEY,
  TIME DATETIME BASETIME,
  VALUE DOUBLE SUMMARIZED
);
```

- 같은 이름의 테이블이 이미 있으면 에러 반환

### GET `/cgi-bin/api/db/table/list?server=xxx`

- 전체 TAG 테이블 목록 반환 (USER_ID 기준으로 소유 유저명 포함)
- `M$SYS_USERS` 를 조회해 USER_ID → 유저명 매핑
- 유효하지 않은 user이면 에러 반환
- 응답 예:

```json
[
  { "name": "TAG1", "user": "SYS" },
  { "name": "TAG2", "user": "ADMIN" }
]
```

### GET `/cgi-bin/api/db/table/columns?server=xxx&table=xxx`

- 지정 TAG 테이블의 컬럼 목록 반환
- `M$SYS_USERS` 로 user 유효성 검사 → user not found 시 에러
- `M$SYS_COLUMNS JOIN M$SYS_TABLES` 단일 쿼리로 컬럼과 테이블 타입을 함께 조회 → table not found / not TAG table 시 에러

## Service 관련 구현 메모

- service prefix는 `_opc_`
- service install config는 `cgi-bin/neo-collector.js` 를 직접 실행하도록 생성
- working directory는 package root 기준
- service lifecycle helper는 `cgi-bin/src/cgi/cgi_util.js` 에 모여 있다

다음 작업자가 특히 주의할 점:

- config 이름과 service 이름은 동일하지 않다
- service 이름은 `_opc_${name}`
- list API와 delete 흐름에서 이 둘을 혼동하면 상태가 꼬인다
- delete 구현은 retry loop보다 단일 cleanup 흐름을 유지하는 쪽이 안전하다

## OPC UA node browse 메모

`/cgi-bin/api/opcua/node/descendants` 는 BFS로 지정 노드의 모든 하위 노드를 탐색한다.

구현 배경:

- 일부 서버/노드 조합에서 JSH `opcua.Client#children()` 이 Variable 노드를 누락했다
- 실제 테스트에서 `ns=1;s=Plant1.Line1` 에 대해:
  - `browse()` 는 `Temperature`, `Pressure`, `Counter` 반환
  - `children()` 는 `Line1` 만 반환

따라서 `browse()` 기반 BFS 탐색을 사용한다.

## Logger 메모

- 클래스: `src/lib/logger.js` — `Logger`, `init`, `getInstance`, `LOG_DIR` export
- 로그 디렉토리: `LOG_DIR = ~/public/logs/<pkg-name>/` (process.argv 기반 자동 계산)
- `neo-collector.js` 에서 `new Logger(config.log, { name: configName })` 로 생성
  - `options.name` 이 로그 파일 stem — `collector-a.log` 형태
- rotate: 파일이 10 MB 초과 시 `stem.ISO타임스탬프.log` 로 rename 후 새 파일 생성
- purge: rotate된 파일이 `maxFiles` 초과 시 오래된 것부터 삭제
- `LOG_DIR` 은 log list/content API에서도 import해서 사용

예:

```text
collector-a.log
collector-a.2026-04-08T03-42-34-064Z.log
```

## 테스트 / 검증 메모

- 이 프로젝트는 Jest가 아니라 `cgi-bin/test/runner.js` 기반 테스트를 사용
- Node `--check` 는 문법 확인 정도로만 사용
- JSH runtime 차이 때문에 실제 동작 검증은 가능하면 Machbase Neo JSH에서 다시 확인한다
- 특히 아래는 JSH에서 확인하는 편이 안전하다
  - logger file I/O
  - service install/start/stop/uninstall
  - CGI mounted path
  - OPC UA browse / descendants 동작

## 공개 테스트 경로 메모

배포 테스트는 보통 아래 경로에 복사해서 확인했다.

```text
/home/thlee/machbase-neo/public/neo-pkg-opcua-client
```

예시 URL:

- `http://127.0.0.1:5654/public/neo-pkg-opcua-client/cgi-bin/api/collector`
- `http://127.0.0.1:5654/public/neo-pkg-opcua-client/cgi-bin/api/opcua/node/descendants`

## 다음 작업자 체크리스트

1. `README.md`, `AGENTS.md`, `CLAUDE.md`, `CLAUDE.md` 를 먼저 읽는다.
2. `machbase-neo` 실행 경로를 사용자에게 확인한다.
3. 현재 환경의 실제 JSH 호출 형식을 확인한다.
4. config 이름과 service 이름 `_opc_${name}` 을 구분한다.
5. list / install / delete / logger 정책을 기존 동작과 맞춘다.
6. 검증이 필요하면 public 배포 경로 또는 실제 JSH shell에서 다시 확인한다.
