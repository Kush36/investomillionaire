import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import App from './App.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      {/* reducedMotion="user" makes every animation in the tree honour the OS
          setting without each component asking. It reduces motion rather than
          removing it: direct manipulation still answers a finger, because a
          control that stops responding is broken rather than calm (WCAG 2.3.3). */}
      <MotionConfig reducedMotion="user">
        <App />
      </MotionConfig>
    </BrowserRouter>
  </React.StrictMode>
)
