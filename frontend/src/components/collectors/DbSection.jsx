import { useState, useEffect, useCallback, useMemo } from "react";
import Icon from "../common/Icon";
import * as serversApi from "../../api/servers";
import { useApp } from "../../context/AppContext";

const NUMERIC_TYPES = new Set(["SHORT", "INTEGER", "LONG", "FLOAT", "DOUBLE"]);

function isNumericColumn(col) {
    if (!col || !col.type) return false;
    return NUMERIC_TYPES.has(col.type.toUpperCase());
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

export default function DbSection({
    form,
    update,
    servers = [],
    onOpenServerSettings,
    onRefreshServers,
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

    const fetchColumns = useCallback(async () => {
        if (!db.server || !db.table) {
            setColumns([]);
            return;
        }
        setLoadingColumns(true);
        try {
            const data = await serversApi.listColumns(db.server, db.table);
            setColumns((data?.columns || []).filter(isNumericColumn));
        } catch (e) {
            notify(e.reason || e.message, "error");
            setColumns([]);
        } finally {
            setLoadingColumns(false);
        }
    }, [db.server, db.table, notify]);

    useEffect(() => {
        fetchTables();
    }, [fetchTables]);

    useEffect(() => {
        fetchColumns();
    }, [fetchColumns]);

    const handleServerChange = (e) => {
        const name = e.target.value;
        update("db.server", name);
        update("db.table", "");
        update("db.column", "");
    };

    const handleTableChange = (e) => {
        update("db.table", e.target.value);
        update("db.column", "");
    };

    const handleColumnChange = (e) => {
        update("db.column", e.target.value);
    };

    const hasServer = Boolean(db.server);
    const hasTable = Boolean(db.table);
    const groupedTables = useMemo(() => groupTablesByUser(tables), [tables]);
    const tableInList = useMemo(
        () =>
            tables.some(
                (t) => displayTableName(t.user || "SYS", t.name) === db.table
            ),
        [tables, db.table]
    );

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

                <div className="grid grid-cols-2 gap-12">
                    <div>
                        <label className="form-label">Table</label>
                        <select
                            required
                            value={db.table || ""}
                            onChange={handleTableChange}
                            onMouseDown={() => hasServer && fetchTables()}
                            disabled={!hasServer}
                            className="w-full"
                        >
                            <option value="" disabled>
                                {!hasServer
                                    ? "Select a database server first"
                                    : loadingTables
                                    ? "Loading..."
                                    : "Select a table..."}
                            </option>
                            {db.table && !tableInList && (
                                <option value={db.table}>{db.table}</option>
                            )}
                            {groupedTables.map(([user, list]) => (
                                <optgroup key={user} label={user}>
                                    {list.map((t) => {
                                        const label = displayTableName(user, t.name);
                                        return (
                                            <option key={label} value={label}>
                                                {label}
                                            </option>
                                        );
                                    })}
                                </optgroup>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="form-label">Value Column</label>
                        <select
                            required
                            value={db.column || ""}
                            onChange={handleColumnChange}
                            onMouseDown={() => hasTable && fetchColumns()}
                            disabled={!hasTable}
                            className="w-full"
                        >
                            <option value="" disabled>
                                {!hasTable
                                    ? "Select a table first"
                                    : loadingColumns
                                    ? "Loading..."
                                    : "Select a column..."}
                            </option>
                            {db.column && !columns.find((c) => c.name === db.column) && (
                                <option value={db.column}>{db.column}</option>
                            )}
                            {columns.map((c) => (
                                <option key={c.name} value={c.name}>
                                    {c.name} ({c.type})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <p className="text-xs text-on-surface-tertiary mt-4 text-right">
                    All node values will be written to the selected column.
                </p>
            </div>
        </div>
    );
}
