import { db } from '@/db';
import { auditLog } from '@/db/schema';

export interface AuditEntry {
  tenantId: string;
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
}

export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.insert(auditLog).values({
      tenantId: entry.tenantId,
      userId: entry.userId || null,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId || null,
      metadata: entry.metadata || {},
      ipAddress: entry.ipAddress || null,
    });
  } catch (error) {
    console.error('Audit log write failed:', error);
  }
}
