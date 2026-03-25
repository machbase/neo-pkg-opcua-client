# Logger

`cgi-bin/src/logger.js`

JSON 또는 텍스트 형식으로 로그를 출력하고, 파일 로테이션을 지원하는 로거입니다.

## 초기화

앱 진입점에서 `init()`으로 전역 설정을 초기화한 후 `getLogger()`로 모듈별 로거를 생성합니다.

```js
const { init, getLogger } = require("./src/logger.js");  // cgi-bin/ 기준 경로

init(config.log);                    // 앱 시작 시 1회 호출
const logger = getLogger("MyModule");
```

## API

### `init(config)`

전역 로그 설정을 초기화합니다. `getLogger()`로 생성되는 모든 Logger에 적용됩니다.

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `config` | object | [설정](configuration.md#log) 참조 |

### `getLogger(name)`

전역 설정을 사용하는 Logger 인스턴스를 반환합니다.

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `name` | string | 모듈 이름 (로그 출력 시 `module` 필드) |

### `new Logger(name, config)`

독립적인 설정을 가진 Logger를 직접 생성합니다.

```js
const { Logger } = require("./src/logger.js");  // cgi-bin/ 기준 경로

const logger = new Logger("MyModule", {
    level: "DEBUG",
    output: "both",
    format: "json",
    file: {
        path: "./logs/app.log",
        maxSize: "10MB",
        maxFiles: 7,
        rotate: "daily",
    },
});
```

### 로그 메서드

```js
logger.debug(message, detail?)
logger.info(message, detail?)
logger.warn(message, detail?)
logger.error(message, detail?)
```

| 파라미터 | 타입 | 설명 |
|----------|------|------|
| `message` | string | 로그 메시지 |
| `detail` | any | (선택) 추가 데이터. `detail` 필드로 출력 |

### `logger.child(name)`

동일한 설정을 가지되 다른 모듈 이름을 가진 Logger를 반환합니다.

```js
const child = logger.child("SubModule");
```

## 출력 형식

### JSON (기본)

```json
{"ts":"2026-03-09T05:35:03.588Z","level":"INFO","module":"Collector","message":"collected","detail":{"count":6}}
```

### Text

```
2026-03-09T05:35:03.588Z [INFO] [Collector] collected {"count":6}
```

## 로그 레벨

레벨 우선순위: `DEBUG(0)` < `INFO(1)` < `WARN(2)` < `ERROR(3)`

설정된 레벨 미만의 로그는 출력되지 않습니다.

## 파일 로테이션

### size 방식

쓴 바이트를 누적하여 `maxSize`를 초과하면 현재 파일에 타임스탬프 접미사를 붙여 보관하고 새 파일을 생성합니다. 프로세스 시작 시 기존 파일이 있어도 새로 쓴 바이트부터 카운트합니다.

```
app.log                          # 현재 파일
app.log.2026-03-09T05-35-03-588Z # 로테이션된 파일
```

### daily 방식

날짜가 바뀌면 현재 파일에 날짜 접미사를 붙여 보관하고 새 파일을 생성합니다.

```
app.log            # 현재 파일
app.log.2026-03-08 # 전날 파일
```

`maxFiles`를 초과하는 오래된 파일은 자동으로 삭제됩니다.
