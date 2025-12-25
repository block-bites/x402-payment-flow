import { useState, useCallback, useRef, useEffect } from 'react'
import { API_URL } from '../config/x402-config'

export interface StreamToken {
  token: string
  expiresIn: number // seconds
  mediaType: 'video' | 'image'
  mimeType: string
  fetchedAt: number // timestamp
}

export interface UseStreamTokenResult {
  streamToken: StreamToken | null
  streamUrl: string | null
  isLoading: boolean
  error: string | null
  
  fetchStreamToken: (assetId: string) => Promise<string | null>
  refreshToken: () => Promise<string | null>
  clearToken: () => void
  isTokenValid: () => boolean
}

// Token is valid if it has more than 10 seconds left
const TOKEN_VALIDITY_MARGIN = 10 * 1000 // 10 seconds in ms

export const useStreamToken = (
  getSessionHeader: () => Record<string, string>
): UseStreamTokenResult => {
  const [streamToken, setStreamToken] = useState<StreamToken | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentAssetId = useRef<string | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Clear refresh timer on unmount
  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
    }
  }, [])

  // Check if current token is still valid
  const isTokenValid = useCallback((): boolean => {
    if (!streamToken) return false
    
    const now = Date.now()
    const expiresAt = streamToken.fetchedAt + (streamToken.expiresIn * 1000)
    return expiresAt - now > TOKEN_VALIDITY_MARGIN
  }, [streamToken])

  // Build stream URL from token
  const streamUrl = streamToken && currentAssetId.current
    ? `${API_URL}/stream/${currentAssetId.current}?token=${streamToken.token}`
    : null

  // Fetch new stream token
  const fetchStreamToken = useCallback(async (assetId: string): Promise<string | null> => {
    const sessionHeader = getSessionHeader()
    
    if (!sessionHeader['X-Wallet-Session']) {
      setError('Not authenticated')
      return null
    }

    setIsLoading(true)
    setError(null)

    try {
      console.log('[StreamToken] Fetching token for:', assetId)
      
      const res = await fetch(`${API_URL}/stream/access-check/${assetId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...sessionHeader
        }
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to get stream token')
      }

      const data = await res.json()
      
      if (!data.success || !data.streamToken) {
        throw new Error(data.error || 'No stream token received')
      }

      const token: StreamToken = {
        token: data.streamToken,
        expiresIn: data.expiresIn || 120,
        mediaType: data.mediaType,
        mimeType: data.mimeType,
        fetchedAt: Date.now()
      }

      console.log('[StreamToken] Got token, expires in:', token.expiresIn, 'seconds')
      
      setStreamToken(token)
      currentAssetId.current = assetId

      // Set up auto-refresh for long videos (refresh at 75% of token lifetime)
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
      }
      
      const refreshTime = token.expiresIn * 0.75 * 1000 // 75% of lifetime
      refreshTimerRef.current = setTimeout(() => {
        console.log('[StreamToken] Auto-refreshing token...')
        fetchStreamToken(assetId)
      }, refreshTime)

      return `${API_URL}/stream/${assetId}?token=${token.token}`
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Stream token error'
      console.error('[StreamToken] Error:', errorMessage)
      setError(errorMessage)
      return null
    } finally {
      setIsLoading(false)
    }
  }, [getSessionHeader])

  // Refresh current token
  const refreshToken = useCallback(async (): Promise<string | null> => {
    if (!currentAssetId.current) {
      setError('No asset to refresh')
      return null
    }
    return fetchStreamToken(currentAssetId.current)
  }, [fetchStreamToken])

  // Clear token
  const clearToken = useCallback(() => {
    if (refreshTimerRef.current) {
      clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
    setStreamToken(null)
    currentAssetId.current = null
    setError(null)
  }, [])

  return {
    streamToken,
    streamUrl,
    isLoading,
    error,
    fetchStreamToken,
    refreshToken,
    clearToken,
    isTokenValid
  }
}

