import { useState, useEffect, useRef, useCallback } from 'react'
import { useStreamToken } from '../hooks/use-stream-token'

interface SecureVideoPlayerProps {
  assetId: string
  isLocked: boolean
  hasAccess: boolean
  onPaymentRequest: () => void
  serverOnline?: boolean | null
  getSessionHeader: () => Record<string, string>
  previewUrl?: string // Direct Supabase URL for preview (from /media API)
}

const SecureVideoPlayer: React.FC<SecureVideoPlayerProps> = ({
  assetId,
  isLocked,
  hasAccess,
  onPaymentRequest,
  serverOnline,
  getSessionHeader,
  previewUrl
}) => {
  const [hasError, setHasError] = useState(false)
  const [isLoadingStream, setIsLoadingStream] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const hasTriedFetch = useRef(false)
  
  const { 
    streamUrl, 
    fetchStreamToken, 
    clearToken,
    isTokenValid,
    refreshToken
  } = useStreamToken(getSessionHeader)

  // Reset error when previewUrl changes
  useEffect(() => {
    if (previewUrl) {
      setHasError(false)
    }
  }, [previewUrl])

  // Fetch stream token when user has access - only once
  useEffect(() => {
    if (hasAccess && !isLocked && !streamUrl && !hasTriedFetch.current) {
      hasTriedFetch.current = true
      setIsLoadingStream(true)
      fetchStreamToken(assetId).finally(() => {
        setIsLoadingStream(false)
      })
    }
    
    // Clear token when locked
    if (isLocked) {
      clearToken()
      hasTriedFetch.current = false
    }
  }, [hasAccess, isLocked, assetId]) // Removed streamUrl, fetchStreamToken, clearToken to prevent loops

  // Handle seeking - refresh token if needed
  const handleSeeking = useCallback(async () => {
    if (!isTokenValid()) {
      console.log('[SecureVideo] Token expired, refreshing...')
      await refreshToken()
    }
  }, [isTokenValid, refreshToken])

  const handleClick = useCallback((): void => {
    if (isLocked && serverOnline) {
      onPaymentRequest()
    }
  }, [isLocked, serverOnline, onPaymentRequest])

  // Use previewUrl from props (from /media API), no fallback fetch needed
  // Use stream URL when unlocked and available, otherwise preview
  const videoSrc = !isLocked && streamUrl ? streamUrl : (previewUrl || '')

  // Show placeholder only if server offline, or if we have a src but it failed to load
  const showPlaceholder = serverOnline === false || (hasError && videoSrc)
  const showLoading = isLoadingStream && hasAccess && !isLocked
  
  // If no videoSrc yet (mediaList not loaded), show loading state
  const showWaiting = !videoSrc && !showPlaceholder && isLocked

  return (
    <div 
      className={`media-container ${isLocked ? 'locked' : 'unlocked'}`} 
      onClick={isLocked ? handleClick : undefined}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {showPlaceholder ? (
        <div className="media-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="20" height="20" rx="2" ry="2"/>
            <polygon points="10 8 16 12 10 16 10 8"/>
          </svg>
          <span>{serverOnline === false ? 'Server Offline' : 'Failed to load'}</span>
        </div>
      ) : showWaiting ? (
        <div className="media-placeholder">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2" width="20" height="20" rx="2" ry="2"/>
            <polygon points="10 8 16 12 10 16 10 8"/>
          </svg>
          <span>Loading preview...</span>
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
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          onError={(e) => {
            console.error('[SecureVideo] Video error:', e, 'src:', videoSrc)
            setHasError(true)
          }}
          onLoadedData={() => {
            console.log('[SecureVideo] Video loaded successfully')
            setHasError(false)
          }}
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
              {hasAccess ? 'Watch' : 'Buy'}
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

