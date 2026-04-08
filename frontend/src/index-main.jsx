import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { AppProvider } from './context/AppContext'
import IndexApp from './IndexApp'
import './styles/index.css'

createRoot(document.getElementById('root')).render(
  <HashRouter>
    <AppProvider>
      <IndexApp />
    </AppProvider>
  </HashRouter>
)
