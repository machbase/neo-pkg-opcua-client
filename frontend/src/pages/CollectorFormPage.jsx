import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router'
import { useApp } from '../context/AppContext'
import * as api from '../api/collectors'
import Icon from '../components/common/Icon'
import OpcuaSection from '../components/collectors/OpcuaSection'
import DbSection from '../components/collectors/DbSection'
import LogSection from '../components/collectors/LogSection'

const DEFAULTS = {
  name: '',
  opcua: {
    endpoint: '',
    interval: 5000,
    readRetryInterval: 100,
    nodes: [],
  },
  db: {
    table: 'TAG',
    host: '127.0.0.1',
    port: 5656,
    user: 'sys',
    password: '',
  },
  log: {
    level: 'INFO',
    output: 'console',
    format: 'json',
    file: {
      path: '',
      maxSize: '10MB',
      maxFiles: 7,
      rotate: 'size',
    },
  },
}

export default function CollectorFormPage({ detail, onRefresh }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { notify, setSelectedCollectorId } = useApp()
  const isEdit = Boolean(id)

  const [form, setForm] = useState(DEFAULTS)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isEdit) setSelectedCollectorId(null)
  }, [isEdit, setSelectedCollectorId])

  useEffect(() => {
    if (isEdit && detail?.config) {
      const c = detail.config
      setForm({
        name: detail.name || id,
        opcua: { ...DEFAULTS.opcua, ...c.opcua, nodes: c.opcua?.nodes || [] },
        db: { ...DEFAULTS.db, ...c.db },
        log: {
          ...DEFAULTS.log,
          ...c.log,
          file: { ...DEFAULTS.log.file, ...c.log?.file },
        },
      })
    } else if (!isEdit) {
      setForm(DEFAULTS)
    }
  }, [id, isEdit, detail])

  const update = (path, value) => {
    setForm(prev => {
      const next = { ...prev }
      const keys = path.split('.')
      let obj = next
      for (let i = 0; i < keys.length - 1; i++) {
        obj[keys[i]] = { ...obj[keys[i]] }
        obj = obj[keys[i]]
      }
      obj[keys[keys.length - 1]] = value
      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const config = {
        opcua: {
          endpoint: form.opcua.endpoint,
          interval: Number(form.opcua.interval),
          readRetryInterval: Number(form.opcua.readRetryInterval),
          nodes: form.opcua.nodes,
        },
        db: {
          table: form.db.table,
          host: form.db.host,
          port: Number(form.db.port),
          user: form.db.user,
          password: form.db.password,
        },
        log: {
          level: form.log.level,
          output: form.log.output,
          format: form.log.format,
        },
      }

      if (form.log.output === 'file' || form.log.output === 'both') {
        config.log.file = {
          path: form.log.file.path,
          maxSize: form.log.file.maxSize,
          maxFiles: Number(form.log.file.maxFiles),
          rotate: form.log.file.rotate,
        }
      }

      if (isEdit) {
        await api.updateCollector(id, config)
        notify(`Collector '${id}' updated`, 'success')
      } else {
        await api.createCollector(form.name, config)
        notify(`Collector created`, 'success')
      }
      if (onRefresh) await onRefresh()
      setSelectedCollectorId(isEdit ? id : form.name)
      navigate('/')
    } catch (e) {
      notify(e.reason || e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-header-inner">
          <div className="page-title-group min-w-0 !mb-0">
            <div className="flex items-center gap-2">
              <button onClick={() => navigate('/')} className="p-1 hover:bg-surface-hover rounded-base transition-colors shrink-0">
                <Icon name="arrow_back" />
              </button>
              <h2 className="page-title truncate">
                {isEdit ? 'Edit Collector' : 'New Collector Configuration'}
              </h2>
            </div>
            <p className="page-desc ml-8">
              Define data acquisition parameters for OPC UA node telemetry.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="collector-form"
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? 'Saving...' : (isEdit ? 'Update' : 'Create')}
            </button>
          </div>
        </div>
      </div>

      <div className="page-body">
        <div className="page-body-inner">
          <form id="collector-form" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16">
              {/* Left column */}
              <div className="space-y-16">
                {/* Collector Identity */}
                <div className="form-card">
                  <div className="form-card-header">
                    <Icon name="badge" className="text-primary" />
                    Collector Identity
                  </div>
                  <div>
                    <label className="form-label">Collector Unique ID</label>
                    <input
                      type="text"
                      required
                      disabled={isEdit}
                      value={form.name}
                      onChange={e => update('name', e.target.value)}
                      className="w-full disabled:opacity-50"
                      placeholder="e.g. FLOW-WEST-001"
                    />
                  </div>
                </div>

                {/* OPC UA */}
                <OpcuaSection form={form} update={update} />
              </div>

              {/* Right column */}
              <div className="space-y-16">
                <DbSection form={form} update={update} />
                <LogSection form={form} update={update} />
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
