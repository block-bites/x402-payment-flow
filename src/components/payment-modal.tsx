import { PaymentRequirements, formatUsdcAmount } from '../config/x402-config'
import { PaymentStatus, PlanType, PlanPricing } from '../hooks/use-x402-payment'
import PlanSelector from './plan-selector'
import './payment-modal.css'

interface PaymentModalProps {
  show: boolean
  paymentRequirements: PaymentRequirements | null
  paymentStatus: PaymentStatus
  walletAddress: string | null
  transactionHash: string | null
  error: string | null
  onPayment: () => void
  onCancel: () => void
  onConnectWallet: () => void
  // New props for plan selection
  pricing?: PlanPricing | null
  selectedPlan?: PlanType
  onPlanSelect?: (plan: PlanType) => void
}

function PaymentModal({
  show,
  paymentRequirements,
  paymentStatus,
  walletAddress,
  transactionHash,
  error,
  onPayment,
  onCancel,
  onConnectWallet,
  pricing,
  selectedPlan = '24h',
  onPlanSelect
}: PaymentModalProps) {
  if (!show) return null

  const isProcessing = ['signing', 'settling', 'requesting'].includes(paymentStatus)
  const isSuccess = paymentStatus === 'success'
  const isError = paymentStatus === 'error'

  const getNetworkName = (network: string): string => {
    if (network === 'eip155:84532' || network === 'base-sepolia') return 'Base Sepolia'
    if (network === 'eip155:8453' || network === 'base') return 'Base'
    return network
  }

  const getExplorerUrl = (network: string, txHash: string): string => {
    if (network === 'eip155:84532' || network === 'base-sepolia') {
      return `https://sepolia.basescan.org/tx/${txHash}`
    }
    if (network === 'eip155:8453' || network === 'base') {
      return `https://basescan.org/tx/${txHash}`
    }
    return '#'
  }

  const getStepStatus = (step: number) => {
    if (isSuccess) return 'complete'
    if (isError) return step <= getCurrentStep() ? 'error' : 'pending'
    
    const current = getCurrentStep()
    if (step < current) return 'complete'
    if (step === current) return 'active'
    return 'pending'
  }

  const getCurrentStep = () => {
    switch (paymentStatus) {
      case 'requesting': return 1
      case 'signing': return 2
      case 'settling': return 3
      case 'success': return 4
      case 'error': return 2
      default: return 1
    }
  }

  // Get display amount based on selected plan
  const getDisplayAmount = (): string => {
    if (pricing && pricing[selectedPlan]) {
      return pricing[selectedPlan].priceFormatted
    }
    if (paymentRequirements) {
      return formatUsdcAmount(paymentRequirements.amount)
    }
    return '$0.00'
  }

  // Default pricing if not provided
  const displayPricing: PlanPricing = pricing || {
    '24h': { price: 0.01, priceFormatted: '$0.01', amount: '10000' },
    '7d': { price: 0.05, priceFormatted: '$0.05', amount: '50000' }
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div className="modal-title">
            <span className="protocol-badge">x402</span>
            <h2>
              {isSuccess ? 'Payment Complete' : isError ? 'Payment Failed' : 'Payment Required'}
            </h2>
          </div>
          <button className="close-button" onClick={onCancel}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Amount Display */}
        <div className={`amount-display ${isSuccess ? 'success' : isError ? 'error' : ''}`}>
          <div className="amount-value">
            {getDisplayAmount()}
          </div>
          <div className="amount-currency">USDC</div>
          {!isProcessing && !isSuccess && !isError && (
            <div className="plan-duration-badge">
              {selectedPlan === '24h' ? '24 Hour Access' : '7 Day Access'}
            </div>
          )}
        </div>

        {/* Plan Selector - show only when not processing */}
        {!isProcessing && !isSuccess && !isError && walletAddress && onPlanSelect && (
          <PlanSelector
            pricing={displayPricing}
            selectedPlan={selectedPlan}
            onPlanSelect={onPlanSelect}
            disabled={isProcessing}
          />
        )}

        {/* Progress Steps */}
        <div className="progress-steps">
          <div className={`step ${getStepStatus(1)}`}>
            <div className="step-indicator">
              {getStepStatus(1) === 'complete' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : getStepStatus(1) === 'active' ? (
                <div className="step-spinner"></div>
              ) : (
                <span>1</span>
              )}
            </div>
            <div className="step-label">Request</div>
          </div>

          <div className="step-line"></div>

          <div className={`step ${getStepStatus(2)}`}>
            <div className="step-indicator">
              {getStepStatus(2) === 'complete' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : getStepStatus(2) === 'active' ? (
                <div className="step-spinner"></div>
              ) : getStepStatus(2) === 'error' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              ) : (
                <span>2</span>
              )}
            </div>
            <div className="step-label">Sign</div>
          </div>

          <div className="step-line"></div>

          <div className={`step ${getStepStatus(3)}`}>
            <div className="step-indicator">
              {getStepStatus(3) === 'complete' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : getStepStatus(3) === 'active' ? (
                <div className="step-spinner"></div>
              ) : (
                <span>3</span>
              )}
            </div>
            <div className="step-label">Settle</div>
          </div>

          <div className="step-line"></div>

          <div className={`step ${getStepStatus(4)}`}>
            <div className="step-indicator">
              {getStepStatus(4) === 'complete' ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                <span>4</span>
              )}
            </div>
            <div className="step-label">Done</div>
          </div>
        </div>

        {/* Status Message */}
        <div className="status-section">
          {paymentStatus === 'requesting' && (
            <div className="status-message">
              <div className="status-icon requesting"></div>
              <span>Fetching payment requirements...</span>
            </div>
          )}

          {paymentStatus === 'signing' && (
            <div className="status-message">
              <div className="status-icon signing"></div>
              <div className="status-text">
                <span className="status-title">Waiting for signature</span>
                <span className="status-desc">Please sign the authorization in your wallet</span>
              </div>
            </div>
          )}

          {paymentStatus === 'settling' && (
            <div className="status-message">
              <div className="status-icon settling"></div>
              <div className="status-text">
                <span className="status-title">Processing payment</span>
                <span className="status-desc">Settling transaction on-chain...</span>
              </div>
            </div>
          )}

          {isSuccess && (
            <div className="status-message success">
              <div className="status-icon success">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <polyline points="16 10 11 15 8 12"></polyline>
                </svg>
              </div>
              <div className="status-text">
                <span className="status-title">Payment successful!</span>
                <span className="status-desc">Your {selectedPlan === '24h' ? '24 hour' : '7 day'} access has been activated</span>
              </div>
            </div>
          )}

          {isError && (
            <div className="status-message error">
              <div className="status-icon error">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="15" y1="9" x2="9" y2="15"></line>
                  <line x1="9" y1="9" x2="15" y2="15"></line>
                </svg>
              </div>
              <div className="status-text">
                <span className="status-title">Payment failed</span>
                <span className="status-desc">{error || 'An error occurred'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Transaction Details */}
        {paymentRequirements && !isProcessing && !isSuccess && !isError && (
          <div className="details-section">
            <div className="detail-item">
              <span className="detail-label">Network</span>
              <span className="detail-value">
                <span className="network-indicator"></span>
                {getNetworkName(paymentRequirements.network)}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Recipient</span>
              <span className="detail-value mono">
                {paymentRequirements.payTo.slice(0, 6)}...{paymentRequirements.payTo.slice(-4)}
              </span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Protocol</span>
              <span className="detail-value">EIP-3009</span>
            </div>
          </div>
        )}

        {/* Transaction Link */}
        {isSuccess && transactionHash && paymentRequirements && (
          <div className="tx-section">
            <a
              href={getExplorerUrl(paymentRequirements.network, transactionHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="tx-link"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
              View on Explorer
            </a>
          </div>
        )}

        {/* Actions */}
        <div className="actions-section">
          {!walletAddress && !isProcessing && !isSuccess && (
            <button className="btn-primary full" onClick={onConnectWallet}>
              Connect Wallet
            </button>
          )}

          {walletAddress && !isProcessing && !isSuccess && !isError && paymentRequirements && (
            <>
              <button className="btn-secondary" onClick={onCancel}>
                Cancel
              </button>
              <button className="btn-primary" onClick={onPayment}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect>
                  <line x1="1" y1="10" x2="23" y2="10"></line>
                </svg>
                Pay {displayPricing[selectedPlan].priceFormatted}
              </button>
            </>
          )}

          {isError && (
            <button className="btn-primary full" onClick={onCancel}>
              Try Again
            </button>
          )}

          {isSuccess && (
            <button className="btn-success full" onClick={onCancel}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              Continue
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default PaymentModal
