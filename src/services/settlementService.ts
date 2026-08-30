import { db, generateId, syncRedundancySnapshot } from './db';
import type {
  Settlement,
  Payment,
  SettlementPeriodInfo,
  ProviderSettlementSummary,
  MonthlyDashboardMetrics
} from '../types';
import {
  getSettlementPeriods,
  getDaysInMonth,
  getFormattedDateDetails,
  getNowKolkataISO,
  formatDateStr
} from './dateService';
import { getProviderCollectionsInRange } from './milkService';
import { logAuditEntry } from './auditService';

/**
 * Checks if a specific settlement period is finalized for a provider.
 */
export async function isSettlementFinalized(
  providerId: string,
  year: number,
  month: number,
  periodIndex: 1 | 2 | 3
): Promise<boolean> {
  const settlement = await db.settlements
    .where(['provider_id', 'year', 'month', 'period_index'])
    .equals([providerId, year, month, periodIndex])
    .first();

  return settlement?.status === 'FINALIZED';
}

/**
 * Checks if any settlement covering a specific date is finalized for a provider.
 */
export async function isDateFinalizedForProvider(
  providerId: string,
  businessDate: string
): Promise<boolean> {
  const details = getFormattedDateDetails(businessDate);
  const periodIndex = (details.day <= 10 ? 1 : details.day <= 20 ? 2 : 3) as 1 | 2 | 3;
  return isSettlementFinalized(providerId, details.year, details.month, periodIndex);
}

/**
 * Computes the 10-day settlement summary for a single provider in a given period.
 */
export async function getProviderSettlementSummary(
  providerId: string,
  period: SettlementPeriodInfo
): Promise<ProviderSettlementSummary> {
  const provider = await db.providers.get(providerId);
  const collections = await getProviderCollectionsInRange(
    providerId,
    period.period_start,
    period.period_end
  );

  let totalLitres = 0;
  let totalAmount = 0;
  let morningLitres = 0;
  let eveningLitres = 0;

  const rateBuckets: { [rate: number]: { litres: number; amount: number } } = {};

  for (const c of collections) {
    totalLitres += c.quantity_litres;
    totalAmount += c.amount;

    if (c.session === 'MORNING') {
      morningLitres += c.quantity_litres;
    } else {
      eveningLitres += c.quantity_litres;
    }

    if (!rateBuckets[c.rate_per_litre]) {
      rateBuckets[c.rate_per_litre] = { litres: 0, amount: 0 };
    }
    rateBuckets[c.rate_per_litre].litres += c.quantity_litres;
    rateBuckets[c.rate_per_litre].amount += c.amount;
  }

  const ratesUsed = Object.keys(rateBuckets).map(r => {
    const rateNum = parseFloat(r);
    return {
      rate: rateNum,
      litres: parseFloat(rateBuckets[rateNum].litres.toFixed(2)),
      amount: parseFloat(rateBuckets[rateNum].amount.toFixed(2))
    };
  });

  const settlement = await db.settlements
    .where(['provider_id', 'year', 'month', 'period_index'])
    .equals([providerId, period.year, period.month, period.period_index])
    .first();

  let payment: Payment | null = null;
  if (settlement) {
    payment = (await db.payments.where('settlement_id').equals(settlement.id).first()) || null;
  }

  return {
    provider_id: providerId,
    provider_name: provider?.name || 'Unknown Provider',
    provider_phone: provider?.phone,
    period_info: period,
    total_litres: parseFloat(totalLitres.toFixed(2)),
    total_amount: parseFloat(totalAmount.toFixed(2)),
    rates_used: ratesUsed,
    morning_litres: parseFloat(morningLitres.toFixed(2)),
    evening_litres: parseFloat(eveningLitres.toFixed(2)),
    collections_count: collections.length,
    is_finalized: settlement?.status === 'FINALIZED',
    finalized_at: settlement?.finalized_at,
    payment
  };
}

/**
 * Computes summaries for all providers for a specific settlement period.
 */
export async function getAllSettlementsForPeriod(
  period: SettlementPeriodInfo
): Promise<ProviderSettlementSummary[]> {
  const providers = await db.providers.toArray();
  const summaries: ProviderSettlementSummary[] = [];

  for (const p of providers) {
    const summary = await getProviderSettlementSummary(p.id, period);
    // Include all active providers or providers who had milk collections in this period
    if (p.active || summary.total_litres > 0) {
      summaries.push(summary);
    }
  }

  return summaries.sort((a, b) => a.provider_name.localeCompare(b.provider_name));
}

/**
 * Finalizes a settlement record to lock it.
 */
export async function finalizeSettlement(params: {
  providerId: string;
  year: number;
  month: number;
  periodIndex: 1 | 2 | 3;
}): Promise<Settlement> {
  const { providerId, year, month, periodIndex } = params;
  const periods = getSettlementPeriods(year, month);
  const period = periods[periodIndex - 1];

  const summary = await getProviderSettlementSummary(providerId, period);

  let settlement = await db.settlements
    .where(['provider_id', 'year', 'month', 'period_index'])
    .equals([providerId, year, month, periodIndex])
    .first();

  const now = getNowKolkataISO();

  if (!settlement) {
    settlement = {
      id: generateId(),
      provider_id: providerId,
      year,
      month,
      period_index: periodIndex,
      period_start: period.period_start,
      period_end: period.period_end,
      total_litres: summary.total_litres,
      total_amount: summary.total_amount,
      status: 'FINALIZED',
      finalized_at: now
    };
    await db.settlements.add(settlement);
  } else {
    settlement.total_litres = summary.total_litres;
    settlement.total_amount = summary.total_amount;
    settlement.status = 'FINALIZED';
    settlement.finalized_at = now;
    await db.settlements.put(settlement);
  }

  await logAuditEntry({
    entity_type: 'SETTLEMENT',
    entity_id: settlement.id,
    action: 'FINALIZE',
    old_value: null,
    new_value: settlement,
    reason: `Finalized period ${period.label} for provider ${summary.provider_name} (Total: ${summary.total_litres} L, ₹${summary.total_amount})`
  });

  await syncRedundancySnapshot();
  return settlement;
}

/**
 * Reopens a finalized settlement.
 */
export async function reopenSettlement(
  settlementId: string,
  reason?: string
): Promise<Settlement> {
  const settlement = await db.settlements.get(settlementId);
  if (!settlement) throw new Error('Settlement not found');

  const oldVal = { ...settlement };
  settlement.status = 'OPEN';
  settlement.finalized_at = null;

  await db.settlements.put(settlement);

  await logAuditEntry({
    entity_type: 'SETTLEMENT',
    entity_id: settlement.id,
    action: 'REOPEN',
    old_value: oldVal,
    new_value: settlement,
    reason: reason || 'Reopened settlement for edits'
  });

  return settlement;
}

/**
 * Records a payment for a settlement.
 */
export async function recordPayment(params: {
  providerId: string;
  year: number;
  month: number;
  periodIndex: 1 | 2 | 3;
  amountPaid: number;
  paymentMethod: Payment['payment_method'];
  notes?: string;
}): Promise<Payment> {
  const { providerId, year, month, periodIndex, amountPaid, paymentMethod, notes } = params;
  
  // Make sure settlement exists
  let settlement = await db.settlements
    .where(['provider_id', 'year', 'month', 'period_index'])
    .equals([providerId, year, month, periodIndex])
    .first();

  if (!settlement) {
    // Auto-create/finalize settlement
    settlement = await finalizeSettlement({ providerId, year, month, periodIndex });
  }

  const existingPayment = await db.payments.where('settlement_id').equals(settlement.id).first();
  const now = getNowKolkataISO();

  if (existingPayment) {
    const oldVal = { ...existingPayment };
    existingPayment.amount_paid = amountPaid;
    existingPayment.payment_method = paymentMethod;
    existingPayment.paid_at = now;
    existingPayment.notes = notes;
    existingPayment.status = 'PAID';
    await db.payments.put(existingPayment);

    await logAuditEntry({
      entity_type: 'PAYMENT',
      entity_id: existingPayment.id,
      action: 'UPDATE',
      old_value: oldVal,
      new_value: existingPayment,
      reason: `Updated payment of ₹${amountPaid} via ${paymentMethod}`
    });

    return existingPayment;
  }

  const newPayment: Payment = {
    id: generateId(),
    settlement_id: settlement.id,
    provider_id: providerId,
    amount_paid: amountPaid,
    paid_at: now,
    payment_method: paymentMethod,
    notes,
    status: 'PAID'
  };

  await db.payments.add(newPayment);

  await logAuditEntry({
    entity_type: 'PAYMENT',
    entity_id: newPayment.id,
    action: 'PAY',
    old_value: null,
    new_value: newPayment,
    reason: `Recorded payment of ₹${amountPaid} via ${paymentMethod}`
  });

  await syncRedundancySnapshot();
  return newPayment;
}

/**
 * Computes high-level monthly dashboard metrics.
 */
export async function getMonthlyDashboardMetrics(
  year: number,
  month: number
): Promise<MonthlyDashboardMetrics> {
  const totalDays = getDaysInMonth(year, month);
  const startDate = formatDateStr(year, month, 1);
  const endDate = formatDateStr(year, month, totalDays);

  const periods = getSettlementPeriods(year, month);
  const monthName = periods[0].month_name;

  const collections = await db.milk_collections
    .where('business_date')
    .between(startDate, endDate, true, true)
    .toArray();

  let totalLitres = 0;
  let morningLitres = 0;
  let eveningLitres = 0;
  let totalPayable = 0;

  for (const c of collections) {
    totalLitres += c.quantity_litres;
    totalPayable += c.amount;
    if (c.session === 'MORNING') {
      morningLitres += c.quantity_litres;
    } else {
      eveningLitres += c.quantity_litres;
    }
  }

  // Calculate payments made for this month
  const monthSettlements = await db.settlements
    .where(['year', 'month'])
    .equals([year, month])
    .toArray();

  let totalPaid = 0;
  for (const s of monthSettlements) {
    const payment = await db.payments.where('settlement_id').equals(s.id).first();
    if (payment) {
      totalPaid += payment.amount_paid;
    }
  }

  const activeProvidersCount = await db.providers.where('active').equals(1).count();
  const closedDaysCount = await db.daily_closings
    .where('business_date')
    .between(startDate, endDate, true, true)
    .and(dc => dc.is_closed)
    .count();

  return {
    year,
    month,
    month_name: monthName,
    total_milk_litres: parseFloat(totalLitres.toFixed(2)),
    morning_milk_litres: parseFloat(morningLitres.toFixed(2)),
    evening_milk_litres: parseFloat(eveningLitres.toFixed(2)),
    total_payable: parseFloat(totalPayable.toFixed(2)),
    total_paid: parseFloat(totalPaid.toFixed(2)),
    total_pending: parseFloat(Math.max(0, totalPayable - totalPaid).toFixed(2)),
    active_providers_count: activeProvidersCount,
    days_closed_count: closedDaysCount,
    total_days: totalDays
  };
}
