# CLAUDE.md

## 프로젝트 개요

machbase-neo JSH 환경에서 OPC UA 서버로부터 주기적으로 데이터를 수집하여 Machbase TAG 테이블에 저장하는 데이터 수집기.

## 실행 환경

- **런타임**: machbase-neo JSH (Node.js 유사 환경, 표준 Node.js 아님)
- **외부 모듈**: `opcua`, `machcli` — JSH 내장 모듈 (npm 패키지 아님)
- **fs API**: JSH는 일부 fs API가 동기 방식이지만 일반 Node.js와 다를 수 있음 (`fs.readFile` → 동기, `fs.exists`, `fs.mkdir`, `fs.readdir` 등)

## 핵심 파일 구조

```
cgi-bin/
├── neo-collector.js          # 데몬 진입점 (config 로드 → Collector 시작)
├── api/
│   ├── collector.js          # CGI: POST/GET/PUT/DELETE /cgi-bin/api/collector
│   └── collector/
│       ├── list.js           # CGI: GET  /cgi-bin/api/collector/list
│       ├── start.js          # CGI: POST /cgi-bin/api/collector/start?name=xxx
│       └── stop.js           # CGI: POST /cgi-bin/api/collector/stop?name=xxx
├── conf.d/
│   └── collector-a.json      # 수집기 설정 (opcua / db / log)
├── src/
│   ├── collector.js          # Collector 클래스 (폴링 루프)
│   ├── logger.js             # Logger / LogRotator
│   ├── cgi/cgi_util.js       # CGI 유틸 (parseQuery, readBody, reply, conf.d CRUD, isRunning)
│   ├── db/machbase-appender.js  # MachbaseAppender (machcli 래퍼)
│   └── opcua/opcua-client.js    # OpcuaClient (opcua 래퍼)
├── test/
│   ├── index.js              # 테스트 진입점
│   ├── runner.js             # 자체 테스트 러너 (Jest 없음)
│   └── *.test.js
└── run/
    └── <name>.pid            # 실행 중인 수집기 PID 파일
```

## 데이터 흐름

```
setInterval(interval)
  └─ Collector.collect()
       └─ OpcuaClient.read(nodeIds)   → ReadResult[] { value, sourceTimestamp }
            └─ MachbaseAppender.append(name, ts, value) × N
                 └─ MachbaseAppender.flush()
```

- OPC-UA 읽기는 **구독(subscription) 방식이 아닌 폴링** 방식
- 읽기 실패 시 OpcuaClient는 연결을 재시도하지 않고 null 반환 (다음 interval에 재연결)
- DB 연결 끊김 시 다음 collect() 호출 시 자동 재오픈 시도

## 설정 파일 구조 (conf.d/*.json)

```json
{
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
    "host": "127.0.0.1", "port": 5656,
    "user": "sys", "password": "manager"
  },
  "log": {
    "level": "INFO",
    "output": "both",
    "format": "json",
    "file": { "path": "./logs/collector-a.log", "maxSize": "10MB", "maxFiles": 7, "rotate": "daily" }
  }
}
```

## 로거 사용법

```js
const { getLogger } = require('./logger.js');
const logger = getLogger('ModuleName');

logger.debug('msg', { key: 'value' });
logger.info('msg', { key: 'value' });
logger.warn('msg', { key: 'value' });
logger.error('msg', { key: 'value' });
```

- `init(config.log)` 는 `neo-collector.js` 진입점에서 한 번만 호출
- 이후 `getLogger(name)` 로 생성한 모든 Logger 인스턴스는 전역 config를 공유함 (in-place 업데이트 방식)
- 로그 포맷: `json` (기본) 또는 `text`
- 로그 출력: `console`, `file`, `both`

## CGI 엔드포인트 규칙

- 각 CGI 파일은 `REQUEST_METHOD` 환경변수로 HTTP 메서드를 판별
- 쿼리: `CGI.parseQuery()`, 바디: `CGI.readBody()`, 응답: `CGI.reply({ ok, data, reason })`
- 수집기 설정은 `conf.d/<name>.json`에 저장
- 실행 상태는 `run/<name>.pid` 파일 존재 여부로 판단 (`CGI.isRunning(name)`)

## 테스트 실행

```bash
machbase-neo jsh -v /app=<프로젝트 경로> /app/cgi-bin/test/index.js
```

- Jest 없음 — 자체 `TestRunner` (cgi-bin/test/runner.js) 사용
- Mock 주입: `Collector` 생성자 2번째 인자 `{ opcuaClient, machbaseAppender }` 로 의존성 교체
- 테스트 파일: `*.test.js` → `test/index.js`에서 일괄 require

## 수집기 데몬 실행

```bash
machbase-neo jsh -v /app=<프로젝트 경로> /app/cgi-bin/neo-collector.js /app/cgi-bin/conf.d/collector-a.json
```

## 주의 사항

- JSH 환경이므로 `require('fs')`, `require('path')`, `require('process')` 외 npm 패키지 사용 불가
- `process.env.get(key)` 사용 (일반 Node.js의 `process.env[key]` 아님)
- `process.addShutdownHook(fn)` — JSH 전용 종료 훅
- `fs.readFile` 이 JSH에서는 동기 동작 (콜백 없이 반환값 사용)
