import { randomUUID } from 'crypto';
import { withTransaction } from '../db/pool';
import { EntryType, LedgerEntry } from '../domain/ledger';
import * as ledgerRepo from '../repositories/ledgerRepo';
import * as accountsRepo from '../repositories/accountsRepo';
import * as reversalPostingsRepo from '../repositories/reversalPostingsRepo';
import { UNIQUE_VIOLATION } from '../repositories/paymentPostingsRepo';
import { AlreadyReversedError, NotFoundError, ValidationError } from '../errors';

const REVERSAL_ENTRY_TYPE: Partial<Record<EntryType, EntryType>> = {
  payment_fees: 'reversal_fees',
  payment_interest: 'reversal_interest',
  payment_principal: 'reversal_principal',
};

export interface ReversePaymentResult {
  reversalPaymentGroupId: string;
  entries: LedgerEntry[];
  balanceCents: number;
}

export async function reversePayment(
  accountId: string,
  originalPaymentGroupId: string
): Promise<ReversePaymentResult> {
  const reversalPaymentGroupId = randomUUID();

  return withTransaction(async (client) => {
    const account = await accountsRepo.lockAccountForUpdate(client, accountId);
    if (!account) {
      throw new NotFoundError(`Account ${accountId} not found`);
    }

    const originalEntries = await ledgerRepo.getEntriesByPaymentGroupId(
      accountId,
      originalPaymentGroupId,
      client
    );
    if (originalEntries.length === 0) {
      throw new NotFoundError(
        `No payment found with paymentGroupId ${originalPaymentGroupId}`
      );
    }

    const reversibleEntries = originalEntries.filter(
      (e) => e.entryType in REVERSAL_ENTRY_TYPE
    );
    if (reversibleEntries.length === 0) {
      throw new ValidationError(
        'This financial event has no reversible payment allocation lines'
      );
    }

    try {
      await reversalPostingsRepo.insertPosting(
        client,
        originalPaymentGroupId,
        reversalPaymentGroupId
      );
    } catch (err: any) {
      if (err.code === UNIQUE_VIOLATION) {
        const existing = await reversalPostingsRepo.findByOriginalPaymentGroupId(
          originalPaymentGroupId
        );
        throw new AlreadyReversedError(existing!.reversalPaymentGroupId);
      }
      throw err;
    }

    const newEntries: ledgerRepo.NewEntry[] = reversibleEntries.map((e) => ({
      accountId,
      entryType: REVERSAL_ENTRY_TYPE[e.entryType]!,
      direction: e.direction === 'debit' ? 'credit' : 'debit',
      amountCents: e.amountCents,
      paymentGroupId: reversalPaymentGroupId,
      reversesPaymentGroupId: originalPaymentGroupId,
      description: `Reversal of: ${e.description}`,
    }));

    const entries = await ledgerRepo.insertEntries(client, newEntries);
    const balanceCents = await ledgerRepo.getBalanceCents(accountId, client);

    return { reversalPaymentGroupId, entries, balanceCents };
  });
}
