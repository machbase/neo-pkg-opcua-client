# Logger

`cgi-bin/src/lib/logger.js`

크기 기반 로테이션을 지원하는 파일 로거입니다.

API 레퍼런스는 [API.md — Logger API](API.md#logger-api)를 참조하세요.

## 출력 위치

```
$HOME/public/logs/{패키지명}/repli.log
$HOME/public/logs/{패키지명}/repli_0001.log
...
```

패키지명은 `process.argv[1]` 경로에서 자동으로 추출합니다.

## 출력 형식

```
[INFO] 2026-04-14 09:00:00.123  collect  (count=6)
[ERROR] 2026-04-14 09:00:01.456  db open  failed  (error="connection refused")
```

```
[LEVEL] YYYY-MM-DD HH:MM:SS.sss  stage  msg  (key=value ...)
```

- 값에 공백, `=`, `"` 가 포함되면 쌍따옴표로 감쌉니다.
- `null`/`undefined` 필드는 출력하지 않습니다.

## 파일 로테이션

파일 크기가 10 MB를 초과하면 다음 인덱스 파일로 전환합니다.

```
repli.log        → repli_0001.log → repli_0002.log → ... → repli_{maxFiles-1}.log
```

`maxFiles` 한도에 도달하면 이후 로그는 더 이상 기록하지 않습니다.
