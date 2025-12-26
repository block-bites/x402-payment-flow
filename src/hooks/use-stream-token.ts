import { useState, useCallback, useRef } from 'react'
import { API_URL } from '../config/x402-config'

export interface SignedUrlData {
  url: string // Direct Supabase signed URL
  expiresIn: number // seconds (default 300 = 5 min)
  mediaType: 'video' | 'image'
  mimeType: string
  fetchedAt: number // timestamp
}

export interface UseStreamTokenResult {
  streamToken: SignedUrlData | null
  streamUrl: string | null
  isLoading: boolean
  error: string | null
  
  fetchStreamToken: (assetId: string) => Promise<string | null>
  refreshToken: () => Promise<string | null>
  clearToken: () => void
  isTokenValid: () => boolean
}

// URL is valid if it has more than 30 seconds left (signed URLs last 5 min)
const URL_VALIDITY_MARGIN = 30 * 1000 // 30 seconds in ms

export const useStreamToken = (
  getSessionHeader: () => Record<string, string>
): UseStreamTokenResult => {
  const [streamToken, setStreamToken] = useState<SignedUrlData | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentAssetId = useRef<string | null>(null)
  const isFetching = useRef(false) // Prevent concurrent fetches

  // Check if current signed URL is still valid
  const isTokenValid = useCallback((): boolean => {
    if (!streamToken) return false
    
    const now = Date.now()
    const expiresAt = streamToken.fetchedAt + (streamToken.expiresIn * 1000)
    return expiresAt - now > URL_VALIDITY_MARGIN
  }, [streamToken])

  // Stream URL is now the direct Supabase signed URL
  const streamUrl = streamToken?.url || null

  // Fetch signed URL from new endpoint
  const fetchStreamToken = useCallback(async (assetId: string): Promise<string | null> => {
    // Prevent concurrent fetches
    if (isFetching.current) {
      console.log('[StreamAccess] Already fetching, skipping...')
      return null
    }

    const sessionHeader = getSessionHeader()
    
    if (!sessionHeader['X-Wallet-Session']) {
      setError('Not authenticated')
      return null
    }

    isFetching.current = true
    setIsLoading(true)
    setError(null)

    try {
      console.log('[StreamAccess] Fetching signed URL for:', assetId)
      
      // NEW API: /stream/access/:assetId (returns signed URL directly)
      const res = await fetch(`${API_URL}/stream/access/${assetId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...sessionHeader
        }
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to get stream access')
      }

      const data = await res.json()
      
      if (!data.success || !data.url) {
        throw new Error(data.error || 'No signed URL received')
      }

      const signedUrlData: SignedUrlData = {
        url: data.url, // Direct Supabase signed URL
        expiresIn: data.expiresIn || 300, // 5 minutes default
        mediaType: data.mediaType,
        mimeType: data.mimeType,
        fetchedAt: Date.now()
      }

      console.log('[StreamAccess] Got signed URL, expires in:', signedUrlData.expiresIn, 'seconds')
      
      setStreamToken(signedUrlData)
      currentAssetId.current = assetId

      // Return the direct Supabase URL (no proxy needed!)
      return signedUrlData.url
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Stream access error'
      console.error('[StreamAccess] Error:', errorMessage)
      setError(errorMessage)
      return null
    } finally {
      setIsLoading(false)
      isFetching.current = false
    }
  }, [getSessionHeader])

  // Refresh signed URL - only when explicitly called
  const refreshToken = useCallback(async (): Promise<string | null> => {
    if (!currentAssetId.current) {
      setError('No asset to refresh')
      return null
    }
    // Clear current URL first to force re-fetch
    setStreamToken(null)
    return fetchStreamToken(currentAssetId.current)
  }, [fetchStreamToken])

  // Clear token/URL
  const clearToken = useCallback(() => {
    setStreamToken(null)
    currentAssetId.current = null
    setError(null)
    isFetching.current = false
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
