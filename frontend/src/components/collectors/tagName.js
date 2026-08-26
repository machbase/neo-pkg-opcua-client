// 태그 이름 규칙. 이름을 만들거나 고치거나 검사하는 모든 곳이 여기를 거친다.
//
// 왜 하나로 합쳤나
//
// 이전에는 다섯 개가 있었고, 같은 문자열을 서로 다르게 처리했다.
//
//   NAME_PATTERN           영숫자 + _         일괄 이름변경 모달에서만 걸림
//   TAG_NAME_PATTERN       영숫자 + _ + .     파생 태그 편집기에서만 걸림
//   cleanTagName (rename)  나머지 문자를 삭제, 한글은 자판 위치로 치환
//   cleanTagName (derived) 위와 같고 점만 남김
//   normalizeTagNameInput  연속 공백을 "_" 하나로
//
// 그래서 "Simulation Examples" 가 노드 브라우저에서는 "Simulation_Examples", 이름변경 모달에
// 직접 입력하면 "SimulationExamples", 파생 태그 편집기에서는 거부로 갈렸다. 노드를 추가하거나
// 인라인으로 고치는 경로는 아무 검사도 하지 않아서, 모달이 거부하던 이름이 이미 저장된 설정에
// 들어 있었다. 다섯 화면 중 한 곳에서만 걸리는 건 규칙이 아니다.
//
// 무엇을 기준으로 삼았나
//
// 백엔드가 기준이다. 실제로 강제하는 것(cgi-bin handler.js 의 validateConfig)은 trim 뿐이고
// 문자에 대한 검사는 없다. 이건 빠뜨린 게 아니다 — Machbase 는 TAG NAME 컬럼에 공백·점·하이픈·
// 한글을 그대로 저장하고, 조회 경로는 이름을 바인드 파라미터로 넘기며, 차트 경로는 따옴표로
// 감싸 이스케이프하고, neo-web Tag Analyzer 도 자체 문자 규칙이 없다. 네 가지 모두 실제 서버로
// 확인했다.
//
// 2026년 6월 인코딩 버그의 잔재였다 — 클라이언트가 URLSearchParams 로 쿼리를
// 만들면서 공백을 "+" 로 인코딩했는데, 서버는 decodeURIComponent 만 해서 "+" 를 공백으로
// 되돌리지 않았다. 양쪽 모두 3일 간격으로 고쳐졌고(서버 6/12, 클라이언트 6/15) 우회책만 남았다.
//
// 무엇을 거부하나
//
// 백엔드가 볼 수 없는 것과, json 경로가 담지 못하는 것뿐이다.
//
//   콤마    names 와 jsonKeys 는 콤마로 이어붙인 하나의 쿼리 파라미터로 전송된다. 콤마가 든
//           이름은 전송 중 쪼개져 다시 읽을 수 없다. 저장은 되고 조회만 조용히 비는, 가장 나쁜
//           형태의 실패라 미리 막는다.
//   json    큰따옴표와 제어문자. JSON collector 일 때만 해당한다 — 아래 참고.
//
// 중복 검사는 이미 쓰이는 이름을 아는 호출부가 인자로 넘긴다.
//
// 여기서 보지 않는 것 두 가지:
//
//   컬럼 폭    NAME 컬럼의 VARCHAR 폭. 테이블을 아는 백엔드가 저장 시 막는다(machbase/neo#1367).
//              프론트로 복제하면 컬럼 메타를 컴포넌트 두 단계 더 관통시켜야 해서 두지 않았다.
//   256자      neo-web Tag Analyzer 로 넘길 때만 걸리는 제한이라 핸드오프 쪽에 있다
//              (dataViewerModel.js 의 TAG_ANALYZER_MAX_TEXT). 저장·조회에는 아무 영향이 없고,
//              300자 태그가 정상 동작하는 것을 실측으로 확인했다.


// JSON collector 는 한 사이클을 한 row 로 저장하고 노드 이름이 payload 의 키가 된다. 그래서
// 이름이 바인드 파라미터가 아니라 json 경로 `PAYLOAD->'$["name"]'` 안으로 들어간다. 따옴표
// 형태는 `]` `[` `\` `'` 점 공백을 모두 담을 수 있지만(실측), 큰따옴표는 경로를 닫아버리고
// json 경로 문법에는 이스케이프가 없다. 제어문자는 SQL 텍스트 자체를 깨뜨린다. 이 둘만 거부한다.
// 비-JSON collector 는 이름이 값으로만 쓰이므로 이런 제약이 없다.
const JSON_PAYLOAD_KEY_REJECT = /["\r\n\t\0]/;

/**
 * 저장될 형태의 이름. trim 만 한다 — 백엔드가 하는 것과 정확히 같다.
 *
 * @param {string} value
 * @returns {string}
 */
export function normalizeTagName(value) {
    return String(value ?? "").trim();
}

/**
 * 저장했다가 다시 읽어올 수 있는 이름인지 검사한다.
 *
 * @param {string} value - 원본 입력. 여기서 정규화하므로 호출부가 미리 trim 할 필요 없다
 * @param {object} [options]
 * @param {string[]} [options.taken] - 이미 쓰이는 이름들. 일치하면 중복
 * @param {boolean} [options.jsonPayloadKey] - JSON collector 라 이 이름이 payload 키가 되는 경우
 * @returns {{ ok: true, name: string } | { ok: false, reason: string }}
 */
export function validateTagName(value, options = {}) {
    const name = normalizeTagName(value);
    const { taken, jsonPayloadKey = false } = options;

    if (!name) return { ok: false, reason: "Enter a tag name." };

    if (name.includes(",")) {
        return { ok: false, reason: `'${name}' contains a comma, which separates names in a request.` };
    }
    if (jsonPayloadKey && JSON_PAYLOAD_KEY_REJECT.test(name)) {
        return { ok: false, reason: `'${name}' contains a character a json payload key cannot carry.` };
    }
    if (Array.isArray(taken) && taken.some((other) => normalizeTagName(other) === name)) {
        return { ok: false, reason: `'${name}' is already used.` };
    }

    return { ok: true, name };
}
