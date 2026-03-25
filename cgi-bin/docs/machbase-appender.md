# MachbaseAppender

`cgi-bin/src/db/machbase-appender.js`

Machbase TAG 테이블에 데이터를 고성능으로 삽입하는 appender 래퍼입니다. 프로세스 시작 시 `open()`, 종료 시 `close()`를 1회 호출하며, 매 수집 주기마다 `append()` + `flush()`로 데이터를 삽입합니다. `append()` 또는 `flush()` 실패 시 내부 리소스를 자동으로 정리하고 예외를 전파하여 호출자가 재연결을 시도할 수 있도록 합니다.

## API

### `new MachbaseAppender(dbConf, table, options?)`

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `dbConf` | object | DB 연결 설정 |
| `dbConf.host` | string | 호스트. 기본값 `"127.0.0.1"` |
| `dbConf.port` | number | 포트. 기본값 `5656` |
| `dbConf.user` | string | 사용자명. 기본값 `"sys"` |
| `dbConf.password` | string | 비밀번호. 기본값 `"manager"` |
| `table` | string | 저장할 테이블명 (예: `"TAG"`) |
| `options.clientFactory` | function | (테스트용) 내부 클라이언트 생성 팩토리 |

### `open()`

DB에 연결하고 appender를 초기화합니다. 부분 실패 시 열린 리소스를 정리하고 예외를 전파합니다.

### `isOpen()`

appender가 열려 있으면 `true`, 닫혀 있으면 `false`를 반환합니다.

### `append(name, time, value)`

레코드 1건을 appender 버퍼에 추가합니다. 실패 시 `close()`를 호출하고 예외를 전파합니다.

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `name` | string | TAG 이름 |
| `time` | Date | 타임스탬프 |
| `value` | number | TAG 값 |

### `flush()`

버퍼에 쌓인 레코드를 DB에 전송합니다. 실패 시 `close()`를 호출하고 예외를 전파합니다.

### `close()`

appender, 연결, 클라이언트를 순서대로 정리합니다. 내부 오류가 발생해도 예외를 전파하지 않습니다.

## 예시

```js
const MachbaseAppender = require("./src/db/machbase-appender.js");  // cgi-bin/ 기준 경로

const appender = new MachbaseAppender(
    { host: "127.0.0.1", port: 5656, user: "sys", password: "manager" },
    "TAG"
);

appender.open();

// 수집 주기마다
appender.append("sensor.tag1", new Date(), 3.14);
appender.append("sensor.tag2", new Date(), 2.71);
appender.flush();

// 종료 시
appender.close();
```

## 주의사항

- `append()`와 `flush()`는 `open()` 이후에만 호출해야 합니다.
- `append()` 또는 `flush()` 실패 시 appender가 자동으로 닫히므로, 다음 호출 전에 `isOpen()`으로 상태를 확인하거나 재연결해야 합니다.
- `close()` 후에는 `append()`를 호출할 수 없습니다.
