import { useState } from 'react'
import { X, Loader2, Lock, Mail } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'

interface LoginModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function LoginModal({ isOpen, onClose, onSuccess }: LoginModalProps) {
  const { user, isAllowed, signInWithGoogle, signOut, isLoading } = useAuth()
  const [isSigningIn, setIsSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleGoogleSignIn = async () => {
    setIsSigningIn(true)
    setError(null)
    try {
      await signInWithGoogle()
      // The page will redirect to Google, then back
    } catch (err: any) {
      setError(err.message || 'Failed to sign in')
      setIsSigningIn(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (err: any) {
      setError(err.message || 'Failed to sign out')
    }
  }

  // User is logged in but NOT in allowlist
  if (user && !isAllowed && !isLoading) {
    return (
      <div
        className="fixed inset-0 flex items-center justify-center z-50"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        onClick={onClose}
      >
        <div
          className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold" style={{ color: '#0F172A' }}>
              Pro Feature
            </h3>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <X className="w-5 h-5" style={{ color: '#64748B' }} />
            </button>
          </div>

          <div className="text-center py-6">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)' }}
            >
              <Lock className="w-8 h-8" style={{ color: '#DC2626' }} />
            </div>

            <p className="text-base font-medium mb-2" style={{ color: '#334155' }}>
              Persistent storage is a <strong>Pro feature</strong>.
            </p>
            <p className="text-base font-medium mb-4" style={{ color: '#64748B' }}>
              By invite only.
            </p>

            <div
              className="p-4 rounded-lg mb-4"
              style={{ backgroundColor: '#FAFAFA', border: '1px solid #E2E8F0' }}
            >
              <p className="text-sm font-medium" style={{ color: '#64748B' }}>
                Signed in as:
              </p>
              <p className="text-base font-semibold" style={{ color: '#0F172A' }}>
                {user.email}
              </p>
            </div>

            <p className="text-base font-medium mb-6" style={{ color: '#334155' }}>
              Contact{' '}
              <a
                href="mailto:amar@harolikar.com"
                className="underline"
                style={{ color: '#DC2626' }}
              >
                amar@harolikar.com
              </a>
              {' '}for access.
            </p>

            <button
              onClick={handleSignOut}
              className="w-full py-2 px-4 rounded-lg font-medium transition-all hover:bg-gray-100"
              style={{ border: '1px solid #E2E8F0', color: '#64748B' }}
            >
              Sign out and try different account
            </button>
          </div>
        </div>
      </div>
    )
  }

  // User is logged in AND in allowlist - success!
  if (user && isAllowed && !isLoading) {
    // Call success callback and close
    if (onSuccess) {
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 500)
    }

    return (
      <div
        className="fixed inset-0 flex items-center justify-center z-50"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        onClick={onClose}
      >
        <div
          className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center py-6">
            <div
              className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}
            >
              <Mail className="w-8 h-8" style={{ color: '#22C55E' }} />
            </div>

            <p className="text-xl font-bold mb-2" style={{ color: '#0F172A' }}>
              Welcome back!
            </p>
            <p className="text-base font-medium" style={{ color: '#64748B' }}>
              {user.email}
            </p>
            <p className="text-sm font-medium mt-2" style={{ color: '#22C55E' }}>
              Pro features enabled
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Not logged in - show sign in options
  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold" style={{ color: '#0F172A' }}>
            Sign in for Pro Features
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5" style={{ color: '#64748B' }} />
          </button>
        </div>

        <p className="text-base font-medium mb-6" style={{ color: '#64748B' }}>
          Sign in to enable persistent storage. Your files won't be automatically deleted.
        </p>

        {error && (
          <div
            className="mb-4 p-3 rounded-lg text-sm font-medium"
            style={{ backgroundColor: 'rgba(220, 38, 38, 0.1)', color: '#DC2626' }}
          >
            {error}
          </div>
        )}

        <button
          onClick={handleGoogleSignIn}
          disabled={isSigningIn || isLoading}
          className="w-full py-3 px-4 rounded-lg font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ backgroundColor: '#4285F4' }}
        >
          {isSigningIn || isLoading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </>
          )}
        </button>

        <p className="text-sm font-medium mt-4 text-center" style={{ color: '#64748B' }}>
          Pro features are by invite only.{' '}
          <a
            href="mailto:amar@harolikar.com"
            className="underline"
            style={{ color: '#DC2626' }}
          >
            Request access
          </a>
        </p>
      </div>
    </div>
  )
}
