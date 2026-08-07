import { Request, Router } from 'express';
import { assessFee } from '../services/feeService';
import { ValidationError } from '../errors';
import { serializeEntry } from './serialize';

export const feesRouter = Router({ mergeParams: true });

interface AccountParams {
  accountId: string;
}

feesRouter.post('/', async (req: Request<AccountParams>, res, next) => {
  try {
    const { amountCents, description } = req.body ?? {};
    if (typeof amountCents !== 'number') {
      throw new ValidationError('amountCents (integer, cents) is required');
    }
    const result = await assessFee(req.params.accountId, amountCents, description);
    res.status(201).json({
      paymentGroupId: result.paymentGroupId,
      entry: serializeEntry(result.entry),
      balanceCents: result.balanceCents,
    });
  } catch (err) {
    next(err);
  }
});
