import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from "react-error-boundary";

import App from './App.tsx'
import { ErrorFallback } from './ErrorFallback.tsx'
import { installSparkKVFallback } from './lib/sparkKV.ts'
import { loadSparkRuntimeIfNeeded } from './lib/sparkRuntime.ts'

import "./main.css"
import "./styles/theme.css"
import "./index.css"

async function bootstrapApp() {
  await loadSparkRuntimeIfNeeded()
  installSparkKVFallback()

  createRoot(document.getElementById('root')!).render(
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <App />
    </ErrorBoundary>
  )
}

void bootstrapApp()
