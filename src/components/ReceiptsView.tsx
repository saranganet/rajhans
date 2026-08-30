import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Lock,
  Unlock,
  CheckCircle,
  Printer,
  IndianRupee
} from 'lucide-react';
import type { ProviderSettlementSummary, PaymentMethod } from '../types';
import {
  getSettlementPeriods,
  getTodayKolkata,
  getMonthsForYear
} from '../services/dateService';
import {
  getAllSettlementsForPeriod,
  finalizeSettlement,
  reopenSettlement,
  recordPayment
} from '../services/settlementService';
import { formatRupees, formatLitres, formatTimestampIST } from '../services/formatters';
import { PaymentModal } from './Modals/PaymentModal';
import { ReceiptSlipModal } from './Modals/ReceiptSlipModal';
import { ConfirmationModal } from './Modals/ConfirmationModal';

interface ReceiptsViewProps {
  searchFilter: string;
}

export const ReceiptsView: React.FC<ReceiptsViewProps> = ({ searchFilter }) => {
  const today = getTodayKolkata();
  const currentYear = parseInt(today.slice(0, 4), 10);
  const currentMonth = parseInt(today.slice(5, 7), 10);

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [selectedPeriodIndex, setSelectedPeriodIndex] = useState<1 | 2 | 3>(
    parseInt(today.slice(8, 10), 10) <= 10 ? 1 : parseInt(today.slice(8, 10), 10) <= 20 ? 2 : 3
  );

  const [settlements, setSettlements] = useState<ProviderSettlementSummary[]>([]);

  // Modals
  const [paymentSummary, setPaymentSummary] = useState<ProviderSettlementSummary | null>(null);
  const [slipSummary, setSlipSummary] = useState<ProviderSettlementSummary | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    action: () => void;
    isDangerous?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    action: () => {}
  });

  const periods = useMemo(() => getSettlementPeriods(selectedYear, selectedMonth), [selectedYear, selectedMonth]);
  const activePeriod = periods[selectedPeriodIndex - 1];
  const months = useMemo(() => getMonthsForYear(selectedYear), [selectedYear]);

  const loadSettlements = async () => {
    try {
      const data = await getAllSettlementsForPeriod(activePeriod);
      setSettlements(data);
    } catch (err) {
      console.error('Failed to load settlements:', err);
    }
  };

  useEffect(() => {
    loadSettlements();
  }, [selectedYear, selectedMonth, selectedPeriodIndex]);

  const filteredSettlements = useMemo(() => {
    if (!searchFilter.trim()) return settlements;
    const query = searchFilter.toLowerCase();
    return settlements.filter(s =>
      s.provider_name.toLowerCase().includes(query) ||
      (s.provider_phone && s.provider_phone.includes(query))
    );
  }, [settlements, searchFilter]);

  // Aggregate totals for the 10-day period
  const periodTotals = useMemo(() => {
    let totalLitres = 0;
    let totalAmount = 0;
    let totalPaid = 0;
    let finalizedCount = 0;

    for (const s of settlements) {
      totalLitres += s.total_litres;
      totalAmount += s.total_amount;
      if (s.payment) {
        totalPaid += s.payment.amount_paid;
      }
      if (s.is_finalized) {
        finalizedCount++;
      }
    }

    return {
      totalLitres: parseFloat(totalLitres.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
      totalPaid: parseFloat(totalPaid.toFixed(2)),
      totalPending: parseFloat(Math.max(0, totalAmount - totalPaid).toFixed(2)),
      finalizedCount,
      allFinalized: settlements.length > 0 && finalizedCount === settlements.length
    };
  }, [settlements]);

  const handleFinalize = async (summary: ProviderSettlementSummary) => {
    await finalizeSettlement({
      providerId: summary.provider_id,
      year: selectedYear,
      month: selectedMonth,
      periodIndex: selectedPeriodIndex
    });
    await loadSettlements();
  };

  const handleReopen = async (summary: ProviderSettlementSummary) => {
    setConfirmModal({
      isOpen: true,
      title: 'Reopen Settlement?',
      message: `Are you sure you want to reopen the settlement for ${summary.provider_name} (${activePeriod.label})? Any edits to milk records will change payable amounts.`,
      action: async () => {
        const settlement = await finalizeSettlement({
          providerId: summary.provider_id,
          year: selectedYear,
          month: selectedMonth,
          periodIndex: selectedPeriodIndex
        });
        await reopenSettlement(settlement.id, 'User requested unlock for corrections');
        await loadSettlements();
      }
    });
  };

  const handleFinalizeAll = async () => {
    setConfirmModal({
      isOpen: true,
      title: 'Finalize All Settlements?',
      message: `This will lock the 10-day settlement (${activePeriod.label}) for all ${settlements.length} providers. Continue?`,
      action: async () => {
        for (const s of settlements) {
          await finalizeSettlement({
            providerId: s.provider_id,
            year: selectedYear,
            month: selectedMonth,
            periodIndex: selectedPeriodIndex
          });
        }
        await loadSettlements();
      }
    });
  };

  const handlePaymentSubmit = async (params: {
    providerId: string;
    year: number;
    month: number;
    periodIndex: 1 | 2 | 3;
    amountPaid: number;
    paymentMethod: PaymentMethod;
    notes?: string;
  }) => {
    await recordPayment(params);
    await loadSettlements();
  };

  return (
    <div>
      <div className="view-header">
        <div className="view-title-group">
          <h1 className="view-heading">10-Day Settlements & Receipts (१० दिवसांच्या पावत्या)</h1>
          <p className="view-subheading">
            Strict 10-day cycles (1–10, 11–20, 21–End). Calculate amounts, lock finalized bills, and record payments.
          </p>
        </div>

        <button className="btn-primary" onClick={handleFinalizeAll}>
          <Lock size={18} />
          <span>Finalize All ({activePeriod.label.split(' ')[0]})</span>
        </button>
      </div>

      {/* Period & Month Selector Bar */}
      <div className="period-selector-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Calendar size={18} color="#1b4332" />
            <select
              className="form-select"
              style={{ padding: '0.45rem 0.75rem', fontWeight: 700 }}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
            >
              {months.map((m) => (
                <option key={m.month} value={m.month}>
                  {m.name} ({selectedYear})
                </option>
              ))}
            </select>
          </div>

          <select
            className="form-select"
            style={{ padding: '0.45rem 0.75rem', fontWeight: 700 }}
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
          >
            <option value={2025}>2025</option>
            <option value={2026}>2026</option>
            <option value={2027}>2027</option>
          </select>
        </div>

        {/* 3 Strict 10-Day Period Tabs */}
        <div className="period-tabs">
          {periods.map((p) => (
            <button
              key={p.period_index}
              className={`period-tab-btn ${selectedPeriodIndex === p.period_index ? 'active' : ''}`}
              onClick={() => setSelectedPeriodIndex(p.period_index)}
            >
              Period {p.period_index}: {p.label.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Period Overview Summary Card */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1b4332 0%, #2d6a4f 100%)',
          color: '#ffffff',
          borderRadius: '16px',
          padding: '1.25rem 2rem',
          marginBottom: '1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '1.5rem',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
        }}
      >
        <div>
          <div style={{ fontSize: '0.85rem', color: '#fef3c7', textTransform: 'uppercase', fontWeight: 700 }}>
            {activePeriod.label}
          </div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>
            {formatLitres(periodTotals.totalLitres)} Total Milk
          </div>
        </div>

        <div style={{ display: 'flex', gap: '2.5rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#d8f3dc', textTransform: 'uppercase' }}>Total Payable</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>{formatRupees(periodTotals.totalAmount)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#d8f3dc', textTransform: 'uppercase' }}>Paid Amount</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#86efac' }}>{formatRupees(periodTotals.totalPaid)}</div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#d8f3dc', textTransform: 'uppercase' }}>Pending Balance</div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fef08a' }}>{formatRupees(periodTotals.totalPending)}</div>
          </div>
        </div>
      </div>

      {/* Settlement Cards List */}
      <div className="settlement-cards-list">
        {filteredSettlements.length === 0 ? (
          <div style={{ background: '#fff', padding: '3rem', borderRadius: '12px', textAlign: 'center', color: '#64748b' }}>
            No milk collections or providers recorded for this settlement period.
          </div>
        ) : (
          filteredSettlements.map((s) => {
            const isPaid = !!s.payment;

            return (
              <div key={s.provider_id} className="settlement-card">
                <div className="settlement-provider-info">
                  <div className="settlement-provider-name">{s.provider_name}</div>
                  <div className="settlement-period-label">{s.period_info.label}</div>
                  {s.provider_phone && (
                    <div style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.2rem' }}>
                      📞 {s.provider_phone}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.5rem' }}>
                    {s.is_finalized ? (
                      <span className="status-pill locked" style={{ fontSize: '0.75rem' }}>
                        <Lock size={12} /> Finalized
                      </span>
                    ) : (
                      <span className="status-pill pending" style={{ fontSize: '0.75rem' }}>
                        Open
                      </span>
                    )}

                    {isPaid ? (
                      <span className="status-pill paid" style={{ fontSize: '0.75rem' }}>
                        <CheckCircle size={12} /> Paid ({s.payment?.payment_method})
                      </span>
                    ) : (
                      <span className="status-pill unpaid" style={{ fontSize: '0.75rem' }}>
                        Unpaid
                      </span>
                    )}
                  </div>
                </div>

                <div className="settlement-metrics">
                  <div className="settlement-metric-item">
                    <span className="settlement-metric-label">Total Milk</span>
                    <span className="settlement-metric-value">{formatLitres(s.total_litres)}</span>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      ☀️ {formatLitres(s.morning_litres)} | 🌙 {formatLitres(s.evening_litres)}
                    </span>
                  </div>

                  <div className="settlement-metric-item">
                    <span className="settlement-metric-label">Rate Applied</span>
                    <span className="settlement-metric-value" style={{ fontSize: '1.15rem' }}>
                      {s.rates_used.length === 1 ? (
                        `₹${s.rates_used[0].rate}/L`
                      ) : s.rates_used.length > 1 ? (
                        s.rates_used.map(r => `₹${r.rate}/L`).join(', ')
                      ) : (
                        '—'
                      )}
                    </span>
                    {s.rates_used.length > 1 && (
                      <span style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 600 }}>
                        Rate changed in period
                      </span>
                    )}
                  </div>

                  <div className="settlement-metric-item">
                    <span className="settlement-metric-label">Total Payable</span>
                    <span className="settlement-metric-value highlight">{formatRupees(s.total_amount)}</span>
                    {s.payment && (
                      <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>
                        Paid {formatTimestampIST(s.payment.paid_at)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="settlement-actions-group">
                  <button
                    className="btn-secondary"
                    style={{ padding: '0.5rem 0.85rem' }}
                    onClick={() => setSlipSummary(s)}
                    title="Print Receipt Slip"
                  >
                    <Printer size={16} />
                    <span>Slip</span>
                  </button>

                  {s.is_finalized ? (
                    <button
                      className="btn-secondary"
                      style={{ padding: '0.5rem 0.85rem' }}
                      onClick={() => handleReopen(s)}
                      title="Unlock settlement for editing"
                    >
                      <Unlock size={16} />
                      <span>Reopen</span>
                    </button>
                  ) : (
                    <button
                      className="btn-secondary"
                      style={{ padding: '0.5rem 0.85rem' }}
                      onClick={() => handleFinalize(s)}
                      title="Lock settlement from edits"
                    >
                      <Lock size={16} />
                      <span>Finalize</span>
                    </button>
                  )}

                  {!isPaid ? (
                    <button
                      className="btn-primary"
                      style={{ background: '#16a34a', padding: '0.5rem 1rem' }}
                      onClick={() => setPaymentSummary(s)}
                    >
                      <IndianRupee size={16} />
                      <span>Pay Now</span>
                    </button>
                  ) : (
                    <button
                      className="btn-secondary"
                      style={{ padding: '0.5rem 0.85rem' }}
                      onClick={() => setPaymentSummary(s)}
                    >
                      <span>Update Pay</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Payment Recording Modal */}
      <PaymentModal
        isOpen={!!paymentSummary}
        summary={paymentSummary}
        onClose={() => setPaymentSummary(null)}
        onSubmit={handlePaymentSubmit}
      />

      {/* Receipt Slip Modal */}
      <ReceiptSlipModal
        isOpen={!!slipSummary}
        summary={slipSummary}
        onClose={() => setSlipSummary(null)}
      />

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        isDangerous={confirmModal.isDangerous}
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
