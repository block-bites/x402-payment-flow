import { useState, useEffect, useRef } from 'react'
import { API_URL } from '../config/x402-config'
import { useStreamToken } from '../hooks/use-stream-token'

interface SecureVideoPlayerProps {
  assetId: string
  isLocked: boolean
  hasAccess: boolean
  onPaymentRequest: () => void
  serverOnline?: boolean | null
  getSessionHeader: () => Record<string, string>
  previewUrl?: string // Direct Supabase URL for preview
}

const SecureVideoPlayer: React.FC<SecureVideoPlayerProps> = ({
  assetId,
  isLocked,
  hasAccess,
  onPaymentRequest,
  serverOnline,
  getSessionHeader,
  previewUrl: externalPreviewUrl
}) => {
  const [hasError, setHasError] = useState(false)
  const [isLoadingStream, setIsLoadingStream] = useState(false)
  const [fetchedPreviewUrl, setFetchedPreviewUrl] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  
  const { 
    streamUrl, 
    fetchStreamToken, 
    clearToken,
    isTokenValid,
    refreshToken
  } = useStreamToken(getSessionHeader)

  // Fetch preview URL from API if not provided
  useEffect(() => {
    if (!externalPreviewUrl && isLocked) {
      fetch(`${API_URL}/media/preview/${assetId}`)
        .then(res => res.json())
        .then(data => {
          if (data.previewUrl) {
            setFetchedPreviewUrl(data.previewUrl)
          }
        })
        .catch(err => {
          console.error('[SecureVideo] Failed to fetch preview URL:', err)
        })
    }
  }, [assetId, externalPreviewUrl, isLocked])

  // Fetch stream token when user has access and wants to play
  useEffect(() => {
    if (hasAccess && !isLocked && !streamUrl) {
      setIsLoadingStream(true)
      fetchStreamToken(assetId).finally(() => {
        setIsLoadingStream(false)
      })
    }
    
    // Clear token when locked
    if (isLocked) {
      clearToken()
    }
  }, [hasAccess, isLocked, assetId, fetchStreamToken, clearToken, streamUrl])

  // Handle seeking - refresh token if needed
  const handleSeeking = async () => {
    if (!isTokenValid()) {
      console.log('[SecureVideo] Token expired, refreshing...')
      await refreshToken()
    }
  }

  const handleClick = (): void => {
    if (isLocked && serverOnline) {
      onPaymentRequest()
    }
  }

  // Preview URL - use external, fetched, or fallback
  const previewUrl = externalPreviewUrl || fetchedPreviewUrl || `${API_URL}/media/preview/${assetId}`
  
  // Use stream URL when unlocked and available, otherwise preview
  const videoSrc = !isLocked && streamUrl ? streamUrl : previewUrl

  const showPlaceholder = serverOnline === false || hasError
  const showLoading = isLoadingStream && hasAccess && !isLocked

  return (
    <div 
      className={`media-container ${isLocked ? 'locked' : 'unlocked'}`} 
      onClick={isLocked ? handleClick : undefined}
    >
      {showPlaceholder ? (
        <div className="media-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="20" height="20" rx="2" ry="2"/>
            <polygon points="10 8 16 12 10 16 10 8"/>
          </svg>
          <span>{serverOnline === false ? 'Server Offline' : 'Failed to load'}</span>
        </div>
      ) : showLoading ? (
        <div className="media-placeholder loading">
          <div className="loading-spinner"></div>
          <span>Loading secure stream...</span>
        </div>
      ) : (
        <video
          ref={videoRef}
          controls={!isLocked}
          onError={() => setHasError(true)}
          onLoadedData={() => setHasError(false)}
          onSeeking={handleSeeking}
          className={`video-player ${isLocked ? 'blurred' : ''}`}
          autoPlay={isLocked}
          loop={isLocked}
          muted={isLocked}
          playsInline
          src={videoSrc}
        >
          Your browser does not support video playback.
        </video>
      )}
      
      {isLocked && !showPlaceholder && (
        <div className="paywall-overlay">
          <div className="paywall-content">
            <div className="paywall-icon">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <div className="paywall-text">Premium Content</div>
            <button className="paywall-button">
              <span className="x402-badge">402</span>
              Unlock Video
            </button>
          </div>
        </div>
      )}
      
      {!isLocked && !showPlaceholder && !showLoading && (
        <div className="unlock-badge">Unlocked</div>
      )}
    </div>
  )
}

export default SecureVideoPlayer

