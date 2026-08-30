import Dexie, { type Table } from 'dexie';
import type {
  Provider,
  ProviderRate,
  MilkCollection,
  DailyClosing,
  Settlement,
  Payment,
  AuditLog
} from '../types';

export class RajhansDairyDatabase extends Dexie {
  providers!: Table<Provider, string>;
  provider_rates!: Table<ProviderRate, string>;
  milk_collections!: Table<MilkCollection, string>;
  daily_closings!: Table<DailyClosing, string>;
  settlements!: Table<Settlement, string>;
  payments!: Table<Payment, string>;
  audit_logs!: Table<AuditLog, string>;

  constructor() {
    super('RajhansDairyDB');
    this.version(1).stores({
      providers: 'id, name, active, created_at',
      provider_rates: 'id, provider_id, effective_from, effective_to, [provider_id+effective_from]',
      milk_collections: 'id, provider_id, business_date, session, [provider_id+business_date+session], [business_date+session], [provider_id+business_date]',
      daily_closings: 'id, business_date, is_closed',
      settlements: 'id, provider_id, [provider_id+year+month+period_index], [year+month+period_index]',
      payments: 'id, settlement_id, provider_id, paid_at',
      audit_logs: 'id, entity_type, entity_id, timestamp'
    });
  }
}

export const db = new RajhansDairyDatabase();

/**
 * Requests permanent non-evictable storage from the mobile browser OS.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persisted();
      if (!isPersisted) {
        return await navigator.storage.persist();
      }
      return true;
    } catch (e) {
      console.warn('Persistent storage request error:', e);
    }
  }
  return false;
}

/**
 * Generates a unique UUID v4 string.
 */
export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'id-' + Math.random().toString(36).substring(2, 11) + '-' + Date.now().toString(36);
}

/**
 * Creates an immediate redundancy snapshot in localStorage.
 */
export async function syncRedundancySnapshot(): Promise<void> {
  try {
    const providers = await db.providers.toArray();
    if (providers.length === 0) return;

    const snapshot = {
      appName: 'Rajhans Dairy (राजहंस डेअरी)',
      version: 1,
      savedAt: new Date().toISOString(),
      providers,
      provider_rates: await db.provider_rates.toArray(),
      milk_collections: await db.milk_collections.toArray(),
      daily_closings: await db.daily_closings.toArray(),
      settlements: await db.settlements.toArray(),
      payments: await db.payments.toArray(),
      audit_logs: await db.audit_logs.toArray()
    };

    localStorage.setItem('rajhans_primary_snapshot', JSON.stringify(snapshot));
    localStorage.setItem('rajhans_last_sync_timestamp', new Date().toISOString());
  } catch (e) {
    // quota limits if excessive
  }
}

/**
 * Self-healing recovery: if IndexedDB is ever empty but localStorage snapshot exists, auto-recover!
 */
export async function verifyAndRecoverDatabase(): Promise<boolean> {
  try {
    const providerCount = await db.providers.count();
    if (providerCount === 0) {
      const savedSnapshot = localStorage.getItem('rajhans_primary_snapshot');
      if (savedSnapshot) {
        console.log('Self-healing triggered: recovering database from redundancy snapshot...');
        await restoreDatabaseBackup(savedSnapshot);
        return true;
      }
    }
  } catch (e) {
    console.error('Error during auto-recovery check:', e);
  }
  return false;
}

/**
 * Database health metrics for multi-year audit inspection.
 */
export async function getDatabaseHealthStats(): Promise<{
  providersCount: number;
  collectionsCount: number;
  settlementsCount: number;
  paymentsCount: number;
  auditLogsCount: number;
  isPersistent: boolean;
  lastBackupDate: string | null;
}> {
  const isPersisted = typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persisted
    ? await navigator.storage.persisted()
    : false;

  const providersCount = await db.providers.count();
  const collectionsCount = await db.milk_collections.count();
  const settlementsCount = await db.settlements.count();
  const paymentsCount = await db.payments.count();
  const auditLogsCount = await db.audit_logs.count();
  const lastBackup = localStorage.getItem('rajhans_last_sync_timestamp');

  return {
    providersCount,
    collectionsCount,
    settlementsCount,
    paymentsCount,
    auditLogsCount,
    isPersistent: isPersisted,
    lastBackupDate: lastBackup
  };
}

/**
 * Export all database contents to a downloadable JSON object.
 */
export async function exportDatabaseBackup(): Promise<string> {
  const data = {
    appName: 'Rajhans Dairy (राजहंस डेअरी)',
    version: 1,
    exported_at: new Date().toISOString(),
    providers: await db.providers.toArray(),
    provider_rates: await db.provider_rates.toArray(),
    milk_collections: await db.milk_collections.toArray(),
    daily_closings: await db.daily_closings.toArray(),
    settlements: await db.settlements.toArray(),
    payments: await db.payments.toArray(),
    audit_logs: await db.audit_logs.toArray(),
  };

  try {
    localStorage.setItem('rajhans_primary_snapshot', JSON.stringify(data));
    localStorage.setItem('rajhans_last_sync_timestamp', new Date().toISOString());
  } catch (e) {
    // Ignore quota
  }

  return JSON.stringify(data, null, 2);
}

/**
 * Restore database from JSON backup.
 */
export async function restoreDatabaseBackup(jsonString: string): Promise<boolean> {
  try {
    const data = JSON.parse(jsonString);
    if (!data.providers && !data.milk_collections) {
      throw new Error('Invalid backup file format');
    }

    await db.transaction('rw', [
      db.providers,
      db.provider_rates,
      db.milk_collections,
      db.daily_closings,
      db.settlements,
      db.payments,
      db.audit_logs
    ], async () => {
      await db.providers.clear();
      await db.provider_rates.clear();
      await db.milk_collections.clear();
      await db.daily_closings.clear();
      await db.settlements.clear();
      await db.payments.clear();
      await db.audit_logs.clear();

      if (data.providers?.length) await db.providers.bulkAdd(data.providers);
      if (data.provider_rates?.length) await db.provider_rates.bulkAdd(data.provider_rates);
      if (data.milk_collections?.length) await db.milk_collections.bulkAdd(data.milk_collections);
      if (data.daily_closings?.length) await db.daily_closings.bulkAdd(data.daily_closings);
      if (data.settlements?.length) await db.settlements.bulkAdd(data.settlements);
      if (data.payments?.length) await db.payments.bulkAdd(data.payments);
      if (data.audit_logs?.length) await db.audit_logs.bulkAdd(data.audit_logs);
    });

    await syncRedundancySnapshot();
    return true;
  } catch (error) {
    console.error('Failed to restore backup:', error);
    throw error;
  }
}

/**
 * Clears all data to start fresh for a new dairy.
 */
export async function resetDatabaseAll(): Promise<void> {
  await db.transaction('rw', [
    db.providers,
    db.provider_rates,
    db.milk_collections,
    db.daily_closings,
    db.settlements,
    db.payments,
    db.audit_logs
  ], async () => {
    await db.providers.clear();
    await db.provider_rates.clear();
    await db.milk_collections.clear();
    await db.daily_closings.clear();
    await db.settlements.clear();
    await db.payments.clear();
    await db.audit_logs.clear();
  });
  localStorage.removeItem('rajhans_primary_snapshot');
}
