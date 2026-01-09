import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Header } from './components/layout/Header'
import { Footer } from './components/layout/Footer'
import { Home } from './pages/Home'
import { MyFiles } from './pages/MyFiles'
import { AuthProvider } from './contexts/AuthContext'
import DuckItUploader from './pages/xlwings/xlwings-DuckItUploader'

// Main app layout with header/footer
function MainLayout() {
  const [showMyFiles, setShowMyFiles] = useState(false)

  // Listen for openMyFiles event from Home component
  useEffect(() => {
    const handleOpenMyFiles = () => {
      setShowMyFiles(true)
    }

    window.addEventListener('openMyFiles', handleOpenMyFiles)
    return () => window.removeEventListener('openMyFiles', handleOpenMyFiles)
  }, [])

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#FFFFFF' }}>
      <Header onMyFilesClick={() => setShowMyFiles(true)} />
      <Home />
      <Footer />
      {showMyFiles && <MyFiles onClose={() => setShowMyFiles(false)} />}
    </div>
  )
}

function App() {
  const [isPopupClosing, setIsPopupClosing] = useState(false)

  // Handle OAuth popup callback - detect if we're in a popup and close it
  useEffect(() => {
    // Check if this window was opened as a popup (has an opener)
    const isPopup = window.opener !== null

    if (isPopup) {
      console.log('🔐 [POPUP] Detected popup window, notifying opener...')
      setIsPopupClosing(true)

      // Notify the opener window that auth is complete
      try {
        window.opener.postMessage({ type: 'AUTH_COMPLETE' }, '*')
      } catch (e) {
        console.error('🔐 [POPUP] Failed to notify opener:', e)
      }

      // Close this popup after a short delay to allow session to be established
      setTimeout(() => {
        console.log('🔐 [POPUP] Closing popup window...')
        window.close()
      }, 1500)
    }
  }, [])

  // Show a simple message if we're closing the popup
  if (isPopupClosing) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="text-2xl mb-2">✓</div>
          <p className="text-gray-600">Sign-in complete! This window will close...</p>
        </div>
      </div>
    )
  }

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<MainLayout />} />
          <Route path="/xlwings/duckit" element={<DuckItUploader />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}

export default App
