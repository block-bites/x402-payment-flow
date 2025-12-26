import { useState, useEffect } from 'react'
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

  // Wallet session hook for authentication
  const {
    session,
    isAuthenticated,
    isAuthenticating,
    entitlements,
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

  // Fetch media list from API
  const fetchMediaList = async () => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const sessionHeader = getSessionHeader()
      if (sessionHeader['X-Wallet-Session']) {
        headers['X-Wallet-Session'] = sessionHeader['X-Wallet-Session']
      }
      
      const response = await fetch(`${API_URL}/media`, { headers })
      if (response.ok) {
        const data = await response.json()
        if (data.media) {
          setMediaList(data.media)
        }
      }
    } catch (err) {
      console.error('[App] Failed to fetch media list:', err)
    }
  }

  // Check server status
  useEffect(() => {
    let wasOffline = serverStatus.online === false || serverStatus.online === null

    const checkServer = async () => {
      try {
        const response = await fetch(`${API_URL}/health`, { 
          method: 'GET',
          signal: AbortSignal.timeout(3000)
        })
        if (response.ok) {
          const data = await response.json()
          const network = data?.payment?.network || data?.network || null
          
          // If server just came online, refresh media components
          if (wasOffline) {
            setMediaKey(prev => prev + 1)
            fetchMediaList()
          }
          
          setServerStatus({ online: true, network })
          wasOffline = false
        } else {
          setServerStatus({ online: false, network: null })
          wasOffline = true
        }
      } catch {
        setServerStatus({ online: false, network: null })
        wasOffline = true
      }
    }

    checkServer()
    fetchMediaList()
    const interval = setInterval(checkServer, 5000)
    return () => clearInterval(interval)
  }, [])

  // Auto-authenticate when wallet connects
  useEffect(() => {
    if (walletAddress && !isAuthenticated && !isAuthenticating) {
      // Check if session exists for this wallet
      if (!session || session.walletAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        console.log('[App] Wallet connected, authenticating...')
        authenticate(walletAddress)
      }
    }
  }, [walletAddress, isAuthenticated, isAuthenticating, session, authenticate])

  // Refresh entitlements after successful payment
  useEffect(() => {
    if (paymentStatus === 'success') {
      console.log('[App] Payment success, refreshing entitlements...')
      fetchEntitlements()
      // Force re-render media components to fetch new stream tokens
      setMediaKey(prev => prev + 1)
    }
  }, [paymentStatus, fetchEntitlements])

  // Handle wallet connect with authentication
  const handleConnect = async () => {
    await connectWallet()
  }

  // Handle disconnect - clear both wallet and session
  const handleDisconnect = () => {
    sessionLogout()
    disconnectWallet()
  }

  // Check if user has access to media
  const hasVideoAccess = hasAccessTo('video')
  const hasImageAccess = hasAccessTo('image')

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

  // Get display price based on selected plan
  const getDisplayPrice = () => {
    if (pricing) {
      return pricing[selectedPlan].priceFormatted
    }
    return '$0.01'
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
            <> Authenticated • {entitlements.length} active entitlement{entitlements.length !== 1 ? 's' : ''}</>
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
          <p className="price-tag">
            {hasVideoAccess ? (
              <span className="access-badge">Access Granted</span>
            ) : (
              <>{getDisplayPrice()} USDC</>
            )}
          </p>
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
          <p className="price-tag">
            {hasImageAccess ? (
              <span className="access-badge">Access Granted</span>
            ) : (
              <>{getDisplayPrice()} USDC</>
            )}
          </p>
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

      {/* Entitlements list */}
      {isAuthenticated && entitlements.length > 0 && (
        <section className="entitlements-section">
          <h3>Your Purchases</h3>
          <div className="entitlements-list">
            {entitlements.map((ent) => (
              <div key={ent.id} className="entitlement-item">
                <span className="entitlement-asset">{ent.assetId}</span>
                <span className="entitlement-plan">{ent.planType}</span>
                <span className="entitlement-expires">
                  Expires: {new Date(ent.expiresAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

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
