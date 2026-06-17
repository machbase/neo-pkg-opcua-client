import { useEffect } from 'react'
import Icon from '../common/Icon'

const LEGACY_OPTION_VALUE = '__legacy_endpoint__'

export default function OpcuaSection({
  form,
  update,
  opcuaServers = [],
  onOpenOpcuaServerSettings,
  onRefreshOpcuaServers,
}) {
  const legacyEndpoint = form.opcua.endpoint && !form.opcua.server ? form.opcua.endpoint : ''
  const selectedValue = form.opcua.server || (legacyEndpoint ? LEGACY_OPTION_VALUE : '')

  useEffect(() => {
    if (!form.opcua.server && !legacyEndpoint && opcuaServers.length > 0) {
      update('opcua.server', opcuaServers[0].name)
    }
  }, [form.opcua.server, legacyEndpoint, opcuaServers, update])

  const handleServerChange = (e) => {
    if (e.target.value === LEGACY_OPTION_VALUE) return
    update('opcua.server', e.target.value)
    if (e.target.value) update('opcua.endpoint', '')
  }

  return (
    <div className="form-card">
      <div className="form-card-header">
        <span className="section-dot" />
        OPC UA Server
        <Icon name="sensors" className="ml-auto text-primary" />
      </div>

      <div className="space-y-20">
        <div>
          <label className="form-label">OPC UA Server</label>
          <div className="flex gap-8">
            <select
              required
              value={selectedValue}
              onChange={handleServerChange}
              onMouseDown={() => onRefreshOpcuaServers?.()}
              className="flex-1"
            >
              {opcuaServers.length === 0 && !legacyEndpoint && (
                <option value="">No OPC UA servers configured</option>
              )}
              {!form.opcua.server && !legacyEndpoint && opcuaServers.length > 0 && (
                <option value="" disabled>
                  Select an OPC UA server...
                </option>
              )}
              {legacyEndpoint && (
                <option value={LEGACY_OPTION_VALUE}>
                  Legacy endpoint: {legacyEndpoint}
                </option>
              )}
              {opcuaServers.map((server) => (
                <option key={server.name} value={server.name}>
                  {server.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onOpenOpcuaServerSettings?.(true)}
              className="btn btn-primary-outline btn-icon shrink-0"
              title="Add OPC UA server"
            >
              <Icon name="add" />
            </button>
          </div>
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
            <label className="form-label">Read Retry Interval (MS)</label>
            <input
              type="number"
              min="0"
              value={form.opcua.readRetryInterval}
              onChange={(e) => update('opcua.readRetryInterval', e.target.value)}
              className="w-full"
              placeholder="100"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
