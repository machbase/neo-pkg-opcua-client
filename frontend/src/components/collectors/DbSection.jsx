import Icon from '../common/Icon'

export default function DbSection({ form, update }) {
  return (
    <div className="form-card">
      <div className="form-card-header">
        <Icon name="database" className="text-primary" />
        Database Target
      </div>

      <div className="space-y-6">
        <div>
          <label className="form-label">Host Address</label>
          <input
            type="text"
            value={form.db.host}
            onChange={e => update('db.host', e.target.value)}
            className="w-full"
            placeholder="127.0.0.1"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Port</label>
            <input
              type="number"
              value={form.db.port}
              onChange={e => update('db.port', e.target.value)}
              className="w-full"
              placeholder="5656"
            />
          </div>
          <div>
            <label className="form-label">Table Name</label>
            <input
              type="text"
              required
              value={form.db.table}
              onChange={e => update('db.table', e.target.value)}
              className="w-full"
              placeholder="TAG"
            />
          </div>
        </div>

        <div>
          <label className="form-label">Service Account</label>
          <input
            type="text"
            value={form.db.user}
            onChange={e => update('db.user', e.target.value)}
            className="w-full"
            placeholder="sys"
          />
        </div>

        <div>
          <label className="form-label">Authentication</label>
          <input
            type="password"
            value={form.db.password}
            onChange={e => update('db.password', e.target.value)}
            className="w-full"
            placeholder="••••••••"
          />
        </div>
      </div>
    </div>
  )
}
