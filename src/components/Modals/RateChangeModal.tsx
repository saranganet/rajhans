import React, { useState } from 'react';
import { X, TrendingUp, Info } from 'lucide-react';
import { getTodayKolkata } from '../../services/dateService';
import { formatRupees } from '../../services/formatters';

interface RateChangeModalProps {
  isOpen: boolean;
  provider: { id: string; name: string; default_rate: number } | null;
  onClose: () => void;
  onSubmit: (params: { providerId: string; newRate: number; effectiveFrom: string; reason: string }) => Promise<void>;
}

export const RateChangeModal: React.FC<RateChangeModalProps> = ({
  isOpen,
  provider,
  onClose,
  onSubmit
}) => {
  const [newRate, setNewRate] = useState<string>('');
  const [effectiveFrom, setEffectiveFrom] = useState<string>(getTodayKolkata());
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen || !provider) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const rateVal = parseFloat(newRate);
    if (isNaN(rateVal) || rateVal <= 0) {
      alert('Please enter a valid rate per litre.');
      return;
    }
    if (!effectiveFrom) {
      alert('Please select an effective start date.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        providerId: provider.id,
        newRate: rateVal,
        effectiveFrom,
        reason: reason.trim() || `Rate updated to ₹${rateVal}/L from ${effectiveFrom}`
      });
      onClose();
    } catch (err) {
      alert('Failed to update rate. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <TrendingUp size={22} color="#1b4332" />
            <h3 className="modal-title">Update Provider Rate</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Provider</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#1e293b' }}>{provider.name}</div>
              <div style={{ fontSize: '0.95rem', color: '#1b4332', fontWeight: 600, marginTop: '0.2rem' }}>
                Current Rate: <strong>{formatRupees(provider.default_rate)}/L</strong>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">New Rate per Litre (₹) *</label>
              <input
                type="number"
                step="0.25"
                min="1"
                required
                className="form-input"
                style={{ fontSize: '1.25rem', fontWeight: 700 }}
                placeholder="e.g. 54.00"
                value={newRate}
                onChange={(e) => setNewRate(e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Effective From Date (Asia/Kolkata) *</label>
              <input
                type="date"
                required
                className="form-input"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
              />
              <div className="form-hint" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#047857' }}>
                <Info size={14} /> Historical milk records before {effectiveFrom} will permanently retain their previous rate.
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Reason / Notes (Optional)</label>
              <input
                type="text"
                className="form-input"
                placeholder="e.g. Monthly market revision"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save New Rate'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
