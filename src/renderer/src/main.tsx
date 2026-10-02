import '@mantine/core/styles.layer.css'
import './theme/tokens.css'
import './assets/main.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { initializeVisualPreferences } from './theme/visual-preferences'
import { VisualPreferencesProvider } from './theme/VisualPreferencesProvider'

const initialPreferences = initializeVisualPreferences()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <VisualPreferencesProvider initial={initialPreferences}>
        <App />
      </VisualPreferencesProvider>
    </ErrorBoundary>
  </StrictMode>
)
