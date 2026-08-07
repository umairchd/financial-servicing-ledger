import { Router } from 'express';
import * as accountsRepo from '../repositories/accountsRepo';
import * as ledgerRepo from '../repositories/ledgerRepo';
import { NotFoundError } from '../errors';
import { serializeBalance, serializeEntry } from './serialize';

export const accountsRouter = Router();

accountsRouter.get('/:accountId', async (req, res, next) => {
  try {
    const account = await accountsRepo.getAccount(req.params.accountId);
    if (!account) throw new NotFoundError(`Account ${req.params.accountId} not found`);
    const balanceCents = await ledgerRepo.getBalanceCents(account.id);
    res.json({
      id: account.id,
      scheduledPaymentCents: account.scheduledPaymentCents,
      createdAt: account.createdAt,
      ...serializeBalance(account.id, balanceCents),
    });
  } catch (err) {
    next(err);
  }
});

accountsRouter.get('/:accountId/balance', async (req, res, next) => {
  try {
    const account = await accountsRepo.getAccount(req.params.accountId);
    if (!account) throw new NotFoundError(`Account ${req.params.accountId} not found`);
    const balanceCents = await ledgerRepo.getBalanceCents(account.id);
    res.json(serializeBalance(account.id, balanceCents));
  } catch (err) {
    next(err);
  }
});

accountsRouter.get('/:accountId/transactions', async (req, res, next) => {
  try {
    const account = await accountsRepo.getAccount(req.params.accountId);
    if (!account) throw new NotFoundError(`Account ${req.params.accountId} not found`);
    const entries = await ledgerRepo.getHistory(account.id);
    res.json({ accountId: account.id, entries: entries.map(serializeEntry) });
  } catch (err) {
    next(err);
  }
});
