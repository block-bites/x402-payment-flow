import { useState, useEffect, useCallback, useRef } from 'react'
import SecureVideoPlayer from './components/secure-video-player'
import SecureImageViewer from './components/secure-image-viewer'
import PaymentModal from './components/payment-modal'
import WalletConnect from './components/wallet-connect'
import { planSelectorStyles } from './components/plan-selector'
import { useX402Payment, PlanType } from './hooks/use-x402-payment'
import { useWalletSession } from './hooks/use-wallet-session'
import { API_URL } from './config/x402-config'
import './App.css'

interface MediaInfo {
  id: string
  previewUrl: string
  pricing: {
    '24h': { price: number; priceFormatted: string }
    '7d': { price: number; priceFormatted: string }
  }
  hasAccess?: boolean // Set by backend when X-Wallet-Session header is present
}

function App() {
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [_currentMediaType, setCurrentMediaType] = useState<'video' | 'image' | null>(null)
  const [serverStatus, setServerStatus] = useState<{
    online: boolean | null
    network: string | null
  }>({ online: null, network: null })
  const [mediaKey, setMediaKey] = useState(0) // Key to force re-render media components
  const [mediaList, setMediaList] = useState<MediaInfo[]>([]) // Media list from API
  const previousWalletAddress = useRef<string | null>(null) // Track wallet address changes
  const fetchMediaListTimeoutRef = useRef<NodeJS.Timeout | null>(null) // Debounce fetchMediaList
  const isFetchingMediaListRef = useRef<boolean>(false) // Prevent concurrent fetches

  // Wallet session hook for authentication
  const {
    isAuthenticated,
    isAuthenticating,
    isVerifyingSession,
    authenticate,
    logout: sessionLogout,
    fetchEntitlements,
    hasAccessTo,
    getSessionHeader
  } = useWalletSession()

  // Payment hook
  const {
    paymentStatus,
    paymentRequirements,
    walletAddress,
    transactionHash,
    error,
    pricing,
    selectedPlan,
    connectWallet,
    disconnectWallet,
    requestPayment,
    executePayment,
    resetPayment,
    setSelectedPlan
  } = useX402Payment()

  // Fetch media list from API - sends X-Wallet-Session header if authenticated
  // Debounced to prevent multiple concurrent requests
  const fetchMediaList = useCallback(async (immediate = false) => {
    // Clear any pending timeout
    if (fetchMediaListTimeoutRef.current) {
      clearTimeout(fetchMediaListTimeoutRef.current)
      fetchMediaListTimeoutRef.current = null
    }

    const doFetch = async () => {
      // Prevent concurrent fetches
      if (isFetchingMediaListRef.current) {
        console.log('[App] Media list fetch already in progress, skipping...')
        return
      }

      isFetchingMediaListRef.current = true
      try {
        const headers: Record<string, string> = {}
        const sessionHeader = getSessionHeader()
        if (sessionHeader['X-Wallet-Session']) {
          headers['X-Wallet-Session'] = sessionHeader['X-Wallet-Session']
          console.log('[App] Fetching media list WITH session header')
        } else {
          console.log('[App] Fetching media list WITHOUT session header')
        }
        
        const response = await fetch(`${API_URL}/media`, { headers })
        if (response.ok) {
          const data = await response.json()
          if (data.media) {
            console.log('[App] Media list received:', data.media.map((m: MediaInfo) => ({
              id: m.id,
              hasAccess: m.hasAccess
            })))
            setMediaList(data.media)
          }
        } else {
          console.error('[App] Failed to fetch media list:', response.status, response.statusText)
        }
      } catch (err) {
        console.error('[App] Failed to fetch media list:', err)
      } finally {
        isFetchingMediaListRef.current = false
      }
    }

    if (immediate) {
      await doFetch()
    } else {
      // Debounce: wait 300ms before fetching
      fetchMediaListTimeoutRef.current = setTimeout(() => {
        doFetch()
        fetchMediaListTimeoutRef.current = null
      }, 300)
    }
  }, [getSessionHeader])

  // Check server status - runs ONCE on mount, no polling
  useEffect(() => {
    let isMounted = true

    const checkServer = async () => {
      try {
        const response = await fetch(`${API_URL}/health`, { 
          method: 'GET',
          signal: AbortSignal.timeout(5000)
        })
        if (!isMounted) return
        
        if (response.ok) {
          const data = await response.json()
          const network = data?.payment?.network || data?.network || null
          setServerStatus({ online: true, network })
          fetchMediaList(true) // Immediate fetch on initial server check
        } else {
          setServerStatus({ online: false, network: null })
        }
      } catch {
        if (!isMounted) return
        setServerStatus({ online: false, network: null })
      }
    }

    // Single check on mount - NO POLLING
    checkServer()
    
    return () => {
      isMounted = false
    }
  }, [fetchMediaList])

  // Refresh entitlements and media list after successful payment
  useEffect(() => {
    if (paymentStatus === 'success') {
      console.log('[App] Payment success, refreshing entitlements and media list...')
      fetchEntitlements()
      fetchMediaList(true) // Immediate fetch after payment
      // Force re-render media components to fetch new stream tokens
      setMediaKey(prev => prev + 1)
    }
  }, [paymentStatus, fetchEntitlements, fetchMediaList])

  // Auto-authenticate when wallet is connected but not authenticated
  // This runs immediately when walletAddress changes (after connect or reconnect)
  // BUT: Don't authenticate if we're verifying an existing session (to avoid duplicate sign requests)
  useEffect(() => {
    const walletChanged = previousWalletAddress.current !== walletAddress
    const walletJustConnected = walletChanged && walletAddress !== null && previousWalletAddress.current === null
    
    // Don't auto-authenticate if:
    // 1. We're already authenticated
    // 2. We're currently authenticating
    // 3. We're verifying an existing session (to avoid duplicate sign requests on page refresh)
    // 4. Server is offline
    if (walletJustConnected || (walletAddress && !isAuthenticated && !isAuthenticating && !isVerifyingSession && serverStatus.online)) {
      console.log('[App] Wallet connected, auto-authenticating...', walletAddress, 'walletJustConnected:', walletJustConnected)
      let cancelled = false
      
      authenticate(walletAddress!)
        .then((success) => {
          if (cancelled) return
          if (success) {
            console.log('[App] Auto-authentication successful, refreshing media list...')
            // Refresh media list after authentication (debounced)
            if (!cancelled) {
              fetchMediaList()
            }
          } else {
            console.log('[App] Auto-authentication failed')
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.error('[App] Auto-authentication error:', err)
          }
        })
      
      previousWalletAddress.current = walletAddress
      
      return () => {
        cancelled = true
      }
    } else if (walletChanged) {
      // Update ref even if we don't authenticate (e.g., wallet disconnected)
      previousWalletAddress.current = walletAddress
    }
  }, [walletAddress, isAuthenticated, isAuthenticating, isVerifyingSession, authenticate, serverStatus.online, fetchMediaList])

  // Refresh media list when session changes (connect/disconnect) or after authentication
  // Combined with verification check to avoid duplicate fetches
  useEffect(() => {
    if (!serverStatus.online) return

    // Only fetch if:
    // 1. Session verification is complete (not verifying)
    // 2. We have a clear authenticated state
    if (!isVerifyingSession) {
      if (isAuthenticated) {
        console.log('[App] Session authenticated, refreshing media list. isAuthenticated:', isAuthenticated)
      } else {
        console.log('[App] Session disconnected, refreshing media list without header')
      }
      // Debounced fetch - will combine multiple rapid changes
      fetchMediaList()
    }
  }, [isAuthenticated, isVerifyingSession, fetchMediaList, serverStatus.online])

  // Handle wallet connect - authentication will happen automatically via useEffect
  const handleConnect = async () => {
    await connectWallet()
    // Authentication will be triggered by useEffect when walletAddress changes
  }

  // Handle disconnect - clear both wallet and session
  const handleDisconnect = () => {
    sessionLogout()
    disconnectWallet()
    // Refresh media list without session header (debounced)
    fetchMediaList()
  }

  // Check if user has access to media - prioritize hasAccess from API response
  // If hasAccess is undefined (not yet loaded), fallback to entitlements check
  const videoMedia = mediaList.find(m => m.id === 'video')
  const imageMedia = mediaList.find(m => m.id === 'image')
  const hasVideoAccess = videoMedia?.hasAccess !== undefined 
    ? videoMedia.hasAccess 
    : hasAccessTo('video')
  const hasImageAccess = imageMedia?.hasAccess !== undefined 
    ? imageMedia.hasAccess 
    : hasAccessTo('image')

  const handlePaymentRequest = async (mediaType: 'video' | 'image') => {
    setCurrentMediaType(mediaType)
    
    if (!walletAddress) {
      await handleConnect()
      return
    }

    // If not authenticated, authenticate first
    if (!isAuthenticated) {
      const success = await authenticate(walletAddress)
      if (!success) {
        return
      }
    }

    await requestPayment(mediaType, getSessionHeader())
    setShowPaymentModal(true)
  }

  const handlePaymentExecute = async () => {
    await executePayment(getSessionHeader())
  }

  const handlePaymentCancel = () => {
    setShowPaymentModal(false)
    setCurrentMediaType(null)
    resetPayment()
  }

  const handlePlanSelect = (plan: PlanType) => {
    setSelectedPlan(plan)
  }

  return (
    <div className="app">
      {/* Inject plan selector styles */}
      <style>{planSelectorStyles}</style>
      
      <header className="app-header">
        <div className="header-top">
          <h1>x402 Payment Demo</h1>
          <WalletConnect
            walletAddress={walletAddress}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            isConnecting={paymentStatus === 'connecting' || isAuthenticating}
          />
        </div>
        <p className="description">
          Demo x402 protocol with USDC payments on Base Sepolia.
          {isAuthenticated ? (
            <> Authenticated</>
          ) : (
            <> Connect wallet to unlock premium content.</>
          )}
        </p>
        <div className="status-badges">
          <div className="status-badge">
            <span className={`status-dot ${serverStatus.online === null ? 'checking' : serverStatus.online ? 'online' : 'offline'}`}></span>
            {serverStatus.online === null ? 'Connecting...' : serverStatus.online ? (
              serverStatus.network?.includes('84532') || serverStatus.network?.includes('sepolia') 
                ? 'Base Sepolia' 
                : serverStatus.network?.includes('8453') || serverStatus.network === 'base'
                  ? 'Base Mainnet'
                  : serverStatus.network || 'Connected'
            ) : 'Server Offline'}
          </div>
          {isAuthenticated && (
            <div className="status-badge authenticated">
              <span className="status-dot online"></span>
              Session Active
            </div>
          )}
        </div>
      </header>

      <main className="demo-container">
        <div className="media-section">
          <h2>Video</h2>
          {hasVideoAccess && (
            <p className="price-tag">
              <span className="access-badge">Access Granted</span>
            </p>
          )}
          <SecureVideoPlayer
            key={`video-${mediaKey}`}
            assetId="video"
            isLocked={!hasVideoAccess}
            hasAccess={hasVideoAccess}
            onPaymentRequest={() => handlePaymentRequest('video')}
            serverOnline={serverStatus.online}
            getSessionHeader={getSessionHeader}
            previewUrl={mediaList.find(m => m.id === 'video')?.previewUrl}
          />
        </div>

        <div className="media-section">
          <h2>Image</h2>
          {hasImageAccess && (
            <p className="price-tag">
              <span className="access-badge">Access Granted</span>
            </p>
          )}
          <SecureImageViewer
            key={`image-${mediaKey}`}
            assetId="image"
            isLocked={!hasImageAccess}
            hasAccess={hasImageAccess}
            onPaymentRequest={() => handlePaymentRequest('image')}
            serverOnline={serverStatus.online}
            getSessionHeader={getSessionHeader}
            previewUrl={mediaList.find(m => m.id === 'image')?.previewUrl}
          />
        </div>
      </main>

      <PaymentModal
        show={showPaymentModal}
        paymentRequirements={paymentRequirements}
        paymentStatus={paymentStatus}
        walletAddress={walletAddress}
        transactionHash={transactionHash}
        error={error}
        onPayment={handlePaymentExecute}
        onCancel={handlePaymentCancel}
        onConnectWallet={handleConnect}
        pricing={pricing}
        selectedPlan={selectedPlan}
        onPlanSelect={handlePlanSelect}
      />
    </div>
  )
}

export default App
