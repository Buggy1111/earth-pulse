import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'

// Service worker for installable/offline PWA. Updates are prepared in the
// background but NOT activated mid-session: with `immediate: true` the new SW
// took over while the old bundle was still running, its precache entries got
// new hashes, and the running app 404'd its own assets → ErrorBoundary reload
// → the "app restarts twice on open" symptom. `immediate: false` activates
// the new version on the NEXT visit, so a session never swaps under itself.
registerSW({ immediate: false })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
