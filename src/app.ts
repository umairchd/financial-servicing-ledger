import express, { NextFunction, Request, Response } from 'express';
import path from 'path';
import { accountsRouter } from './routes/accounts';
import { paymentsRouter } from './routes/payments';
import { feesRouter } from './routes/fees';
import {
  AlreadyReversedError,
  DuplicatePaymentError,
  NotFoundError,
  ValidationError,
} from './errors';

export const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use('/api/accounts', accountsRouter);
app.use('/api/accounts/:accountId/payments', paymentsRouter);
app.use('/api/accounts/:accountId/fees', feesRouter);

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof DuplicatePaymentError) {
    return res.status(409).json({
      error: 'duplicate_external_payment_id',
      message: err.message,
      existingPaymentGroupId: err.existingPaymentGroupId,
    });
  }
  if (err instanceof AlreadyReversedError) {
    return res.status(409).json({
      error: 'already_reversed',
      message: err.message,
      existingReversalPaymentGroupId: err.existingReversalPaymentGroupId,
    });
  }
  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: 'not_found', message: err.message });
  }
  if (err instanceof ValidationError) {
    return res.status(422).json({ error: 'validation_error', message: err.message });
  }
  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ error: 'internal_error', message: 'Unexpected error' });
});

// Vercel's "Express" framework preset zero-config detection looks for a
// default export here (in addition to api/index.ts) to wrap as the
// serverless function.
export default app;
