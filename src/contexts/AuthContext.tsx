import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { neonAuth, isNeonAuthConfigured } from '../lib/neon-client'
import { checkUserAccess, type AppUser } from '../lib/neon-db'

// Simplified user type for Neon Auth
interface NeonUser {
  id: string
  email: string
  name?: string
  image?: string
}

interface AuthContextType {
  user: NeonUser | null
  isLoading: boolean
  isAllowed: boolean // Is user allowed (not blocked)?
  appUser: AppUser | null // User record from app_users table
  limits: Record<string, number | null> // Effective rate limits for this user
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  checkAllowlist: () => Promise<boolean>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<NeonUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAllowed, setIsAllowed] = useState(false)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [limits, setLimits] = useState<Record<string, number | null>>({})

  // Check user access in app_users table (still uses Supabase for data)
  const checkAccess = useCallback(async (email: string) => {
    try {
      const { allowed, user: appUserRecord, limits: userLimits } = await checkUserAccess(email)
      console.log('🔐 [AUTH] Access check:', email, allowed, userLimits)
      setIsAllowed(allowed)
      setAppUser(appUserRecord)
      setLimits(userLimits)
      return allowed
    } catch (err) {
      console.error('🔐 [AUTH] Access check failed:', err)
      setIsAllowed(false)
      setAppUser(null)
      setLimits({})
      return false
    }
  }, [])

  // Function to refresh session - extracted so it can be called from message handler
  const refreshSession = useCallback(async () => {
    console.log('🔐 [AUTH] Refreshing session...')
    try {
      const sessionData = await neonAuth.getSession()
      console.log('🔐 [AUTH] Session response:', sessionData)

      if (sessionData?.data?.session && sessionData?.data?.user) {
        const neonUser: NeonUser = {
          id: sessionData.data.user.id,
          email: sessionData.data.user.email,
          name: sessionData.data.user.name || undefined,
          image: sessionData.data.user.image || undefined
        }
        console.log('🔐 [AUTH] User found:', neonUser.email)
        setUser(neonUser)
        await checkAccess(neonUser.email)
      } else {
        console.log('🔐 [AUTH] No active session')
        setUser(null)
        setIsAllowed(false)
        setAppUser(null)
        setLimits({})
      }
    } catch (err) {
      console.error('🔐 [AUTH] Session fetch failed:', err)
      setUser(null)
      setIsAllowed(false)
    } finally {
      setIsLoading(false)
    }
  }, [checkAccess])

  useEffect(() => {
    console.log('🔐 [AUTH] Starting auth check, isNeonAuthConfigured:', isNeonAuthConfigured)

    // Skip if Neon Auth is not configured
    if (!isNeonAuthConfigured) {
      console.log('🔐 [AUTH] Neon Auth not configured, skipping')
      setIsLoading(false)
      return
    }

    // Get initial session
    refreshSession()

    // Listen for session changes on focus
    const handleFocus = () => {
      console.log('🔐 [AUTH] Window focused, checking session...')
      refreshSession()
    }

    // Listen for AUTH_COMPLETE message from popup
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'AUTH_COMPLETE') {
        console.log('🔐 [AUTH] Received AUTH_COMPLETE from popup, refreshing session...')
        refreshSession()
      }
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('message', handleMessage)

    return () => {
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('message', handleMessage)
    }
  }, [refreshSession])

  const signInWithGoogle = async () => {
    console.log('🔐 [AUTH] Starting Google sign-in...')
    try {
      await neonAuth.signIn.social({
        provider: 'google',
        callbackURL: window.location.origin
      })
    } catch (err) {
      console.error('🔐 [AUTH] Google sign-in failed:', err)
      throw err
    }
  }

  const signOut = async () => {
    console.log('🔐 [AUTH] Signing out...')
    try {
      await neonAuth.signOut()
      setUser(null)
      setIsAllowed(false)
      setAppUser(null)
      setLimits({})
    } catch (err) {
      console.error('🔐 [AUTH] Sign out failed:', err)
      // Clear state anyway
      setUser(null)
      setIsAllowed(false)
      setAppUser(null)
      setLimits({})
      throw err
    }
  }

  const checkAllowlist = async (): Promise<boolean> => {
    if (!user?.email) return false
    return checkAccess(user.email)
  }

  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isAllowed,
      appUser,
      limits,
      signInWithGoogle,
      signOut,
      checkAllowlist
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
