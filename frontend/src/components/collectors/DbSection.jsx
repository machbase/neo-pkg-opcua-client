import Icon from "../common/Icon";

export default function DbSection({ form, update }) {
    return (
        <div className="form-card">
            <div className="form-card-header">
                <Icon name="database" className="text-primary" />
                Database Target
            </div>

            <div className="space-y-20">
                <div>
                    <label className="form-label">Host Address</label>
                    <input type="text" value={form.db.host} onChange={(e) => update("db.host", e.target.value)} className="w-full" placeholder="127.0.0.1" />
                </div>

                <div className="grid grid-cols-2 gap-12">
                    <div>
                        <label className="form-label">Port</label>
                        <input type="number" value={form.db.port} onChange={(e) => update("db.port", e.target.value)} className="w-full" placeholder="5656" />
                    </div>
                    <div>
                        <label className="form-label">Table Name</label>
                        <input type="text" required value={form.db.table} onChange={(e) => update("db.table", e.target.value)} className="w-full" placeholder="TAG" />
                    </div>
                </div>

                <div>
                    <label className="form-label">User</label>
                    <input type="text" value={form.db.user} onChange={(e) => update("db.user", e.target.value)} className="w-full" placeholder="sys" />
                </div>

                <div>
                    <label className="form-label">Password</label>
                    <input type="password" value={form.db.password} onChange={(e) => update("db.password", e.target.value)} className="w-full" placeholder="Enter password" />
                </div>

                <div className="help-text pt-5 border-t border-border">
                    <div>DB utility APIs</div>
                    <div><code>POST /cgi-bin/api/db/connect/test</code> : validate DB connection</div>
                    <div><code>POST /cgi-bin/api/db/table/create</code> : create TAG table using the current DB fields</div>
                    <div>Request body uses the same fields as this section.</div>
                </div>
            </div>
        </div>
    );
}
