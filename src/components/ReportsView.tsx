import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Download,
  Users,
  Milk,
  IndianRupee,
  CheckCircle2,
  AlertTriangle,
  ArrowUpDown
} from 'lucide-react';
import type { MonthlyDashboardMetrics } from '../types';
import { db } from '../services/db';
import {
  getTodayKolkata,
  getMonthsForYear,
  getDaysInMonth,
  formatDateStr
} from '../services/dateService';
import { getMonthlyDashboardMetrics } from '../services/settlementService';
import { formatRupees, formatLitres } from '../services/formatters';

interface ProviderMonthlyRow {
  provider_id: string;
  provider_name: string;
  phone?: string;
  morning_litres: number;
  evening_litres: number;
  total_litres: number;
  total_amount: number;
  paid_amount: number;
  pending_amount: number;
  days_supplied: number;
}

interface ReportsViewProps {
  searchFilter: string;
}

export const ReportsView: React.FC<ReportsViewProps> = ({ searchFilter }) => {
  const today = getTodayKolkata();
  const currentYear = parseInt(today.slice(0, 4), 10);
  const currentMonth = parseInt(today.slice(5, 7), 10);

  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth);
  const [metrics, setMetrics] = useState<MonthlyDashboardMetrics | null>(null);
  const [providerRows, setProviderRows] = useState<ProviderMonthlyRow[]>([]);
  const [sortField, setSortField] = useState<keyof ProviderMonthlyRow>('total_litres');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const months = useMemo(() => getMonthsForYear(selectedYear), [selectedYear]);

  const loadReportData = async () => {
    try {
      const m = await getMonthlyDashboardMetrics(selectedYear, selectedMonth);
      setMetrics(m);

      const totalDays = getDaysInMonth(selectedYear, selectedMonth);
      const startDate = formatDateStr(selectedYear, selectedMonth, 1);
      const endDate = formatDateStr(selectedYear, selectedMonth, totalDays);

      const providers = await db.providers.toArray();
      const collections = await db.milk_collections
        .where('business_date')
        .between(startDate, endDate, true, true)
        .toArray();

      const settlements = await db.settlements
        .where(['year', 'month'])
        .equals([selectedYear, selectedMonth])
        .toArray();

      const payments = await db.payments.toArray();

      const rows: ProviderMonthlyRow[] = [];

      for (const p of providers) {
        const pCols = collections.filter(c => c.provider_id === p.id);
        if (pCols.length === 0 && !p.active) continue;

        let morningLitres = 0;
        let eveningLitres = 0;
        let totalAmount = 0;
        const distinctDates = new Set<string>();

        for (const c of pCols) {
          distinctDates.add(c.business_date);
          totalAmount += c.amount;
          if (c.session === 'MORNING') {
            morningLitres += c.quantity_litres;
          } else {
            eveningLitres += c.quantity_litres;
          }
        }

        // Total payments for this provider in this month
        const pSettlements = settlements.filter(s => s.provider_id === p.id);
        let paidAmount = 0;
        for (const s of pSettlements) {
          const pm = payments.find(pay => pay.settlement_id === s.id);
          if (pm) paidAmount += pm.amount_paid;
        }

        const totL = parseFloat((morningLitres + eveningLitres).toFixed(2));
        const totAmt = parseFloat(totalAmount.toFixed(2));

        rows.push({
          provider_id: p.id,
          provider_name: p.name,
          phone: p.phone,
          morning_litres: parseFloat(morningLitres.toFixed(2)),
          evening_litres: parseFloat(eveningLitres.toFixed(2)),
          total_litres: totL,
          total_amount: totAmt,
          paid_amount: parseFloat(paidAmount.toFixed(2)),
          pending_amount: parseFloat(Math.max(0, totAmt - paidAmount).toFixed(2)),
          days_supplied: distinctDates.size
        });
      }

      setProviderRows(rows);
    } catch (err) {
      console.error('Failed to load report data:', err);
    }
  };

  useEffect(() => {
    loadReportData();
  }, [selectedYear, selectedMonth]);

  const handleSort = (field: keyof ProviderMonthlyRow) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const filteredAndSortedRows = useMemo(() => {
    let result = providerRows;
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase();
      result = result.filter(r =>
        r.provider_name.toLowerCase().includes(q) ||
        (r.phone && r.phone.includes(q))
      );
    }

    return result.sort((a, b) => {
      const valA = a[sortField];
      const valB = b[sortField];
      if (typeof valA === 'string') {
        return sortAsc
          ? (valA as string).localeCompare(valB as string)
          : (valB as string).localeCompare(valA as string);
      }
      return sortAsc ? (valA as number) - (valB as number) : (valB as number) - (valA as number);
    });
  }, [providerRows, searchFilter, sortField, sortAsc]);

  const handleExportCSV = () => {
    if (providerRows.length === 0) return;

    const monthName = months.find(m => m.month === selectedMonth)?.name || selectedMonth;
    const header = ['Provider Name', 'Phone', 'Days Supplied', 'Morning (L)', 'Evening (L)', 'Total Milk (L)', 'Total Payable (Rs)', 'Paid (Rs)', 'Pending (Rs)'];
    const rows = providerRows.map(r => [
      `"${r.provider_name}"`,
      `"${r.phone || ''}"`,
      r.days_supplied,
      r.morning_litres,
      r.evening_litres,
      r.total_litres,
      r.total_amount,
      r.paid_amount,
      r.pending_amount
    ]);

    const csvContent = [header.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rajhans_dairy_monthly_${selectedYear}_${monthName}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="view-header">
        <div className="view-title-group">
          <h1 className="view-heading">Monthly Reports & Analytics (मासिक अहवाल)</h1>
          <p className="view-subheading">
            Comprehensive business dashboard, provider summaries, and milk yield insights.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#fff', padding: '0.35rem 0.65rem', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
            <Calendar size={18} color="#1b4332" />
            <select
              className="form-select"
              style={{ border: 'none', padding: '0.35rem', fontWeight: 700 }}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(parseInt(e.target.value, 10))}
            >
              {months.map((m) => (
                <option key={m.month} value={m.month}>
                  {m.name}
                </option>
              ))}
            </select>

            <select
              className="form-select"
              style={{ border: 'none', padding: '0.35rem', fontWeight: 700 }}
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
            >
              <option value={2025}>2025</option>
              <option value={2026}>2026</option>
              <option value={2027}>2027</option>
            </select>
          </div>

          <button className="btn-secondary" onClick={handleExportCSV}>
            <Download size={18} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {metrics && (
        <div className="metrics-overview-grid">
          <div className="metric-summary-card">
            <div className="metric-card-header">
              <span className="metric-card-title">Total Milk Collected</span>
              <Milk className="metric-card-icon" />
            </div>
            <div className="metric-card-value" style={{ color: '#1b4332' }}>
              {formatLitres(metrics.total_milk_litres)}
            </div>
            <div className="metric-card-subtitle">
              ☀️ {formatLitres(metrics.morning_milk_litres)} | 🌙 {formatLitres(metrics.evening_milk_litres)}
            </div>
          </div>

          <div className="metric-summary-card">
            <div className="metric-card-header">
              <span className="metric-card-title">Total Payable</span>
              <IndianRupee className="metric-card-icon" />
            </div>
            <div className="metric-card-value">
              {formatRupees(metrics.total_payable)}
            </div>
            <div className="metric-card-subtitle">
              Total monthly billing
            </div>
          </div>

          <div className="metric-summary-card">
            <div className="metric-card-header">
              <span className="metric-card-title">Paid Amount</span>
              <CheckCircle2 className="metric-card-icon" style={{ color: '#16a34a' }} />
            </div>
            <div className="metric-card-value" style={{ color: '#16a34a' }}>
              {formatRupees(metrics.total_paid)}
            </div>
            <div className="metric-card-subtitle">
              Settlements cleared
            </div>
          </div>

          <div className="metric-summary-card">
            <div className="metric-card-header">
              <span className="metric-card-title">Pending Balance</span>
              <AlertTriangle className="metric-card-icon" style={{ color: '#d97706' }} />
            </div>
            <div className="metric-card-value" style={{ color: '#d97706' }}>
              {formatRupees(metrics.total_pending)}
            </div>
            <div className="metric-card-subtitle">
              Due to providers
            </div>
          </div>

          <div className="metric-summary-card">
            <div className="metric-card-header">
              <span className="metric-card-title">Active Providers</span>
              <Users className="metric-card-icon" />
            </div>
            <div className="metric-card-value">
              {metrics.active_providers_count}
            </div>
            <div className="metric-card-subtitle">
              {metrics.days_closed_count} of {metrics.total_days} days closed
            </div>
          </div>
        </div>
      )}

      {/* Provider-level Monthly Breakdown Table */}
      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('provider_name')} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  Provider Name <ArrowUpDown size={14} />
                </div>
              </th>
              <th>Days Supplied</th>
              <th onClick={() => handleSort('morning_litres')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                Morning (L)
              </th>
              <th onClick={() => handleSort('evening_litres')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                Evening (L)
              </th>
              <th onClick={() => handleSort('total_litres')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                  Total Milk <ArrowUpDown size={14} />
                </div>
              </th>
              <th onClick={() => handleSort('total_amount')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                  Total Amount <ArrowUpDown size={14} />
                </div>
              </th>
              <th onClick={() => handleSort('paid_amount')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                Paid (₹)
              </th>
              <th onClick={() => handleSort('pending_amount')} style={{ cursor: 'pointer', textAlign: 'right' }}>
                Pending (₹)
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedRows.map((row) => (
              <tr key={row.provider_id}>
                <td>
                  <div style={{ fontWeight: 700, color: '#1e293b' }}>{row.provider_name}</div>
                  {row.phone && <div style={{ fontSize: '0.8rem', color: '#64748b' }}>📞 {row.phone}</div>}
                </td>
                <td>
                  <span style={{ fontWeight: 600 }}>{row.days_supplied}</span> / {metrics?.total_days} days
                </td>
                <td style={{ textAlign: 'right' }}>{formatLitres(row.morning_litres)}</td>
                <td style={{ textAlign: 'right' }}>{formatLitres(row.evening_litres)}</td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#1b4332' }}>
                  {formatLitres(row.total_litres)}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 800, color: '#14532d' }}>
                  {formatRupees(row.total_amount)}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>
                  {formatRupees(row.paid_amount)}
                </td>
                <td style={{ textAlign: 'right', fontWeight: 700, color: row.pending_amount > 0 ? '#dc2626' : '#64748b' }}>
                  {formatRupees(row.pending_amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
