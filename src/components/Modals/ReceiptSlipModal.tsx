import React, { useEffect, useState } from 'react';
import { X, Printer } from 'lucide-react';
import type { ProviderSettlementSummary, MilkCollection } from '../../types';
import { formatRupees, formatLitres, formatTimestampIST } from '../../services/formatters';
import { getProviderCollectionsInRange } from '../../services/milkService';

interface ReceiptSlipModalProps {
  isOpen: boolean;
  summary: ProviderSettlementSummary | null;
  onClose: () => void;
}

export const ReceiptSlipModal: React.FC<ReceiptSlipModalProps> = ({
  isOpen,
  summary,
  onClose
}) => {
  const [collections, setCollections] = useState<MilkCollection[]>([]);

  useEffect(() => {
    if (summary) {
      getProviderCollectionsInRange(
        summary.provider_id,
        summary.period_info.period_start,
        summary.period_info.period_end
      ).then(setCollections);
    }
  }, [summary]);

  if (!isOpen || !summary) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h3 className="modal-title">Receipt Slip (पावती)</h3>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <div className="receipt-slip" id="printable-receipt">
            <div className="receipt-slip-header">
              <div className="receipt-slip-title">🥛 RAJHANS DAIRY (राजहंस डेअरी)</div>
              <div style={{ fontSize: '0.85rem', marginTop: '0.2rem' }}>Milk Collection & Settlement Statement</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b' }}>Timezone: Asia/Kolkata (IST)</div>
            </div>

            <div style={{ fontSize: '0.9rem', lineHeight: '1.6', marginBottom: '0.75rem' }}>
              <div><strong>Provider:</strong> {summary.provider_name}</div>
              {summary.provider_phone && <div><strong>Phone:</strong> {summary.provider_phone}</div>}
              <div><strong>Period:</strong> {summary.period_info.label}</div>
              <div><strong>Status:</strong> {summary.payment ? `PAID (${summary.payment.payment_method})` : 'UNPAID'}</div>
              {summary.payment && <div><strong>Paid On:</strong> {formatTimestampIST(summary.payment.paid_at)}</div>}
            </div>

            <table className="receipt-slip-table" style={{ fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #000' }}>
                  <th>Date</th>
                  <th>Session</th>
                  <th>Qty</th>
                  <th>Rate</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {collections.map((c) => (
                  <tr key={c.id}>
                    <td>{c.business_date.slice(5)}</td>
                    <td>{c.session === 'MORNING' ? 'Morn' : 'Eve'}</td>
                    <td>{formatLitres(c.quantity_litres)}</td>
                    <td>₹{c.rate_per_litre}</td>
                    <td style={{ textAlign: 'right' }}>{formatRupees(c.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="receipt-slip-total">
              <span>TOTAL MILK: {formatLitres(summary.total_litres)}</span>
              <span>{formatRupees(summary.total_amount)}</span>
            </div>

            {summary.rates_used.length > 1 && (
              <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#475569' }}>
                * Rate breakdown: {summary.rates_used.map(r => `${formatLitres(r.litres)} @ ₹${r.rate}/L`).join(', ')}
              </div>
            )}

            <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.8rem', color: '#64748b' }}>
              Thank You! / धन्यवाद!
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Close
          </button>
          <button className="btn-primary" onClick={handlePrint}>
            <Printer size={18} /> Print Slip
          </button>
        </div>
      </div>
    </div>
  );
};
