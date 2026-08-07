import { Outstanding } from './ledger';

export interface Allocation {
  feesCents: number;
  interestCents: number;
  principalCents: number;
}

/**
 * Overpayment beyond outstanding principal is clamped into principal rather
 * than creating a separate credit balance -- see README assumptions.
 */
export function allocatePayment(
  outstanding: Outstanding,
  amountCents: number
): Allocation {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error('amountCents must be a positive integer');
  }

  let remaining = amountCents;

  const feesCents = Math.min(remaining, Math.max(outstanding.feesCents, 0));
  remaining -= feesCents;

  const interestCents = Math.min(remaining, Math.max(outstanding.interestCents, 0));
  remaining -= interestCents;

  const principalCents = remaining;

  return { feesCents, interestCents, principalCents };
}
