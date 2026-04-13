import { useState } from "react";
import Icon from "../common/Icon";
import { koToEn } from "../../utils/korean";
import { useApp } from "../../context/AppContext";
import * as api from "../../api/collectors";

export default function DbSection({ form, update }) {
    const { notify } = useApp();
    const [testing, setTesting] = useState(false);
    const [creating, setCreating] = useState(false);

    const db = form.db;
    const dbReady = !!(db.host && db.port && db.table && db.user && db.password);

    const handleTestConnection = async () => {
        setTesting(true);
        try {
            await api.testDbConnection(db);
            notify("Connection successful", "success");
        } catch (e) {
            notify(e.reason || e.message, "error");
        } finally {
            setTesting(false);
        }
    };

    const handleCreateTable = async () => {
        setCreating(true);
        try {
            await api.createDbTable(db);
            notify(`Table '${db.table}' created`, "success");
        } catch (e) {
            notify(e.reason || e.message, "error");
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="form-card">
            <div className="form-card-header">
                <Icon name="database" className="text-primary" />
                Database Target
            </div>

            <div className="space-y-20">
                <div>
                    <label className="form-label">Host Address</label>
                    <input type="text" value={db.host} onChange={(e) => update("db.host", e.target.value)} className="w-full" placeholder="127.0.0.1" />
                </div>

                <div className="grid grid-cols-2 gap-12">
                    <div>
                        <label className="form-label">Port</label>
                        <input type="number" value={db.port} onChange={(e) => update("db.port", e.target.value)} className="w-full" placeholder="5656" />
                    </div>
                    <div>
                        <label className="form-label">Table Name</label>
                        <input type="text" required value={db.table} onChange={(e) => update("db.table", koToEn(e.target.value).replace(/[^a-zA-Z0-9_]/g, ""))} className="w-full" placeholder="TAG" />
                    </div>
                </div>

                <div>
                    <label className="form-label">User</label>
                    <input type="text" value={db.user} onChange={(e) => update("db.user", e.target.value)} className="w-full" placeholder="sys" />
                </div>

                <div>
                    <label className="form-label">Password</label>
                    <input type="password" value={db.password} onChange={(e) => update("db.password", e.target.value)} className="w-full" placeholder="Enter password" />
                </div>

                <div className="flex gap-8 pt-5 border-t border-border">
                    <button type="button" disabled={!dbReady || testing} onClick={handleTestConnection} className="btn btn-sm btn-success">
                        <Icon name="cable" className="icon-xs" />
                        {testing ? "Testing..." : "Test Connection"}
                    </button>
                    <button type="button" disabled={!dbReady || creating} onClick={handleCreateTable} className="btn btn-sm btn-info">
                        <Icon name="add_box" className="icon-xs" />
                        {creating ? "Creating..." : "Create Table"}
                    </button>
                </div>
            </div>
        </div>
    );
}
