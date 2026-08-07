export class DuplicatePaymentError extends Error {
  constructor(public existingPaymentGroupId: string) {
    super('Payment with this externalPaymentId has already been posted');
    this.name = 'DuplicatePaymentError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class AlreadyReversedError extends Error {
  constructor(public existingReversalPaymentGroupId: string) {
    super('This payment has already been reversed');
    this.name = 'AlreadyReversedError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
