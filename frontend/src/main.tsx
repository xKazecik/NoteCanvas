import './excalidrawAssetPath'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@excalidraw/excalidraw/index.css'
import './index.css'
import App from './App.tsx'
import { configureDisplayFont } from './utils/displayFont'

configureDisplayFont()

// Caches the app shell so offline mode can load the app without a connection.
// Production only: in dev it would serve stale Vite modules.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const version = encodeURIComponent(import.meta.env.VITE_APP_VERSION || 'dev')
    navigator.serviceWorker.register(`/sw.js?v=${version}`).catch((err) => {
      console.warn('Service worker registration failed:', err)
    })
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
