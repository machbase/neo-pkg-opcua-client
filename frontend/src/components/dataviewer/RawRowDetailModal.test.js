import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "RawRowDetailModal.jsx"), "utf8");

test("row inspector announces itself as a modal dialog named by the header identity", () => {
    assert.match(source, /role="dialog"/);
    assert.match(source, /aria-modal="true"/);
    assert.match(source, /aria-labelledby=\{identity \? titleId : undefined\}/);
    assert.match(source, /aria-label=\{identity \? undefined :/);
    // 제목 요소가 실제로 그 id 를 달고 있어야 이름이 읽힌다.
    assert.match(source, /<div id=\{titleId\} className="row-inspector-title mono"/);
});

test("focus moves into the box on open without landing on a destructive control", () => {
    assert.match(source, /tabIndex=\{-1\}/);
    assert.match(source, /dialog\.focus\(\{ preventScroll: true \}\)/);
    // 이미 상자 안에 포커스가 있으면 옮기지 않는다.
    assert.match(source, /if \(dialog && !dialog\.contains\(document\.activeElement\)\)/);
});

test("Tab is trapped in both directions and the list is rebuilt per keystroke", () => {
    assert.match(source, /event\.key !== "Tab"/);
    assert.match(source, /document\.addEventListener\("keydown", onKey, true\)/);
    assert.match(source, /document\.removeEventListener\("keydown", onKey, true\)/);
    assert.match(source, /const items = focusableWithin\(dialog\);/);
    assert.match(source, /event\.shiftKey && \(active === first \|\| active === dialog\)/);
    assert.match(source, /!event\.shiftKey && active === last/);
    // disabled 버튼은 후보에서 빠져야 한다 — ↑/↓ 는 양 끝 로우에서 disabled 가 된다.
    assert.match(source, /button:not\(\[disabled\]\)/);
});

test("closing hands focus back to the inspected row, never to body", () => {
    assert.match(source, /\[inspectedRowRef\.current, openerRef\.current, fallback\]/);
    assert.match(source, /el !== document\.body && el\.isConnected/);
    assert.match(source, /\.data-viewer-raw-table tbody tr\.raw-row-clickable\.is-inspected/);
    assert.match(source, /\.data-viewer-raw-card \.table-card-body/);
    // tr 은 tabindex 가 없어 focus() 가 먹지 않으므로 복귀 시점에만 -1 을 심는다.
    assert.match(source, /el\.setAttribute\("tabindex", "-1"\)/);
});

test("row navigation keeps working but yields to text entry", () => {
    assert.match(source, /event\.key !== "ArrowUp" && event\.key !== "ArrowDown"/);
    assert.match(source, /if \(isTextEntry\(event\.target\)\) return;/);
    assert.match(source, /tag === "INPUT" \|\| tag === "TEXTAREA" \|\| tag === "SELECT" \|\| el\.isContentEditable === true/);
    // Esc·overlay 닫기는 여전히 공용 훅이 담당한다.
    assert.match(source, /useModalDismiss\(onClose\)/);
});
