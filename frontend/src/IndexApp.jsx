import { Routes, Route } from 'react-router'
import useCollectors from './hooks/useCollectors'
import Sidebar from './components/layout/Sidebar'
import DashboardPage from './pages/DashboardPage'
import CollectorFormPage from './pages/CollectorFormPage'
import Toast from './components/common/Toast'

export default function IndexApp() {
  const { collectors, toggleCollector, removeCollector, refreshCollectors } = useCollectors()

  return (
    <>
      <div className="flex max-lg:flex-col overflow-hidden bg-surface-alt text-on-surface antialiased">
        <Sidebar collectors={collectors} onToggleCollector={toggleCollector} />
        <main className="ml-64 max-lg:ml-0 flex-1 h-screen overflow-hidden bg-surface-alt">
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
