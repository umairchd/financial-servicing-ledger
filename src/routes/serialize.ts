import { LedgerEntry } from '../domain/ledger';

function formatUsd(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

export function serializeEntry(entry: LedgerEntry) {
  return {
    id: entry.id,
    accountId: entry.accountId,
    entryType: entry.entryType,
    direction: entry.direction,
    amountCents: entry.amountCents,
    amountDisplay: formatUsd(entry.amountCents),
    paymentGroupId: entry.paymentGroupId,
    reversesPaymentGroupId: entry.reversesPaymentGroupId,
    externalPaymentId: entry.externalPaymentId ?? null,
    description: entry.description,
    createdAt: entry.createdAt,
  };
}

export function serializeBalance(accountId: string, balanceCents: number) {
  return {
    accountId,
    balanceCents,
    balanceDisplay: formatUsd(balanceCents),
    asOf: new Date().toISOString(),
  };
}
