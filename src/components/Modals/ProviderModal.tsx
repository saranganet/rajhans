import React, { useState } from 'react';
import { X, UserPlus } from 'lucide-react';
import type { Provider } from '../../types';
import { getTodayKolkata } from '../../services/dateService';

interface ProviderModalProps {
  isOpen: boolean;
  provider?: Provider | null;
  onClose: () => void;
  onSubmit: (params: { name: string; phone?: string; defaultRate: number; active: boolean }) => Promise<void>;
}

export const ProviderModal: React.FC<ProviderModalProps> = ({
  isOpen,
  provider,
  onClose,
  onSubmit
}) => {
  const [name, setName] = useState<string>(provider?.name || '');
  const [phone, setPhone] = useState<string>(provider?.phone || '');
  const [defaultRate, setDefaultRate] = useState<string>(provider?.default_rate ? provider.default_rate.toString() : '52');
  const [active, setActive] = useState<boolean>(provider ? provider.active : true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      alert('Please enter provider name.');
      return;
    }
    const rateVal = parseFloat(defaultRate);
    if (isNaN(rateVal) || rateVal <= 0) {
      alert('Please enter a valid rate per litre.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSubmit({
        name: name.trim(),
        phone: phone.trim() || undefined,
        defaultRate: rateVal,
        active
      });
      onClose();
    } catch (err) {
      alert('Failed to save provider.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <UserPlus size={22} color="#1b4332" />
            <h3 className="modal-title">{provider ? 'Edit Provider' : 'Add New Milk Provider'}</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Provider Full Name *</label>
              <input
                type="text"
                required
                className="form-input"
                style={{ fontSize: '1.15rem', fontWeight: 600 }}
                placeholder="e.g. Ramesh Patil"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number (Optional)</label>
              <input
                type="tel"
                className="form-input"
                placeholder="e.g. 9822012345"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Rate per Litre (₹) *</label>
              <input
                type="number"
                step="0.25"
                min="1"
                required
                className="form-input"
                style={{ fontSize: '1.25rem', fontWeight: 700 }}
                placeholder="52.00"
                value={defaultRate}
                onChange={(e) => setDefaultRate(e.target.value)}
              />
              <div className="form-hint">
                Rate will be effective from today ({getTodayKolkata()}).
              </div>
            </div>

            {provider && (
              <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem', marginTop: '0.5rem' }}>
                <input
                  type="checkbox"
                  id="active-check"
                  style={{ width: '20px', height: '20px', cursor: 'pointer' }}
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                />
                <label htmlFor="active-check" style={{ fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>
                  Active Provider (appears in daily register)
                </label>
              </div>
            )}
          </div>

          <div className="modal-footer">
            <button type="button" className="btn-secondary" onClick={onClose} disabled={isSubmitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : provider ? 'Update Provider' : 'Add Provider'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
