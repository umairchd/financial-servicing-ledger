import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { resetDatabase, DEMO_ACCOUNT_ID } from './resetDb';

describe('POST /api/accounts/:accountId/payments', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('records a $400 payment and allocates it fully to principal when nothing else is outstanding', async () => {
    const res = await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/payments`)
      .send({ externalPaymentId: 'pay-001', amountCents: 40000 });

    expect(res.status).toBe(201);
    expect(res.body.entries).toHaveLength(1);
    expect(res.body.entries[0].entryType).toBe('payment_principal');
    expect(res.body.entries[0].amountCents).toBe(40000);
    expect(res.body.balanceCents).toBe(260000);
  });

  it('applies the waterfall (fees -> interest -> principal) when fees are outstanding', async () => {
    await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/fees`)
      .send({ amountCents: 2500 })
      .expect(201);

    const res = await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/payments`)
      .send({ externalPaymentId: 'pay-002', amountCents: 40000 });

    expect(res.status).toBe(201);
    const byType = Object.fromEntries(
      res.body.entries.map((e: any) => [e.entryType, e.amountCents])
    );
    expect(byType.payment_fees).toBe(2500);
    expect(byType.payment_principal).toBe(37500);
    expect(byType.payment_interest).toBeUndefined();
    expect(res.body.balanceCents).toBe(262500);
  });

  it('records a $200 partial payment covering only outstanding fees and part of principal', async () => {
    await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/fees`)
      .send({ amountCents: 2500 })
      .expect(201);

    const res = await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/payments`)
      .send({ externalPaymentId: 'pay-003', amountCents: 20000 });

    expect(res.status).toBe(201);
    const byType = Object.fromEntries(
      res.body.entries.map((e: any) => [e.entryType, e.amountCents])
    );
    expect(byType.payment_fees).toBe(2500);
    expect(byType.payment_principal).toBe(17500);
    expect(res.body.balanceCents).toBe(282500);
  });

  it('rejects a non-positive amount', async () => {
    const res = await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/payments`)
      .send({ externalPaymentId: 'pay-004', amountCents: 0 });
    expect(res.status).toBe(422);
  });

  it('returns 404 for an unknown account', async () => {
    const res = await request(app)
      .post(`/api/accounts/00000000-0000-0000-0000-000000000099/payments`)
      .send({ externalPaymentId: 'pay-005', amountCents: 40000 });
    expect(res.status).toBe(404);
  });
});
