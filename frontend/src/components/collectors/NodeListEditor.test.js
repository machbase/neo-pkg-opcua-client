import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(__dirname, "NodeListEditor.jsx"), "utf8");

test("NodeListEditor normalizes manual tag name input and edits", () => {
    assert.match(source, /import \{ normalizeTagNameInput \} from "\.\/tagName";/);
    assert.match(source, /const trimmedName = normalizeTagNameInput\(name\)\.trim\(\);/);
    assert.match(source, /setName\(normalizeTagNameInput\(e\.target\.value\)\)/);
    assert.match(source, /setEditingNameValue\(normalizeTagNameInput\(e\.target\.value\)\)/);
});
