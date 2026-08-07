import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../../src/app';
import { resetDatabase, DEMO_ACCOUNT_ID } from './resetDb';

describe('POST /api/accounts/:accountId/fees', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('assesses a $25 late fee as its own financial event', async () => {
    const res = await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/fees`)
      .send({ amountCents: 2500 });

    expect(res.status).toBe(201);
    expect(res.body.entry.entryType).toBe('fee_assessment');
    expect(res.body.entry.direction).toBe('debit');
    expect(res.body.entry.amountCents).toBe(2500);
    expect(res.body.balanceCents).toBe(302500);
  });

  it('rejects a non-positive fee amount', async () => {
    const res = await request(app)
      .post(`/api/accounts/${DEMO_ACCOUNT_ID}/fees`)
      .send({ amountCents: -25 });
    expect(res.status).toBe(422);
  });
});
