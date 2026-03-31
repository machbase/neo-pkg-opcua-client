import { createContext, useContext, useState, useCallback } from 'react'

const AppContext = createContext(null)

let notifId = 0

export function AppProvider({ children }) {
  const [selectedCollectorId, setSelectedCollectorId] = useState(null)
  const [notifications, setNotifications] = useState([])

  const notify = useCallback((message, type = 'info') => {
    const id = ++notifId
    setNotifications(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 4000)
  }, [])

  const dismissNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id))
  }, [])

  return (
    <AppContext.Provider value={{
      selectedCollectorId, setSelectedCollectorId,
      notifications, notify, dismissNotification
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
