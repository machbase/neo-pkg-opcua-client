# CLAUDE.md

## Skills 우선순위

`custom-` 접두사 skill은 같은 맥락의 범용 skill보다 항상 우선 적용한다.

| 범용 skill | 우선 적용 custom skill |
|---|---|
| `api-design` | `custom-cgi-conventions` |
| `coding-standards` | `custom-js-style` |
| `backend-patterns` | `custom-jsh-guidelines` |

범용 skill은 대응되는 `custom-` skill이 없는 영역에서만 참조한다.

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
- 로그 API 경로: `{package_root}/logs/` (log list/content API 기준)
- rotate 파일명: `collector-a_20260408_034208.log` (`{name}_YYYYMMDD_HHMMSS.log`)

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
│   │   ├── all.js                # GET    /cgi-bin/api/log/all
│   │   ├── list.js               # GET    /cgi-bin/api/log/list?name=xxx
│   │   ├── content.js            # GET    /cgi-bin/api/log/content?name=xxx
│   │   └── content/
│   │       └── all.js            # GET    /cgi-bin/api/log/content/all?name=xxx
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
- `table` 파라미터는 `TAG` 또는 `user.TAG` 형식 지원 — `user.TAG` 형식이면 해당 user의 USER_ID로 소유자 구분
- `M$SYS_USERS` 로 user 유효성 검사 → user not found 시 에러
- `selectTableMeta(tableName, userId)` → table not found / not TAG table 시 에러
- `selectColumnsByTableId(tableId)` 로 컬럼 조회
- TODO: `database.user.table` 3단계 형식은 미지원 — Machbase가 지원할 경우 추가 필요

## Collector 값 정규화 메모

`_normalizeValue(value, node)` 동작:

1. `boolean` → 1/0 변환, 그 외 → `Number(value)` 강제 변환
2. `node.formula`가 있으면 컴파일된 함수(`_formulaFn`)로 변환. 없으면 그대로 반환

formula 컴파일은 생성자(`_compileFormulas`)에서 한 번만 수행. 컴파일 실패 시 warn 로그 후 `_formulaFn = null` (→ pass-through).

`config.opcua.nodes[]` 선택 필드:

| 필드 | 기본값 | 설명 |
|------|--------|------|
| `formula` | (없음) | JS 표현식 문자열. `value`는 raw 숫자값. 예: `"(value + 100) * 0.001"` |
| `onChanged` | `false` | `true`이면 이전 값과 달라졌을 때만 append. Collector는 `_previousValues`로 직전 값을 추적하며, 모든 노드가 skip되면 `append()` 및 `_recordLastCollectedAt()` 미호출 |

로그 레벨 정책:
- `db open/close failed` 는 **warn** 레벨 사용 (error 아님)
- 재연결 가능한 일시 장애이므로 fatal 처리하지 않는다

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
- 로그 디렉토리: `LOG_DIR = {package_root}/logs/` (process.argv[1] 기반 자동 계산, fallback: `~/public/logs/neo-pkg-opcua-client`)
- `neo-collector.js` 에서 `new Logger(config.log, { name: configName })` 로 생성
  - `options.name` 이 로그 파일 stem — `collector-a.log` 형태
- rotate: 파일이 10 MB 초과 시 `stem_YYYYMMDD_HHMMSS.log` 로 rename 후 새 파일 생성
- purge: rotate된 파일이 `maxFiles` 초과 시 오래된 것부터 삭제
- `LOG_DIR` 은 log list/content API에서도 import해서 사용

예:

```text
collector-a.log
collector-a_20260408_034208.log
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

1. `README.md`, `CLAUDE.md` 를 먼저 읽는다.
2. `machbase-neo` 실행 경로를 사용자에게 확인한다.
3. 현재 환경의 실제 JSH 호출 형식을 확인한다.
4. config 이름과 service 이름 `_opc_${name}` 을 구분한다.
5. list / install / delete / logger 정책을 기존 동작과 맞춘다.
6. 검증이 필요하면 public 배포 경로 또는 실제 JSH shell에서 다시 확인한다.
