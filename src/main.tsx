import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { loadBackend } from './lib/backend'
import { AppProvider } from './state'

const backend = await loadBackend()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider backend={backend}>
      <App />
    </AppProvider>
  </StrictMode>,
)
