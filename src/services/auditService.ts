import { db, generateId } from './db';
import type { AuditLog } from '../types';
import { getNowKolkataISO } from './dateService';

export async function logAuditEntry(params: {
  entity_type: AuditLog['entity_type'];
  entity_id: string;
  action: AuditLog['action'];
  old_value: any;
  new_value: any;
  reason?: string;
}): Promise<AuditLog> {
  const entry: AuditLog = {
    id: generateId(),
    entity_type: params.entity_type,
    entity_id: params.entity_id,
    action: params.action,
    old_value: params.old_value ? JSON.parse(JSON.stringify(params.old_value)) : null,
    new_value: params.new_value ? JSON.parse(JSON.stringify(params.new_value)) : null,
    reason: params.reason,
    timestamp: getNowKolkataISO()
  };

  await db.audit_logs.add(entry);
  return entry;
}

export async function getRecentAuditLogs(limit: number = 100): Promise<AuditLog[]> {
  const logs = await db.audit_logs.orderBy('timestamp').reverse().limit(limit).toArray();
  return logs;
}

export async function getAuditLogsForEntity(entityId: string): Promise<AuditLog[]> {
  return await db.audit_logs.where('entity_id').equals(entityId).reverse().sortBy('timestamp');
}
