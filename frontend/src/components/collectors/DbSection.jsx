import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Icon from "../common/Icon";
import * as serversApi from "../../api/servers";
import { baseAxisOfColumns, isDistanceBaseTable } from "./tableBaseAxis";
import { useApp } from "../../context/AppContext";

const NUMERIC_TYPES = new Set(["SHORT", "INTEGER", "LONG", "FLOAT", "DOUBLE"]);
const AUTO_TABLE_VALUE_COLUMN = "VALUE";
const AUTO_TABLE_STRING_COLUMN = "STR_VALUE";
// The table list API does not report the base axis, so every table needs its own columns lookup.
// Cap the concurrent lookups so servers with many tables do not get a burst of requests.
const BASE_AXIS_PROBE_CONCURRENCY = 6;

function classifyColumn(col) {
    const t = (col?.type || "").toUpperCase();
    if (NUMERIC_TYPES.has(t)) return "numeric";
    if (t === "JSON") return "json";
    if (t.startsWith("VARCHAR")) return "string";
    return "other";
}

function displayTableName(user, name) {
    return user && user !== "SYS" ? `${user}.${name}` : name;
}

function groupTablesByUser(tables) {
    const map = new Map();
    for (const t of tables) {
        const user = t.user || "SYS";
        if (!map.has(user)) map.set(user, []);
        map.get(user).push(t);
    }
    return [...map.entries()].sort(([a], [b]) => {
        if (a === "SYS") return -1;
        if (b === "SYS") return 1;
        return a.localeCompare(b);
    });
}

function normalizeTableInput(value) {
    return String(value || "").trim().toUpperCase();
}

function isTableNotFoundError(e) {
    const msg = String(e?.reason || e?.message || "").toLowerCase();
    return msg.includes("table") && msg.includes("not found");
}

function isStringValueCandidate(col) {
    return (
        classifyColumn(col) === "string" &&
        !col?.primaryKey &&
        !col?.basetime &&
        !col?.metadata
    );
}

export default function DbSection({
    form,
    update,
    servers = [],
    onOpenServerSettings,
    onRefreshServers,
    isEdit = false,
}) {
    const { notify } = useApp();
    const db = form.db;

    const [tables, setTables] = useState([]);
    const [columns, setColumns] = useState([]);
    const [loadingTables, setLoadingTables] = useState(false);
    const [loadingColumns, setLoadingColumns] = useState(false);
    const [tableDropdownOpen, setTableDropdownOpen] = useState(false);
    const tableComboRef = useRef(null);
    const baseAxisCacheRef = useRef(new Map());
    const tablesRequestRef = useRef(0);

    // The list API carries no base axis info, so probe it per table through the columns API.
    // Results are cached per server+table so reopening the dropdown does not refetch them.
    const filterOutDistanceBaseTables = useCallback(async (server, list) => {
        const cache = baseAxisCacheRef.current;
        const labelOf = (t) => displayTableName(t.user || "SYS", t.name);
        const queue = list.filter((t) => !cache.has(`${server}::${labelOf(t)}`));

        const probe = async () => {
            while (queue.length > 0) {
                const target = queue.shift();
                if (!target) return;
                const label = labelOf(target);
                try {
                    const data = await serversApi.listColumns(server, label);
                    cache.set(`${server}::${label}`, baseAxisOfColumns(data?.columns));
                } catch {
                    // Do not hide tables whose probe failed.
                    // If one is actually selected, verifyTable probes again and blocks it.
                    cache.set(`${server}::${label}`, "time");
                }
            }
        };

        const workerCount = Math.min(BASE_AXIS_PROBE_CONCURRENCY, queue.length);
        await Promise.all(Array.from({ length: workerCount }, probe));

        // The collector appends the collection time to the BASETIME column, so a table
        // with a distance base axis can never be an append target in the first place.
        return list.filter((t) => cache.get(`${server}::${labelOf(t)}`) !== "distance");
    }, []);

    useEffect(() => {
        if (!db.server && servers.length > 0) {
            update("db.server", servers[0].name);
        }
    }, [servers, db.server, update]);

    const fetchTables = useCallback(async () => {
        if (!db.server) {
            setTables([]);
            return;
        }
        const requestId = tablesRequestRef.current + 1;
        tablesRequestRef.current = requestId;
        setLoadingTables(true);
        try {
            const data = await serversApi.listTables(db.server);
            const usable = await filterOutDistanceBaseTables(db.server, data || []);
            if (tablesRequestRef.current !== requestId) return;
            setTables(usable);
        } catch (e) {
            if (tablesRequestRef.current !== requestId) return;
            notify(e.reason || e.message, "error");
            setTables([]);
        } finally {
            if (tablesRequestRef.current === requestId) {
                setLoadingTables(false);
            }
        }
    }, [db.server, filterOutDistanceBaseTables, notify]);

    const verifyTable = useCallback(async (options = {}) => {
        const { allowAutoCreate = true, notifyOnError = true, table = db.table } = options;
        const tableName = normalizeTableInput(table);
        if (!db.server || !tableName) {
            setColumns([]);
            if (db.autoCreateTable) update("db.autoCreateTable", false);
            if (db.tableStatus !== "unknown") update("db.tableStatus", "unknown");
            return "unknown";
        }
        if (tableName !== db.table) {
            update("db.table", tableName);
        }
        setLoadingColumns(true);
        try {
            const data = await serversApi.listColumns(db.server, tableName);
            if (db.autoCreateTable) update("db.autoCreateTable", false);
            // The list filters these out, but the combo also accepts typed input, so block it here too.
            if (isDistanceBaseTable(data?.columns)) {
                setColumns([]);
                if (db.tableStatus !== "unsupportedBase") update("db.tableStatus", "unsupportedBase");
                if (notifyOnError) {
                    notify(`Table '${tableName}' uses a distance base axis and cannot be collected.`, "error");
                }
                return "unsupportedBase";
            }
            setColumns(data?.columns || []);
            if (db.tableStatus !== "existing") update("db.tableStatus", "existing");
            return "existing";
        } catch (e) {
            setColumns([]);
            if (!isEdit && allowAutoCreate && isTableNotFoundError(e) && !tableName.includes(".")) {
                if (!db.autoCreateTable) update("db.autoCreateTable", true);
                if (db.tableStatus !== "autoCreate") update("db.tableStatus", "autoCreate");
                return "autoCreate";
            }
            if (db.autoCreateTable) update("db.autoCreateTable", false);
            if (isTableNotFoundError(e)) {
                if (db.tableStatus !== "missing") update("db.tableStatus", "missing");
            } else if (db.tableStatus !== "unknown") {
                update("db.tableStatus", "unknown");
            }
            if (notifyOnError) {
                notify(e.reason || e.message, "error");
            }
            return "unknown";
        } finally {
            setLoadingColumns(false);
        }
    }, [db.server, db.table, db.autoCreateTable, db.tableStatus, isEdit, notify, update]);

    useEffect(() => {
        fetchTables();
    }, [fetchTables]);

    // Edit mode opens with a server/table already chosen but no columns loaded, so columnKind
    // — and everything derived from it, like the JSON time-policy conflict — stayed empty until
    // the user touched the table field. Resolve the columns once for a table the form already
    // considers existing. Typing a new name sets tableStatus back to "unknown", so this does
    // not fire on every keystroke.
    const verifiedTableRef = useRef("");
    useEffect(() => {
        const tableName = normalizeTableInput(db.table);
        if (!db.server || !tableName) return;
        if (db.tableStatus !== "existing" || columns.length > 0) return;
        const key = `${db.server}::${tableName}`;
        if (verifiedTableRef.current === key) return;
        verifiedTableRef.current = key;
        verifyTable({ allowAutoCreate: false, notifyOnError: false, table: tableName });
    }, [columns.length, db.server, db.table, db.tableStatus, verifyTable]);

    useEffect(() => {
        if (!tableDropdownOpen) return;
        const handleOutsideClick = (event) => {
            if (!tableComboRef.current?.contains(event.target)) {
                setTableDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleOutsideClick);
        return () => document.removeEventListener("mousedown", handleOutsideClick);
    }, [tableDropdownOpen]);

    const { numericCols, jsonCols, stringCols } = useMemo(() => {
        const nc = [];
        const jc = [];
        const sc = [];
        for (const col of columns) {
            const kind = classifyColumn(col);
            if (kind === "numeric") nc.push(col);
            else if (kind === "json") jc.push(col);
            else if (isStringValueCandidate(col)) sc.push(col);
        }
        return { numericCols: nc, jsonCols: jc, stringCols: sc };
    }, [columns]);

    const hasValueColCandidates = numericCols.length + jsonCols.length > 0;
    const hasAnySummarized = useMemo(() => columns.some((c) => c.summarized), [columns]);

    const selectedColumnKind = useMemo(() => {
        if (!db.column) return "";
        if (numericCols.some((c) => c.name === db.column)) return "numeric";
        if (jsonCols.some((c) => c.name === db.column)) return "json";
        return "";
    }, [db.column, numericCols, jsonCols]);

    useEffect(() => {
        if ((db.columnKind || "") !== selectedColumnKind) {
            update("db.columnKind", selectedColumnKind);
        }
    }, [selectedColumnKind, db.columnKind, update]);

    // Whether the selected VALUE column is SUMMARIZED — derived tags with onError:"null"
    // cannot target a SUMMARIZED column. Lifted so DerivedTagsEditor can disable that option.
    const selectedColumnSummarized = useMemo(() => {
        if (!db.column) return false;
        const col = columns.find((c) => c.name === db.column);
        return Boolean(col && col.summarized);
    }, [db.column, columns]);

    useEffect(() => {
        if (Boolean(db.columnSummarized) !== selectedColumnSummarized) {
            update("db.columnSummarized", selectedColumnSummarized);
        }
    }, [selectedColumnSummarized, db.columnSummarized, update]);

    useEffect(() => {
        if (!db.table || loadingColumns) return;
        if (!hasValueColCandidates && stringCols.length > 0 && !db.stringOnly) {
            update("db.stringOnly", true);
            if (db.column) update("db.column", "");
        }
    }, [db.table, loadingColumns, hasValueColCandidates, stringCols.length, db.stringOnly, db.column, update]);

    const handleServerChange = (e) => {
        update("db.server", e.target.value);
        update("db.table", "");
        update("db.column", "");
        update("db.stringColumn", "");
        update("db.stringOnly", false);
        update("db.columnKind", "");
        update("db.autoCreateTable", false);
        update("db.tableStatus", "unknown");
        setColumns([]);
        setTableDropdownOpen(false);
    };

    const handleTableChange = (e) => {
        update("db.table", e.target.value);
        update("db.column", "");
        update("db.stringColumn", "");
        update("db.stringOnly", false);
        update("db.columnKind", "");
        update("db.autoCreateTable", false);
        update("db.tableStatus", "unknown");
        setColumns([]);
        setTableDropdownOpen(true);
    };

    const handleTableBlur = () => {
        if (hasServer && hasTable) {
            verifyTable();
        }
    };

    const handleTableKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            setTableDropdownOpen(false);
            verifyTable();
        } else if (e.key === "ArrowDown") {
            if (hasServer) {
                fetchTables();
                setTableDropdownOpen(true);
            }
        } else if (e.key === "Escape") {
            setTableDropdownOpen(false);
        }
    };

    const handleTableFocus = () => {
        if (!hasServer) return;
        fetchTables();
        setTableDropdownOpen(true);
    };

    const handleTableTriggerClick = () => {
        if (!hasServer) return;
        fetchTables();
        setTableDropdownOpen((open) => !open);
    };

    const handleTableOptionSelect = (label) => {
        const tableName = normalizeTableInput(label);
        update("db.table", tableName);
        update("db.column", "");
        update("db.stringColumn", "");
        update("db.stringOnly", false);
        update("db.columnKind", "");
        update("db.autoCreateTable", false);
        update("db.tableStatus", "unknown");
        setColumns([]);
        setTableDropdownOpen(false);
        verifyTable({ table: tableName });
    };

    const handleValueColumnChange = (e) => {
        const name = e.target.value;
        update("db.column", name);
        if (jsonCols.some((c) => c.name === name)) {
            update("db.stringColumn", "");
        }
    };

    const handleStringColumnChange = (e) => {
        update("db.stringColumn", e.target.value);
    };

    const hasServer = Boolean(db.server);
    const hasTable = Boolean(normalizeTableInput(db.table));
    const groupedTables = useMemo(() => groupTablesByUser(tables), [tables]);
    const tableOptions = useMemo(
        () =>
            groupedTables.flatMap(([user, list]) =>
                list.map((t) => displayTableName(user, t.name))
            ),
        [groupedTables]
    );
    const tableInList = useMemo(
        () =>
            tables.some(
                (t) =>
                    normalizeTableInput(displayTableName(t.user || "SYS", t.name)) ===
                    normalizeTableInput(db.table)
            ),
        [tables, db.table]
    );
    const canAutoCreateTypedTable = !isEdit && hasTable && !normalizeTableInput(db.table).includes(".");

    const autoCreateMode = !isEdit && db.autoCreateTable === true && db.tableStatus === "autoCreate";
    const tableMissing = db.tableStatus === "missing";
    const tableUnsupportedBase = db.tableStatus === "unsupportedBase";
    const tableReady = db.tableStatus === "existing";
    const isJsonMode = selectedColumnKind === "json";
    const stringOnly = !!db.stringOnly;
    const showValueColumn = !stringOnly;
    const stringColumnRequired = stringOnly;
    const stringColumnDisabled = autoCreateMode || !tableReady || isJsonMode;

    const footerHint = autoCreateMode
        ? "This table will be created automatically with VALUE and STR_VALUE columns."
        : stringOnly
        ? "All values will be stored as strings in the selected column."
        : isJsonMode
        ? "All node values will be written as a single JSON payload per cycle."
        : db.stringColumn
        ? "Numeric/boolean values go to Value Column; other types go to String Value Column."
        : "All node values will be written to the selected column.";

    return (
        <div className="form-card">
            <div className="form-card-header">
                <span className="section-dot" />
                Database
                <Icon name="database" className="ml-auto text-primary" />
            </div>

            <div className="space-y-20">
                <div>
                    <label className="form-label">Database Server</label>
                    <div className="flex gap-8">
                        <select
                            value={db.server || ""}
                            onChange={handleServerChange}
                            onMouseDown={() => onRefreshServers?.()}
                            className="flex-1"
                        >
                            {servers.length === 0 && (
                                <option value="">No servers configured</option>
                            )}
                            {!db.server && servers.length > 0 && (
                                <option value="" disabled>
                                    Select a database server...
                                </option>
                            )}
                            {servers.map((s) => (
                                <option key={s.name} value={s.name}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={() => onOpenServerSettings?.(true)}
                            className="btn btn-primary-outline btn-icon shrink-0"
                            title="Add database server"
                        >
                            <Icon name="add" />
                        </button>
                    </div>
                </div>

                <div>
                    <label className="form-label">Table</label>
                    <div ref={tableComboRef} className="table-combo">
                        <div className="table-combo-control">
                            <input
                                required
                                value={db.table || ""}
                                onChange={handleTableChange}
                                onBlur={handleTableBlur}
                                onKeyDown={handleTableKeyDown}
                                onFocus={handleTableFocus}
                                disabled={!hasServer}
                                className="table-combo-input"
                                role="combobox"
                                aria-expanded={tableDropdownOpen}
                                aria-haspopup="listbox"
                                placeholder={
                                    !hasServer
                                        ? "Select a database server first"
                                        : loadingTables
                                        ? "Loading..."
                                        : "Select or enter a table..."
                                }
                            />
                            <button
                                type="button"
                                className="table-combo-trigger"
                                onClick={handleTableTriggerClick}
                                disabled={!hasServer}
                                aria-label="Toggle table list"
                            >
                                <Icon
                                    name="keyboard_arrow_down"
                                    className={`icon-sm table-combo-chevron ${
                                        tableDropdownOpen ? "table-combo-chevron--open" : ""
                                    }`}
                                />
                            </button>
                        </div>
                        {tableDropdownOpen && hasServer && (
                            <div className="table-combo-menu" role="listbox">
                                {loadingTables ? (
                                    <div className="table-combo-empty">Loading...</div>
                                ) : tableOptions.length > 0 ? (
                                    <>
                                        {tableOptions.map((label) => (
                                            <button
                                                type="button"
                                                key={label}
                                                className={`table-combo-option ${
                                                    normalizeTableInput(label) === normalizeTableInput(db.table)
                                                        ? "table-combo-option--selected"
                                                        : ""
                                                }`}
                                                onMouseDown={(e) => e.preventDefault()}
                                                onClick={() => handleTableOptionSelect(label)}
                                                title={label}
                                            >
                                                <span className="table-combo-option-label">{label}</span>
                                                {normalizeTableInput(label) === normalizeTableInput(db.table) && (
                                                    <Icon name="check" className="icon-sm" />
                                                )}
                                            </button>
                                        ))}
                                    </>
                                ) : (
                                    <div className="table-combo-empty">
                                        {canAutoCreateTypedTable && !tableInList
                                            ? "No matching table. The name can be used for auto-create."
                                            : "No tables found."}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {hasTable && autoCreateMode && (
                    <div className="text-xs text-on-surface-tertiary flex items-start gap-6">
                        <Icon name="info" className="icon-sm shrink-0 mt-1" />
                        <span>
                            Table not found. It will be created automatically when
                            the job is saved.
                        </span>
                    </div>
                )}

                {hasTable && tableMissing && (
                    <div className="text-xs flex items-start gap-6" style={{ color: "var(--color-error)" }}>
                        <Icon name="info" className="icon-sm shrink-0 mt-1" />
                        <span>
                            Table not found. Select an existing table before saving.
                        </span>
                    </div>
                )}

                {hasTable && tableUnsupportedBase && (
                    <div className="text-xs flex items-start gap-6" style={{ color: "var(--color-error)" }}>
                        <Icon name="info" className="icon-sm shrink-0 mt-1" />
                        <span>
                            This table uses a distance base axis. Collector writes the
                            collection time to the base column, so only time-based TAG
                            tables can be used.
                        </span>
                    </div>
                )}

                {hasTable && !autoCreateMode && stringOnly && !hasValueColCandidates && (
                    <div className="text-xs text-on-surface-tertiary flex items-start gap-6">
                        <Icon name="info" className="icon-sm shrink-0 mt-1" />
                        <span>
                            No numeric/JSON column in this table — falling back to
                            string-only mode.
                        </span>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-12">
                    {autoCreateMode ? (
                        <>
                            <div>
                                <label className="form-label">Value Column</label>
                                <input
                                    value={AUTO_TABLE_VALUE_COLUMN}
                                    disabled
                                    className="w-full"
                                    readOnly
                                />
                            </div>
                            <div>
                                <label className="form-label">String Value Column</label>
                                <input
                                    value={AUTO_TABLE_STRING_COLUMN}
                                    disabled
                                    className="w-full"
                                    readOnly
                                />
                            </div>
                        </>
                    ) : showValueColumn && (
                        <div>
                            <label className="form-label">Value Column</label>
                            <select
                                required
                                value={db.column || ""}
                                onChange={handleValueColumnChange}
                                onMouseDown={() => hasTable && verifyTable()}
                                disabled={!tableReady}
                                className="w-full"
                            >
                                <option value="" disabled>
                                    {tableMissing
                                        ? "Table not found"
                                        : !hasTable
                                        ? "Select a table first"
                                        : !tableReady
                                        ? "Verify table first"
                                        : loadingColumns
                                        ? "Loading..."
                                        : "Select a column..."}
                                </option>
                                {db.column &&
                                    !numericCols.find((c) => c.name === db.column) &&
                                    !jsonCols.find((c) => c.name === db.column) && (
                                        <option value={db.column}>{db.column}</option>
                                    )}
                                {numericCols.length > 0 && (
                                    <optgroup label="Numeric">
                                        {numericCols.map((c) => (
                                            <option key={c.name} value={c.name}>
                                                {c.name} ({c.type})
                                            </option>
                                        ))}
                                    </optgroup>
                                )}
                                {jsonCols.length > 0 && (
                                    <optgroup label="JSON">
                                        {jsonCols.map((c) => {
                                            const disabled = hasAnySummarized && !c.summarized;
                                            return (
                                                <option
                                                    key={c.name}
                                                    value={c.name}
                                                    disabled={disabled}
                                                >
                                                    {c.name} ({c.type})
                                                    {disabled ? " — needs SUMMARIZED" : ""}
                                                </option>
                                            );
                                        })}
                                    </optgroup>
                                )}
                            </select>
                        </div>
                    )}

                    {!autoCreateMode && (
                        <div>
                            <label className="form-label">
                                String Value Column
                                {stringColumnRequired ? null : (
                                    <span className="text-on-surface-tertiary font-normal ml-4">
                                        (optional)
                                    </span>
                                )}
                            </label>
                            <select
                                required={stringColumnRequired}
                                value={isJsonMode ? "" : db.stringColumn || ""}
                                onChange={handleStringColumnChange}
                                onMouseDown={() => hasTable && !isJsonMode && verifyTable()}
                                disabled={stringColumnDisabled}
                                className="w-full"
                                title={isJsonMode ? "Not used in JSON mode" : undefined}
                            >
                                <option value="">
                                    {tableMissing
                                        ? "Table not found"
                                        : !hasTable
                                        ? "Select a table first"
                                        : !tableReady
                                        ? "Verify table first"
                                        : isJsonMode
                                        ? "Not used in JSON mode"
                                        : loadingColumns
                                        ? "Loading..."
                                        : stringColumnRequired
                                        ? "Select a VARCHAR column..."
                                        : "None"}
                                </option>
                                {db.stringColumn &&
                                    !stringCols.find((c) => c.name === db.stringColumn) && (
                                        <option value={db.stringColumn}>
                                            {db.stringColumn}
                                        </option>
                                    )}
                                {stringCols.map((c) => (
                                    <option key={c.name} value={c.name}>
                                        {c.name} ({c.type})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
                <p className="text-xs text-on-surface-tertiary mt-4 text-right">
                    {footerHint}
                </p>
            </div>
        </div>
    );
}
