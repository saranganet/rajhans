import React, { useEffect, useState, useMemo } from 'react';
import {
  Sun,
  Moon,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Lock,
  Unlock,
  Save,
  Clock,
  Layers,
  UserPlus,
  RefreshCw
} from 'lucide-react';
import type { Provider, MilkCollection, DailyClosing, SessionType } from '../types';
import { db } from '../services/db';
import {
  getTodayKolkata,
  getFormattedDateDetails,
  navigateDate
} from '../services/dateService';
import { getEffectiveRate } from '../services/rateService';
import {
  getSessionCollections,
  recordMilkEntry,
  getDailyClosing,
  closeDay,
  reopenDay
} from '../services/milkService';
import { isDateFinalizedForProvider } from '../services/settlementService';
import { populateDemoData } from '../services/seedData';
import { formatRupees, formatLitres, calculateAmount, parseQuantityInput } from '../services/formatters';
import { ConfirmationModal } from './Modals/ConfirmationModal';

interface ProviderEntryRow {
  provider: Provider;
  rate: number;
  morningQty: string;
  eveningQty: string;
  morningCollection?: MilkCollection;
  eveningCollection?: MilkCollection;
  isFinalized: boolean;
}

interface DailyViewProps {
  currentDate: string;
  onDateChange: (newDate: string) => void;
  searchFilter: string;
  onOpenAddProvider?: () => void;
}

type SessionFilter = 'MORNING' | 'EVENING' | 'BOTH';

export const DailyView: React.FC<DailyViewProps> = ({
  currentDate,
  onDateChange,
  searchFilter,
  onOpenAddProvider
}) => {
  const [rows, setRows] = useState<ProviderEntryRow[]>([]);
  const [dailyClosing, setDailyClosing] = useState<DailyClosing | null>(null);
  const [activeSessionFilter, setActiveSessionFilter] = useState<SessionFilter>('MORNING');
  const [saveFeedback, setSaveFeedback] = useState<{ session: SessionType | 'ALL'; message: string } | null>(null);

  // Warning & Confirmation Modals
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

  const dateDetails = useMemo(() => getFormattedDateDetails(currentDate), [currentDate]);
  const isClosed = dailyClosing?.is_closed ?? false;

  // Load all providers and existing milk collections for this date
  const loadDailyData = async () => {
    try {
      const allProviders = await db.providers.toArray();
      const activeProviders = allProviders.filter(p => p.active);

      const morningSession = await getSessionCollections(currentDate, 'MORNING');
      const eveningSession = await getSessionCollections(currentDate, 'EVENING');
      const closing = await getDailyClosing(currentDate);
      setDailyClosing(closing);

      const rowsData: ProviderEntryRow[] = [];

      for (const p of activeProviders) {
        const rate = await getEffectiveRate(p.id, currentDate);
        const mCol = morningSession.entries.find(e => e.provider_id === p.id);
        const eCol = eveningSession.entries.find(e => e.provider_id === p.id);
        const isFinalized = await isDateFinalizedForProvider(p.id, currentDate);

        rowsData.push({
          provider: p,
          rate,
          morningQty: mCol ? mCol.quantity_litres.toString() : '',
          eveningQty: eCol ? eCol.quantity_litres.toString() : '',
          morningCollection: mCol,
          eveningCollection: eCol,
          isFinalized
        });
      }

      rowsData.sort((a, b) => a.provider.name.localeCompare(b.provider.name));
      setRows(rowsData);
    } catch (err) {
      console.error('Failed to load daily register data:', err);
    }
  };

  useEffect(() => {
    loadDailyData();
  }, [currentDate]);

  // Filtered rows based on top search bar
  const filteredRows = useMemo(() => {
    if (!searchFilter.trim()) return rows;
    const query = searchFilter.toLowerCase();
    return rows.filter(r =>
      r.provider.name.toLowerCase().includes(query) ||
      (r.provider.phone && r.provider.phone.includes(query))
    );
  }, [rows, searchFilter]);

  // Live subtotals
  const morningTotals = useMemo(() => {
    let litres = 0;
    let amount = 0;
    let count = 0;
    for (const r of rows) {
      const q = parseQuantityInput(r.morningQty);
      if (q > 0) {
        litres += q;
        amount += calculateAmount(q, r.rate);
        count++;
      }
    }
    return {
      litres: parseFloat(litres.toFixed(2)),
      amount: parseFloat(amount.toFixed(2)),
      count,
      isRecorded: count > 0
    };
  }, [rows]);

  const eveningTotals = useMemo(() => {
    let litres = 0;
    let amount = 0;
    let count = 0;
    for (const r of rows) {
      const q = parseQuantityInput(r.eveningQty);
      if (q > 0) {
        litres += q;
        amount += calculateAmount(q, r.rate);
        count++;
      }
    }
    return {
      litres: parseFloat(litres.toFixed(2)),
      amount: parseFloat(amount.toFixed(2)),
      count,
      isRecorded: count > 0
    };
  }, [rows]);

  const handleQtyChange = (providerId: string, session: SessionType, value: string) => {
    setRows(prev =>
      prev.map(row => {
        if (row.provider.id === providerId) {
          return session === 'MORNING'
            ? { ...row, morningQty: value }
            : { ...row, eveningQty: value };
        }
        return row;
      })
    );
  };

  const handleAdjustQty = (providerId: string, session: SessionType, delta: number) => {
    setRows(prev =>
      prev.map(row => {
        if (row.provider.id === providerId) {
          const currentVal = parseQuantityInput(
            session === 'MORNING' ? row.morningQty : row.eveningQty
          );
          const newVal = Math.max(0, parseFloat((currentVal + delta).toFixed(2)));
          const strVal = newVal > 0 ? newVal.toString() : '';
          return session === 'MORNING'
            ? { ...row, morningQty: strVal }
            : { ...row, eveningQty: strVal };
        }
        return row;
      })
    );
  };

  const executeSaveSession = async (session: SessionType) => {
    try {
      for (const row of rows) {
        const qtyStr = session === 'MORNING' ? row.morningQty : row.eveningQty;
        const qty = parseQuantityInput(qtyStr);
        const existingCol = session === 'MORNING' ? row.morningCollection : row.eveningCollection;

        if (qty === 0 && !existingCol) continue;

        await recordMilkEntry({
          providerId: row.provider.id,
          businessDate: currentDate,
          session,
          quantityLitres: qty
        });
      }

      setSaveFeedback({
        session,
        message: `✓ ${session === 'MORNING' ? 'Morning (सकाळ)' : 'Evening (संध्याकाळ)'} entries saved!`
      });
      setTimeout(() => setSaveFeedback(null), 3000);
      await loadDailyData();
    } catch (err) {
      alert('Error saving entries. Please try again.');
    }
  };

  const handleSaveSession = (session: SessionType) => {
    const hasFinalizedProviders = rows.some(
      r => r.isFinalized && parseQuantityInput(session === 'MORNING' ? r.morningQty : r.eveningQty) > 0
    );

    if (isClosed) {
      setConfirmModal({
        isOpen: true,
        title: 'Day is Closed (दिवस बंद आहे)',
        message: 'This day is marked as CLOSED. Saving changes will update closed day figures and write to the audit log. Continue?',
        action: () => executeSaveSession(session)
      });
      return;
    }

    if (hasFinalizedProviders) {
      setConfirmModal({
        isOpen: true,
        title: 'Finalized Settlement Warning',
        message: 'One or more providers have a FINALIZED settlement for this period. Modifying records will alter the payable balance. Are you sure?',
        action: () => executeSaveSession(session),
        isDangerous: true
      });
      return;
    }

    executeSaveSession(session);
  };

  const handleToggleDayClose = async () => {
    if (isClosed) {
      setConfirmModal({
        isOpen: true,
        title: 'Reopen Day? (दिवस उघडा)',
        message: `Are you sure you want to reopen ${dateDetails.formattedDate} for modifications?`,
        action: async () => {
          await reopenDay(currentDate, 'Manual reopen by user');
          await loadDailyData();
        }
      });
    } else {
      const closed = await closeDay(currentDate);
      setDailyClosing(closed);
      setSaveFeedback({
        session: 'ALL',
        message: `🔒 Day closed successfully! Total: ${formatLitres(closed.total_litres)} across ${closed.providers_count} providers.`
      });
      setTimeout(() => setSaveFeedback(null), 3500);
    }
  };

  const handleLoadDemoClick = async () => {
    await populateDemoData();
    await loadDailyData();
  };

  return (
    <div>
      {/* Date Hero Banner */}
      <div className="date-hero-card">
        <div className="date-hero-info">
          <div className="date-tag">
            {dateDetails.isToday ? '🌟 TODAY (आज)' : '📅 MILK REGISTER'}
          </div>
          <div className="date-hero-main">{dateDetails.formattedDate}</div>
          <div className="date-hero-sub">
            <span>{dateDetails.dayName}</span>
            {isClosed && (
              <span className="status-pill locked" style={{ fontSize: '0.8rem' }}>
                <Lock size={12} /> CLOSED
              </span>
            )}
          </div>
        </div>

        <div className="date-nav-controls">
          <button
            className="btn-date-nav"
            onClick={() => onDateChange(navigateDate(currentDate, -1))}
            title="Previous Day"
          >
            <ChevronLeft size={22} />
            <span>Prev</span>
          </button>

          <button
            className={`btn-date-nav ${dateDetails.isToday ? 'btn-date-today' : ''}`}
            onClick={() => onDateChange(getTodayKolkata())}
          >
            Today
          </button>

          <button
            className="btn-date-nav"
            onClick={() => onDateChange(navigateDate(currentDate, 1))}
            title="Next Day"
          >
            <span>Next</span>
            <ChevronRight size={22} />
          </button>
        </div>
      </div>

      {/* Empty State Welcome if 0 providers */}
      {rows.length === 0 ? (
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '2px dashed #86efac',
            padding: '2.5rem 1.5rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem',
            marginBottom: '1.5rem'
          }}
        >
          <div style={{ fontSize: '3rem' }}>🐄</div>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1b4332' }}>
            Welcome to Rajhans Dairy! (राजहंस डेअरी)
          </h2>
          <p style={{ color: '#64748b', maxWidth: '420px', fontSize: '0.95rem' }}>
            Start by adding your milk providers and their rate per litre. Everything will be calculated and saved automatically.
          </p>

          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '0.5rem' }}>
            {onOpenAddProvider && (
              <button className="btn-primary" style={{ minHeight: '52px', padding: '0 1.5rem' }} onClick={onOpenAddProvider}>
                <UserPlus size={20} />
                <span>+ Add Your First Provider (उत्पादक जोडा)</span>
              </button>
            )}

            <button className="btn-secondary" style={{ minHeight: '52px' }} onClick={handleLoadDemoClick}>
              <RefreshCw size={18} />
              <span>Load Demo Data (डेमो डेटा)</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Mobile Session Switcher (Segmented Control) */}
          <div className="session-segmented-control">
            <button
              className={`session-segment-btn ${activeSessionFilter === 'MORNING' ? 'active-morning' : ''}`}
              onClick={() => setActiveSessionFilter('MORNING')}
            >
              <Sun size={18} color="#d97706" />
              <span>Morning (सकाळ)</span>
              {morningTotals.isRecorded && <span style={{ fontSize: '0.75rem', color: '#16a34a' }}>✓</span>}
            </button>

            <button
              className={`session-segment-btn ${activeSessionFilter === 'EVENING' ? 'active-evening' : ''}`}
              onClick={() => setActiveSessionFilter('EVENING')}
            >
              <Moon size={18} color="#2563eb" />
              <span>Evening (संध्याकाळ)</span>
              {eveningTotals.isRecorded && <span style={{ fontSize: '0.75rem', color: '#16a34a' }}>✓</span>}
            </button>

            <button
              className={`session-segment-btn ${activeSessionFilter === 'BOTH' ? 'active-both' : ''}`}
              onClick={() => setActiveSessionFilter('BOTH')}
            >
              <Layers size={18} />
              <span>Both (दोन्ही)</span>
            </button>
          </div>

          {saveFeedback && (
            <div
              style={{
                background: '#dcfce7',
                border: '2px solid #86efac',
                color: '#14532d',
                padding: '0.9rem 1.25rem',
                borderRadius: '12px',
                marginBottom: '1rem',
                fontWeight: 800,
                fontSize: '1.05rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
              }}
            >
              <CheckCircle2 size={22} color="#16a34a" />
              {saveFeedback.message}
            </div>
          )}

          {/* REGISTER SECTIONS */}
          <div className="register-grid">
            {/* MORNING SECTION */}
            {(activeSessionFilter === 'MORNING' || activeSessionFilter === 'BOTH') && (
              <div className="session-card morning">
                <div className="session-header">
                  <div className="session-title-wrap">
                    <Sun className="session-icon" color="#d97706" />
                    <div>
                      <h2 className="session-title">MORNING (सकाळ)</h2>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>6:00 AM – 10:00 AM</div>
                    </div>
                  </div>
                  <div>
                    {morningTotals.isRecorded ? (
                      <span className="status-pill recorded">
                        <CheckCircle2 size={13} /> {formatLitres(morningTotals.litres)}
                      </span>
                    ) : (
                      <span className="status-pill pending">
                        <Clock size={13} /> Pending
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  {filteredRows.map((r) => {
                    const qty = parseQuantityInput(r.morningQty);
                    const amount = calculateAmount(qty, r.rate);

                    return (
                      <div key={`morning-${r.provider.id}`} className="provider-touch-row">
                        <div className="provider-touch-info">
                          <div>
                            <div className="provider-touch-name">{r.provider.name}</div>
                            {r.isFinalized && (
                              <span style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 700 }}>
                                🔒 Finalized
                              </span>
                            )}
                          </div>
                          <div className="provider-touch-rate">₹{r.rate}/L</div>
                        </div>

                        <div className="touch-input-group">
                          <button
                            type="button"
                            className="stepper-btn"
                            onClick={() => handleAdjustQty(r.provider.id, 'MORNING', -0.5)}
                          >
                            -
                          </button>

                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              className="touch-number-input"
                              placeholder="0.0"
                              value={r.morningQty}
                              onChange={(e) => handleQtyChange(r.provider.id, 'MORNING', e.target.value)}
                            />
                            <div className="quick-chips-row">
                              <button
                                type="button"
                                className="quick-chip"
                                onClick={() => handleAdjustQty(r.provider.id, 'MORNING', 1.0)}
                              >
                                +1
                              </button>
                              <button
                                type="button"
                                className="quick-chip"
                                onClick={() => handleAdjustQty(r.provider.id, 'MORNING', 5.0)}
                              >
                                +5
                              </button>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="stepper-btn"
                            onClick={() => handleAdjustQty(r.provider.id, 'MORNING', 0.5)}
                          >
                            +
                          </button>

                          <div className="touch-amount-badge">
                            {qty > 0 ? formatRupees(amount) : '—'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="session-footer">
                  <div className="session-totals-bar">
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                      Total: <strong>{formatLitres(morningTotals.litres)}</strong>
                    </span>
                    <span style={{ fontWeight: 800, fontSize: '1.15rem', color: '#166534' }}>
                      {formatRupees(morningTotals.amount)}
                    </span>
                  </div>

                  <button
                    className="btn-large-action btn-save-morning"
                    onClick={() => handleSaveSession('MORNING')}
                  >
                    <Save size={20} />
                    <span>SAVE MORNING (सकाळ जतन करा)</span>
                  </button>
                </div>
              </div>
            )}

            {/* EVENING SECTION */}
            {(activeSessionFilter === 'EVENING' || activeSessionFilter === 'BOTH') && (
              <div className="session-card evening">
                <div className="session-header">
                  <div className="session-title-wrap">
                    <Moon className="session-icon" color="#2563eb" />
                    <div>
                      <h2 className="session-title">EVENING (संध्याकाळ)</h2>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>5:00 PM – 9:00 PM</div>
                    </div>
                  </div>
                  <div>
                    {eveningTotals.isRecorded ? (
                      <span className="status-pill recorded">
                        <CheckCircle2 size={13} /> {formatLitres(eveningTotals.litres)}
                      </span>
                    ) : (
                      <span className="status-pill pending">
                        <Clock size={13} /> Pending
                      </span>
                    )}
                  </div>
                </div>

                <div>
                  {filteredRows.map((r) => {
                    const qty = parseQuantityInput(r.eveningQty);
                    const amount = calculateAmount(qty, r.rate);

                    return (
                      <div key={`evening-${r.provider.id}`} className="provider-touch-row">
                        <div className="provider-touch-info">
                          <div>
                            <div className="provider-touch-name">{r.provider.name}</div>
                            {r.isFinalized && (
                              <span style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 700 }}>
                                🔒 Finalized
                              </span>
                            )}
                          </div>
                          <div className="provider-touch-rate">₹{r.rate}/L</div>
                        </div>

                        <div className="touch-input-group">
                          <button
                            type="button"
                            className="stepper-btn"
                            onClick={() => handleAdjustQty(r.provider.id, 'EVENING', -0.5)}
                          >
                            -
                          </button>

                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              className="touch-number-input"
                              placeholder="0.0"
                              value={r.eveningQty}
                              onChange={(e) => handleQtyChange(r.provider.id, 'EVENING', e.target.value)}
                            />
                            <div className="quick-chips-row">
                              <button
                                type="button"
                                className="quick-chip"
                                onClick={() => handleAdjustQty(r.provider.id, 'EVENING', 1.0)}
                              >
                                +1
                              </button>
                              <button
                                type="button"
                                className="quick-chip"
                                onClick={() => handleAdjustQty(r.provider.id, 'EVENING', 5.0)}
                              >
                                +5
                              </button>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="stepper-btn"
                            onClick={() => handleAdjustQty(r.provider.id, 'EVENING', 0.5)}
                          >
                            +
                          </button>

                          <div className="touch-amount-badge">
                            {qty > 0 ? formatRupees(amount) : '—'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="session-footer">
                  <div className="session-totals-bar">
                    <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                      Total: <strong>{formatLitres(eveningTotals.litres)}</strong>
                    </span>
                    <span style={{ fontWeight: 800, fontSize: '1.15rem', color: '#166534' }}>
                      {formatRupees(eveningTotals.amount)}
                    </span>
                  </div>

                  <button
                    className="btn-large-action btn-save-evening"
                    onClick={() => handleSaveSession('EVENING')}
                  >
                    <Save size={20} />
                    <span>SAVE EVENING (संध्याकाळ जतन करा)</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* DAILY CLOSING CARD */}
          <div className="closing-summary-card">
            <div className="closing-stats-grid">
              <div className="closing-stat-item">
                <span className="closing-stat-label">Morning Qty</span>
                <span className="closing-stat-value" style={{ color: '#d97706' }}>
                  {formatLitres(morningTotals.litres)}
                </span>
              </div>

              <div className="closing-stat-item">
                <span className="closing-stat-label">Evening Qty</span>
                <span className="closing-stat-value" style={{ color: '#2563eb' }}>
                  {formatLitres(eveningTotals.litres)}
                </span>
              </div>

              <div className="closing-stat-item">
                <span className="closing-stat-label">Total Milk</span>
                <span className="closing-stat-value" style={{ color: '#1b4332' }}>
                  {formatLitres(morningTotals.litres + eveningTotals.litres)}
                </span>
              </div>

              <div className="closing-stat-item">
                <span className="closing-stat-label">Total Payable</span>
                <span className="closing-stat-value" style={{ color: '#166534' }}>
                  {formatRupees(morningTotals.amount + eveningTotals.amount)}
                </span>
              </div>
            </div>

            <div>
              {isClosed ? (
                <button
                  className="btn-secondary"
                  style={{ width: '100%', minHeight: '50px', fontSize: '1.05rem', fontWeight: 800 }}
                  onClick={handleToggleDayClose}
                >
                  <Unlock size={18} />
                  <span>Reopen Day (दिवस पुन्हा उघडा)</span>
                </button>
              ) : (
                <button
                  className="btn-primary"
                  style={{ width: '100%', minHeight: '50px', fontSize: '1.05rem', fontWeight: 800 }}
                  onClick={handleToggleDayClose}
                >
                  <Lock size={18} />
                  <span>CLOSE DAY (दिवस बंद करा)</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Confirmation Safeguard Modal */}
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
