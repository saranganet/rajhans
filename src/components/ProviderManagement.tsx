import React, { useState, useEffect, useMemo } from 'react';
import {
  UserPlus,
  TrendingUp,
  Phone,
  Edit2,
  Trash2,
  X
} from 'lucide-react';
import type { Provider, ProviderRate, MilkCollection } from '../types';
import { db, generateId, syncRedundancySnapshot } from '../services/db';
import { getEffectiveRate, getProviderRateHistory, setProviderRate } from '../services/rateService';
import { getTodayKolkata, getNowKolkataISO } from '../services/dateService';
import { formatRupees, formatLitres } from '../services/formatters';
import { logAuditEntry } from '../services/auditService';
import { ProviderModal } from './Modals/ProviderModal';
import { RateChangeModal } from './Modals/RateChangeModal';
import { ConfirmationModal } from './Modals/ConfirmationModal';

interface ProviderCardData {
  provider: Provider;
  currentRate: number;
  rates: ProviderRate[];
  recentCollections: MilkCollection[];
  totalLitresMonth: number;
  totalAmountMonth: number;
}

interface ProviderManagementProps {
  searchFilter?: string;
}

export const ProviderManagement: React.FC<ProviderManagementProps> = ({ searchFilter = '' }) => {
  const [providersData, setProvidersData] = useState<ProviderCardData[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [rateChangeProvider, setRateChangeProvider] = useState<{ id: string; name: string; currentRate: number } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; provider: Provider | null }>({
    isOpen: false,
    provider: null
  });

  const today = getTodayKolkata();

  const loadProviders = async () => {
    try {
      const allProviders = await db.providers.toArray();
      const currentMonthPrefix = today.substring(0, 7);

      const list: ProviderCardData[] = [];

      for (const p of allProviders) {
        const currentRate = await getEffectiveRate(p.id, today);
        const rates = await getProviderRateHistory(p.id);
        const collections = await db.milk_collections
          .where('[provider_id+business_date]')
          .between([p.id, `${currentMonthPrefix}-01`], [p.id, `${currentMonthPrefix}-31`], true, true)
          .toArray();

        let totalL = 0;
        let totalAmt = 0;
        for (const c of collections) {
          totalL += c.quantity_litres;
          totalAmt += c.amount;
        }

        const recent = await db.milk_collections
          .where('provider_id')
          .equals(p.id)
          .reverse()
          .limit(8)
          .toArray();

        list.push({
          provider: p,
          currentRate,
          rates,
          recentCollections: recent,
          totalLitresMonth: parseFloat(totalL.toFixed(2)),
          totalAmountMonth: parseFloat(totalAmt.toFixed(2))
        });
      }

      list.sort((a, b) => a.provider.name.localeCompare(b.provider.name));
      setProvidersData(list);
    } catch (err) {
      console.error('Failed to load providers list:', err);
    }
  };

  useEffect(() => {
    loadProviders();
  }, []);

  const filteredList = useMemo(() => {
    if (!searchFilter.trim()) return providersData;
    const q = searchFilter.toLowerCase();
    return providersData.filter(item =>
      item.provider.name.toLowerCase().includes(q) ||
      (item.provider.phone && item.provider.phone.includes(q))
    );
  }, [providersData, searchFilter]);

  const activeProvider = useMemo(() => {
    return providersData.find(d => d.provider.id === selectedProviderId) || null;
  }, [providersData, selectedProviderId]);

  // Handle Add/Edit Provider
  const handleSaveProvider = async (params: { name: string; phone?: string; defaultRate: number; active: boolean }) => {
    const now = getNowKolkataISO();

    if (editingProvider) {
      const oldVal = { ...editingProvider };
      const updated: Provider = {
        ...editingProvider,
        name: params.name,
        phone: params.phone,
        active: params.active,
        default_rate: params.defaultRate,
        updated_at: now
      };
      await db.providers.put(updated);

      await logAuditEntry({
        entity_type: 'PROVIDER',
        entity_id: updated.id,
        action: 'UPDATE',
        old_value: oldVal,
        new_value: updated,
        reason: `Updated provider ${params.name}`
      });
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
        reason: `Added provider ${params.name} with rate ₹${params.defaultRate}/L`
      });
    }

    await syncRedundancySnapshot();
    setIsAddModalOpen(false);
    setEditingProvider(null);
    await loadProviders();
  };

  // Handle Rate Change Submit
  const handleRateChangeSubmit = async (params: { providerId: string; newRate: number; effectiveFrom: string; reason: string }) => {
    await setProviderRate({
      providerId: params.providerId,
      newRate: params.newRate,
      effectiveFrom: params.effectiveFrom,
      reason: params.reason
    });
    setRateChangeProvider(null);
    await loadProviders();
  };

  // Handle Delete Provider
  const executeDeleteProvider = async () => {
    if (!deleteConfirm.provider) return;
    const p = deleteConfirm.provider;

    try {
      await db.transaction('rw', [db.providers, db.provider_rates, db.milk_collections, db.settlements, db.payments], async () => {
        await db.providers.delete(p.id);
        await db.provider_rates.where('provider_id').equals(p.id).delete();
      });

      await logAuditEntry({
        entity_type: 'PROVIDER',
        entity_id: p.id,
        action: 'DELETE',
        old_value: p,
        new_value: null,
        reason: `Deleted provider ${p.name}`
      });

      await syncRedundancySnapshot();
      setDeleteConfirm({ isOpen: false, provider: null });
      if (selectedProviderId === p.id) {
        setSelectedProviderId(null);
      }
      await loadProviders();
    } catch (err) {
      alert('Failed to delete provider.');
    }
  };

  return (
    <div>
      {/* Header & Add Action */}
      <div className="view-header">
        <div className="view-title-group">
          <h1 className="view-heading">Milk Providers (दूध उत्पादक)</h1>
          <p className="view-subheading">
            Manage provider names, custom rates per litre, and individual ledgers.
          </p>
        </div>

        <button
          className="btn-primary"
          style={{ width: '100%', maxWidth: '320px' }}
          onClick={() => {
            setEditingProvider(null);
            setIsAddModalOpen(true);
          }}
        >
          <UserPlus size={20} />
          <span>+ Add New Provider (नवीन उत्पादक)</span>
        </button>
      </div>

      {/* Empty State when 0 providers */}
      {providersData.length === 0 ? (
        <div
          style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '2px dashed #cbd5e1',
            padding: '3rem 1.5rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '1rem'
          }}
        >
          <div style={{ fontSize: '3rem' }}>👥</div>
          <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#1e293b' }}>
            No Providers Added Yet (अद्याप उत्पादक जोडलेले नाहीत)
          </h3>
          <p style={{ color: '#64748b', maxWidth: '400px', fontSize: '0.95rem' }}>
            Add your first milk provider with their name and rate per litre to begin recording daily milk.
          </p>
          <button
            className="btn-primary"
            style={{ minHeight: '52px', padding: '0 1.75rem' }}
            onClick={() => {
              setEditingProvider(null);
              setIsAddModalOpen(true);
            }}
          >
            <UserPlus size={20} />
            <span>+ Add First Provider (पहिला उत्पादक जोडा)</span>
          </button>
        </div>
      ) : (
        /* Provider Cards Grid */
        <div className="provider-cards-grid">
          {filteredList.map((item) => (
            <div
              key={item.provider.id}
              className="provider-card"
              onClick={() => setSelectedProviderId(item.provider.id)}
            >
              <div className="provider-card-top">
                <div>
                  <div className="provider-card-name">{item.provider.name}</div>
                  {item.provider.phone ? (
                    <div className="provider-card-phone">
                      <Phone size={13} /> {item.provider.phone}
                    </div>
                  ) : (
                    <div className="provider-card-phone">No phone</div>
                  )}
                </div>

                <div className="rate-badge-large">
                  ₹{item.currentRate}/L
                </div>
              </div>

              {/* Monthly Stats */}
              <div className="provider-card-stats">
                <div className="stat-box">
                  <span className="stat-box-label">This Month Milk</span>
                  <span className="stat-box-value" style={{ color: '#1b4332' }}>
                    {formatLitres(item.totalLitresMonth)}
                  </span>
                </div>
                <div className="stat-box" style={{ textAlign: 'right' }}>
                  <span className="stat-box-label">Total Payable</span>
                  <span className="stat-box-value" style={{ color: '#166534' }}>
                    {formatRupees(item.totalAmountMonth)}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="provider-card-actions" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flex: 1, minHeight: '44px', fontSize: '0.85rem', padding: '0 0.5rem' }}
                  onClick={() => setRateChangeProvider({
                    id: item.provider.id,
                    name: item.provider.name,
                    currentRate: item.currentRate
                  })}
                >
                  <TrendingUp size={15} color="#d97706" />
                  <span>Rate (दर बदला)</span>
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{ minHeight: '44px', padding: '0 0.75rem' }}
                  onClick={() => {
                    setEditingProvider(item.provider);
                    setIsAddModalOpen(true);
                  }}
                  title="Edit details"
                >
                  <Edit2 size={16} />
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{ minHeight: '44px', padding: '0 0.75rem', color: '#dc2626', borderColor: '#fecaca' }}
                  onClick={() => setDeleteConfirm({ isOpen: true, provider: item.provider })}
                  title="Delete provider"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MOBILE-FIRST PROVIDER DETAILS & LEDGER MODAL / SHEET */}
      {activeProvider && (
        <div className="modal-backdrop" onClick={() => setSelectedProviderId(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase' }}>
                  Provider Ledger (उत्पादक खाते)
                </div>
                <h3 className="modal-title">{activeProvider.provider.name}</h3>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedProviderId(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {/* Rate & Contact Highlight */}
              <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>CURRENT APPLICABLE RATE</div>
                  <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#1b4332' }}>
                    ₹{activeProvider.currentRate.toFixed(2)}<span style={{ fontSize: '1rem', fontWeight: 600 }}>/L</span>
                  </div>
                </div>

                <button
                  className="btn-secondary"
                  style={{ height: '42px', fontSize: '0.85rem' }}
                  onClick={() => setRateChangeProvider({
                    id: activeProvider.provider.id,
                    name: activeProvider.provider.name,
                    currentRate: activeProvider.currentRate
                  })}
                >
                  <TrendingUp size={16} color="#d97706" /> Update Rate
                </button>
              </div>

              {/* Rate Revision History */}
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1e293b', marginBottom: '0.6rem' }}>
                  Rate History (दरांचा इतिहास)
                </div>
                <div className="rate-timeline">
                  {activeProvider.rates.map((r, idx) => (
                    <div key={r.id} className={`rate-timeline-item ${idx === 0 ? 'active-rate' : ''}`}>
                      <div className="rate-timeline-dates">
                        {r.effective_from} {r.effective_to ? `to ${r.effective_to}` : '→ Present'}
                      </div>
                      <div className="rate-timeline-val">
                        ₹{r.rate_per_litre.toFixed(2)}/L
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Milk Entries */}
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.95rem', color: '#1e293b', marginBottom: '0.6rem' }}>
                  Recent Milk Entries (अलीकडील दूध नोंदी)
                </div>
                {activeProvider.recentCollections.length === 0 ? (
                  <div style={{ color: '#94a3b8', fontSize: '0.85rem', padding: '0.5rem 0' }}>
                    No milk recorded yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                    {activeProvider.recentCollections.map(col => (
                      <div
                        key={col.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.55rem 0.75rem',
                          background: '#ffffff',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          fontSize: '0.85rem'
                        }}
                      >
                        <div>
                          <strong>{col.business_date}</strong> ({col.session === 'MORNING' ? '☀️ Morning' : '🌙 Evening'})
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 700 }}>{formatLitres(col.quantity_litres)}</span> @ ₹{col.rate_per_litre} = <strong style={{ color: '#166534' }}>{formatRupees(col.amount)}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Delete Provider Danger Zone */}
              <div style={{ marginTop: '0.75rem', borderTop: '1px solid #fee2e2', paddingTop: '0.75rem' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: '100%', color: '#dc2626', borderColor: '#fca5a5', background: '#fff5f5' }}
                  onClick={() => setDeleteConfirm({ isOpen: true, provider: activeProvider.provider })}
                >
                  <Trash2 size={16} />
                  <span>Delete Provider (हा उत्पादक हटवा)</span>
                </button>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" style={{ width: '100%' }} onClick={() => setSelectedProviderId(null)}>
                Close (बंद करा)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Provider Modal */}
      <ProviderModal
        isOpen={isAddModalOpen}
        provider={editingProvider}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingProvider(null);
        }}
        onSubmit={handleSaveProvider}
      />

      {/* Rate Change Modal */}
      {rateChangeProvider && (
        <RateChangeModal
          isOpen={true}
          provider={{
            id: rateChangeProvider.id,
            name: rateChangeProvider.name,
            default_rate: rateChangeProvider.currentRate
          }}
          onClose={() => setRateChangeProvider(null)}
          onSubmit={handleRateChangeSubmit}
        />
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteConfirm.isOpen}
        title="Delete Provider? (उत्पादक हटवायचा का?)"
        message={`Are you sure you want to delete ${deleteConfirm.provider?.name || ''}? All their rate settings will be permanently removed.`}
        isDangerous={true}
        confirmText="Yes, Delete (होय, हटवा)"
        cancelText="Cancel (रद्द करा)"
        onConfirm={executeDeleteProvider}
        onCancel={() => setDeleteConfirm({ isOpen: false, provider: null })}
      />
    </div>
  );
};
