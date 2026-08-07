export type EntryType =
  | 'principal_origination'
  | 'fee_assessment'
  | 'interest_assessment'
  | 'payment_fees'
  | 'payment_interest'
  | 'payment_principal'
  | 'reversal_fees'
  | 'reversal_interest'
  | 'reversal_principal';

export type Direction = 'debit' | 'credit';

export interface LedgerEntry {
  id: string;
  accountId: string;
  entryType: EntryType;
  direction: Direction;
  amountCents: number;
  paymentGroupId: string;
  reversesPaymentGroupId: string | null;
  description: string;
  createdAt: string;
  // Only populated by getHistory() (joined from payment_postings); undefined elsewhere.
  externalPaymentId?: string | null;
}

export interface Outstanding {
  feesCents: number;
  interestCents: number;
  principalCents: number;
}
