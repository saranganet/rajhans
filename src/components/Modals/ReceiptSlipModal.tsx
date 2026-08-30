import React, { useEffect, useState, useMemo } from 'react';
import { X, Printer, Share2, Copy, Check } from 'lucide-react';
import type { ProviderSettlementSummary, MilkCollection } from '../../types';
import { formatRupees, formatLitres, formatTimestampIST, calculateAmount } from '../../services/formatters';
import { getProviderCollectionsInRange } from '../../services/milkService';

interface ReceiptSlipModalProps {
  isOpen: boolean;
  summary: ProviderSettlementSummary | null;
  onClose: () => void;
}

interface DailyRow {
  date: string;
  formattedDate: string;
  morningLitres: number;
  eveningLitres: number;
  totalLitres: number;
  rate: number;
  amount: number;
}

export const ReceiptSlipModal: React.FC<ReceiptSlipModalProps> = ({
  isOpen,
  summary,
  onClose
}) => {
  const [collections, setCollections] = useState<MilkCollection[]>([]);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (summary) {
      getProviderCollectionsInRange(
        summary.provider_id,
        summary.period_info.period_start,
        summary.period_info.period_end
      ).then(setCollections);
    }
  }, [summary]);

  // Aggregate collections into a clean day-by-day 10-day matrix
  const dailyRows = useMemo(() => {
    if (!summary) return [];

    const rows: DailyRow[] = [];
    const start = new Date(summary.period_info.period_start);
    const end = new Date(summary.period_info.period_end);

    let curr = new Date(start);
    while (curr <= end) {
      const yyyy = curr.getFullYear();
      const mm = String(curr.getMonth() + 1).padStart(2, '0');
      const dd = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${yyyy}-${mm}-${dd}`;
      const formattedDate = `${dd}/${mm}`;

      const morningCol = collections.find(c => c.business_date === dateStr && c.session === 'MORNING');
      const eveningCol = collections.find(c => c.business_date === dateStr && c.session === 'EVENING');

      const morningL = morningCol ? morningCol.quantity_litres : 0;
      const eveningL = eveningCol ? eveningCol.quantity_litres : 0;
      const totalL = parseFloat((morningL + eveningL).toFixed(2));
      const rate = morningCol ? morningCol.rate_per_litre : (eveningCol ? eveningCol.rate_per_litre : (summary.rates_used[0]?.rate || 50));
      const amount = calculateAmount(totalL, rate);

      rows.push({
        date: dateStr,
        formattedDate,
        morningLitres: morningL,
        eveningLitres: eveningL,
        totalLitres: totalL,
        rate,
        amount
      });

      curr.setDate(curr.getDate() + 1);
    }

    return rows;
  }, [summary, collections]);

  const morningTotalL = useMemo(() => dailyRows.reduce((acc, r) => acc + r.morningLitres, 0), [dailyRows]);
  const eveningTotalL = useMemo(() => dailyRows.reduce((acc, r) => acc + r.eveningLitres, 0), [dailyRows]);

  if (!isOpen || !summary) return null;

  const handlePrint = () => {
    window.print();
  };

  // Generate clean text message for WhatsApp sharing
  const generateWhatsAppMessage = () => {
    const isPaid = !!summary.payment;
    let msg = `🥛 *राजहंस डेअरी (RAJHANS DAIRY)* 🥛\n`;
    msg += `📄 *१० दिवसांचे दूध बिल (Milk Statement)*\n`;
    msg += `--------------------------------\n`;
    msg += `👤 उत्पादक: *${summary.provider_name}*\n`;
    msg += `📅 कालावधी: ${summary.period_info.label}\n`;
    msg += `--------------------------------\n`;
    msg += `🌅 सकाळ दूध: ${formatLitres(morningTotalL)}\n`;
    msg += `🌆 संध्याकाळ दूध: ${formatLitres(eveningTotalL)}\n`;
    msg += `🥛 एकूण दूध: *${formatLitres(summary.total_litres)}*\n`;
    if (summary.rates_used.length === 1) {
      msg += `💰 दर: ₹${summary.rates_used[0].rate.toFixed(2)}/L\n`;
    }
    msg += `💵 *एकूण रक्कम: ${formatRupees(summary.total_amount)}*\n`;
    msg += `📌 स्थिती: *${isPaid ? 'अदा (PAID)' : 'बाकी (UNPAID)'}*\n`;
    if (summary.payment) {
      msg += `💳 पेमेंट पद्धत: ${summary.payment.payment_method}\n`;
      msg += `⏰ दिनांक: ${formatTimestampIST(summary.payment.paid_at)}\n`;
    }
    msg += `--------------------------------\n`;
    msg += `धन्यवाद! (राजहंस डेअरी)\n`;
    return msg;
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(generateWhatsAppMessage());
    const phone = summary.provider_phone ? summary.provider_phone.replace(/[^0-9]/g, '') : '';
    const phoneParam = phone ? `phone=${phone.length === 10 ? '91' + phone : phone}&` : '';
    window.open(`https://api.whatsapp.com/send?${phoneParam}text=${text}`, '_blank');
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(generateWhatsAppMessage());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '580px' }}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '1.25rem' }}>🧾</span>
            <h3 className="modal-title">दूध पावती (Milk Bill Slip)</h3>
          </div>
          <button className="modal-close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Printable Receipt Paper */}
          <div className="receipt-paper" id="printable-receipt">
            {/* Dairy Header */}
            <div className="receipt-header-center">
              <div className="receipt-dairy-brand">🥛 राजहंस डेअरी (RAJHANS DAIRY)</div>
              <div className="receipt-dairy-sub">१० दिवसांचे दूध संकलन व बिल पावती</div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                Timezone: Asia/Kolkata (IST)
              </div>
            </div>

            {/* Provider & Period Meta Box */}
            <div className="receipt-meta-grid">
              <div>
                <span style={{ color: '#64748b' }}>उत्पादक:</span>{' '}
                <strong style={{ color: '#0f172a', fontSize: '0.95rem' }}>{summary.provider_name}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>कालावधी:</span>{' '}
                <strong style={{ color: '#0f172a' }}>{summary.period_info.label}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>मोबाईल:</span>{' '}
                <span>{summary.provider_phone || '—'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span style={{ color: '#64748b' }}>स्थिती:</span>{' '}
                {summary.payment ? (
                  <span style={{ color: '#16a34a', fontWeight: 800 }}>PAID ({summary.payment.payment_method})</span>
                ) : (
                  <span style={{ color: '#dc2626', fontWeight: 800 }}>UNPAID (बाकी)</span>
                )}
              </div>
            </div>

            {/* Day-by-Day 10-Day Table */}
            <table className="receipt-table">
              <thead>
                <tr>
                  <th>दिनांक</th>
                  <th>☀️ सकाळ</th>
                  <th>🌙 संध्या.</th>
                  <th>एकूण (L)</th>
                  <th>दर (₹)</th>
                  <th style={{ textAlign: 'right' }}>रक्कम (₹)</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((r) => (
                  <tr key={r.date}>
                    <td style={{ fontWeight: 700 }}>{r.formattedDate}</td>
                    <td>{r.morningLitres > 0 ? r.morningLitres.toFixed(1) : '—'}</td>
                    <td>{r.eveningLitres > 0 ? r.eveningLitres.toFixed(1) : '—'}</td>
                    <td style={{ fontWeight: 700 }}>{r.totalLitres > 0 ? r.totalLitres.toFixed(1) : '—'}</td>
                    <td>₹{r.rate.toFixed(1)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 700 }}>
                      {r.amount > 0 ? r.amount.toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f1f5f9', fontWeight: 800, borderTop: '2px solid #0f172a' }}>
                  <td>एकूण</td>
                  <td>{morningTotalL.toFixed(1)} L</td>
                  <td>{eveningTotalL.toFixed(1)} L</td>
                  <td style={{ color: '#0f172a' }}>{summary.total_litres.toFixed(1)} L</td>
                  <td>—</td>
                  <td style={{ textAlign: 'right', color: '#166534' }}>{formatRupees(summary.total_amount)}</td>
                </tr>
              </tfoot>
            </table>

            {/* Net Summary Box */}
            <div className="receipt-summary-box">
              <div className="receipt-summary-row">
                <span style={{ color: '#475569', fontWeight: 600 }}>सकाळ एकूण दूध (Morning Total):</span>
                <strong>{formatLitres(morningTotalL)}</strong>
              </div>
              <div className="receipt-summary-row">
                <span style={{ color: '#475569', fontWeight: 600 }}>संध्याकाळ एकूण दूध (Evening Total):</span>
                <strong>{formatLitres(eveningTotalL)}</strong>
              </div>
              <div className="receipt-summary-row">
                <span style={{ color: '#475569', fontWeight: 600 }}>एकूण संकलित दूध (Total Milk):</span>
                <strong style={{ fontSize: '1.05rem' }}>{formatLitres(summary.total_litres)}</strong>
              </div>

              {summary.rates_used.length > 1 ? (
                <div style={{ fontSize: '0.75rem', color: '#64748b', background: '#ffffff', padding: '0.35rem 0.5rem', borderRadius: '4px' }}>
                  दर विभागणी: {summary.rates_used.map(r => `${formatLitres(r.litres)} @ ₹${r.rate}/L`).join(' + ')}
                </div>
              ) : (
                <div className="receipt-summary-row">
                  <span style={{ color: '#475569', fontWeight: 600 }}>लागू दर (Rate per Litre):</span>
                  <strong>₹{summary.rates_used[0]?.rate.toFixed(2)}/L</strong>
                </div>
              )}

              <div className="receipt-summary-row receipt-grand-total">
                <span>एकूण देय रक्कम (Total Amount):</span>
                <span>{formatRupees(summary.total_amount)}</span>
              </div>
            </div>

            {/* Payment Stamp Seal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
              <div>
                {summary.payment ? (
                  <div className="receipt-stamp-badge">
                    ✓ PAID: {summary.payment.payment_method}
                  </div>
                ) : (
                  <div className="receipt-stamp-badge receipt-stamp-unpaid">
                    UNPAID (बाकी)
                  </div>
                )}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#64748b', textAlign: 'right' }}>
                पावती दिनांक: {new Date().toLocaleDateString('en-GB')}
              </div>
            </div>

            {/* Signatures */}
            <div className="receipt-signatures">
              <div className="receipt-sign-line">उत्पादक स्वाक्षरी<br /><span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>(Farmer Sign)</span></div>
              <div className="receipt-sign-line">व्यवस्थापक स्वाक्षरी<br /><span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>(Dairy Sign)</span></div>
            </div>

            <div style={{ textAlign: 'center', marginTop: '1rem', fontSize: '0.75rem', color: '#94a3b8' }}>
              ।। धन्यवाद ।। राजहंस डेअरी ।।
            </div>
          </div>
        </div>

        {/* Action Buttons Bar */}
        <div className="modal-footer" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ background: '#25D366', color: '#ffffff', borderColor: '#25D366', fontWeight: 800 }}
              onClick={handleShareWhatsApp}
            >
              <Share2 size={16} /> WhatsApp वर पाठवा
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={handleCopyText}
              title="Copy bill text"
            >
              {copied ? <Check size={16} color="#16a34a" /> : <Copy size={16} />}
              <span>{copied ? 'Copied!' : 'Copy Text'}</span>
            </button>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-secondary" onClick={onClose}>
              Close
            </button>
            <button className="btn-primary" onClick={handlePrint}>
              <Printer size={18} /> Print Slip (प्रिंट करा)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
