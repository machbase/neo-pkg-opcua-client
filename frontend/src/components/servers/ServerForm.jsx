import { useState, useEffect } from "react";
import Icon from "../common/Icon";
import { koToEn } from "../../utils/korean";

const inputClass = "w-full";
const labelClass = "form-label";

const DEFAULT_FORM = {
    name: "",
    host: "127.0.0.1",
    port: 5656,
    user: "SYS",
    password: "",
};

function initialForm(server) {
    if (!server) return { ...DEFAULT_FORM };
    return {
        name: server.name || "",
        host: server.host || DEFAULT_FORM.host,
        port: server.port || DEFAULT_FORM.port,
        user: server.user || DEFAULT_FORM.user,
        password: "",
    };
}

export default function ServerForm({ server, onSave, onClose }) {
    const isEdit = Boolean(server);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(() => initialForm(server));

    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [onClose]);

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

                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <label className={labelClass}>User</label>
                                <input
                                    type="text"
                                    required
                                    value={form.user}
                                    onChange={(e) => update({ user: e.target.value })}
                                    className={inputClass}
                                    placeholder="SYS"
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Password</label>
                                <input
                                    type="text"
                                    value={form.password}
                                    onChange={(e) => update({ password: koToEn(e.target.value) })}
                                    className={`${inputClass} input-password`}
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
