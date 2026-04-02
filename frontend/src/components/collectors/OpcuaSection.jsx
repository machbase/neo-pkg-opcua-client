import Icon from '../common/Icon'
import NodeListEditor from './NodeListEditor'

export default function OpcuaSection({ form, update }) {
  return (
    <div className="form-card">
      <div className="form-card-header">
        <Icon name="sensors" className="text-primary" />
        OPC UA Configuration
      </div>

      <div className="space-y-6">
        <div>
          <label className="form-label">Endpoint URL</label>
          <input
            type="text"
            required
            value={form.opcua.endpoint}
            onChange={e => update('opcua.endpoint', e.target.value)}
            className="w-full"
            placeholder="opc.tcp://192.168.1.100:4840"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Sampling Interval (ms)</label>
            <input
              type="number"
              required
              min="100"
              value={form.opcua.interval}
              onChange={e => update('opcua.interval', e.target.value)}
              className="w-full"
              placeholder="5000"
            />
          </div>
          <div>
            <label className="form-label">Read Retry Limit</label>
            <input
              type="number"
              min="10"
              value={form.opcua.readRetryInterval}
              onChange={e => update('opcua.readRetryInterval', e.target.value)}
              className="w-full"
              placeholder="100"
            />
          </div>
        </div>

        <NodeListEditor
          nodes={form.opcua.nodes}
          onChange={nodes => update('opcua.nodes', nodes)}
          endpoint={form.opcua.endpoint}
        />
      </div>
    </div>
  )
}
