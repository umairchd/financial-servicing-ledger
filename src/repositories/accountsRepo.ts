import { PoolClient } from 'pg';
import { pool } from '../db/pool';

export interface Account {
  id: string;
  scheduledPaymentCents: number;
  createdAt: string;
}

export async function getAccount(accountId: string): Promise<Account | null> {
  const { rows } = await pool.query(
    `SELECT * FROM accounts WHERE id = $1`,
    [accountId]
  );
  if (rows.length === 0) return null;
  return {
    id: rows[0].id,
    scheduledPaymentCents: Number(rows[0].scheduled_payment_cents),
    createdAt: rows[0].created_at,
  };
}

/**
 * Locks the account row for the duration of the current transaction so concurrent
 * payment postings against the same account serialize instead of racing on the
 * outstanding-balance read that precedes waterfall allocation.
 */
export async function lockAccountForUpdate(
  client: PoolClient,
  accountId: string
): Promise<Account | null> {
  const { rows } = await client.query(
    `SELECT * FROM accounts WHERE id = $1 FOR UPDATE`,
    [accountId]
  );
  if (rows.length === 0) return null;
  return {
    id: rows[0].id,
    scheduledPaymentCents: Number(rows[0].scheduled_payment_cents),
    createdAt: rows[0].created_at,
  };
}
