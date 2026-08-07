import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { pool } from '../../src/db/pool';
import { resetDatabase, DEMO_ACCOUNT_ID } from './resetDb';

describe('GET /balance and /transactions', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('runs the full spec scenario and matches an independently-computed balance', async () => {
    const payment = await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/payments`)
      .send({ externalPaymentId: 'scenario-payment', amountCents: 40000 });
    expect(payment.status).toBe(201);

    const duplicate = await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/payments`)
      .send({ externalPaymentId: 'scenario-payment', amountCents: 40000 });
    expect(duplicate.status).toBe(409);

    const fee = await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/fees`)
      .send({ amountCents: 2500 });
    expect(fee.status).toBe(201);

    const partial = await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/payments`)
      .send({ externalPaymentId: 'scenario-partial', amountCents: 20000 });
    expect(partial.status).toBe(201);

    const reversal = await request(app).post(
      `/api/accounts/${DEMO_ACCOUNT_ID}/payments/${payment.body.paymentGroupId}/reversal`
    );
    expect(reversal.status).toBe(201);

    const balanceRes = await request(app).get(
      `/api/accounts/${DEMO_ACCOUNT_ID}/balance`
    );
    const { rows } = await pool.query(
      `SELECT COALESCE(SUM(
         CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END
       ), 0) AS balance_cents
       FROM ledger_entries WHERE account_id = $1`,
      [DEMO_ACCOUNT_ID]
    );
    expect(balanceRes.body.balanceCents).toBe(Number(rows[0].balance_cents));

    const historyRes = await request(app).get(
      `/api/accounts/${DEMO_ACCOUNT_ID}/transactions`
    );
    const timestamps = historyRes.body.entries.map((e: any) =>
      new Date(e.createdAt).getTime()
    );
    const sorted = [...timestamps].sort((a, b) => a - b);
    expect(timestamps).toEqual(sorted);

    // principal_origination(1) + payment(1) + fee(1) + partial payment(2: fees+principal)
    // + reversal(1) = 6 rows total.
    expect(historyRes.body.entries).toHaveLength(6);
  });
});
