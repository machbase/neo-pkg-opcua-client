import { useState, useEffect, useCallback } from 'react'
import { Routes, Route, useLocation } from 'react-router'
import useCollectors from './hooks/useCollectors'
import { useApp } from './context/AppContext'
import * as api from './api/collectors'
import Sidebar from './components/layout/Sidebar'
import DashboardPage from './pages/DashboardPage'
import CollectorFormPage from './pages/CollectorFormPage'
import Toast from './components/common/Toast'

export default function IndexApp() {
  const location = useLocation()
  const { collectors, toggleCollector, installCollector, removeCollector, refreshCollectors } = useCollectors()
  const { selectedCollectorId, notify } = useApp()
  const [detail, setDetail] = useState(null)

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
  }, [selectedCollectorId, fetchDetail, location.pathname])

  return (
    <>
      <div className="flex max-lg:flex-col overflow-hidden bg-surface-alt text-on-surface antialiased">
        <Sidebar collectors={collectors} onToggleCollector={toggleCollector} onInstallCollector={installCollector} onRefresh={refreshCollectors} />
        <main className="ml-64 max-lg:ml-0 flex-1 h-screen overflow-hidden bg-surface-alt">
          <Routes>
            <Route path="/" element={
              <DashboardPage collectors={collectors} detail={detail} onDelete={removeCollector} />
            } />
            <Route path="/collectors/new" element={
              <CollectorFormPage onRefresh={refreshCollectors} />
            } />
            <Route path="/collectors/:id/edit" element={
              <CollectorFormPage detail={detail} onRefresh={refreshCollectors} />
            } />
          </Routes>
        </main>
      </div>
      <Toast />
    </>
  )
}
