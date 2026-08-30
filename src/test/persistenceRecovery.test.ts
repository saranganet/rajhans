import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { db, generateId, syncRedundancySnapshot, verifyAndRecoverDatabase } from '../services/db';
import { recordMilkEntry } from '../services/milkService';

// Polyfill localStorage in Vitest Node environment
const storageMock: { [key: string]: string } = {};
const mockLocalStorage = {
  getItem: (key: string) => storageMock[key] || null,
  setItem: (key: string, value: string) => { storageMock[key] = value; },
  removeItem: (key: string) => { delete storageMock[key]; },
  clear: () => { Object.keys(storageMock).forEach(k => delete storageMock[k]); }
};

describe('Multi-Year Data Durability & Auto-Recovery Tests', () => {
  beforeAll(() => {
    if (typeof globalThis.localStorage === 'undefined') {
      (globalThis as any).localStorage = mockLocalStorage;
    }
  });

  beforeEach(async () => {
    await db.providers.clear();
    await db.provider_rates.clear();
    await db.milk_collections.clear();
    await db.daily_closings.clear();
    await db.settlements.clear();
    await db.payments.clear();
    await db.audit_logs.clear();
    globalThis.localStorage.clear();
  });

  it('creates redundant snapshot when milk is recorded', async () => {
    const providerId = generateId();
    await db.providers.add({
      id: providerId,
      name: 'Ramesh Patil',
      active: true,
      default_rate: 52.00,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z'
    });

    await recordMilkEntry({
      providerId,
      businessDate: '2026-08-30',
      session: 'MORNING',
      quantityLitres: 10.0
    });

    const savedSnapshot = globalThis.localStorage.getItem('rajhans_primary_snapshot');
    expect(savedSnapshot).not.toBeNull();

    const parsed = JSON.parse(savedSnapshot!);
    expect(parsed.providers).toHaveLength(1);
    expect(parsed.providers[0].name).toBe('Ramesh Patil');
    expect(parsed.milk_collections).toHaveLength(1);
    expect(parsed.milk_collections[0].quantity_litres).toBe(10.0);
  });

  it('self-heals and auto-recovers all records if IndexedDB is cleared but snapshot exists', async () => {
    const providerId = generateId();
    await db.providers.add({
      id: providerId,
      name: 'Babasaheb Bhosale',
      active: true,
      default_rate: 51.00,
      created_at: '2026-08-01T00:00:00.000Z',
      updated_at: '2026-08-01T00:00:00.000Z'
    });

    await recordMilkEntry({
      providerId,
      businessDate: '2026-08-30',
      session: 'MORNING',
      quantityLitres: 8.5
    });

    await syncRedundancySnapshot();

    // Simulate accidental database wipe
    await db.providers.clear();
    await db.milk_collections.clear();
    expect(await db.providers.count()).toBe(0);
    expect(await db.milk_collections.count()).toBe(0);

    // Run self-healing recovery routine
    const recovered = await verifyAndRecoverDatabase();
    expect(recovered).toBe(true);

    // Verify all data restored in IndexedDB
    expect(await db.providers.count()).toBe(1);
    const restoredProvider = await db.providers.get(providerId);
    expect(restoredProvider?.name).toBe('Babasaheb Bhosale');

    const restoredCollections = await db.milk_collections.toArray();
    expect(restoredCollections).toHaveLength(1);
    expect(restoredCollections[0].quantity_litres).toBe(8.5);
  });
});
