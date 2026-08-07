import { Pool, PoolClient } from 'pg';
import { pool } from '../db/pool';
import { Direction, EntryType, LedgerEntry, Outstanding } from '../domain/ledger';

interface Row {
  id: string;
  account_id: string;
  entry_type: EntryType;
  direction: Direction;
  amount_cents: string;
  payment_group_id: string;
  reverses_payment_group_id: string | null;
  description: string;
  created_at: string;
}

function toEntry(row: Row): LedgerEntry {
  return {
    id: row.id,
    accountId: row.account_id,
    entryType: row.entry_type,
    direction: row.direction,
    amountCents: Number(row.amount_cents),
    paymentGroupId: row.payment_group_id,
    reversesPaymentGroupId: row.reverses_payment_group_id,
    description: row.description,
    createdAt: row.created_at,
  };
}

export interface NewEntry {
  accountId: string;
  entryType: EntryType;
  direction: Direction;
  amountCents: number;
  paymentGroupId: string;
  reversesPaymentGroupId?: string | null;
  description: string;
}

export async function insertEntries(
  client: PoolClient,
  entries: NewEntry[]
): Promise<LedgerEntry[]> {
  const inserted: LedgerEntry[] = [];
  for (const e of entries) {
    const { rows } = await client.query<Row>(
      `INSERT INTO ledger_entries
         (account_id, entry_type, direction, amount_cents, payment_group_id,
          reverses_payment_group_id, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        e.accountId,
        e.entryType,
        e.direction,
        e.amountCents,
        e.paymentGroupId,
        e.reversesPaymentGroupId ?? null,
        e.description,
      ]
    );
    inserted.push(toEntry(rows[0]));
  }
  return inserted;
}

/** Current balance, derived live from the ledger -- never a stored counter. */
export async function getBalanceCents(
  accountId: string,
  runner: Pool | PoolClient = pool
): Promise<number> {
  const { rows } = await runner.query<{ balance_cents: string }>(
    `SELECT COALESCE(SUM(
       CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END
     ), 0) AS balance_cents
     FROM ledger_entries
     WHERE account_id = $1`,
    [accountId]
  );
  return Number(rows[0].balance_cents);
}

/**
 * Outstanding fees/interest/principal, derived the same way as balance is:
 * assessments/original obligations increase the outstanding amount, payments and
 * reversals-of-payments decrease it, reversals-of-assessments increase it back.
 */
export async function getOutstanding(
  accountId: string,
  runner: Pool | PoolClient = pool
): Promise<Outstanding> {
  const { rows } = await runner.query<{
    fees_cents: string;
    interest_cents: string;
    principal_cents: string;
  }>(
    `SELECT
       COALESCE(SUM(CASE
         WHEN entry_type = 'fee_assessment' THEN amount_cents
         WHEN entry_type = 'payment_fees' THEN -amount_cents
         WHEN entry_type = 'reversal_fees' THEN amount_cents
         ELSE 0 END), 0) AS fees_cents,
       COALESCE(SUM(CASE
         WHEN entry_type = 'interest_assessment' THEN amount_cents
         WHEN entry_type = 'payment_interest' THEN -amount_cents
         WHEN entry_type = 'reversal_interest' THEN amount_cents
         ELSE 0 END), 0) AS interest_cents,
       COALESCE(SUM(CASE
         WHEN entry_type = 'principal_origination' THEN amount_cents
         WHEN entry_type = 'payment_principal' THEN -amount_cents
         WHEN entry_type = 'reversal_principal' THEN amount_cents
         ELSE 0 END), 0) AS principal_cents
     FROM ledger_entries
     WHERE account_id = $1`,
    [accountId]
  );
  return {
    feesCents: Number(rows[0].fees_cents),
    interestCents: Number(rows[0].interest_cents),
    principalCents: Number(rows[0].principal_cents),
  };
}

export async function getHistory(accountId: string): Promise<LedgerEntry[]> {
  const { rows } = await pool.query<Row & { external_payment_id: string | null }>(
    `SELECT le.*, pp.external_payment_id
     FROM ledger_entries le
     LEFT JOIN payment_postings pp
       ON pp.account_id = le.account_id AND pp.payment_group_id = le.payment_group_id
     WHERE le.account_id = $1
     ORDER BY le.created_at ASC, le.id ASC`,
    [accountId]
  );
  return rows.map((row) => ({ ...toEntry(row), externalPaymentId: row.external_payment_id }));
}

export async function getEntriesByPaymentGroupId(
  accountId: string,
  paymentGroupId: string,
  runner: Pool | PoolClient = pool
): Promise<LedgerEntry[]> {
  const { rows } = await runner.query<Row>(
    `SELECT * FROM ledger_entries
     WHERE account_id = $1 AND payment_group_id = $2
     ORDER BY created_at ASC, id ASC`,
    [accountId, paymentGroupId]
  );
  return rows.map(toEntry);
}
