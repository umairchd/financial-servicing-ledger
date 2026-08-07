import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { resetDatabase, DEMO_ACCOUNT_ID } from './resetDb';

describe('POST /api/accounts/:accountId/payments/:paymentGroupId/reversal', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('reverses the original $400 payment without touching the original record, and restores the balance', async () => {
    const posted = await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/payments`)
      .send({ externalPaymentId: 'to-be-reversed', amountCents: 40000 });
    expect(posted.status).toBe(201);
    const { paymentGroupId } = posted.body;

    const historyBefore = await request(app).get(
      `/api/accounts/${DEMO_ACCOUNT_ID}/transactions`
    );
    const originalRowsBefore = historyBefore.body.entries.filter(
      (e: any) => e.paymentGroupId === paymentGroupId
    );
    expect(originalRowsBefore).toHaveLength(1);

    const reversed = await request(app).post(
      `/api/accounts/${DEMO_ACCOUNT_ID}/payments/${paymentGroupId}/reversal`
    );
    expect(reversed.status).toBe(201);
    expect(reversed.body.entries).toHaveLength(1);
    expect(reversed.body.entries[0].entryType).toBe('reversal_principal');
    expect(reversed.body.entries[0].direction).toBe('debit');
    expect(reversed.body.entries[0].reversesPaymentGroupId).toBe(paymentGroupId);
    expect(reversed.body.balanceCents).toBe(300000);

    const historyAfter = await request(app).get(
      `/api/accounts/${DEMO_ACCOUNT_ID}/transactions`
    );
    const originalRowsAfter = historyAfter.body.entries.filter(
      (e: any) => e.paymentGroupId === paymentGroupId
    );
    expect(originalRowsAfter).toEqual(originalRowsBefore);
    expect(historyAfter.body.entries.length).toBe(
      historyBefore.body.entries.length + 1
    );
  });

  it('rejects reversing the same payment twice', async () => {
    const posted = await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/payments`)
      .send({ externalPaymentId: 'reverse-once', amountCents: 40000 });
    const { paymentGroupId } = posted.body;

    const first = await request(app).post(
      `/api/accounts/${DEMO_ACCOUNT_ID}/payments/${paymentGroupId}/reversal`
    );
    expect(first.status).toBe(201);

    const second = await request(app).post(
      `/api/accounts/${DEMO_ACCOUNT_ID}/payments/${paymentGroupId}/reversal`
    );
    expect(second.status).toBe(409);
    expect(second.body.error).toBe('already_reversed');
  });

  it('returns 404 when reversing an unknown paymentGroupId', async () => {
    const res = await request(app).post(
      `/api/accounts/${DEMO_ACCOUNT_ID}/payments/00000000-0000-0000-0000-000000000099/reversal`
    );
    expect(res.status).toBe(404);
  });
});
