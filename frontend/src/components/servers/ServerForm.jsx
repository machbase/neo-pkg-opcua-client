import { useState, useEffect, useRef } from "react";
import Icon from "../common/Icon";
import { koToEn } from "../../utils/korean";
import * as serversApi from "../../api/servers";
import { useApp } from "../../context/AppContext";

const inputClass = "w-full";
const labelClass = "form-label";

const DEFAULT_FORM = {
    name: "",
    host: "127.0.0.1",
    port: 5656,
    database: "MACHBASEDB",
    user: "SYS",
    password: "",
};

function initialForm(server) {
    if (!server) return { ...DEFAULT_FORM };
    return {
        name: server.name || "",
        host: server.host || DEFAULT_FORM.host,
        port: server.port || DEFAULT_FORM.port,
        database: server.database || DEFAULT_FORM.database,
        user: server.user || DEFAULT_FORM.user,
        password: "",
    };
}

function databaseErrorMessage(error) {
    const message = String(error?.reason || error?.message || "").trim();
    const lower = message.toLowerCase();
    if (!message
        || lower.includes("loading private key from virtual filesystem is not supported yet")
        || lower.includes("failed to fetch")
        || lower.includes("server returned non-json response")) {
        return "";
    }
    return message;
}

function resolveDatabaseSelection(current, databases) {
    const writable = (Array.isArray(databases) ? databases : []).filter((database) => database.writable);
    const currentName = String(current || "").trim().toUpperCase();
    const currentDatabase = writable.find((database) => database.name === currentName);
    if (currentDatabase) return currentDatabase.name;
    const defaultDatabase = writable.find((database) => database.name === "MACHBASEDB");
    if (defaultDatabase) return defaultDatabase.name;
    return writable[0]?.name || "";
}

export default function ServerForm({ server, onSave, onClose }) {
    const { notify } = useApp();
    const isEdit = Boolean(server);
    const [saving, setSaving] = useState(false);
    const [loadingDatabases, setLoadingDatabases] = useState(false);
    const [databases, setDatabases] = useState([]);
    const [databaseOpen, setDatabaseOpen] = useState(false);
    const [credentialError, setCredentialError] = useState("");
    const databasePickerRef = useRef(null);
    const userInputRef = useRef(null);
    const passwordInputRef = useRef(null);
    const [form, setForm] = useState(() => initialForm(server));

    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [onClose]);

    useEffect(() => {
        const handlePointerDown = (e) => {
            if (databasePickerRef.current && !databasePickerRef.current.contains(e.target)) {
                setDatabaseOpen(false);
            }
        };
        document.addEventListener("mousedown", handlePointerDown);
        return () => document.removeEventListener("mousedown", handlePointerDown);
    }, []);

    const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await onSave({ ...form, port: Number(form.port) });
        } finally {
            setSaving(false);
        }
    };

    const handleLoadDatabases = async () => {
        setLoadingDatabases(true);
        try {
            const body = isEdit && !form.password
                ? { server: server.name }
                : { profile: { ...form, port: Number(form.port) } };
            const result = await serversApi.listDatabases(body);
            const nextDatabases = Array.isArray(result?.databases) ? result.databases : [];
            setDatabases(nextDatabases);
            setForm((prev) => ({
                ...prev,
                database: resolveDatabaseSelection(prev.database, nextDatabases),
            }));
        } catch (error) {
            setDatabases([]);
            setDatabaseOpen(false);
            const message = databaseErrorMessage(error);
            if (message) notify(message, "error");
        } finally {
            setLoadingDatabases(false);
        }
    };

    const handleDatabaseToggle = () => {
        if (databaseOpen) {
            setDatabaseOpen(false);
            return;
        }
        if (!String(form.user || "").trim()) {
            setCredentialError("user");
            notify("User is required to load databases", "error");
            userInputRef.current?.focus();
            return;
        }
        if (!isEdit && !String(form.password || "")) {
            setCredentialError("password");
            notify("Password is required to load databases", "error");
            passwordInputRef.current?.focus();
            return;
        }
        setCredentialError("");
        setDatabaseOpen(true);
        handleLoadDatabases();
    };

    const handleDatabaseKeyDown = (e) => {
        if (e.key === "Escape" && databaseOpen) {
            e.preventDefault();
            e.stopPropagation();
            setDatabaseOpen(false);
        }
    };

    return (
        <div className="modal-overlay" onMouseDown={onClose}>
            <div className="modal modal-md" onMouseDown={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <div className="modal-header-title">
                        <Icon name={isEdit ? "edit" : "add_circle"} className="text-primary" />
                        {isEdit ? "Edit Database Server" : "Add Database Server"}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-4 hover:bg-surface-hover rounded-base tooltip"
                        data-tooltip="Close"
                    >
                        <Icon name="close" />
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="modal-body space-y-16">
                        <div>
                            <label className={labelClass}>Name</label>
                            <input
                                type="text"
                                required
                                disabled={isEdit}
                                value={form.name}
                                onChange={(e) => update({ name: e.target.value })}
                                className={`${inputClass} disabled:opacity-50`}
                                placeholder="e.g., machbase-main"
                            />
                        </div>

                        <div className="grid grid-cols-3 gap-8">
                            <div className="col-span-2">
                                <label className={labelClass}>Host</label>
                                <input
                                    type="text"
                                    required
                                    value={form.host}
                                    onChange={(e) => update({ host: e.target.value })}
                                    className={inputClass}
                                    placeholder="127.0.0.1"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Port</label>
                                <input
                                    type="number"
                                    required
                                    value={form.port}
                                    onChange={(e) => update({ port: e.target.value })}
                                    className={inputClass}
                                />
                            </div>
                        </div>

                        <div>
                            <label className={labelClass}>Database</label>
                            <div ref={databasePickerRef} className={`database-picker database-picker--drop-up ${databaseOpen ? "database-picker--open" : ""}`}>
                                <Icon name="database" className="database-picker__database-icon" />
                                <input
                                    type="text"
                                    required
                                    value={form.database}
                                    onChange={(e) => update({ database: e.target.value })}
                                    onKeyDown={handleDatabaseKeyDown}
                                    role="combobox"
                                    aria-autocomplete="none"
                                    aria-expanded={databaseOpen}
                                    aria-controls="opcua-database-list"
                                    className={`${inputClass} database-picker__input`}
                                    placeholder="MACHBASEDB"
                                />
                                <button
                                    type="button"
                                    className="database-picker__trigger"
                                    onClick={handleDatabaseToggle}
                                    disabled={loadingDatabases}
                                    aria-label="Show available databases"
                                    aria-expanded={databaseOpen}
                                >
                                    <Icon name={loadingDatabases ? "progress_activity" : "expand_more"} className={`database-picker__trigger-icon ${loadingDatabases ? "animate-spin" : ""}`} />
                                </button>
                                {databaseOpen && (
                                    <div
                                        id="opcua-database-list"
                                        role="listbox"
                                        className="database-picker__menu"
                                    >
                                        {loadingDatabases && (
                                            <div className="database-picker__message">Loading databases...</div>
                                        )}
                                        {!loadingDatabases && databases.length === 0 && (
                                            <div className="database-picker__message">No available databases</div>
                                        )}
                                        {!loadingDatabases && databases.map((db) => {
                                            const selected = db.name === form.database;
                                            return (
                                                <button
                                                    key={db.name}
                                                    type="button"
                                                    role="option"
                                                    aria-selected={selected}
                                                    disabled={!db.writable}
                                                    className="database-picker__option"
                                                    onClick={() => {
                                                        update({ database: db.name });
                                                        setDatabaseOpen(false);
                                                    }}
                                                >
                                                    <span className="flex items-center gap-2 min-w-0">
                                                        <Icon name={selected ? "check" : "database"} className={selected ? "text-primary" : "text-on-surface-tertiary"} />
                                                        <span className="truncate">{db.name}</span>
                                                        {db.isDefault && <span className="text-xs text-on-surface-tertiary">default</span>}
                                                    </span>
                                                    <span className="text-xs text-on-surface-secondary shrink-0">{db.accessMode}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                            <p className="text-xs text-on-surface-secondary mt-4">Only READ_WRITE databases can be selected and saved.</p>
                        </div>

                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <label className={labelClass}>User</label>
                                <input
                                    ref={userInputRef}
                                    type="text"
                                    required
                                    value={form.user}
                                    onChange={(e) => {
                                        update({ user: e.target.value });
                                        if (credentialError === "user") setCredentialError("");
                                    }}
                                    aria-invalid={credentialError === "user" || undefined}
                                    className={`${inputClass} ${credentialError === "user" ? "!border-error" : ""}`}
                                    placeholder="SYS"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Password</label>
                                <input
                                    ref={passwordInputRef}
                                    type="text"
                                    required={!isEdit}
                                    value={form.password}
                                    onChange={(e) => {
                                        update({ password: koToEn(e.target.value) });
                                        if (credentialError === "password") setCredentialError("");
                                    }}
                                    aria-invalid={credentialError === "password" || undefined}
                                    className={`${inputClass} input-password ${credentialError === "password" ? "!border-error" : ""}`}
                                    placeholder={isEdit ? "Leave blank to keep" : "Enter password"}
                                    autoComplete="new-password"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="modal-footer">
                        <button type="button" onClick={onClose} className="btn btn-ghost">
                            Cancel
                        </button>
                        <button type="submit" disabled={saving} className="btn btn-primary">
                            {isEdit ? "Update" : "Create"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
