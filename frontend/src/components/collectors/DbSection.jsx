import { useState, useEffect, useCallback, useMemo } from "react";
import Icon from "../common/Icon";
import * as serversApi from "../../api/servers";
import { useApp } from "../../context/AppContext";

const NUMERIC_TYPES = new Set(["SHORT", "INTEGER", "LONG", "FLOAT", "DOUBLE"]);
const AUTO_TABLE_VALUE_COLUMN = "VALUE";
const AUTO_TABLE_STRING_COLUMN = "STR_VALUE";

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
        setLoadingTables(true);
        try {
            const data = await serversApi.listTables(db.server);
            setTables(data || []);
        } catch (e) {
            notify(e.reason || e.message, "error");
            setTables([]);
        } finally {
            setLoadingTables(false);
        }
    }, [db.server, notify]);

    const verifyTable = useCallback(async (options = {}) => {
        const { allowAutoCreate = true, notifyOnError = true } = options;
        const tableName = normalizeTableInput(db.table);
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
            setColumns(data?.columns || []);
            if (db.autoCreateTable) update("db.autoCreateTable", false);
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
    };

    const handleTableBlur = () => {
        if (hasServer && hasTable) {
            verifyTable();
        }
    };

    const handleTableKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            verifyTable();
        }
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
                (t) => displayTableName(t.user || "SYS", t.name) === db.table
            ),
        [tables, db.table]
    );

    const autoCreateMode = !isEdit && db.autoCreateTable === true && db.tableStatus === "autoCreate";
    const tableMissing = db.tableStatus === "missing";
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
                    <input
                        required
                        value={db.table || ""}
                        onChange={handleTableChange}
                        onBlur={handleTableBlur}
                        onKeyDown={handleTableKeyDown}
                        onFocus={() => hasServer && fetchTables()}
                        onMouseDown={() => hasServer && fetchTables()}
                        disabled={!hasServer}
                        className="w-full"
                        list="db-table-options"
                        placeholder={
                            !hasServer
                                ? "Select a database server first"
                                : loadingTables
                                ? "Loading..."
                                : "Select or enter a table..."
                        }
                    />
                    <datalist id="db-table-options">
                        {db.table && !tableInList && (
                            <option value={db.table} />
                        )}
                        {tableOptions.map((label) => (
                            <option key={label} value={label} />
                        ))}
                    </datalist>
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
