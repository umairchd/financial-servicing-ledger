import { pool } from '../../src/db/pool';
import { DEMO_ACCOUNT_ID } from '../../migrations/1785922800285_seed_demo_account';

export { DEMO_ACCOUNT_ID };

// TRUNCATE (unlike DELETE) isn't routed through ledger_entries' append-only rule.
export async function resetDatabase(): Promise<void> {
  await pool.query(
    'TRUNCATE reversal_postings, payment_postings, ledger_entries, accounts CASCADE'
  );
  await pool.query(
    `INSERT INTO accounts (id, scheduled_payment_cents) VALUES ($1, 40000)`,
    [DEMO_ACCOUNT_ID]
  );
  await pool.query(
    `INSERT INTO ledger_entries
       (account_id, entry_type, direction, amount_cents, payment_group_id, description)
     VALUES ($1, 'principal_origination', 'debit', 300000, gen_random_uuid(), 'Original principal balance')`,
    [DEMO_ACCOUNT_ID]
  );
}
