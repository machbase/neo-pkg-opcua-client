// Determines the base axis of a TAG table.
//
// Base time and base distance share the BASETIME bit of M$SYS_COLUMNS.FLAG, so the flag
// alone cannot tell them apart — only the column type can. DATETIME means base time; any
// other type (a DOUBLE odometer column, for example) means base distance.
//
// The column name is never used for the decision. Both values it does use already come back
// in the columns API response:
//   - basetime: M$SYS_COLUMNS.FLAG & 0x1000000
//   - type:     the SQL type string from ColumnType.fromCode(M$SYS_COLUMNS.TYPE)
//
// (same rule as GettColumnFlag in neo-web src/components/side/DBExplorer/utils.ts)

/**
 * @param {Array<{ type?: string, basetime?: boolean }>} columns - the columns array from the columns API
 * @returns {"time"|"distance"} the table's base axis; "time" when there is no BASETIME column
 */
export function baseAxisOfColumns(columns) {
    const baseColumn = (columns || []).find((col) => col?.basetime);
    if (!baseColumn) return "time";
    return String(baseColumn.type || "").toUpperCase().startsWith("DATETIME") ? "time" : "distance";
}

/**
 * The collector appends the collection time to the BASETIME column, so a table
 * whose base is distance cannot be an append target.
 *
 * @param {Array<{ type?: string, basetime?: boolean }>} columns
 * @returns {boolean}
 */
export function isDistanceBaseTable(columns) {
    return baseAxisOfColumns(columns) === "distance";
}
