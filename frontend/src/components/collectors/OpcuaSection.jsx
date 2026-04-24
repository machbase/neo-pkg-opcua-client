import { useState } from 'react'
import Icon from '../common/Icon'
import { useApp } from '../../context/AppContext'
import { testOpcuaConnection } from '../../api/collectors'

export default function OpcuaSection({ form, update }) {
  const { notify } = useApp()
  const [testing, setTesting] = useState(false)

  const handleTest = async () => {
    const endpoint = form.opcua.endpoint
    if (!endpoint) return
    const readRetryInterval =
      form.opcua.readRetryInterval !== '' && form.opcua.readRetryInterval != null
        ? Number(form.opcua.readRetryInterval)
        : undefined
    setTesting(true)
    try {
      await testOpcuaConnection(endpoint, readRetryInterval)
      notify('OPC UA connection successful', 'success')
    } catch (e) {
      notify(e.reason || e.message || 'OPC UA connection failed', 'error')
    } finally {
      setTesting(false)
    }
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
          <label className="form-label">Endpoint URL</label>
          <div className="flex gap-8">
            <input
              type="text"
              required
              value={form.opcua.endpoint}
              onChange={(e) => update('opcua.endpoint', e.target.value)}
              className="flex-1"
              placeholder="opc.tcp://192.168.1.100:4840"
            />
            <button
              type="button"
              onClick={handleTest}
              disabled={!form.opcua.endpoint || testing}
              className="btn btn-primary-outline shrink-0"
            >
              <Icon name={testing ? 'progress_activity' : 'electrical_services'} className="icon-sm" />
              <span>{testing ? 'Testing...' : 'Connection Test'}</span>
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
