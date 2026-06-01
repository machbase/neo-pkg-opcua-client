import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "NodeBrowserPanel.jsx"), "utf8");

test("NodeBrowserPanel applies selection changes from latest selection state", () => {
    assert.match(
        source,
        /setSelectionState\(\(prev\)\s*=>\s*applyNodeSelectionState\(prev,/,
    );
});

test("NodeBrowserPanel keeps selected and removedIds in one state object", () => {
    assert.doesNotMatch(source, /const \[selected,\s*setSelected\]/);
    assert.doesNotMatch(source, /const \[removedIds,\s*setRemovedIds\]/);
});
