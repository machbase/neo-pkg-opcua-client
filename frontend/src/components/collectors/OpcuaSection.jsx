import Icon from '../common/Icon'

export default function OpcuaSection({ form, update }) {
  return (
    <div className="form-card">
      <div className="form-card-header">
        <span className="section-dot" />
        OPC UA Server
        <Icon name="sensors" className="ml-auto text-primary" />
      </div>

      <div className="space-y-20">
        <div>
          <label className="form-label">Endpoint URL</label>
          <input
            type="text"
            required
            value={form.opcua.endpoint}
            onChange={(e) => update('opcua.endpoint', e.target.value)}
            className="w-full"
            placeholder="opc.tcp://192.168.1.100:4840"
          />
        </div>

        <div className="grid grid-cols-2 gap-12">
          <div>
            <label className="form-label">Interval (ms)</label>
            <input
              type="number"
              required
              min="1000"
              value={form.opcua.interval}
              onChange={(e) => update('opcua.interval', e.target.value)}
              className="w-full"
              placeholder="1000"
            />
          </div>
          <div>
            <label className="form-label">Read Retry Limit</label>
            <input
              type="number"
              min="0"
              value={form.opcua.readRetryInterval}
              onChange={(e) => update('opcua.readRetryInterval', e.target.value)}
              className="w-full"
              placeholder="3"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
