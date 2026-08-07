import { PoolClient } from 'pg';
import { pool } from '../db/pool';

/** Same idempotency idiom as payment_postings, keyed on original_payment_group_id. */
export async function insertPosting(
  client: PoolClient,
  originalPaymentGroupId: string,
  reversalPaymentGroupId: string
): Promise<void> {
  await client.query(
    `INSERT INTO reversal_postings (original_payment_group_id, reversal_payment_group_id)
     VALUES ($1, $2)`,
    [originalPaymentGroupId, reversalPaymentGroupId]
  );
}

export async function findByOriginalPaymentGroupId(
  originalPaymentGroupId: string
): Promise<{ reversalPaymentGroupId: string } | null> {
  const { rows } = await pool.query(
    `SELECT reversal_payment_group_id FROM reversal_postings
     WHERE original_payment_group_id = $1`,
    [originalPaymentGroupId]
  );
  if (rows.length === 0) return null;
  return { reversalPaymentGroupId: rows[0].reversal_payment_group_id };
}
