# JSH Runtime Reference

machbase-neo jsh (goja 기반) 런타임 API 참조 문서.
공식 문서: https://docs.machbase.com/kr/neo/jsh/

---

## 런타임 특성

- **엔진**: goja (Go 기반 JS 엔진) — Node.js 아님
- **모듈 시스템**: CommonJS (`require` / `module.exports`)
- **비동기**: `async/await`, `Promise` 지원
- **cwd**: `/work` (실제 경로 `/home/machbase/neo-pkg-opcua-client`와 심볼릭 링크)
- **미지원 항목**:
  - `__dirname`, `__filename` 없음 → `process.argv[1]` 기반으로 ROOT 경로 계산:
    ```js
    const _argv = process.argv[1];
    const ROOT = _argv.slice(0, _argv.lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);
    ```
    `cgi-bin/` 하위 어느 디렉토리에서 실행해도 올바르게 동작합니다.
  - `AbortController` 없음 → 직접 구현 필요
  - `fs/promises` 없음 → `fs` 동기 API 사용
  - `process.hrtime.bigint()` 없음 → `process.hrtime()` 사용
  - `typeof bigint` 동작 상이 → `_isBigInt()` 헬퍼 필요
  - `require('외부패키지')` 불가 — node_modules 탐색 없음, 내장 모듈만 가능
  - `console.log` 없음 → `console.println()` 사용
- **파일 I/O**: 절대경로 사용 권장 (`/work/data/`, `/work/logs/`)
- **유니코드 주의**: `fs.createWriteStream`에서 유니코드 문자 쓰기 시 `write(str, 'utf8')` 명시 필요

---

## 사용 가능한 내장 모듈

`global`, `archive`, `fs`, `http`, `machcli`, `mathx`, `mqtt`, `net`, `opcua`, `os`, `pretty`, `process`

---

## process 모듈

```js
const process = require('process');
```

### 주요 프로퍼티

| 프로퍼티 | 설명 |
|---------|------|
| `process.env` | 환경 변수 객체. `process.env.get('HOME')` |
| `process.pid` | 현재 프로세스 ID |
| `process.ppid` | 부모 프로세스 ID |
| `process.platform` | `windows` / `linux` / `darwin` |
| `process.arch` | `amd64` / `aarch64` |
| `process.version` | jsh 버전 문자열 |
| `process.stdout` | 표준 출력 스트림 |
| `process.stderr` | 표준 에러 스트림 |
| `process.stdin` | 표준 입력 스트림 |

### 주요 메서드

| 메서드 | 설명 |
|--------|------|
| `process.exit([code])` | 프로세스 종료 (기본 code=0) |
| `process.cwd()` | 현재 작업 디렉토리 반환 |
| `process.chdir(path)` | 작업 디렉토리 변경 |
| `process.hrtime([prev])` | 고정밀 시간 `[seconds, nanoseconds]` 반환 |
| `process.now()` | 현재 시간 객체 반환 |
| `process.nextTick(cb, ...args)` | 다음 이벤트 루프 턴에 콜백 실행 |
| `process.addShutdownHook(cb)` | 프로세스 종료 시 콜백 등록 |
| `process.on('SIGINT', cb)` | 시그널 핸들러 등록 |
| `process.once('SIGTERM', cb)` | 시그널 핸들러 1회 등록 |
| `process.kill(pid[, signal])` | OS 시그널 전송 |
| `process.expand(val)` | 환경변수 확장 (`$HOME` → 실제 경로) |
| `process.memoryUsage()` | 메모리 사용 정보 (`rss`, `heapTotal`, `heapUsed` 등) |

### 지원 시그널

`SIGHUP`, `SIGINT`, `SIGQUIT`, `SIGABRT`, `SIGKILL`, `SIGUSR1`, `SIGSEGV`, `SIGUSR2`, `SIGPIPE`, `SIGALRM`, `SIGTERM`
대소문자 무관, `SIG` 접두사 필수.

```js
process.once('SIGTERM', () => { shutdownFlag.value = true; });
process.once('SIGINT',  () => { shutdownFlag.value = true; });
```

---

## fs 모듈

```js
const fs = require('fs');
```

Node.js 호환 동기 파일 시스템 API (v8.0.73+).
모든 함수는 `Sync` suffix 별칭도 제공 (`readFileSync`, `writeFileSync` 등).

### 파일 읽기/쓰기

```js
fs.readFile(path[, options])          // UTF-8 문자열 또는 바이트 배열 반환
fs.writeFile(path, data[, options])   // 파일 쓰기 (생성/덮어쓰기)
fs.appendFile(path, data[, options])  // 파일 끝에 추가
```

### 파일 정보

```js
fs.exists(path)   // boolean 반환
fs.stat(path)     // { name, size, mode, mtime, atime, ctime, birthtime, isFile(), isDirectory(), isSymbolicLink() }
```

### 디렉토리

```js
fs.readdir(path[, options])   // options: { withFileTypes, recursive } — '.' '..' 포함
fs.mkdir(path[, options])     // options: { recursive: true }
fs.rmdir(path[, options])     // options: { recursive: true }
```

### 파일 조작

```js
fs.rename(oldPath, newPath)           // 이름 변경/이동 (같은 마운트 내)
fs.unlink(path)                       // 파일 삭제
fs.rm(path[, options])                // 파일/디렉토리 삭제 (options: { force: true })
fs.copyFile(src, dest[, flags])       // 단일 파일 복사
```

### 스트림

```js
const ws = fs.createWriteStream(path[, options]);
ws.write(data, 'utf8');   // 인코딩 명시 권장
ws.on('error', cb);
ws.end();

const rs = fs.createReadStream(path[, options]);
rs.pipe(ws);
```

### 권한/접근

```js
fs.access(path[, mode])   // mode: fs.constants.F_OK / R_OK / W_OK / X_OK
fs.chmod(path, mode)
```

### Atomic Write 패턴 (권장)

```js
const tmpPath = `${filePath}.${Date.now()}.tmp`;
fs.writeFileSync(tmpPath, content, 'utf8');
fs.renameSync(tmpPath, filePath);
```

---

## machcli 모듈

```js
const machcli = require('machcli');
```

jsh 내장 동기 DB 클라이언트 (v8.0.73+). **모든 메서드 동기 실행**.

### 연결

```js
const client = new machcli.Client({
  host: '127.0.0.1',   // 기본값
  port: 5656,           // 기본값
  user: 'sys',          // 기본값
  password: 'manager',  // 기본값
  alternativeHost: '',  // optional
  alternativePort: 0,   // optional
});

const conn = client.connect();  // Connection 반환
conn.close();
client.close();  // 내부 클라이언트 종료
```

### Connection 메서드

| 메서드 | 반환 | 설명 |
|--------|------|------|
| `conn.query(sql[, ...params])` | `Rows` | SELECT 실행 |
| `conn.queryRow(sql[, ...params])` | `Row` | 단건 SELECT (`_ROWNUM` 포함) |
| `conn.exec(sql[, ...params])` | `{rowsAffected, message}` | DDL/DML 실행 |
| `conn.explain(sql[, ...params])` | `string` | 실행 계획 반환 |
| `conn.append(tableName)` | `Appender` | Append 스트림 오픈 |
| `conn.close()` | — | 연결 종료 |

### Rows 순회

```js
const rows = conn.query('SELECT _RID, name, time FROM _TAG_DATA_0 WHERE _RID >= ?', startRid);
for (const row of rows) {
  // row.COLUMN_NAME (컬럼명 대문자)
  console.println(row._RID, row.NAME, row.TIME);
}
rows.close();  // 반드시 close() 호출
```

### Appender 사용

```js
const appender = conn.append('TAG');
appender.append(v1, v2, v3, ...);  // spread 방식 (배열 아님)
appender.flush();   // 명시 호출 필요
appender.close();   // 명시 호출 필요
```

### VOLATILE TABLE 주의

VOLATILE TABLE은 Appender 미지원 → `exec` + `?` 파라미터 바인딩 사용:

```js
conn.exec('INSERT INTO _repli_chk VALUES (?, ?, ?)', idx, name, timeObj);
```

### 쿼리 결과 타입 주의사항

- 컬럼명: **대문자** 반환 (`_RID`, `NAME`, `TIME`)
- TAG 파티션의 `NAME` 컬럼: `typeof number` (tag ID, 숫자)
- `TIME` 컬럼: Go `time.Time` 객체
  - `BigInt(row.TIME)` → NaN (불가)
  - `row.TIME.unixNano()` → number (정밀도 손실 발생)
  - **정밀도 유지**: `?` 파라미터 바인딩으로 `time.Time` 객체 그대로 전달

### 유틸리티

```js
machcli.queryTableType(conn, names)    // 테이블 타입 코드 반환
machcli.stringTableType(type)          // 타입 코드 → 문자열 (Log, Tag, Volatile 등)
machcli.stringColumnType(columnType)   // 컬럼 타입 코드 → 문자열
```

---

## http 모듈

```js
const http = require('http');
```

### HTTP 서버

```js
const svr = new http.Server({ network: 'tcp', address: 'host:port' });

svr.get('/path/:id', (ctx) => {
  const id = ctx.param('id');
  const q  = ctx.query('name');
  const body = ctx.request.body;
  ctx.json(http.status.OK, { ok: true, data: id });
});
svr.post('/path', (ctx) => { ... });
svr.put('/path/:id', (ctx) => { ... });
svr.delete('/path/:id', (ctx) => { ... });
svr.options('/path', (ctx) => { ... });

svr.serve(callback);  // 서버 시작
svr.close();          // 서버 종료
```

### Context 응답 헬퍼

```js
ctx.json(status, data[, { indent: true }])
ctx.text(status, format[, ...args])
ctx.html(status, template, data)
ctx.redirect(status, url)
ctx.setHeader(name, value)
ctx.abort()
```

### HTTP 클라이언트

```js
const res = http.get('https://example.com');
console.println(res.statusCode, res.text());

const req = http.request({ method: 'POST', url: '...', headers: {} }, (res) => {
  console.println(res.json());
});
req.write(JSON.stringify(body));
req.end();
```

### 상태 코드 상수

`http.status.OK`, `http.status.Created`, `http.status.NoContent`,
`http.status.Found`, `http.status.NotFound`, `http.status.InternalServerError`

---

## os 모듈

```js
const os = require('os');
os.platform()       // 'linux' / 'darwin' / 'windows'
os.arch()           // 'amd64' / 'aarch64'
os.hostname()       // 시스템 호스트명
os.homedir()        // 현재 사용자 홈 디렉토리
os.tmpdir()         // 임시 디렉토리
os.totalmem()       // 전체 메모리 (bytes)
os.freemem()        // 가용 메모리 (bytes)
os.uptime()         // 시스템 업타임 (초)
os.cpus()           // CPU 코어 정보 배열
os.networkInterfaces()  // 네트워크 인터페이스 정보
os.diskUsage(path)  // { total, used, free, usedPercent }
os.EOL              // 플랫폼별 줄바꿈 (\n 또는 \r\n)
os.constants.signals   // 시그널 상수 (SIGINT=2, SIGTERM=15, ...)
```

---

## 실행 방법

```bash
# 스크립트 실행
../machbase-neo/machbase-neo jsh /work/cgi-bin/neo-collector.js /work/cgi-bin/conf.d/collector-a.json

# 디렉토리 마운트
../machbase-neo/machbase-neo jsh -v /ext=/some/host/dir /work/script.js

# 인라인 실행
../machbase-neo/machbase-neo jsh -C 'console.println("hello")'
```

- jsh cwd = `/work` (심볼릭 링크 → 실제 `/home/machbase/neo-pkg-opcua-client`)
- 파일 경로는 `/work/...` 절대경로 사용 권장
