// Tag-name normalization + validation shared by node names and derived-tag names.

// A valid TAG primary-key name: letters, digits, underscore; cannot start with a digit.
// Mirrors the backend name rule used for source nodes and derived tags.
export const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Derived-tag names additionally allow dots, so dotted TAG names ("line1.power") can be
// authored the same way source node names can (normalizeTagNameInput only collapses
// whitespace). The backend places no character restriction on derived tag names.
export const TAG_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_.]*$/;

export function normalizeTagNameInput(value) {
    return String(value || "").replace(/\s+/g, "_");
}
