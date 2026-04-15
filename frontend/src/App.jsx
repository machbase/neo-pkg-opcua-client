import { useState, useEffect, useRef, useCallback } from 'react'
import { Routes, Route, useNavigate } from 'react-router'
import useCollectors from './hooks/useCollectors'
import useServers from './hooks/useServers'
import { useApp } from './context/AppContext'
import * as api from './api/collectors'
import DashboardPage from './pages/DashboardPage'
import CollectorFormPage from './pages/CollectorFormPage'
import ServerSettingsModal from './components/servers/ServerSettingsModal'
import Toast from './components/common/Toast'

const CHANNEL_NAME = 'app:neo-opcua-collector'

export default function App() {
  const navigate = useNavigate()
  const { selectedCollectorId, setSelectedCollectorId, notify } = useApp()
  const { collectors, toggleCollector, installCollector, removeCollector, refreshCollectors } = useCollectors()
  const { servers, loading: serversLoading, addServer, editServer, removeServer, healthCheck, refreshServers } = useServers()
  const [detail, setDetail] = useState(null)
  const [showServerSettings, setShowServerSettings] = useState(false)
  const [autoOpenForm, setAutoOpenForm] = useState(false)

  const openServerSettings = useCallback((openForm = false) => {
    setAutoOpenForm(Boolean(openForm))
    setShowServerSettings(true)
  }, [])

  const closeServerSettings = useCallback(() => {
    setShowServerSettings(false)
    setAutoOpenForm(false)
  }, [])

  const fetchDetail = useCallback((id) => {
    if (!id) { setDetail(null); return Promise.resolve() }
    return api.getCollector(id)
      .then(setDetail)
      .catch((e) => {
        notify(e.reason || e.message, 'error')
        setDetail(null)
      })
  }, [notify])

  useEffect(() => {
    fetchDetail(selectedCollectorId)
  }, [selectedCollectorId, fetchDetail])
  const channelRef = useRef(null)
  const handlersRef = useRef({})

  handlersRef.current = {
    selectCollector: (payload) => {
      setSelectedCollectorId(payload.collectorId)
      navigate('/')
    },
    navigate: (payload) => {
      navigate(payload.path)
    },
    toggleCollector: (payload) => {
      const c = collectors.find(c => c.id === payload.collectorId)
      if (c) toggleCollector(c)
    },
    installCollector: (payload) => {
      const c = collectors.find(c => c.id === payload.collectorId)
      if (c) installCollector(c)
    },
    openServerSettings: () => {
      openServerSettings()
    },
    requestReady: () => {
      const ch = channelRef.current
      if (!ch) return
      ch.postMessage({ type: 'ready' })
      ch.postMessage({ type: 'collectorsData', payload: { collectors } })
      ch.postMessage({ type: 'collectorSelected', payload: { collectorId: selectedCollectorId } })
    },
  }

  useEffect(() => {
    const ch = new BroadcastChannel(CHANNEL_NAME)
    channelRef.current = ch

    ch.onmessage = (e) => {
      const msg = e.data
      if (!msg || !msg.type) return
      const handler = handlersRef.current[msg.type]
      if (handler) handler(msg.payload)
    }

    ch.postMessage({ type: 'ready' })
    return () => ch.close()
  }, [])

  useEffect(() => {
    channelRef.current?.postMessage({ type: 'collectorsData', payload: { collectors } })
  }, [collectors])

  useEffect(() => {
    channelRef.current?.postMessage({ type: 'collectorSelected', payload: { collectorId: selectedCollectorId } })
  }, [selectedCollectorId])

  return (
    <>
      <div className="bg-surface-alt text-on-surface antialiased">
        <main className="h-screen overflow-hidden bg-surface-alt">
          <Routes>
            <Route path="/" element={
              <DashboardPage collectors={collectors} detail={detail} onDelete={removeCollector} />
            } />
            <Route path="/collectors/new" element={
              <CollectorFormPage
                onRefresh={refreshCollectors}
                servers={servers}
                onOpenServerSettings={openServerSettings}
                onRefreshServers={refreshServers}
              />
            } />
            <Route path="/collectors/:id/edit" element={
              <CollectorFormPage
                detail={detail}
                onRefresh={refreshCollectors}
                onRefreshDetail={() => fetchDetail(selectedCollectorId)}
                servers={servers}
                onOpenServerSettings={openServerSettings}
                onRefreshServers={refreshServers}
              />
            } />
          </Routes>
        </main>
      </div>
      <Toast />
      {showServerSettings && (
        <ServerSettingsModal
          servers={servers}
          loading={serversLoading}
          onAdd={addServer}
          onEdit={editServer}
          onDelete={removeServer}
          onHealthCheck={healthCheck}
          onRefresh={refreshServers}
          onClose={closeServerSettings}
          autoOpenForm={autoOpenForm}
        />
      )}
    </>
  )
}
