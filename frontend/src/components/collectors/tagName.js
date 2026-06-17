export function normalizeTagNameInput(value) {
    return String(value || "").replace(/\s+/g, "_");
}
