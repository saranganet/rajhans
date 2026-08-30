import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db, generateId } from '../services/db';
import { getEffectiveRate, setProviderRate } from '../services/rateService';
import { recordMilkEntry, closeDay, reopenDay, isDayClosed } from '../services/milkService';
import { getProviderSettlementSummary } from '../services/settlementService';
import { getSettlementPeriods } from '../services/dateService';

describe('Rate Versioning and Milk Collection Integration Tests', () => {
  beforeEach(async () => {
    await db.providers.clear();
    await db.provider_rates.clear();
    await db.milk_collections.clear();
    await db.daily_closings.clear();
    await db.settlements.clear();
    await db.payments.clear();
    await db.audit_logs.clear();
  });

  it('preserves historical rates when provider rate is changed mid-month', async () => {
    const providerId = generateId();
    await db.providers.add({
      id: providerId,
      name: 'Ramesh Patil',
      phone: '9822012345',
      active: true,
      default_rate: 50.00,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z'
    });

    await db.provider_rates.add({
      id: generateId(),
      provider_id: providerId,
      rate_per_litre: 50.00,
      effective_from: '2026-08-01',
      effective_to: null,
      created_at: '2026-08-01T00:00:00.000Z'
    });

    // Effective rate on 10 Aug should be 50
    expect(await getEffectiveRate(providerId, '2026-08-10')).toBe(50.00);

    // Record milk on 10 Aug (8 L @ 50 = 400)
    const entry1 = await recordMilkEntry({
      providerId,
      businessDate: '2026-08-10',
      session: 'MORNING',
      quantityLitres: 8.0
    });
    expect(entry1.rate_per_litre).toBe(50.00);
    expect(entry1.amount).toBe(400.00);

    // Change rate to 52 effective from 15 Aug
    await setProviderRate({
      providerId,
      newRate: 52.00,
      effectiveFrom: '2026-08-15',
      reason: 'Mid-month rate revision'
    });

    // Check rate lookup before and after 15 Aug
    expect(await getEffectiveRate(providerId, '2026-08-14')).toBe(50.00);
    expect(await getEffectiveRate(providerId, '2026-08-15')).toBe(52.00);
    expect(await getEffectiveRate(providerId, '2026-08-25')).toBe(52.00);

    // Record milk on 16 Aug (8 L @ 52 = 416)
    const entry2 = await recordMilkEntry({
      providerId,
      businessDate: '2026-08-16',
      session: 'MORNING',
      quantityLitres: 8.0
    });
    expect(entry2.rate_per_litre).toBe(52.00);
    expect(entry2.amount).toBe(416.00);

    // Historical entry on 10 Aug MUST STILL be 50.00 and 400.00!
    const oldEntry = await db.milk_collections.get(entry1.id);
    expect(oldEntry?.rate_per_litre).toBe(50.00);
    expect(oldEntry?.amount).toBe(400.00);
  });

  it('prevents duplicate collections for the same provider + date + session', async () => {
    const providerId = generateId();
    await db.providers.add({
      id: providerId,
      name: 'Suresh Deshmukh',
      active: true,
      default_rate: 54.00,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z'
    });

    // First entry: Morning 8.0 L
    const first = await recordMilkEntry({
      providerId,
      businessDate: '2026-08-30',
      session: 'MORNING',
      quantityLitres: 8.0
    });

    const collections1 = await db.milk_collections.toArray();
    expect(collections1).toHaveLength(1);
    expect(collections1[0].quantity_litres).toBe(8.0);

    // Second entry for the SAME provider, date, session: user corrects to 7.5 L
    await recordMilkEntry({
      providerId,
      businessDate: '2026-08-30',
      session: 'MORNING',
      quantityLitres: 7.5,
      reason: 'Corrected quantity'
    });

    const collections2 = await db.milk_collections.toArray();
    // Must STILL have only 1 record, updated in-place!
    expect(collections2).toHaveLength(1);
    expect(collections2[0].id).toBe(first.id);
    expect(collections2[0].quantity_litres).toBe(7.5);
    expect(collections2[0].amount).toBe(405.00); // 7.5 * 54 = 405

    // Audit logs should record the change
    const auditLogs = await db.audit_logs.where('entity_type').equals('COLLECTION').toArray();
    expect(auditLogs.length).toBeGreaterThanOrEqual(2); // 1 create + 1 update
    const updateAudit = auditLogs.find(a => a.action === 'UPDATE');
    expect(updateAudit?.old_value.quantity_litres).toBe(8.0);
    expect(updateAudit?.new_value.quantity_litres).toBe(7.5);
  });

  it('handles daily closing and reopening with audit trail', async () => {
    const providerId = generateId();
    await db.providers.add({
      id: providerId,
      name: 'Mahesh Shinde',
      active: true,
      default_rate: 50.00,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z'
    });

    await recordMilkEntry({
      providerId,
      businessDate: '2026-08-30',
      session: 'MORNING',
      quantityLitres: 10.0
    });
    await recordMilkEntry({
      providerId,
      businessDate: '2026-08-30',
      session: 'EVENING',
      quantityLitres: 8.0
    });

    expect(await isDayClosed('2026-08-30')).toBe(false);

    // Close the day
    const closed = await closeDay('2026-08-30');
    expect(closed.is_closed).toBe(true);
    expect(closed.total_litres).toBe(18.0);
    expect(closed.total_amount).toBe(900.0);
    expect(await isDayClosed('2026-08-30')).toBe(true);

    // Reopen day
    const reopened = await reopenDay('2026-08-30', 'Forgot to add evening provider');
    expect(reopened.is_closed).toBe(false);
    expect(await isDayClosed('2026-08-30')).toBe(false);
  });

  it('accurately calculates 10-day settlements across rate changes', async () => {
    const providerId = generateId();
    await db.providers.add({
      id: providerId,
      name: 'Ramesh Patil',
      active: true,
      default_rate: 52.00,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z'
    });

    // 11 Aug to 14 Aug: 10 L per day @ 50 = 40 L @ 50 = 2000
    for (let day = 11; day <= 14; day++) {
      await recordMilkEntry({
        providerId,
        businessDate: `2026-08-${day}`,
        session: 'MORNING',
        quantityLitres: 10.0,
        overrideRate: 50.00
      });
    }

    // 15 Aug to 20 Aug: 10 L per day @ 52 = 60 L @ 52 = 3120
    for (let day = 15; day <= 20; day++) {
      await recordMilkEntry({
        providerId,
        businessDate: `2026-08-${day}`,
        session: 'MORNING',
        quantityLitres: 10.0,
        overrideRate: 52.00
      });
    }

    const periods = getSettlementPeriods(2026, 8);
    const period2 = periods[1]; // 11–20 August

    const summary = await getProviderSettlementSummary(providerId, period2);

    expect(summary.total_litres).toBe(100.0); // 40 + 60
    expect(summary.total_amount).toBe(5120.0); // 2000 + 3120
    expect(summary.rates_used).toHaveLength(2);

    const rate50 = summary.rates_used.find(r => r.rate === 50);
    const rate52 = summary.rates_used.find(r => r.rate === 52);
    expect(rate50?.litres).toBe(40.0);
    expect(rate52?.litres).toBe(60.0);
  });
});
