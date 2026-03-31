import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import SideApp from './SideApp'
import './styles/index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SideApp />
  </StrictMode>
)
