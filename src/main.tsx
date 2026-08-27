import React, { Suspense, lazy } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

const isCamera = window.location.pathname === '/camera'
const CameraCapture = isCamera ? lazy(() => import('./CameraCapture')) : null

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isCamera && CameraCapture
      ? <Suspense fallback={null}><CameraCapture /></Suspense>
      : <App />}
  </React.StrictMode>,
)
