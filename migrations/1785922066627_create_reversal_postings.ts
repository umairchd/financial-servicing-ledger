import { MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable('reversal_postings', {
    original_payment_group_id: { type: 'uuid', primaryKey: true },
    reversal_payment_group_id: { type: 'uuid', notNull: true },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable('reversal_postings');
}
