import React, { useState, useEffect, useMemo } from 'react';
import { Filter, ArrowRight } from 'lucide-react';
import type { AuditLog } from '../types';
import { getRecentAuditLogs } from '../services/auditService';
import { formatTimestampIST, formatRupees, formatLitres } from '../services/formatters';

interface AuditLogViewProps {
  searchFilter: string;
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ searchFilter }) => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [entityFilter, setEntityFilter] = useState<string>('ALL');

  const loadLogs = async () => {
    try {
      const data = await getRecentAuditLogs(150);
      setLogs(data);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesEntity = entityFilter === 'ALL' || log.entity_type === entityFilter;
      const matchesSearch = !searchFilter.trim() ||
        (log.reason && log.reason.toLowerCase().includes(searchFilter.toLowerCase())) ||
        log.entity_type.toLowerCase().includes(searchFilter.toLowerCase()) ||
        log.action.toLowerCase().includes(searchFilter.toLowerCase());

      return matchesEntity && matchesSearch;
    });
  }, [logs, entityFilter, searchFilter]);

  const renderValueSnippet = (val: any) => {
    if (!val) return <span style={{ color: '#94a3b8' }}>—</span>;
    if (typeof val === 'object') {
      if (val.quantity_litres !== undefined) {
        return (
          <span>
            {formatLitres(val.quantity_litres)} (@ ₹{val.rate_per_litre}/L = {formatRupees(val.amount)})
          </span>
        );
      }
      if (val.rate_per_litre !== undefined) {
        return <span>₹{val.rate_per_litre}/L (eff. {val.effective_from})</span>;
      }
      if (val.total_litres !== undefined) {
        return <span>{formatLitres(val.total_litres)} ({formatRupees(val.total_amount)})</span>;
      }
      if (val.amount_paid !== undefined) {
        return <span>{formatRupees(val.amount_paid)} via {val.payment_method}</span>;
      }
      return <span style={{ fontSize: '0.8rem' }}>{JSON.stringify(val).slice(0, 45)}</span>;
    }
    return String(val);
  };

  return (
    <div>
      <div className="view-header">
        <div className="view-title-group">
          <h1 className="view-heading">Audit Trail (बदल नोंदवही)</h1>
          <p className="view-subheading">
            Immutable log of all milk quantity changes, rate revisions, payments, and settlements to prevent financial discrepancies.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#fff', padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <Filter size={16} color="#1b4332" />
            <select
              className="form-select"
              style={{ border: 'none', padding: '0.35rem', fontWeight: 600 }}
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
            >
              <option value="ALL">All Categories</option>
              <option value="COLLECTION">Milk Collections</option>
              <option value="PROVIDER_RATE">Rate Changes</option>
              <option value="SETTLEMENT">10-Day Settlements</option>
              <option value="PAYMENT">Payments</option>
              <option value="DAILY_CLOSING">Daily Closing</option>
              <option value="PROVIDER">Providers</option>
            </select>
          </div>
        </div>
      </div>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '18%' }}>Timestamp (IST)</th>
              <th style={{ width: '12%' }}>Category</th>
              <th style={{ width: '10%' }}>Action</th>
              <th style={{ width: '30%' }}>Previous → New Value</th>
              <th style={{ width: '30%' }}>Reason / Details</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', padding: '3rem', color: '#64748b' }}>
                  No audit entries found matching the criteria.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log) => {
                const isUpdate = log.action === 'UPDATE';
                const isFinalize = log.action === 'FINALIZE';
                const isPay = log.action === 'PAY';

                return (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.85rem', fontWeight: 600, color: '#334155' }}>
                      {formatTimestampIST(log.timestamp)}
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          padding: '0.2rem 0.5rem',
                          borderRadius: '4px',
                          background: '#f1f5f9',
                          color: '#334155'
                        }}
                      >
                        {log.entity_type}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          color: isPay || isFinalize ? '#166534' : isUpdate ? '#d97706' : '#2563eb'
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                        {log.old_value && (
                          <span className="diff-badge old">{renderValueSnippet(log.old_value)}</span>
                        )}
                        {log.old_value && log.new_value && <ArrowRight size={14} color="#94a3b8" />}
                        {log.new_value && (
                          <span className="diff-badge new">{renderValueSnippet(log.new_value)}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.9rem', color: '#1e293b' }}>
                      {log.reason || '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
