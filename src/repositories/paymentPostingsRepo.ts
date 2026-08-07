import { PoolClient } from 'pg';
import { pool } from '../db/pool';

export const UNIQUE_VIOLATION = '23505';

/** Fails on the (account_id, external_payment_id) primary key for a duplicate. */
export async function insertPosting(
  client: PoolClient,
  accountId: string,
  externalPaymentId: string,
  paymentGroupId: string
): Promise<void> {
  await client.query(
    `INSERT INTO payment_postings (account_id, external_payment_id, payment_group_id)
     VALUES ($1, $2, $3)`,
    [accountId, externalPaymentId, paymentGroupId]
  );
}

export async function findByExternalPaymentId(
  accountId: string,
  externalPaymentId: string
): Promise<{ paymentGroupId: string } | null> {
  const { rows } = await pool.query(
    `SELECT payment_group_id FROM payment_postings
     WHERE account_id = $1 AND external_payment_id = $2`,
    [accountId, externalPaymentId]
  );
  if (rows.length === 0) return null;
  return { paymentGroupId: rows[0].payment_group_id };
}
