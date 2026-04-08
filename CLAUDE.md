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
│   │   ├── connect/
│   │   │   └── test.js           # POST   /cgi-bin/api/db/connect/test
│   │   └── table/
│   │       └── create.js         # POST   /cgi-bin/api/db/table/create
│   └── node/
│       ├── children.js           # POST   /cgi-bin/api/node/children
│       └── children-native.js    # POST   /cgi-bin/api/node/children-native
├── src/
│   ├── collector.js              # polling loop
│   ├── logger.js                 # logger / rotator
│   ├── cgi/cgi_util.js           # config, pid, service helper
│   ├── db/machbase-client.js     # DB connect / query / create helper
│   ├── db/machbase-appender.js   # Machbase append wrapper
│   └── opcua/opcua-client.js     # opcua wrapper
└── test/
    ├── index.js
    ├── runner.js
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
- `db.password` 는 응답에서 제거

### PUT `/cgi-bin/api/collector?name=xxx`

- 설정 파일 수정
- service가 현재 `RUNNING` 일 때만 `stop -> start`
- install되지 않았거나 running이 아니면 config만 수정
- `db.password` 가 없거나 `""` 이면 기존 password 유지

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

### POST `/cgi-bin/api/db/connect/test`

- body는 `config.db` 와 같은 구조
- `table` 없이 DB 연결만 확인
- 성공 시 `{ connected: true, host, port, user }`

### POST `/cgi-bin/api/db/table/create`

- body는 `config.db` 와 같은 구조
- 지정한 DB에 연결해 TAG 테이블 생성
- 생성 SQL은 아래 구조로 고정

```sql
CREATE TAG TABLE ${table} (
  NAME VARCHAR(100) PRIMARY KEY,
  TIME DATETIME BASETIME,
  VALUE DOUBLE SUMMARIZED
);
```

- 같은 이름의 테이블이 이미 있으면 에러 반환

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

## OPC UA browse / children 메모

현재 프론트엔드 node browser는 `children.js` 를 사용한다.
그런데 이 endpoint는 이름은 `children` 이지만 현재 실제 구현은 `browse()` 기반이다.

이유:

- 일부 서버/노드 조합에서 JSH `opcua.Client#children()` 이 Variable 노드를 누락했다
- 실제 테스트에서 `ns=1;s=Plant1.Line1` 에 대해:
  - `browse()` 는 `Temperature`, `Pressure`, `Counter` 반환
  - `children()` 는 `Line1` 만 반환

그래서 현재 endpoint 의미는 아래와 같다.

- `/cgi-bin/api/node/children`
  - 프론트용
  - `browse()` 결과의 `references` 반환
- `/cgi-bin/api/node/children-native`
  - JSH native `children()` 결과 비교용

이 부분은 나중에 API 이름을 더 명확히 바꿀 수 있지만, 현재 프론트는 `children` 경로를 기대한다.

## Logger 메모

- 전역 logger config는 `init(config.log, options)` 로 초기화
- collector 실행 진입점 `neo-collector.js` 에서 `{ defaultFileName: "${configName}.log" }` 를 주입
- `${CWD}` placeholder는 `cgi-bin` parent, 즉 package root 기준으로 치환
- rotate / purge 는 현재 `stem.timestamp.ext` 패턴을 기준으로 동작

예:

```text
collector-a.log
collector-a.2026-04-08T03-42-34-064Z.log
collector-a.2026-04-08.log
```

## 테스트 / 검증 메모

- 이 프로젝트는 Jest가 아니라 `cgi-bin/test/runner.js` 기반 테스트를 사용
- Node `--check` 는 문법 확인 정도로만 사용
- JSH runtime 차이 때문에 실제 동작 검증은 가능하면 Machbase Neo JSH에서 다시 확인한다
- 특히 아래는 JSH에서 확인하는 편이 안전하다
  - logger file I/O
  - service install/start/stop/uninstall
  - CGI mounted path
  - OPC UA browse / children 차이

## 공개 테스트 경로 메모

배포 테스트는 보통 아래 경로에 복사해서 확인했다.

```text
/home/thlee/machbase-neo/public/neo-pkg-opcua-client
```

예시 URL:

- `http://127.0.0.1:5654/public/neo-pkg-opcua-client/cgi-bin/api/collector`
- `http://127.0.0.1:5654/public/neo-pkg-opcua-client/cgi-bin/api/node/children`

## 다음 작업자 체크리스트

1. `README.md`, `AGENTS.md`, `CLAUDE.md` 를 먼저 읽는다.
2. `machbase-neo` 실행 경로를 사용자에게 확인한다.
3. 현재 환경의 실제 JSH 호출 형식을 확인한다.
4. config 이름과 service 이름 `_opc_${name}` 을 구분한다.
5. list / install / delete / logger 정책을 기존 동작과 맞춘다.
6. 검증이 필요하면 public 배포 경로 또는 실제 JSH shell에서 다시 확인한다.
