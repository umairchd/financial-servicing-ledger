import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('payment_postings', {
    account_id: {
      type: 'uuid',
      notNull: true,
      references: 'accounts',
      onDelete: 'RESTRICT',
    },
    external_payment_id: { type: 'text', notNull: true },
    payment_group_id: { type: 'uuid', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Duplicate (account_id, external_payment_id) fails here before any
  // ledger_entries rows are written.
  pgm.addConstraint('payment_postings', 'payment_postings_pkey', {
    primaryKey: ['account_id', 'external_payment_id'],
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('payment_postings');
}
