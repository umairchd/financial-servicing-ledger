import { randomUUID } from 'crypto';
import { withTransaction } from '../db/pool';
import { allocatePayment } from '../domain/waterfall';
import { LedgerEntry } from '../domain/ledger';
import * as ledgerRepo from '../repositories/ledgerRepo';
import * as accountsRepo from '../repositories/accountsRepo';
import * as paymentPostingsRepo from '../repositories/paymentPostingsRepo';
import { DuplicatePaymentError, NotFoundError, ValidationError } from '../errors';

export interface PostPaymentResult {
  paymentGroupId: string;
  entries: LedgerEntry[];
  balanceCents: number;
}

function formatUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export async function postPayment(
  accountId: string,
  externalPaymentId: string,
  amountCents: number
): Promise<PostPaymentResult> {
  if (!externalPaymentId || typeof externalPaymentId !== 'string') {
    throw new ValidationError('externalPaymentId is required');
  }
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError('amountCents must be a positive integer');
  }

  const paymentGroupId = randomUUID();

  return withTransaction(async (client) => {
    const account = await accountsRepo.lockAccountForUpdate(client, accountId);
    if (!account) {
      throw new NotFoundError(`Account ${accountId} not found`);
    }

    // First write of the transaction, so a duplicate fails here before any
    // ledger_entries rows exist for this attempt.
    try {
      await paymentPostingsRepo.insertPosting(
        client,
        accountId,
        externalPaymentId,
        paymentGroupId
      );
    } catch (err: any) {
      if (err.code === paymentPostingsRepo.UNIQUE_VIOLATION) {
        const existing = await paymentPostingsRepo.findByExternalPaymentId(
          accountId,
          externalPaymentId
        );
        throw new DuplicatePaymentError(existing!.paymentGroupId);
      }
      throw err;
    }

    const outstanding = await ledgerRepo.getOutstanding(accountId, client);
    const allocation = allocatePayment(outstanding, amountCents);

    const newEntries: ledgerRepo.NewEntry[] = [];
    if (allocation.feesCents > 0) {
      newEntries.push({
        accountId,
        entryType: 'payment_fees',
        direction: 'credit',
        amountCents: allocation.feesCents,
        paymentGroupId,
        description: `Payment allocation: fees (${formatUsd(allocation.feesCents)})`,
      });
    }
    if (allocation.interestCents > 0) {
      newEntries.push({
        accountId,
        entryType: 'payment_interest',
        direction: 'credit',
        amountCents: allocation.interestCents,
        paymentGroupId,
        description: `Payment allocation: interest (${formatUsd(allocation.interestCents)})`,
      });
    }
    if (allocation.principalCents > 0) {
      newEntries.push({
        accountId,
        entryType: 'payment_principal',
        direction: 'credit',
        amountCents: allocation.principalCents,
        paymentGroupId,
        description: `Payment allocation: principal (${formatUsd(allocation.principalCents)})`,
      });
    }

    const entries = await ledgerRepo.insertEntries(client, newEntries);
    const balanceCents = await ledgerRepo.getBalanceCents(accountId, client);

    return { paymentGroupId, entries, balanceCents };
  });
}
