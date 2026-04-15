import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, useNavigate, useLocation } from 'react-router'
import useCollectors from './hooks/useCollectors'
import useServers from './hooks/useServers'
import { useApp } from './context/AppContext'
import * as api from './api/collectors'
import Sidebar from './components/layout/Sidebar'
import DashboardPage from './pages/DashboardPage'
import CollectorFormPage from './pages/CollectorFormPage'
import ServerSettingsModal from './components/servers/ServerSettingsModal'
import Toast from './components/common/Toast'

export default function IndexApp() {
  const navigate = useNavigate()
  const location = useLocation()
  const { collectors, toggleCollector, installCollector, removeCollector, refreshCollectors } = useCollectors()
  const { servers, loading: serversLoading, addServer, editServer, removeServer, healthCheck, refreshServers } = useServers()
  const { selectedCollectorId, setSelectedCollectorId, notify } = useApp()
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
    if (!id) { setDetail(null); return }
    api.getCollector(id)
      .then(setDetail)
      .catch((e) => {
        notify(e.reason || e.message, 'error')
        setDetail(null)
      })
  }, [notify])

  useEffect(() => {
    fetchDetail(selectedCollectorId)
  }, [selectedCollectorId, fetchDetail])

  return (
    <>
      <div className="flex flex-col lg:flex-row overflow-hidden bg-surface-alt text-on-surface antialiased">
        <Sidebar
          collectors={collectors}
          selectedCollectorId={selectedCollectorId}
          onSelectCollector={(id) => {
            setSelectedCollectorId(id)
            if (location.pathname !== '/') navigate('/')
          }}
          onNewCollector={() => {
            setSelectedCollectorId(null)
            navigate('/collectors/new')
          }}
          onToggleCollector={toggleCollector}
          onInstallCollector={installCollector}
          onRefresh={refreshCollectors}
          onServerSettings={() => openServerSettings()}
          className="side w-full shrink-0 lg:fixed lg:left-0 lg:top-0 lg:w-64 lg:h-screen z-dropdown border-b lg:border-b-0 lg:border-r border-border"
        />
        <main className="flex-1 h-screen overflow-y-auto bg-surface-alt lg:ml-64">
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
