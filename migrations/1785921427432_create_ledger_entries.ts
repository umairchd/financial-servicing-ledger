import { MigrationBuilder } from 'node-pg-migrate';

const ENTRY_TYPES = [
  'principal_origination',
  'fee_assessment',
  'interest_assessment',
  'payment_fees',
  'payment_interest',
  'payment_principal',
  'reversal_fees',
  'reversal_interest',
  'reversal_principal',
];

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('ledger_entries', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    account_id: {
      type: 'uuid',
      notNull: true,
      references: 'accounts',
      onDelete: 'RESTRICT',
    },
    entry_type: {
      type: 'text',
      notNull: true,
      check: `entry_type IN (${ENTRY_TYPES.map((t) => `'${t}'`).join(', ')})`,
    },
    direction: {
      type: 'text',
      notNull: true,
      check: "direction IN ('debit', 'credit')",
    },
    amount_cents: {
      type: 'bigint',
      notNull: true,
      check: 'amount_cents > 0',
    },
    payment_group_id: { type: 'uuid', notNull: true },
    reverses_payment_group_id: { type: 'uuid' },
    description: { type: 'text', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // DB-level append-only enforcement, independent of application code.
  pgm.sql(`
    CREATE RULE ledger_entries_no_update AS ON UPDATE TO ledger_entries DO INSTEAD NOTHING;
    CREATE RULE ledger_entries_no_delete AS ON DELETE TO ledger_entries DO INSTEAD NOTHING;
  `);

  pgm.createIndex('ledger_entries', 'account_id');
  pgm.createIndex('ledger_entries', 'payment_group_id');
  pgm.createIndex('ledger_entries', 'reverses_payment_group_id');
  pgm.createIndex('ledger_entries', ['account_id', 'created_at']);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    DROP RULE IF EXISTS ledger_entries_no_update ON ledger_entries;
    DROP RULE IF EXISTS ledger_entries_no_delete ON ledger_entries;
  `);
  pgm.dropTable('ledger_entries');
}
