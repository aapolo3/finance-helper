import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts: a third-party stylesheet would block the first render.
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import '@fontsource/ibm-plex-sans/600.css'
import '@fontsource-variable/newsreader/opsz.css'
import './index.css'
import App from './App.tsx'
import { startAppearance } from './lib/appearance'

startAppearance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
