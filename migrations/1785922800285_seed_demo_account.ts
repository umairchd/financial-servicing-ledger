import { MigrationBuilder } from 'node-pg-migrate';

export const DEMO_ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';
const ORIGINATION_PAYMENT_GROUP_ID = '00000000-0000-0000-0000-000000000001';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    INSERT INTO accounts (id, scheduled_payment_cents)
    VALUES ('${DEMO_ACCOUNT_ID}', 40000);
  `);

  // The starting $3,000 principal balance is itself a ledger row, not a separate
  // mutable field on accounts -- so the balance is always a pure derivation from
  // ledger_entries with nothing to keep in sync.
  pgm.sql(`
    INSERT INTO ledger_entries
      (account_id, entry_type, direction, amount_cents, payment_group_id, description)
    VALUES
      ('${DEMO_ACCOUNT_ID}', 'principal_origination', 'debit', 300000,
       '${ORIGINATION_PAYMENT_GROUP_ID}', 'Original principal balance');
  `);
}

export async function down(): Promise<void> {
  // Intentionally a no-op: ledger_entries is append-only (DELETE is blocked by
  // a DB rule, see migration 002), so deleting the seed row here would silently
  // do nothing and then fail the accounts row's FK check. Rolling back to zero
  // relies on migrations 002/001 dropping their tables outright instead, which
  // isn't blocked by the rule.
}
