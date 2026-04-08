import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import { AppProvider } from './context/AppContext'
import App from './App'
import './styles/index.css'

createRoot(document.getElementById('root')).render(
  <HashRouter>
    <AppProvider>
      <App />
    </AppProvider>
  </HashRouter>
)
