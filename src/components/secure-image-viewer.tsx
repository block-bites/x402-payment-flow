import { useState, useEffect, useRef, useCallback } from 'react'
import { useStreamToken } from '../hooks/use-stream-token'

interface SecureImageViewerProps {
  assetId: string
  isLocked: boolean
  hasAccess: boolean
  onPaymentRequest: () => void
  serverOnline?: boolean | null
  getSessionHeader: () => Record<string, string>
  previewUrl?: string // Direct Supabase URL for preview (from /media API)
}

const SecureImageViewer: React.FC<SecureImageViewerProps> = ({
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
  const hasTriedFetch = useRef(false)
  
  const { 
    streamUrl, 
    fetchStreamToken, 
    clearToken 
  } = useStreamToken(getSessionHeader)

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
  }, [hasAccess, isLocked, assetId]) // Removed dependencies that cause loops

  const handleClick = useCallback((): void => {
    if (isLocked && serverOnline) {
      onPaymentRequest()
    }
  }, [isLocked, serverOnline, onPaymentRequest])

  // Use previewUrl from props (from /media API), no fallback fetch needed
  // Use stream URL when unlocked and available, otherwise preview
  const imageSrc = !isLocked && streamUrl ? streamUrl : (previewUrl || '')

  const showPlaceholder = serverOnline === false || hasError || !imageSrc
  const showLoading = isLoadingStream && hasAccess && !isLocked

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
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <circle cx="8.5" cy="8.5" r="1.5"/>
            <polyline points="21 15 16 10 5 21"/>
          </svg>
          <span>{serverOnline === false ? 'Server Offline' : 'Loading...'}</span>
        </div>
      ) : showLoading ? (
        <div className="media-placeholder loading">
          <div className="loading-spinner"></div>
          <span>Loading secure image...</span>
        </div>
      ) : (
        <img
          src={imageSrc}
          alt="Premium content"
          className={`image-viewer ${isLocked ? 'blurred' : ''}`}
          onError={() => setHasError(true)}
          onLoad={() => setHasError(false)}
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          draggable={false}
        />
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

export default SecureImageViewer
