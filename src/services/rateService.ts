import { db, generateId, syncRedundancySnapshot } from './db';
import type { ProviderRate } from '../types';
import { navigateDate, getNowKolkataISO } from './dateService';
import { logAuditEntry } from './auditService';

/**
 * Retrieves the applicable rate per litre for a provider on a specific business date (YYYY-MM-DD).
 */
export async function getEffectiveRate(providerId: string, businessDate: string): Promise<number> {
  const rates = await db.provider_rates.where('provider_id').equals(providerId).toArray();
  
  if (!rates || rates.length === 0) {
    const provider = await db.providers.get(providerId);
    return provider?.default_rate || 50.0;
  }

  // Look for a rate record where effective_from <= businessDate AND (effective_to is null or effective_to >= businessDate)
  const matchedRate = rates.find(r => {
    const isAfterOrOnFrom = r.effective_from <= businessDate;
    const isBeforeOrOnTo = !r.effective_to || r.effective_to >= businessDate;
    return isAfterOrOnFrom && isBeforeOrOnTo;
  });

  if (matchedRate) {
    return matchedRate.rate_per_litre;
  }

  // Fallback: If date is earlier than earliest rate, use earliest rate
  rates.sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  if (businessDate < rates[0].effective_from) {
    return rates[0].rate_per_litre;
  }

  // If date is later, use the latest rate
  return rates[rates.length - 1].rate_per_litre;
}

/**
 * Gets full rate history for a provider, sorted chronologically.
 */
export async function getProviderRateHistory(providerId: string): Promise<ProviderRate[]> {
  const rates = await db.provider_rates.where('provider_id').equals(providerId).toArray();
  return rates.sort((a, b) => b.effective_from.localeCompare(a.effective_from)); // newest first
}

/**
 * Updates a provider's rate with an effective date.
 * Closes out previous rates cleanly and inserts the new versioned rate record.
 */
export async function setProviderRate(params: {
  providerId: string;
  newRate: number;
  effectiveFrom: string; // YYYY-MM-DD
  reason?: string;
}): Promise<ProviderRate> {
  const { providerId, newRate, effectiveFrom, reason } = params;
  
  const provider = await db.providers.get(providerId);
  if (!provider) {
    throw new Error(`Provider not found: ${providerId}`);
  }

  const existingRates = await db.provider_rates.where('provider_id').equals(providerId).toArray();

  let newRateRecord: ProviderRate | null = null;

  await db.transaction('rw', [db.provider_rates, db.providers, db.audit_logs], async () => {
    // If there's an existing rate starting exactly on this date, update its value
    const exactMatch = existingRates.find(r => r.effective_from === effectiveFrom);
    if (exactMatch) {
      const oldVal = { ...exactMatch };
      exactMatch.rate_per_litre = newRate;
      await db.provider_rates.put(exactMatch);
      newRateRecord = exactMatch;

      await logAuditEntry({
        entity_type: 'PROVIDER_RATE',
        entity_id: exactMatch.id,
        action: 'UPDATE',
        old_value: oldVal,
        new_value: exactMatch,
        reason: reason || `Updated rate effective from ${effectiveFrom} to ₹${newRate}/L`
      });
    } else {
      // Find the open-ended rate or rate active right before this effective date
      const prevActiveRate = existingRates.find(r => !r.effective_to || r.effective_to >= effectiveFrom);
      if (prevActiveRate) {
        // Close it on previous day
        const dayBefore = navigateDate(effectiveFrom, -1);
        const oldVal = { ...prevActiveRate };
        prevActiveRate.effective_to = dayBefore;
        await db.provider_rates.put(prevActiveRate);

        await logAuditEntry({
          entity_type: 'PROVIDER_RATE',
          entity_id: prevActiveRate.id,
          action: 'UPDATE',
          old_value: oldVal,
          new_value: prevActiveRate,
          reason: `Closed previous rate at ${dayBefore}`
        });
      }

      // Create new rate record
      newRateRecord = {
        id: generateId(),
        provider_id: providerId,
        rate_per_litre: newRate,
        effective_from: effectiveFrom,
        effective_to: null,
        created_at: getNowKolkataISO()
      };
      await db.provider_rates.add(newRateRecord);

      await logAuditEntry({
        entity_type: 'PROVIDER_RATE',
        entity_id: newRateRecord.id,
        action: 'CREATE',
        old_value: null,
        new_value: newRateRecord,
        reason: reason || `Set new rate to ₹${newRate}/L effective from ${effectiveFrom}`
      });
    }

    // Update default rate on provider for quick display if effective date is now or past
    provider.default_rate = newRate;
    provider.updated_at = getNowKolkataISO();
    await db.providers.put(provider);
  });

  await syncRedundancySnapshot();
  return newRateRecord!;
}
