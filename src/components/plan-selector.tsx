export type PlanType = '24h' | '7d'

export interface PlanPricing {
  '24h': {
    price: number
    priceFormatted: string
  }
  '7d': {
    price: number
    priceFormatted: string
  }
}

interface PlanSelectorProps {
  pricing: PlanPricing
  selectedPlan: PlanType
  onPlanSelect: (plan: PlanType) => void
  disabled?: boolean
}

const PlanSelector: React.FC<PlanSelectorProps> = ({
  pricing,
  selectedPlan,
  onPlanSelect,
  disabled = false
}) => {
  return (
    <div className="plan-selector">
      <div className="plan-selector-label">Choose access duration:</div>
      <div className="plan-options">
        <button
          className={`plan-option ${selectedPlan === '24h' ? 'selected' : ''}`}
          onClick={() => onPlanSelect('24h')}
          disabled={disabled}
        >
          <div className="plan-duration">24 Hours</div>
          <div className="plan-price">{pricing['24h'].priceFormatted}</div>
          <div className="plan-unit">USDC</div>
        </button>
        
        <button
          className={`plan-option ${selectedPlan === '7d' ? 'selected' : ''}`}
          onClick={() => onPlanSelect('7d')}
          disabled={disabled}
        >
          <div className="plan-duration">7 Days</div>
          <div className="plan-price">{pricing['7d'].priceFormatted}</div>
          <div className="plan-unit">USDC</div>
          {pricing['7d'].price < pricing['24h'].price * 7 && (
            <div className="plan-badge">Best Value</div>
          )}
        </button>
      </div>
    </div>
  )
}

// Styles for plan selector
export const planSelectorStyles = `
.plan-selector {
  margin: 1rem 0;
}

.plan-selector-label {
  font-size: 0.875rem;
  color: var(--text-secondary, #888);
  margin-bottom: 0.75rem;
}

.plan-options {
  display: flex;
  gap: 0.75rem;
}

.plan-option {
  flex: 1;
  padding: 1rem;
  border: 2px solid var(--border-color, #333);
  border-radius: 12px;
  background: var(--bg-secondary, #1a1a1a);
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
  text-align: center;
}

.plan-option:hover:not(:disabled) {
  border-color: var(--accent-color, #646cff);
  background: var(--bg-hover, #222);
}

.plan-option.selected {
  border-color: var(--accent-color, #646cff);
  background: var(--accent-bg, rgba(100, 108, 255, 0.1));
}

.plan-option:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.plan-duration {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary, #fff);
  margin-bottom: 0.25rem;
}

.plan-price {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent-color, #646cff);
}

.plan-unit {
  font-size: 0.75rem;
  color: var(--text-secondary, #888);
  text-transform: uppercase;
}

.plan-badge {
  position: absolute;
  top: -8px;
  right: -8px;
  background: var(--success-color, #22c55e);
  color: #fff;
  font-size: 0.625rem;
  font-weight: 700;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  text-transform: uppercase;
}
`

export default PlanSelector

