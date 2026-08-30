export type SessionType = 'MORNING' | 'EVENING';

export type SettlementStatus = 'OPEN' | 'FINALIZED';
export type PaymentStatus = 'UNPAID' | 'PAID';
export type PaymentMethod = 'CASH' | 'BANK' | 'UPI';

export interface Provider {
  id: string;
  name: string;
  phone?: string;
  active: boolean;
  default_rate: number;
  created_at: string;
  updated_at: string;
}

export interface ProviderRate {
  id: string;
  provider_id: string;
  rate_per_litre: number;
  effective_from: string; // YYYY-MM-DD in Asia/Kolkata
  effective_to: string | null; // null if currently active
  created_at: string;
}

export interface MilkCollection {
  id: string;
  provider_id: string;
  business_date: string; // YYYY-MM-DD in Asia/Kolkata
  session: SessionType;
  quantity_litres: number;
  rate_per_litre: number; // Stored at collection time
  amount: number; // Exact amount (quantity * rate, rounded to 2 decimals)
  created_at: string;
  updated_at: string;
}

export interface DailyClosing {
  id: string;
  business_date: string; // YYYY-MM-DD in Asia/Kolkata
  morning_total_litres: number;
  evening_total_litres: number;
  total_litres: number;
  morning_amount: number;
  evening_amount: number;
  total_amount: number;
  providers_count: number;
  is_closed: boolean;
  closed_at: string | null;
}

export interface SettlementPeriodInfo {
  year: number;
  month: number; // 1-12
  period_index: 1 | 2 | 3;
  period_start: string; // YYYY-MM-DD
  period_end: string;   // YYYY-MM-DD
  month_name: string;
  total_days_in_month: number;
  label: string; // e.g. "1–10 August 2026"
}

export interface ProviderSettlementSummary {
  provider_id: string;
  provider_name: string;
  provider_phone?: string;
  period_info: SettlementPeriodInfo;
  total_litres: number;
  total_amount: number;
  rates_used: { rate: number; litres: number; amount: number }[];
  morning_litres: number;
  evening_litres: number;
  collections_count: number;
  is_finalized: boolean;
  finalized_at?: string | null;
  payment?: Payment | null;
}

export interface Settlement {
  id: string;
  provider_id: string;
  year: number;
  month: number;
  period_index: 1 | 2 | 3;
  period_start: string;
  period_end: string;
  total_litres: number;
  total_amount: number;
  status: SettlementStatus;
  finalized_at: string | null;
}

export interface Payment {
  id: string;
  settlement_id: string;
  provider_id: string;
  amount_paid: number;
  paid_at: string;
  payment_method: PaymentMethod;
  notes?: string;
  status: PaymentStatus;
}

export interface AuditLog {
  id: string;
  entity_type: 'COLLECTION' | 'PROVIDER_RATE' | 'SETTLEMENT' | 'PAYMENT' | 'DAILY_CLOSING' | 'PROVIDER';
  entity_id: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'FINALIZE' | 'REOPEN' | 'PAY';
  old_value: any;
  new_value: any;
  reason?: string;
  timestamp: string; // Asia/Kolkata ISO
}

export interface DailySessionSummary {
  business_date: string;
  session: SessionType;
  is_recorded: boolean;
  total_litres: number;
  total_amount: number;
  providers_recorded_count: number;
  entries: MilkCollection[];
}

export interface MonthlyDashboardMetrics {
  year: number;
  month: number;
  month_name: string;
  total_milk_litres: number;
  morning_milk_litres: number;
  evening_milk_litres: number;
  total_payable: number;
  total_paid: number;
  total_pending: number;
  active_providers_count: number;
  days_closed_count: number;
  total_days: number;
}
