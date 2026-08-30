import React, { useState, useEffect, useMemo } from 'react';
import {
  UserPlus,
  Phone,
  TrendingUp,
  History,
  Edit2,
  Calendar
} from 'lucide-react';
import type { Provider, ProviderRate, MilkCollection } from '../types';
import { db, generateId } from '../services/db';
import { getProviderRateHistory, setProviderRate } from '../services/rateService';
import { getTodayKolkata, getNowKolkataISO } from '../services/dateService';
import { formatRupees, formatLitres } from '../services/formatters';
import { ProviderModal } from './Modals/ProviderModal';
import { RateChangeModal } from './Modals/RateChangeModal';
import { logAuditEntry } from '../services/auditService';

interface ProviderManagementProps {
  searchFilter: string;
}

export const ProviderManagement: React.FC<ProviderManagementProps> = ({ searchFilter }) => {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [rateHistory, setRateHistory] = useState<ProviderRate[]>([]);
  const [recentCollections, setRecentCollections] = useState<MilkCollection[]>([]);
  const [monthTotalLitres, setMonthTotalLitres] = useState<number>(0);
  const [monthTotalAmount, setMonthTotalAmount] = useState<number>(0);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [isRateModalOpen, setIsRateModalOpen] = useState<boolean>(false);
  const [providerForRate, setProviderForRate] = useState<{ id: string; name: string; default_rate: number } | null>(null);

  const loadProviders = async () => {
    const all = await db.providers.toArray();
    all.sort((a, b) => a.name.localeCompare(b.name));
    setProviders(all);
  };

  useEffect(() => {
    loadProviders();
  }, []);

  // When a provider is selected, load their rate history and recent collections
  useEffect(() => {
    if (!selectedProvider) return;

    const fetchDetails = async () => {
      const history = await getProviderRateHistory(selectedProvider.id);
      setRateHistory(history);

      const today = getTodayKolkata();
      const year = parseInt(today.slice(0, 4), 10);
      const month = parseInt(today.slice(5, 7), 10);
      const startOfMonth = `${year}-${month < 10 ? '0' + month : month}-01`;
      const endOfMonth = `${year}-${month < 10 ? '0' + month : month}-31`;

      const cols = await db.milk_collections
        .where('provider_id')
        .equals(selectedProvider.id)
        .toArray();

      // Recent 20 entries
      const sortedCols = cols.sort((a, b) => b.business_date.localeCompare(a.business_date) || (b.session === 'EVENING' ? 1 : -1));
      setRecentCollections(sortedCols.slice(0, 20));

      // Month totals
      const monthCols = cols.filter(c => c.business_date >= startOfMonth && c.business_date <= endOfMonth);
      let mQty = 0;
      let mAmt = 0;
      for (const c of monthCols) {
        mQty += c.quantity_litres;
        mAmt += c.amount;
      }
      setMonthTotalLitres(parseFloat(mQty.toFixed(2)));
      setMonthTotalAmount(parseFloat(mAmt.toFixed(2)));
    };

    fetchDetails();
  }, [selectedProvider]);

  const filteredProviders = useMemo(() => {
    if (!searchFilter.trim()) return providers;
    const query = searchFilter.toLowerCase();
    return providers.filter(p =>
      p.name.toLowerCase().includes(query) ||
      (p.phone && p.phone.includes(query))
    );
  }, [providers, searchFilter]);

  const handleSaveProvider = async (params: { name: string; phone?: string; defaultRate: number; active: boolean }) => {
    const now = getNowKolkataISO();
    const today = getTodayKolkata();

    if (editingProvider) {
      const oldVal = { ...editingProvider };
      editingProvider.name = params.name;
      editingProvider.phone = params.phone;
      editingProvider.active = params.active;
      editingProvider.default_rate = params.defaultRate;
      editingProvider.updated_at = now;

      await db.providers.put(editingProvider);

      await logAuditEntry({
        entity_type: 'PROVIDER',
        entity_id: editingProvider.id,
        action: 'UPDATE',
        old_value: oldVal,
        new_value: editingProvider,
        reason: `Updated provider details for ${params.name}`
      });

      if (selectedProvider?.id === editingProvider.id) {
        setSelectedProvider(editingProvider);
      }
    } else {
      const newId = generateId();
      const newProvider: Provider = {
        id: newId,
        name: params.name,
        phone: params.phone,
        active: params.active,
        default_rate: params.defaultRate,
        created_at: now,
        updated_at: now
      };

      await db.providers.add(newProvider);

      // Create initial rate record
      await db.provider_rates.add({
        id: generateId(),
        provider_id: newId,
        rate_per_litre: params.defaultRate,
        effective_from: today,
        effective_to: null,
        created_at: now
      });

      await logAuditEntry({
        entity_type: 'PROVIDER',
        entity_id: newId,
        action: 'CREATE',
        old_value: null,
        new_value: newProvider,
        reason: `Added new provider ${params.name} with rate ₹${params.defaultRate}/L`
      });
    }

    await loadProviders();
  };

  const handleUpdateRate = async (params: { providerId: string; newRate: number; effectiveFrom: string; reason: string }) => {
    await setProviderRate({
      providerId: params.providerId,
      newRate: params.newRate,
      effectiveFrom: params.effectiveFrom,
      reason: params.reason
    });

    await loadProviders();
    if (selectedProvider?.id === params.providerId) {
      const updated = await db.providers.get(params.providerId);
      if (updated) setSelectedProvider(updated);
    }
  };

  return (
    <div>
      <div className="view-header">
        <div className="view-title-group">
          <h1 className="view-heading">Milk Providers (दूध उत्पादक)</h1>
          <p className="view-subheading">
            Manage provider rates, contact info, rate history, and individual ledgers.
          </p>
        </div>

        <button className="btn-primary" onClick={() => { setEditingProvider(null); setIsAddModalOpen(true); }}>
          <UserPlus size={18} />
          <span>Add New Provider (नवीन उत्पादक)</span>
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selectedProvider ? '1fr 440px' : '1fr', gap: '1.5rem' }}>
        {/* Providers Grid */}
        <div className="provider-cards-grid">
          {filteredProviders.map((p) => {
            const isSelected = selectedProvider?.id === p.id;

            return (
              <div
                key={p.id}
                className="provider-card"
                style={{
                  borderColor: isSelected ? '#1b4332' : undefined,
                  background: isSelected ? '#f0fdf4' : '#ffffff',
                  borderWidth: isSelected ? '2px' : '1px'
                }}
                onClick={() => setSelectedProvider(p)}
              >
                <div>
                  <div className="provider-card-top">
                    <div>
                      <div className="provider-card-name">{p.name}</div>
                      {p.phone ? (
                        <div className="provider-card-phone">
                          <Phone size={13} /> {p.phone}
                        </div>
                      ) : (
                        <div className="provider-card-phone" style={{ color: '#94a3b8' }}>No phone</div>
                      )}
                    </div>
                    <div className="rate-badge-large">
                      {formatRupees(p.default_rate)}/L
                    </div>
                  </div>

                  <div className="provider-card-stats">
                    <div className="stat-box">
                      <span className="stat-box-label">Status</span>
                      <span className="stat-box-value" style={{ fontSize: '0.9rem', color: p.active ? '#16a34a' : '#94a3b8' }}>
                        {p.active ? '● Active' : '○ Inactive'}
                      </span>
                    </div>
                    <div className="stat-box" style={{ textAlign: 'right' }}>
                      <span className="stat-box-label">Action</span>
                      <span style={{ fontSize: '0.85rem', color: '#1b4332', fontWeight: 600 }}>
                        Click to view details →
                      </span>
                    </div>
                  </div>
                </div>

                <div className="provider-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    className="btn-secondary"
                    style={{ flex: 1, padding: '0.4rem 0.6rem', fontSize: '0.85rem', justifyContent: 'center' }}
                    onClick={() => {
                      setProviderForRate(p);
                      setIsRateModalOpen(true);
                    }}
                  >
                    <TrendingUp size={15} color="#1b4332" />
                    <span>Change Rate</span>
                  </button>
                  <button
                    className="btn-secondary"
                    style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                    onClick={() => {
                      setEditingProvider(p);
                      setIsAddModalOpen(true);
                    }}
                    title="Edit Provider Details"
                  >
                    <Edit2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Provider Details Drawer */}
        {selectedProvider && (
          <div
            style={{
              background: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              padding: '1.5rem',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
              height: 'fit-content'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#1e293b' }}>{selectedProvider.name}</h2>
                <div style={{ fontSize: '0.9rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.2rem' }}>
                  <Phone size={14} /> {selectedProvider.phone || 'No phone recorded'}
                </div>
              </div>
              <button
                className="modal-close-btn"
                onClick={() => setSelectedProvider(null)}
                title="Close drawer"
              >
                ✕
              </button>
            </div>

            {/* Current Month Summary */}
            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#166534', textTransform: 'uppercase', fontWeight: 700 }}>
                This Month's Summary
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Milk</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#1b4332' }}>{formatLitres(monthTotalLitres)}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total Payable</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#16a34a' }}>{formatRupees(monthTotalAmount)}</div>
                </div>
              </div>
            </div>

            {/* Rate History Timeline */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#334155', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <History size={16} /> Rate History
                </h3>
                <button
                  className="btn-secondary"
                  style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                  onClick={() => {
                    setProviderForRate(selectedProvider);
                    setIsRateModalOpen(true);
                  }}
                >
                  + New Rate
                </button>
              </div>

              <div className="rate-timeline">
                {rateHistory.map((rh) => (
                  <div
                    key={rh.id}
                    className={`rate-timeline-item ${!rh.effective_to ? 'active-rate' : ''}`}
                  >
                    <div>
                      <div className="rate-timeline-dates">
                        {rh.effective_from} → {rh.effective_to ? rh.effective_to : 'Present (चालू)'}
                      </div>
                      {!rh.effective_to && (
                        <span style={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 700 }}>
                          ● Current Active Rate
                        </span>
                      )}
                    </div>
                    <div className="rate-timeline-val">{formatRupees(rh.rate_per_litre)}/L</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Collections */}
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#334155', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Calendar size={16} /> Recent Milk Entries
              </h3>

              <div style={{ maxHeight: '220px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                  <thead style={{ background: '#f8fafc', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Date</th>
                      <th style={{ padding: '0.5rem', textAlign: 'left' }}>Session</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Qty</th>
                      <th style={{ padding: '0.5rem', textAlign: 'right' }}>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentCollections.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.5rem' }}>{c.business_date}</td>
                        <td style={{ padding: '0.5rem' }}>{c.session === 'MORNING' ? '☀️ Morn' : '🌙 Eve'}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 600 }}>{formatLitres(c.quantity_litres)}</td>
                        <td style={{ padding: '0.5rem', textAlign: 'right', color: '#166534', fontWeight: 600 }}>{formatRupees(c.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit Provider Modal */}
      <ProviderModal
        isOpen={isAddModalOpen}
        provider={editingProvider}
        onClose={() => { setIsAddModalOpen(false); setEditingProvider(null); }}
        onSubmit={handleSaveProvider}
      />

      {/* Rate Change Modal */}
      <RateChangeModal
        isOpen={isRateModalOpen}
        provider={providerForRate}
        onClose={() => { setIsRateModalOpen(false); setProviderForRate(null); }}
        onSubmit={handleUpdateRate}
      />
    </div>
  );
};
