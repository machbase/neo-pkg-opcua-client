import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { AppProvider } from './context/AppContext'
import SideApp from './SideApp'
import './styles/index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppProvider>
      <SideApp />
    </AppProvider>
  </StrictMode>
)
