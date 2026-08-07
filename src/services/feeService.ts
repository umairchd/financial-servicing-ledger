import { randomUUID } from 'crypto';
import { withTransaction } from '../db/pool';
import { LedgerEntry } from '../domain/ledger';
import * as ledgerRepo from '../repositories/ledgerRepo';
import * as accountsRepo from '../repositories/accountsRepo';
import { NotFoundError, ValidationError } from '../errors';

export interface AssessFeeResult {
  paymentGroupId: string;
  entry: LedgerEntry;
  balanceCents: number;
}

export async function assessFee(
  accountId: string,
  amountCents: number,
  description?: string
): Promise<AssessFeeResult> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new ValidationError('amountCents must be a positive integer');
  }

  const paymentGroupId = randomUUID();

  return withTransaction(async (client) => {
    const account = await accountsRepo.lockAccountForUpdate(client, accountId);
    if (!account) {
      throw new NotFoundError(`Account ${accountId} not found`);
    }

    const [entry] = await ledgerRepo.insertEntries(client, [
      {
        accountId,
        entryType: 'fee_assessment',
        direction: 'debit',
        amountCents,
        paymentGroupId,
        description: description ?? `Late fee assessed ($${(amountCents / 100).toFixed(2)})`,
      },
    ]);
    const balanceCents = await ledgerRepo.getBalanceCents(accountId, client);

    return { paymentGroupId, entry, balanceCents };
  });
}
