import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Icon from "../common/Icon";
import useModalDismiss from "../../hooks/useModalDismiss";

// 읽기 전용 상세 보기는 폼이 아니라 값 검사(inspector)다. 값을 input 껍데기에 넣으면 수정할 수
// 있는 것처럼 보이고, 박스 패딩 때문에 네 필드가 화면을 다 먹는다. 그래서 박스를 걷어내고
// [라벨 | 값 | 복사] 3열로만 세운다 — 보이는 것은 박스가 아니라 값이어야 한다.

const COPY_HINT_MS = 1600;
// 화살표 한 번에 굴릴 양. 로우 높이가 아니라 읽는 눈이 따라갈 만한 폭으로 잡았다.
const ARROW_SCROLL_STEP = 80;

// 값에 타입별 색을 주지 않는다. 스키마 타입으로 칠하면 같은 숫자라도 스칼라 컬럼(DOUBLE)은
// 강조되고 JSON payload 에서 뽑은 값은 안 되는 불일치가 생긴다. 타입은 라벨 아래에 글자로 이미
// 적혀 있으므로 색까지 쓸 이유가 없다. 색으로 구분하는 건 값의 유무(NULL)뿐이다.

function prettyJson(text) {
    if (typeof text !== "string") return null;
    const trimmed = text.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
    try {
        return JSON.stringify(JSON.parse(trimmed), null, 2);
    } catch {
        return null;
    }
}

// 스크림이 페이지를 덮어도 뒤쪽 버튼은 Tab 으로 그대로 잡힌다 — 보이지 않는데 눌리는 상태가
// 된다. 그래서 Tab 을 상자 안에 가둔다. 목록을 미리 만들어 두지 않고 Tab 을 누른 순간에 다시
// 만드는 이유는 ↑/↓ 버튼이 양 끝 로우에서 disabled 로 바뀌어 첫/마지막 요소가 움직이기 때문이다.
const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusableWithin(root) {
    return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => el.getClientRects().length > 0
    );
}

// 입력 안에서 ↑/↓ 는 캐럿·목록 이동이다. 지금 이 모달에는 입력이 없지만, 값 편집이나 검색이
// 하나라도 붙는 순간 로우 이동이 조용히 캐럿을 뺏는 버그가 된다.
function isTextEntry(el) {
    if (!el) return false;
    const tag = el.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

// tr·div 에는 tabindex 가 없어 focus() 가 먹지 않는다. 포커스를 돌려줄 때만 -1 을 심는다 —
// -1 은 Tab 순서에 끼어들지 않으므로 그리드의 키보드 동선은 그대로다.
function focusSilently(el) {
    if (!el.hasAttribute("tabindex") && el.tabIndex < 0) el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
}

export default function RawRowDetailModal({
    rows = [],
    index = 0,
    onIndexChange,
    columns = [],
    columnTypes = {},
    tableName = "",
    tableKind = "TAG",
    total = 0,
    primaryKey = "name",
    onClose,
}) {
    const overlayProps = useModalDismiss(onClose);
    const titleId = useId();
    const dialogRef = useRef(null);
    const bodyRef = useRef(null);
    // 이 모달은 로우 클릭으로 열리므로 열기 직전 activeElement 는 대개 body 다. 그대로 닫으면
    // 포커스가 body 로 떨어져 Tab 이 페이지 맨 위(헤더·사이드바)부터 다시 시작한다. 돌아갈
    // 자리를 두 개 잡아 둔다 — 그리드가 .is-inspected 로 표시해 둔 로우, 그리고 열기 직전 자리.
    const openerRef = useRef(null);
    const inspectedRowRef = useRef(null);
    // 어느 필드를 복사했는지 키로 들고 있어야 그 버튼만 체크로 바뀐다. 푸터 힌트에는 라벨을 쓴다.
    const [copied, setCopied] = useState(null);
    const copyTimerRef = useRef(0);

    const row = rows[index];
    const canPrev = index > 0;
    const canNext = index < rows.length - 1;

    const move = useCallback(
        (delta) => {
            const next = index + delta;
            if (next < 0 || next >= rows.length) return;
            onIndexChange?.(next);
        },
        [index, onIndexChange, rows.length]
    );

    // 모달을 닫지 않고 로우를 넘긴다 — 값을 비교하려고 열었다 닫았다 하는 게 이 화면의 주 용도다.
    //
    // 다만 본문은 스크롤되는 영역이다(컬럼이 많거나 payload 가 긴 JSON). 화살표를 무조건 가로채면
    // 스크롤 대신 다른 로우로 튀어 값을 끝까지 읽을 수가 없다. 그래서 아직 그 방향으로 스크롤이
    // 남아 있으면 브라우저에 넘기고, 끝에 닿았을 때만 로우 이동을 가져간다 — 스크롤 컨테이너
    // 안에서 기대되는 순서다.
    useEffect(() => {
        const onKey = (event) => {
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
            if (isTextEntry(event.target)) return;
            const down = event.key === "ArrowDown";
            const body = bodyRef.current;
            if (body) {
                // -1 은 DPR 반올림 흡수용이다. 스크롤이 없는 본문은 scrollHeight === clientHeight
                // 라 room 이 false 가 되어 곧장 로우 이동으로 간다.
                const room = down
                    ? body.scrollTop + body.clientHeight < body.scrollHeight - 1
                    : body.scrollTop > 0;
                if (room) {
                    // 포커스가 본문 안이면 브라우저가 알아서 굴린다. 문제는 기본 상태다 —
                    // 열자마자 포커스는 다이얼로그에 있고 그건 본문의 *부모* 라, 브라우저는
                    // 본문을 스크롤해 주지 않는다. 그 경우에만 직접 굴린다.
                    if (body.contains(event.target)) return;
                    event.preventDefault();
                    body.scrollBy({ top: down ? ARROW_SCROLL_STEP : -ARROW_SCROLL_STEP });
                    return;
                }
            }
            event.preventDefault();
            move(down ? 1 : -1);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [move]);

    // 열리는 순간 포커스를 상자 안으로 들인다. 대상이 닫기 버튼이면 Enter 한 번에 값을 읽기도
    // 전에 모달이 사라지므로, 아무 동작도 없는 컨테이너를 고른다 — ↑/↓ 도 여기서 바로 먹는다.
    // 이미 상자 안에 포커스가 있으면 건드리지 않는다(입력 중인 캐럿을 뺏지 않기 위해서다).
    useEffect(() => {
        openerRef.current = document.activeElement;
        const dialog = dialogRef.current;
        if (dialog && !dialog.contains(document.activeElement)) dialog.focus({ preventScroll: true });
    }, []);

    // capture 로 받는다. 아래에서 누가 Tab 을 먼저 삼켜도 가두는 것만은 성립해야 한다.
    useEffect(() => {
        const onKey = (event) => {
            if (event.key !== "Tab") return;
            const dialog = dialogRef.current;
            if (!dialog) return;
            const items = focusableWithin(dialog);
            const active = document.activeElement;
            if (items.length === 0) {
                event.preventDefault();
                dialog.focus({ preventScroll: true });
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            if (!dialog.contains(active)) {
                event.preventDefault();
                (event.shiftKey ? last : first).focus();
            } else if (event.shiftKey && (active === first || active === dialog)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && active === last) {
                event.preventDefault();
                first.focus();
            }
        };
        document.addEventListener("keydown", onKey, true);
        return () => document.removeEventListener("keydown", onKey, true);
    }, []);

    // ↑/↓ 로 옮겨 다닌 뒤에는 처음 클릭한 로우가 아니라 마지막으로 본 로우가 돌아갈 자리다.
    // 그래서 index 가 바뀔 때마다 그리드에서 다시 잡는다. 표시는 그리드가 하므로 여기서는
    // 그 표시(.is-inspected)를 읽기만 한다.
    useEffect(() => {
        // 못 찾았을 때 옛 값을 남겨 두면 안 된다. 그리드는 가상 스크롤이라 멀리 이동하면 지금
        // 보고 있는 로우가 DOM 에 없는데, 그때 처음 클릭한 로우가 아직 렌더돼 있으면 Esc 가
        // 엉뚱하게 거기로 돌아간다. 없으면 null 로 비워 아래 폴백(그리드 영역)으로 내려보낸다.
        inspectedRowRef.current =
            document.querySelector(".data-viewer-raw-table tbody tr.raw-row-clickable.is-inspected") || null;
    }, [index]);

    // 닫힐 때 포커스 복귀. 로우가 가상 스크롤에서 떨어져 나갔으면(isConnected=false) 열기 직전
    // 자리 → 그리드 스크롤 영역 순으로 물러난다. 어디로 가든 body 로만 떨어뜨리지 않으면 된다.
    useEffect(() => () => {
        const fallback = document.querySelector(".data-viewer-raw-card .table-card-body");
        const target = [inspectedRowRef.current, openerRef.current, fallback].find(
            (el) => el && el !== document.body && el.isConnected
        );
        if (target) focusSilently(target);
    }, []);

    useEffect(() => () => clearTimeout(copyTimerRef.current), []);

    // 로우가 바뀌면 직전 복사 표시를 지운다. 다른 로우의 값이 복사된 것처럼 보이면 안 된다.
    useEffect(() => {
        clearTimeout(copyTimerRef.current);
        setCopied(null);
        // 본문 div 는 로우가 바뀌어도 같은 DOM 노드라 scrollTop 이 남는다. 아래까지 굴려서 다음
        // 로우로 넘어가면 새 로우가 중간부터 보인다 — 맨 위 필드(Time)가 화면 밖이다.
        bodyRef.current?.scrollTo({ top: 0 });
    }, [index]);

    const fields = useMemo(
        () =>
            (columns || [])
                .filter((column) => column && column.key)
                .map((column) => {
                    const label = column.label || column.key;
                    const raw = row?.[column.key];
                    const text = raw === null || raw === undefined ? "" : String(raw);
                    // 라벨은 "Str Value" 로 표시용이라 스키마 이름과 다르다. 조회는 키로 한다.
                    const type = columnTypes[String(column.key).toUpperCase()] || "";
                    return {
                        key: column.key,
                        label,
                        type,
                        text,
                        // 빈 박스로는 NULL 인지 공백인지 알 수 없다. 없음을 글자로 못박는다.
                        empty: text === "",
                        json: prettyJson(text),
                    };
                }),
        [columns, columnTypes, row]
    );

    // navigator.clipboard 는 보안 컨텍스트에서만 있고, 있더라도 문서에 포커스가 없으면
    // NotAllowedError 로 거부한다("Document is not focused"). 거부를 잡지 않으면 버튼을 눌러도
    // 아무 일도 안 일어난 것처럼 보인다 — 실제로 그 상태였다. 그래서 구형 execCommand 로
    // 폴백하고, 그마저 실패하면 실패했다고 말한다. 조용히 삼키지 않는다.
    const writeClipboard = useCallback(async (text) => {
        if (navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(text);
                return true;
            } catch {
                /* 포커스 없음 · 권한 거부 — 아래 폴백으로 내려간다 */
            }
        }
        try {
            const area = document.createElement("textarea");
            area.value = text;
            // 화면 밖으로 밀되 display:none 은 안 된다 — 선택이 불가능해져 복사도 실패한다.
            area.setAttribute("readonly", "");
            area.style.cssText = "position:fixed;top:-1000px;opacity:0";
            // 상자 안에 붙인다. body 에 붙이면 select() 가 포커스를 다이얼로그 밖으로 빼내고,
            // 지운 뒤에는 body 에 남아 Tab 가둠이 그 자리에서 풀린다.
            const host = dialogRef.current || document.body;
            const restore = document.activeElement;
            host.appendChild(area);
            // finally 로 지운다. execCommand 는 폐기된 API 라 환경에 따라 false 가 아니라 throw
            // 하는데, 그때 try 안에서 지우면 임시 textarea 가 상자 안에 포커스를 쥔 채 남는다 —
            // Tab 가둠이 그 자리에서 헛돌고 복사 버튼으로도 못 돌아간다.
            let ok = false;
            try {
                area.select();
                ok = document.execCommand("copy");
            } finally {
                area.remove();
                // 눌렀던 복사 버튼으로 되돌린다 — 연속 복사할 때 Tab 자리를 잃지 않는다.
                if (restore instanceof HTMLElement && restore.isConnected) {
                    restore.focus({ preventScroll: true });
                }
            }
            return ok;
        } catch {
            return false;
        }
    }, []);

    const copy = useCallback((key, label, text) => {
        writeClipboard(text).then((ok) => {
            clearTimeout(copyTimerRef.current);
            setCopied({ key, label, ok });
            copyTimerRef.current = setTimeout(() => setCopied(null), COPY_HINT_MS);
        });
    }, [writeClipboard]);

    const copyJson = () =>
        copy("__json__", "JSON", JSON.stringify(Object.fromEntries(fields.map((f) => [f.label, f.empty ? null : f.text])), null, 2));

    if (!row) return null;

    const identity = String(row?.[primaryKey] ?? "");
    // 대화상자 이름은 헤더의 대표값으로 읽힌다. 그 값이 NULL 이면 이름 없는 대화상자가 되므로
    // 그때만 몇 번째 로우인지로 대신한다 — 스크린리더가 "dialog" 한 마디만 읽고 끝나면 안 된다.

    return (
        <div className="modal-overlay row-inspector-scrim" {...overlayProps}>
            <div
                className="row-inspector"
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={identity ? titleId : undefined}
                aria-label={identity ? undefined : `Row ${(index + 1).toLocaleString()} detail`}
                tabIndex={-1}
            >
                <header className="row-inspector-head">
                    <div className="row-inspector-ident">
                        {/* 제목은 "Row detail" 같은 일반 명사가 아니라 이 로우가 무엇인지여야 한다. */}
                        <div className="row-inspector-meta">
                            <span className="badge badge-primary badge-xs">{tableKind}</span>
                            <span className="row-inspector-table">{tableName}</span>
                            <span className="row-inspector-sep">·</span>
                            <span className="row-inspector-count">
                                row {(index + 1).toLocaleString()} of {(total || rows.length).toLocaleString()}
                            </span>
                        </div>
                        <div id={titleId} className="row-inspector-title mono" title={identity}>{identity}</div>
                    </div>
                    <div className="row-inspector-actions">
                        <button type="button" className="row-inspector-icon" onClick={() => move(-1)}
                            disabled={!canPrev} title="Previous row (↑)" aria-label="Previous row">
                            <Icon name="expand_less" />
                        </button>
                        <button type="button" className="row-inspector-icon" onClick={() => move(1)}
                            disabled={!canNext} title="Next row (↓)" aria-label="Next row">
                            <Icon name="expand_more" />
                        </button>
                        <span className="row-inspector-divider" />
                        <button type="button" className="row-inspector-icon" onClick={onClose}
                            title="Close (Esc)" aria-label="Close">
                            <Icon name="close" />
                        </button>
                    </div>
                </header>

                <div className="row-inspector-body" ref={bodyRef}>
                    {fields.map((field) => (
                        <div key={field.key} className="row-inspector-field">
                            <div className="row-inspector-label">
                                <span>{field.label}</span>
                                {field.type && <span className="row-inspector-type mono">{field.type}</span>}
                            </div>
                            <div
                                className={`row-inspector-value mono${field.empty ? " is-empty" : ""}`}
                            >
                                {field.empty ? "NULL" : field.json ?? field.text}
                            </div>
                            <button
                                type="button"
                                className={`row-inspector-copy${
                                    copied?.key === field.key ? (copied.ok ? " is-copied" : " is-failed") : ""
                                }`}
                                onClick={() => copy(field.key, field.label, field.text)}
                                title={`Copy ${field.label}`}
                                aria-label={`Copy ${field.label}`}
                            >
                                <Icon
                                    name={copied?.key === field.key ? (copied.ok ? "check" : "error") : "content_copy"}
                                    className="icon-sm"
                                />
                            </button>
                        </div>
                    ))}
                </div>

                <footer className="row-inspector-foot">
                    {/* 복사 알림을 토스트로 띄우면 값 하나 볼 때마다 화면이 흔들린다. 여기서만 알린다. */}
                    <span className="row-inspector-hint">
                        {copied
                            ? `${copied.label} ${copied.ok ? "copied" : "copy failed — select the value manually"}`
                            : "↑ ↓ to move between rows · Esc to close"}
                    </span>
                    {/* 강조는 실제로 무언가를 하는 쪽에 준다. 닫기는 Esc·오버레이·헤더 X 로도 되는
                        해제 동작이고, 이 화면에서 유일한 행동은 복사다. 프로젝트의 다른 모달도
                        같은 배치다 — NodeRenameModal 의 Cancel(secondary) / Save all(primary). */}
                    <div className="row-inspector-foot-actions">
                        <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>Close</button>
                        <button type="button" className="btn btn-primary btn-sm" onClick={copyJson}>
                            {copied?.key === "__json__" ? (copied.ok ? "Copied" : "Failed") : "Copy JSON"}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}
