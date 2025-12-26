import { useState, useCallback, useEffect } from 'react'
import { API_URL } from '../config/x402-config'

export interface WalletSession {
  sessionToken: string
  walletAddress: string
  expiresAt: string
}

export interface Entitlement {
  id: string
  assetId: string
  planType: '24h' | '7d'
  expiresAt: string
  createdAt: string
}

export interface UseWalletSessionResult {
  // State
  session: WalletSession | null
  isAuthenticated: boolean
  isAuthenticating: boolean
  entitlements: Entitlement[]
  error: string | null
  
  // Actions
  authenticate: (walletAddress: string) => Promise<boolean>
  logout: () => Promise<void>
  refreshSession: () => Promise<boolean>
  fetchEntitlements: () => Promise<Entitlement[]>
  hasAccessTo: (assetId: string) => boolean
  getSessionHeader: () => Record<string, string>
}

const STORAGE_KEY = 'x402_wallet_session'

// Load session from localStorage
const loadSession = (): WalletSession | null => {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const session = JSON.parse(saved) as WalletSession
      // Check if expired
      if (new Date(session.expiresAt) > new Date()) {
        return session
      }
      // Clear expired session
      localStorage.removeItem(STORAGE_KEY)
    }
  } catch {
    localStorage.removeItem(STORAGE_KEY)
  }
  return null
}

// Save session to localStorage
const saveSession = (session: WalletSession | null) => {
  if (session) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
  } else {
    localStorage.removeItem(STORAGE_KEY)
  }
}

export const useWalletSession = (): UseWalletSessionResult => {
  const [session, setSession] = useState<WalletSession | null>(loadSession)
  const [isAuthenticating, setIsAuthenticating] = useState(false)
  const [entitlements, setEntitlements] = useState<Entitlement[]>([])
  const [error, setError] = useState<string | null>(null)

  const isAuthenticated = session !== null

  // Get session header for API requests
  const getSessionHeader = useCallback((): Record<string, string> => {
    if (session?.sessionToken) {
      return { 'X-Wallet-Session': session.sessionToken }
    }
    return {}
  }, [session])

  // Authenticate wallet (nonce → sign → verify)
  const authenticate = useCallback(async (walletAddress: string): Promise<boolean> => {
    if (!window.ethereum) {
      setError('No wallet found')
      return false
    }

    setIsAuthenticating(true)
    setError(null)

    try {
      // Step 1: Request nonce
      console.log('[Auth] Requesting nonce for', walletAddress)
      const nonceRes = await fetch(`${API_URL}/wallet/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress })
      })

      if (!nonceRes.ok) {
        const data = await nonceRes.json()
        throw new Error(data.error || 'Failed to get nonce')
      }

      const { message, nonce } = await nonceRes.json()
      console.log('[Auth] Got nonce:', nonce)

      // Step 2: Sign message with wallet
      console.log('[Auth] Requesting signature...')
      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [message, walletAddress]
      }) as string

      console.log('[Auth] Got signature:', signature.slice(0, 20) + '...')

      // Step 3: Verify signature and get session
      console.log('[Auth] Verifying signature...')
      const verifyRes = await fetch(`${API_URL}/wallet/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: walletAddress, signature })
      })

      if (!verifyRes.ok) {
        const data = await verifyRes.json()
        throw new Error(data.error || 'Failed to verify signature')
      }

      const { sessionToken, expiresAt } = await verifyRes.json()
      console.log('[Auth] Session created, expires:', expiresAt)

      // Save session
      const newSession: WalletSession = {
        sessionToken,
        walletAddress,
        expiresAt
      }
      setSession(newSession)
      saveSession(newSession)

      // Fetch entitlements after authentication
      await fetchEntitlementsInternal(sessionToken)

      return true
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Authentication failed'
      console.error('[Auth] Error:', errorMessage)
      setError(errorMessage)
      return false
    } finally {
      setIsAuthenticating(false)
    }
  }, [])

  // Internal fetch entitlements (with token parameter)
  const fetchEntitlementsInternal = async (token: string): Promise<Entitlement[]> => {
    try {
      const res = await fetch(`${API_URL}/wallet/entitlements`, {
        headers: { 'X-Wallet-Session': token }
      })

      if (!res.ok) {
        console.warn('[Entitlements] Failed to fetch')
        return []
      }

      const data = await res.json()
      const activeEntitlements = data.active || []
      setEntitlements(activeEntitlements)
      return activeEntitlements
    } catch (err) {
      console.error('[Entitlements] Error:', err)
      return []
    }
  }

  // Public fetch entitlements
  const fetchEntitlements = useCallback(async (): Promise<Entitlement[]> => {
    if (!session?.sessionToken) return []
    return fetchEntitlementsInternal(session.sessionToken)
  }, [session])

  // Check if user has access to asset
  const hasAccessTo = useCallback((assetId: string): boolean => {
    return entitlements.some(e => 
      e.assetId === assetId && 
      new Date(e.expiresAt) > new Date()
    )
  }, [entitlements])

  // Refresh session (check if still valid)
  const refreshSession = useCallback(async (): Promise<boolean> => {
    if (!session?.sessionToken) return false

    try {
      const res = await fetch(`${API_URL}/wallet/session`, {
        headers: { 'X-Wallet-Session': session.sessionToken }
      })

      if (!res.ok) {
        // Session invalid, clear it
        setSession(null)
        saveSession(null)
        setEntitlements([])
        return false
      }

      const data = await res.json()
      if (!data.authenticated) {
        setSession(null)
        saveSession(null)
        setEntitlements([])
        return false
      }

      // Update expiry if provided
      if (data.expiresAt) {
        const updatedSession = { ...session, expiresAt: data.expiresAt }
        setSession(updatedSession)
        saveSession(updatedSession)
      }

      return true
    } catch {
      return false
    }
  }, [session])

  // Logout
  const logout = useCallback(async () => {
    if (session?.sessionToken) {
      try {
        await fetch(`${API_URL}/wallet/logout`, {
          method: 'POST',
          headers: { 'X-Wallet-Session': session.sessionToken }
        })
      } catch {
        // Ignore logout errors
      }
    }

    setSession(null)
    saveSession(null)
    setEntitlements([])
    setError(null)
  }, [session])

  // Auto-refresh session and entitlements on mount - runs ONCE
  useEffect(() => {
    const currentSession = loadSession() // Read from localStorage directly
    if (currentSession) {
      // Verify session is still valid on server
      fetch(`${API_URL}/wallet/session`, {
        headers: { 'X-Wallet-Session': currentSession.sessionToken }
      })
        .then(res => res.ok ? res.json() : Promise.reject())
        .then(data => {
          if (data.authenticated) {
            // Session valid, fetch entitlements
            fetchEntitlementsInternal(currentSession.sessionToken)
          } else {
            // Session invalid, clear it
            setSession(null)
            saveSession(null)
            setEntitlements([])
          }
        })
        .catch(() => {
          // Error checking session - keep local state
        })
    }
  }, []) // Empty deps = mount only, no external dependencies needed

  // Clear session if wallet address changes externally
  const clearSessionForWallet = useCallback((newWalletAddress: string | null) => {
    if (session && newWalletAddress?.toLowerCase() !== session.walletAddress.toLowerCase()) {
      console.log('[Session] Wallet changed, clearing session')
      setSession(null)
      saveSession(null)
      setEntitlements([])
    }
  }, [session])

  return {
    session,
    isAuthenticated,
    isAuthenticating,
    entitlements,
    error,
    authenticate,
    logout,
    refreshSession,
    fetchEntitlements,
    hasAccessTo,
    getSessionHeader,
    // Export for external wallet change detection
    _clearSessionForWallet: clearSessionForWallet
  } as UseWalletSessionResult & { _clearSessionForWallet: (addr: string | null) => void }
}

