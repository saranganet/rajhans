import React, { useState } from 'react';
import { X, CheckCircle, IndianRupee } from 'lucide-react';
import type { ProviderSettlementSummary, PaymentMethod } from '../../types';
import { formatRupees, formatLitres } from '../../services/formatters';

interface PaymentModalProps {
  isOpen: boolean;
  summary: ProviderSettlementSummary | null;
  onClose: () => void;
  onSubmit: (params: {
    providerId: string;
    year: number;
    month: number;
    periodIndex: 1 | 2 | 3;
    amountPaid: number;
    paymentMethod: PaymentMethod;
    notes?: string;
  }) => Promise<void>;
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  summary,
  onClose,
  onSubmit
}) => {
  if (!isOpen || !summary) return null;

  const [amountPaid, setAmountPaid] = useState<number>(summary.total_amount);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amountPaid <= 0) {
      alert('Please enter a valid payment amount.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        providerId: summary.provider_id,
        year: summary.period_info.year,
        month: summary.period_info.month,
        periodIndex: summary.period_info.period_index,
        amountPaid,
        paymentMethod,
        notes: notes.trim()
      });
      onClose();
    } catch (err) {
      alert('Failed to record payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <IndianRupee size={22} color="#16a34a" />
            <h3 className="modal-title">Record Settlement Payment</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div style={{ background: '#f0fdf4', padding: '1rem', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <span style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 600, textTransform: 'uppercase' }}>Provider</span>
                <span style={{ fontSize: '0.85rem', color: '#166534', fontWeight: 600 }}>{summary.period_info.label}</span>
              </div>
              <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#14532d' }}>{summary.provider_name}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #dcfce7' }}>
                <span>Total Milk: <strong>{formatLitres(summary.total_litres)}</strong></span>
                <span>Calculated Amount: <strong>{formatRupees(summary.total_amount)}</strong></span>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Amount Paid (₹) *</label>
              <input
                type="number"
                step="1"
                min="1"
                required
                className="form-input"
                style={{ fontSize: '1.3rem', fontWeight: 800, color: '#166534' }}
                value={amountPaid}
                onChange={(e) => setAmountPaid(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Payment Method *</label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
                {(['CASH', 'UPI', 'BANK'] as PaymentMethod[]).map((method) => (
                  <button
                    key={method}
                    type="button"
                    className={`btn-secondary ${paymentMethod === method ? 'btn-primary' : ''}`}
                    style={{
                      justifyContent: 'center',
                      padding: '0.6rem',
                      fontWeight: 700,
                      background: paymentMethod === method ? '#1b4332' : '#ffffff',
                      color: paymentMethod === method ? '#ffffff' : '#334155'
                    }}
                    onClick={() => setPaymentMethod(method)}
                  >
                    {method === 'CASH' ? '💵 Cash' : method === 'UPI' ? '📱 UPI / PhonePe' : '🏦 Bank Transfer'}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Payment Notes (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Paid in cash at dairy counter"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" style={{ background: '#16a34a' }} disabled={isSubmitting}>
              <CheckCircle size={18} /> {isSubmitting ? 'Saving...' : 'Confirm & Mark Paid'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
