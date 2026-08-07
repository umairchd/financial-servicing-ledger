import { Request, Router } from 'express';
import { postPayment } from '../services/paymentService';
import { reversePayment } from '../services/reversalService';
import { ValidationError } from '../errors';
import { serializeEntry } from './serialize';

export const paymentsRouter = Router({ mergeParams: true });

// Express's types don't infer parent route params from mergeParams: true.
interface AccountParams {
  accountId: string;
}
interface ReversalParams extends AccountParams {
  paymentGroupId: string;
}

paymentsRouter.post('/', async (req: Request<AccountParams>, res, next) => {
  try {
    const { externalPaymentId, amountCents } = req.body ?? {};
    if (typeof amountCents !== 'number') {
      throw new ValidationError('amountCents (integer, cents) is required');
    }
    const result = await postPayment(
      req.params.accountId,
      externalPaymentId,
      amountCents
    );
    res.status(201).json({
      paymentGroupId: result.paymentGroupId,
      entries: result.entries.map(serializeEntry),
      balanceCents: result.balanceCents,
    });
  } catch (err) {
    next(err);
  }
});

paymentsRouter.post('/:paymentGroupId/reversal', async (req: Request<ReversalParams>, res, next) => {
  try {
    const result = await reversePayment(
      req.params.accountId,
      req.params.paymentGroupId
    );
    res.status(201).json({
      reversalPaymentGroupId: result.reversalPaymentGroupId,
      entries: result.entries.map(serializeEntry),
      balanceCents: result.balanceCents,
    });
  } catch (err) {
    next(err);
  }
});
