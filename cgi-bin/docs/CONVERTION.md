# Convention

## HTTP 응답 공통 구조

모든 API 응답은 아래 두 가지 형식만 사용한다.

**성공**

```json
{ "ok": true, "data": <object | array | primitive> }
```

**실패**

```json
{ "ok": false, "reason": "<오류 메시지>" }
```

규칙:

- `ok` 필드는 항상 boolean
- 성공 시 응답 본문은 `data` 키 하나에 담는다. 추가 top-level 필드를 넣지 않는다
- 실패 시 `reason` 은 사람이 읽을 수 있는 단문 문자열
- `data` 가 배열인 경우 빈 배열 `[]` 도 성공 응답이다
- `data` 가 없는 성공(예: DELETE)은 `{ "ok": true }` 만 반환한다

## CGI API 파일 (`api/**/*.js`)

파일 상단에 지원 메서드·경로 주석 → ROOT 경로 계산 → CGI/Handler require → `handlers` 객체로 메서드 분기 → 최상위 `try/catch`로 응답.

- 파라미터 유효성 검사는 api 파일에서 수행, `reply()`로 즉시 반환
- 비즈니스 로직은 **Handler로 위임**하고 api 파일에서는 직접 구현하지 않음
- 미지원 메서드는 `handlers[method]` 부재 시 `method not allowed` 응답

```js
// api/collector/start.js 구조
const { CGI } = require(path.join(ROOT, 'src', 'cgi', 'cgi_util.js'));
const Handler = require(path.join(ROOT, 'src', 'cgi', 'handler.js'));

const { name } = CGI.parseQuery();
const reply = (r) => CGI.reply(r);

const handlers = {
  POST: () => {
    if (!name) {
      reply({ ok: false, reason: 'name is required' });
      return;
    }
    Handler.collectorStart(name, reply);
  },
};
const method = (process.env.get('REQUEST_METHOD') || 'GET').toUpperCase();
try {
  const handler = handlers[method] || (() => {
    reply({ ok: false, reason: 'method not allowed' });
  });
  handler();
} catch (err) {
  reply({ ok: false, reason: err && err.message ? err.message : String(err) });
}
```

## Handler (`src/cgi/handler.js`)

- 함수 시그니처: `function handlerName(param, ..., reply)`
- 내부에서 `reply()`를 직접 호출해 응답 (반환값 없음)
- 에러 메시지 추출은 `errorMessage(err)` 헬퍼 사용
- 모든 export는 파일 하단 `module.exports`에 한 번에 선언

```js
function collectorStart(name, reply) {
  // 로직
  reply({ ok: true });
}

module.exports = { collectorStart, ... };
```

## Machbase TAG 테이블 제약

### 대상 테이블
이 패키지는 TAG 테이블(`TYPE = 6`)만 대상으로 한다. LOG 테이블은 수집·조회 대상에서 제외.

### SUMMARIZED 컬럼과 null append
`SUMMARIZED` 플래그가 지정된 컬럼에는 null을 append할 수 없다. Machbase 제약.

`MachbaseStream`은 `open()` 시점에 `valueColumn`(수집값 컬럼) 외에 `SUMMARIZED` 컬럼이 존재하면 오류를 반환한다.

```
table 'TAG' has other SUMMARIZED columns that cannot be null: COL_NAME. Use one of these as valueColumn instead.
```

따라서 TAG 테이블에 SUMMARIZED 컬럼이 여러 개 있을 경우, collector 설정의 `valueColumn`에 반드시 해당 컬럼 중 하나를 지정해야 한다. 미지정 시 수집이 시작되지 않는다.

## 코드 스타일

`try/catch`, `if`, object 리터럴은 한 줄로 압축하지 않는다.

```js
// 금지
try { fs.unlinkSync(p); } catch (_) {}
if (!name) return CGI.reply({ ok: false });
return { host: db.host, port: db.port };

// 허용
try {
  fs.unlinkSync(p);
} catch (_) {}

if (!name) {
  return CGI.reply({ ok: false });
}

return {
  host: db.host,
  port: db.port,
};
```
