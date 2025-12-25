import { useState, useCallback, useEffect } from 'react'
import { 
  API_URL, 
  MEDIA_IDS,
  PaymentRequirements,
  PaymentRequiredResponse,
  PaymentSuccessResponse,
  SignedPaymentPayload
} from '../config/x402-config'

export type PaymentStatus = 'idle' | 'connecting' | 'requesting' | 'signing' | 'settling' | 'success' | 'error'
export type PlanType = '24h' | '7d'

export interface PlanPricing {
  '24h': {
    price: number
    priceFormatted: string
    amount: string // raw amount in smallest unit
  }
  '7d': {
    price: number
    priceFormatted: string
    amount: string
  }
}

export interface UseX402PaymentResult {
  paymentStatus: PaymentStatus
  paymentRequirements: PaymentRequirements | null
  walletAddress: string | null
  mediaUrl: string | null
  transactionHash: string | null
  error: string | null
  pricing: PlanPricing | null
  selectedPlan: PlanType
  entitlementId: string | null
  connectWallet: () => Promise<void>
  disconnectWallet: () => void
  requestPayment: (mediaType: 'video' | 'image', sessionHeader?: Record<string, string>) => Promise<PaymentRequirements | null>
  executePayment: (sessionHeader?: Record<string, string>) => Promise<boolean>
  resetPayment: () => void
  setSelectedPlan: (plan: PlanType) => void
}

// EIP-712 types for TransferWithAuthorization (EIP-3009)
const TRANSFER_AUTH_TYPES = {
  TransferWithAuthorization: [
    { name: 'from', type: 'address' },
    { name: 'to', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'validAfter', type: 'uint256' },
    { name: 'validBefore', type: 'uint256' },
    { name: 'nonce', type: 'bytes32' },
  ],
}

// Generate random nonce (32 bytes)
function generateNonce(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return '0x' + Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Get chain ID from network string (e.g., "eip155:84532" -> 84532)
function getChainIdFromNetwork(network: string): number {
  if (network.startsWith('eip155:')) {
    return parseInt(network.split(':')[1], 10)
  }
  // Fallback for legacy names
  const networkMap: Record<string, number> = {
    'base-sepolia': 84532,
    'base': 8453,
  }
  return networkMap[network] || 84532
}

// Convert price to raw amount (6 decimals for USDC)
function priceToAmount(price: number): string {
  return String(Math.round(price * 1_000_000))
}

export const useX402Payment = (): UseX402PaymentResult => {
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('idle')
  const [paymentRequirements, setPaymentRequirements] = useState<PaymentRequirements | null>(null)
  const [currentMediaType, setCurrentMediaType] = useState<'video' | 'image' | null>(null)
  const [resourceInfo, setResourceInfo] = useState<{ description: string; mimeType: string } | null>(null)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [pricing, setPricing] = useState<PlanPricing | null>(null)
  const [selectedPlan, setSelectedPlan] = useState<PlanType>('24h')
  const [entitlementId, setEntitlementId] = useState<string | null>(null)
  
  // Check if user manually disconnected (don't auto-connect in that case)
  const wasManuallyDisconnected = sessionStorage.getItem('x402_disconnected') === 'true'
  const [mediaUrl, setMediaUrl] = useState<string | null>(null)
  const [transactionHash, setTransactionHash] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Store session header for use in executePayment
  const [currentSessionHeader, setCurrentSessionHeader] = useState<Record<string, string>>({})

  // Auto-connect on mount if user didn't manually disconnect
  useEffect(() => {
    if (!window.ethereum || wasManuallyDisconnected) return

    window.ethereum.request({ method: 'eth_accounts' })
      .then((accounts) => {
        const accountList = accounts as string[]
        if (accountList.length > 0) {
          setWalletAddress(accountList[0])
        }
      })
      .catch(() => {
        // Ignore errors
      })
  }, [wasManuallyDisconnected])

  // Listen for account changes
  useEffect(() => {
    if (!window.ethereum) return

    const handleAccountsChanged = (accounts: unknown) => {
      const accountList = accounts as string[]
      if (accountList.length > 0) {
        setWalletAddress(accountList[0])
        // User connected again, clear disconnect flag
        sessionStorage.removeItem('x402_disconnected')
      } else if (walletAddress) {
        // User disconnected from dapp connections
        setWalletAddress(null)
      }
    }

    window.ethereum.on?.('accountsChanged', handleAccountsChanged)

    return () => {
      window.ethereum?.removeListener?.('accountsChanged', handleAccountsChanged)
    }
  }, [walletAddress])

  // Connect wallet
  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setError('No wallet found. Install MetaMask or Coinbase Wallet.')
      return
    }

    try {
      setPaymentStatus('connecting')
      setError(null)

      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      }) as string[]

      if (accounts.length === 0) {
        throw new Error('No account selected')
      }

      setWalletAddress(accounts[0])
      // Clear disconnect flag when user manually connects
      sessionStorage.removeItem('x402_disconnected')
      setPaymentStatus('idle')
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Wallet connection error'
      setError(errorMessage)
      setPaymentStatus('error')
    }
  }, [])

  // Disconnect wallet
  const disconnectWallet = useCallback(() => {
    setWalletAddress(null)
    setPaymentRequirements(null)
    setMediaUrl(null)
    setTransactionHash(null)
    setPaymentStatus('idle')
    setError(null)
    setPricing(null)
    setEntitlementId(null)
    // Mark as manually disconnected so we don't auto-connect on refresh
    sessionStorage.setItem('x402_disconnected', 'true')
  }, [])

  // Request payment (get 402 response from backend)
  const requestPayment = useCallback(async (
    mediaType: 'video' | 'image',
    sessionHeader: Record<string, string> = {}
  ): Promise<PaymentRequirements | null> => {
    setPaymentStatus('requesting')
    setError(null)
    setCurrentMediaType(mediaType)
    setCurrentSessionHeader(sessionHeader)

    try {
      const mediaId = MEDIA_IDS[mediaType]
      const response = await fetch(`${API_URL}/media/${mediaId}/access`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...sessionHeader
        },
        body: JSON.stringify({
          planType: selectedPlan
        })
      })

      if (response.status === 402) {
        const data: PaymentRequiredResponse = await response.json()
        
        console.log('x402 Payment Required (HTTP 402):', data)
        
        // Extract pricing from response
        const pricingData = (data as any).pricing
        if (pricingData) {
          setPricing({
            '24h': {
              price: pricingData['24h']?.price || 0.01,
              priceFormatted: pricingData['24h']?.priceFormatted || '$0.01',
              amount: priceToAmount(pricingData['24h']?.price || 0.01)
            },
            '7d': {
              price: pricingData['7d']?.price || 0.05,
              priceFormatted: pricingData['7d']?.priceFormatted || '$0.05',
              amount: priceToAmount(pricingData['7d']?.price || 0.05)
            }
          })
        }
        
        const requirements = data.paymentRequired.accepts[0]
        setPaymentRequirements(requirements)
        setResourceInfo(data.paymentRequired.resource)
        setPaymentStatus('idle')
        
        return requirements
      } else if (response.ok) {
        // Already have access
        const data: PaymentSuccessResponse = await response.json()
        setMediaUrl(data.mediaUrl)
        setPaymentStatus('success')
        return null
      } else {
        throw new Error('Failed to get payment requirements')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Request error'
      setError(errorMessage)
      setPaymentStatus('error')
      return null
    }
  }, [selectedPlan])

  // Execute payment (sign EIP-3009 authorization and submit to backend)
  const executePayment = useCallback(async (
    sessionHeader: Record<string, string> = {}
  ): Promise<boolean> => {
    if (!window.ethereum || !walletAddress || !paymentRequirements || !currentMediaType || !resourceInfo) {
      setError('Missing wallet or payment requirements')
      return false
    }

    // Use provided session header or stored one
    const headers = Object.keys(sessionHeader).length > 0 ? sessionHeader : currentSessionHeader

    try {
      setPaymentStatus('signing')
      setError(null)

      // Switch to correct network
      const chainId = getChainIdFromNetwork(paymentRequirements.network)
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${chainId.toString(16)}` }]
        })
      } catch (switchError: unknown) {
        const err = switchError as { code: number }
        if (err.code === 4902) {
          // Add network if not exists
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${chainId.toString(16)}`,
              chainName: chainId === 84532 ? 'Base Sepolia' : 'Base',
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: [chainId === 84532 ? 'https://sepolia.base.org' : 'https://mainnet.base.org'],
              blockExplorerUrls: [chainId === 84532 ? 'https://sepolia.basescan.org' : 'https://basescan.org']
            }]
          })
        } else {
          throw switchError
        }
      }

      // Get the correct amount for selected plan
      const paymentAmount = pricing?.[selectedPlan]?.amount || paymentRequirements.amount

      // Build EIP-712 authorization data
      const now = Math.floor(Date.now() / 1000)
      const validBefore = now + paymentRequirements.maxTimeoutSeconds
      const nonce = generateNonce()

      // EIP-712 domain - must match USDC contract exactly
      const domain = {
        name: paymentRequirements.extra?.name || 'USDC',
        version: paymentRequirements.extra?.version || '2',
        chainId: chainId,
        verifyingContract: paymentRequirements.asset,
      }

      // Authorization message - use proper types for EIP-712
      const message = {
        from: walletAddress,
        to: paymentRequirements.payTo,
        value: paymentAmount, // Use plan-specific amount
        validAfter: 0, // number for EIP-712
        validBefore: validBefore, // number for EIP-712
        nonce: nonce, // bytes32
      }

      // Sign EIP-712 typed data
      const typedData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ],
          ...TRANSFER_AUTH_TYPES,
        },
        primaryType: 'TransferWithAuthorization',
        domain: domain,
        message: message,
      }

      console.log('EIP-712 Typed Data:', JSON.stringify(typedData, null, 2))

      const signature = await window.ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [walletAddress, JSON.stringify(typedData)]
      }) as string

      console.log('EIP-712 Signature:', signature)

      // Build signed payload for backend - use string format for authorization
      const authorization = {
        from: walletAddress,
        to: paymentRequirements.payTo,
        value: paymentAmount,
        validAfter: '0',
        validBefore: String(validBefore),
        nonce: nonce,
      }

      // Update requirements with correct amount for payload
      const updatedRequirements = {
        ...paymentRequirements,
        amount: paymentAmount
      }

      const signedPayload: SignedPaymentPayload = {
        x402Version: 2,
        resource: resourceInfo,
        accepted: updatedRequirements,
        payload: {
          signature: signature,
          authorization: authorization,
        }
      }

      // Submit to backend
      setPaymentStatus('settling')

      const mediaId = MEDIA_IDS[currentMediaType]
      const response = await fetch(`${API_URL}/media/${mediaId}/access`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...headers
        },
        body: JSON.stringify({
          planType: selectedPlan,
          message: {
            parts: [{ kind: 'text', text: `Request access to ${mediaId}` }],
            metadata: {
              'x402.payment.payload': signedPayload,
              'x402.payment.status': 'payment-submitted'
            }
          }
        })
      })

      const data = await response.json()

      if (response.ok && data.success) {
        console.log('x402 Payment Success:', data)
        setMediaUrl(data.mediaUrl)
        setTransactionHash(data.settlement?.transaction || null)
        setEntitlementId(data.entitlement?.id || null)
        setPaymentStatus('success')
        return true
      } else {
        throw new Error(data.error || data.reason || 'Payment failed')
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Payment error'
      setError(errorMessage)
      setPaymentStatus('error')
      return false
    }
  }, [walletAddress, paymentRequirements, currentMediaType, resourceInfo, pricing, selectedPlan, currentSessionHeader])

  // Reset payment state
  const resetPayment = useCallback(() => {
    setPaymentRequirements(null)
    setResourceInfo(null)
    setCurrentMediaType(null)
    setMediaUrl(null)
    setTransactionHash(null)
    setPaymentStatus('idle')
    setError(null)
    setEntitlementId(null)
    // Keep pricing and selectedPlan for next purchase
  }, [])

  return {
    paymentStatus,
    paymentRequirements,
    walletAddress,
    mediaUrl,
    transactionHash,
    error,
    pricing,
    selectedPlan,
    entitlementId,
    connectWallet,
    disconnectWallet,
    requestPayment,
    executePayment,
    resetPayment,
    setSelectedPlan
  }
}
