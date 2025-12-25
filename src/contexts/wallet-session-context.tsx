import { createContext, useContext, useEffect, ReactNode } from 'react'
import { useWalletSession, WalletSession, Entitlement } from '../hooks/use-wallet-session'

interface WalletSessionContextValue {
  // Session state
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

const WalletSessionContext = createContext<WalletSessionContextValue | null>(null)

interface WalletSessionProviderProps {
  children: ReactNode
  walletAddress: string | null // From parent wallet connection
}

export const WalletSessionProvider: React.FC<WalletSessionProviderProps> = ({ 
  children, 
  walletAddress 
}) => {
  const sessionHook = useWalletSession()
  const { 
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
    getSessionHeader
  } = sessionHook

  // Handle wallet address changes
  useEffect(() => {
    // If wallet disconnected, logout session
    if (!walletAddress && session) {
      console.log('[SessionContext] Wallet disconnected, logging out')
      logout()
    }
    
    // If wallet changed to different address, clear session
    if (walletAddress && session && 
        walletAddress.toLowerCase() !== session.walletAddress.toLowerCase()) {
      console.log('[SessionContext] Wallet changed, logging out old session')
      logout()
    }
  }, [walletAddress, session, logout])

  // Auto-authenticate when wallet connects (if not already authenticated)
  useEffect(() => {
    if (walletAddress && !isAuthenticated && !isAuthenticating) {
      // Check if we have a saved session for this wallet
      const savedSession = session
      if (savedSession && savedSession.walletAddress.toLowerCase() === walletAddress.toLowerCase()) {
        // Already have valid session
        return
      }
      
      // Don't auto-authenticate - let user trigger it
      // This is more secure and gives user control
    }
  }, [walletAddress, isAuthenticated, isAuthenticating, session])

  const value: WalletSessionContextValue = {
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
    getSessionHeader
  }

  return (
    <WalletSessionContext.Provider value={value}>
      {children}
    </WalletSessionContext.Provider>
  )
}

// Hook to use session context
export const useWalletSessionContext = (): WalletSessionContextValue => {
  const context = useContext(WalletSessionContext)
  if (!context) {
    throw new Error('useWalletSessionContext must be used within WalletSessionProvider')
  }
  return context
}

// Export types
export type { WalletSession, Entitlement }

