import { db, generateId, syncRedundancySnapshot } from './db';
import type { MilkCollection, DailyClosing, SessionType, DailySessionSummary } from '../types';
import { getEffectiveRate } from './rateService';
import { calculateAmount } from './formatters';
import { getNowKolkataISO } from './dateService';
import { logAuditEntry } from './auditService';

/**
 * Checks if a business date is closed.
 */
export async function isDayClosed(businessDate: string): Promise<boolean> {
  const closing = await db.daily_closings.where('business_date').equals(businessDate).first();
  return closing?.is_closed ?? false;
}

/**
 * Gets or initializes daily closing stats for a business date.
 */
export async function getDailyClosing(businessDate: string): Promise<DailyClosing> {
  let closing = await db.daily_closings.where('business_date').equals(businessDate).first();
  
  const collections = await db.milk_collections.where('business_date').equals(businessDate).toArray();
  
  let morningLitres = 0;
  let eveningLitres = 0;
  let morningAmount = 0;
  let eveningAmount = 0;
  const uniqueProviders = new Set<string>();

  for (const c of collections) {
    uniqueProviders.add(c.provider_id);
    if (c.session === 'MORNING') {
      morningLitres += c.quantity_litres;
      morningAmount += c.amount;
    } else {
      eveningLitres += c.quantity_litres;
      eveningAmount += c.amount;
    }
  }

  const totalLitres = parseFloat((morningLitres + eveningLitres).toFixed(2));
  const totalAmount = parseFloat((morningAmount + eveningAmount).toFixed(2));

  if (!closing) {
    closing = {
      id: generateId(),
      business_date: businessDate,
      morning_total_litres: morningLitres,
      evening_total_litres: eveningLitres,
      total_litres: totalLitres,
      morning_amount: morningAmount,
      evening_amount: eveningAmount,
      total_amount: totalAmount,
      providers_count: uniqueProviders.size,
      is_closed: false,
      closed_at: null
    };
  } else {
    // Keep closing numbers synced with latest records if not finalized/closed
    closing.morning_total_litres = morningLitres;
    closing.evening_total_litres = eveningLitres;
    closing.total_litres = totalLitres;
    closing.morning_amount = morningAmount;
    closing.evening_amount = eveningAmount;
    closing.total_amount = totalAmount;
    closing.providers_count = uniqueProviders.size;
  }

  return closing;
}

/**
 * Closes the day, locking it from casual edits.
 */
export async function closeDay(businessDate: string): Promise<DailyClosing> {
  const closing = await getDailyClosing(businessDate);
  const oldVal = { ...closing };
  
  closing.is_closed = true;
  closing.closed_at = getNowKolkataISO();
  
  await db.daily_closings.put(closing);
  
  await logAuditEntry({
    entity_type: 'DAILY_CLOSING',
    entity_id: closing.id,
    action: 'FINALIZE',
    old_value: oldVal,
    new_value: closing,
    reason: `Closed day ${businessDate} with total ${closing.total_litres} L across ${closing.providers_count} providers`
  });

  return closing;
}

/**
 * Reopens a previously closed day.
 */
export async function reopenDay(businessDate: string, reason?: string): Promise<DailyClosing> {
  const closing = await getDailyClosing(businessDate);
  const oldVal = { ...closing };
  
  closing.is_closed = false;
  closing.closed_at = null;
  
  await db.daily_closings.put(closing);
  
  await logAuditEntry({
    entity_type: 'DAILY_CLOSING',
    entity_id: closing.id,
    action: 'REOPEN',
    old_value: oldVal,
    new_value: closing,
    reason: reason || `Reopened day ${businessDate} for corrections`
  });

  return closing;
}

/**
 * Fetches collections for a given date and session.
 */
export async function getSessionCollections(
  businessDate: string,
  session: SessionType
): Promise<DailySessionSummary> {
  const collections = await db.milk_collections
    .where(['business_date', 'session'])
    .equals([businessDate, session])
    .toArray();

  let totalLitres = 0;
  let totalAmount = 0;
  for (const c of collections) {
    totalLitres += c.quantity_litres;
    totalAmount += c.amount;
  }

  return {
    business_date: businessDate,
    session,
    is_recorded: collections.length > 0 && totalLitres > 0,
    total_litres: parseFloat(totalLitres.toFixed(2)),
    total_amount: parseFloat(totalAmount.toFixed(2)),
    providers_recorded_count: collections.filter(c => c.quantity_litres > 0).length,
    entries: collections
  };
}

/**
 * Saves or updates a single milk entry with strict duplicate prevention and rate retention.
 */
export async function recordMilkEntry(params: {
  providerId: string;
  businessDate: string;
  session: SessionType;
  quantityLitres: number;
  overrideRate?: number;
  reason?: string;
}): Promise<MilkCollection> {
  const { providerId, businessDate, session, quantityLitres, overrideRate, reason } = params;

  const existing = await db.milk_collections
    .where(['provider_id', 'business_date', 'session'])
    .equals([providerId, businessDate, session])
    .first();

  const now = getNowKolkataISO();

  if (existing) {
    // If quantity is unchanged, return existing
    if (existing.quantity_litres === quantityLitres && !overrideRate) {
      return existing;
    }

    const oldVal = { ...existing };
    const rateToUse = overrideRate ?? existing.rate_per_litre;
    const amount = calculateAmount(quantityLitres, rateToUse);

    existing.quantity_litres = quantityLitres;
    existing.rate_per_litre = rateToUse;
    existing.amount = amount;
    existing.updated_at = now;

    await db.milk_collections.put(existing);

    await logAuditEntry({
      entity_type: 'COLLECTION',
      entity_id: existing.id,
      action: 'UPDATE',
      old_value: oldVal,
      new_value: existing,
      reason: reason || `Updated ${session} milk to ${quantityLitres} L (was ${oldVal.quantity_litres} L)`
    });

    await syncRedundancySnapshot();
    return existing;
  }

  // Create new collection
  const rateToUse = overrideRate ?? await getEffectiveRate(providerId, businessDate);
  const amount = calculateAmount(quantityLitres, rateToUse);

  const newEntry: MilkCollection = {
    id: generateId(),
    provider_id: providerId,
    business_date: businessDate,
    session,
    quantity_litres: quantityLitres,
    rate_per_litre: rateToUse,
    amount,
    created_at: now,
    updated_at: now
  };

  await db.milk_collections.add(newEntry);

  await logAuditEntry({
    entity_type: 'COLLECTION',
    entity_id: newEntry.id,
    action: 'CREATE',
    old_value: null,
    new_value: newEntry,
    reason: `Recorded ${session} milk: ${quantityLitres} L @ ₹${rateToUse}/L`
  });

  await syncRedundancySnapshot();
  return newEntry;
}

/**
 * Saves a full batch of entries for a given session on a business date in a single atomic transaction.
 */
export async function saveSessionCollections(params: {
  businessDate: string;
  session: SessionType;
  entries: { providerId: string; quantityLitres: number }[];
  reason?: string;
}): Promise<MilkCollection[]> {
  const { businessDate, session, entries, reason } = params;
  const results: MilkCollection[] = [];

  await db.transaction('rw', [db.milk_collections, db.provider_rates, db.providers, db.audit_logs], async () => {
    for (const item of entries) {
      if (item.quantityLitres >= 0) {
        const saved = await recordMilkEntry({
          providerId: item.providerId,
          businessDate,
          session,
          quantityLitres: item.quantityLitres,
          reason
        });
        results.push(saved);
      }
    }
  });

  return results;
}

/**
 * Retrieves all collections for a specific provider within a date range (inclusive).
 */
export async function getProviderCollectionsInRange(
  providerId: string,
  startDate: string,
  endDate: string
): Promise<MilkCollection[]> {
  const allForProvider = await db.milk_collections
    .where('provider_id')
    .equals(providerId)
    .toArray();

  return allForProvider
    .filter(c => c.business_date >= startDate && c.business_date <= endDate)
    .sort((a, b) => {
      if (a.business_date !== b.business_date) {
        return a.business_date.localeCompare(b.business_date);
      }
      return a.session === 'MORNING' ? -1 : 1;
    });
}
