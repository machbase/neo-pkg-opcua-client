import { useEffect, useRef } from 'react'
import { Routes, Route, useNavigate } from 'react-router'
import useCollectors from './hooks/useCollectors'
import { useApp } from './context/AppContext'
import DashboardPage from './pages/DashboardPage'
import CollectorFormPage from './pages/CollectorFormPage'
import Toast from './components/common/Toast'

const CHANNEL_NAME = 'app:neo-opcua-collector'

export default function App() {
  const navigate = useNavigate()
  const { selectedCollectorId, setSelectedCollectorId } = useApp()
  const { collectors, toggleCollector, removeCollector, refreshCollectors } = useCollectors()
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
        <main className="h-screen overflow-y-auto bg-surface-alt">
          <Routes>
            <Route path="/" element={
              <DashboardPage collectors={collectors} onDelete={removeCollector} />
            } />
            <Route path="/collectors/new" element={
              <CollectorFormPage onRefresh={refreshCollectors} />
            } />
            <Route path="/collectors/:id/edit" element={
              <CollectorFormPage onRefresh={refreshCollectors} />
            } />
          </Routes>
        </main>
      </div>
      <Toast />
    </>
  )
}
