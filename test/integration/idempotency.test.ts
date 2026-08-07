import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { pool } from '../../src/db/pool';
import { resetDatabase, DEMO_ACCOUNT_ID } from './resetDb';

describe('duplicate external payment ID protection', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('blocks a second payment posted with the same externalPaymentId and creates no new ledger rows', async () => {
    const first = await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/payments`)
      .send({ externalPaymentId: 'dup-payment-1', amountCents: 40000 });
    expect(first.status).toBe(201);

    const { rows: countAfterFirst } = await pool.query(
      'SELECT COUNT(*) FROM ledger_entries WHERE account_id = $1',
      [DEMO_ACCOUNT_ID]
    );

    const second = await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/payments`)
      .send({ externalPaymentId: 'dup-payment-1', amountCents: 40000 });

    expect(second.status).toBe(409);
    expect(second.body.error).toBe('duplicate_external_payment_id');
    expect(second.body.existingPaymentGroupId).toBe(first.body.paymentGroupId);

    const { rows: countAfterSecond } = await pool.query(
      'SELECT COUNT(*) FROM ledger_entries WHERE account_id = $1',
      [DEMO_ACCOUNT_ID]
    );
    expect(countAfterSecond[0].count).toBe(countAfterFirst[0].count);

    const { rows: postingRows } = await pool.query(
      'SELECT COUNT(*) FROM payment_postings WHERE account_id = $1 AND external_payment_id = $2',
      [DEMO_ACCOUNT_ID, 'dup-payment-1']
    );
    expect(postingRows[0].count).toBe('1');
  });

  it('allows the same amount to be posted again under a different externalPaymentId', async () => {
    await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/payments`)
      .send({ externalPaymentId: 'unique-a', amountCents: 40000 })
      .expect(201);

    const second = await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/payments`)
      .send({ externalPaymentId: 'unique-b', amountCents: 40000 });

    expect(second.status).toBe(201);
  });
});
