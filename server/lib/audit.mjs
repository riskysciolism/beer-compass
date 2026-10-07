/**
 * Audit logging helper.
 */
import { pool } from './db.mjs'

export async function logAudit(adminId, action, entityType, entityId, details = {}) {
  await pool.query(
    `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5)`,
    [adminId, action, entityType ?? null, entityId?.toString() ?? null, JSON.stringify(details)],
  )
}
