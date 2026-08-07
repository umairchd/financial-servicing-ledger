import { describe, expect, it } from 'vitest';
import { allocatePayment } from '../../src/domain/waterfall';

describe('allocatePayment', () => {
  it('applies fees, then interest, then principal in order', () => {
    const result = allocatePayment(
      { feesCents: 2500, interestCents: 5000, principalCents: 300000 },
      40000
    );
    expect(result).toEqual({
      feesCents: 2500,
      interestCents: 5000,
      principalCents: 32500,
    });
  });

  it('allocates the full amount to principal when nothing else is outstanding', () => {
    const result = allocatePayment(
      { feesCents: 0, interestCents: 0, principalCents: 300000 },
      40000
    );
    expect(result).toEqual({ feesCents: 0, interestCents: 0, principalCents: 40000 });
  });

  it('covers only fees when the payment does not reach interest', () => {
    const result = allocatePayment(
      { feesCents: 2500, interestCents: 5000, principalCents: 300000 },
      1000
    );
    expect(result).toEqual({ feesCents: 1000, interestCents: 0, principalCents: 0 });
  });

  it('splits a partial payment across fees and interest without reaching principal', () => {
    const result = allocatePayment(
      { feesCents: 2500, interestCents: 5000, principalCents: 300000 },
      5000
    );
    expect(result).toEqual({ feesCents: 2500, interestCents: 2500, principalCents: 0 });
  });

  it('handles the $200 partial payment scenario from the spec (only a $25 fee outstanding)', () => {
    const result = allocatePayment(
      { feesCents: 2500, interestCents: 0, principalCents: 267500 },
      20000
    );
    expect(result).toEqual({ feesCents: 2500, interestCents: 0, principalCents: 17500 });
  });

  it('clamps overpayment beyond total outstanding into principal', () => {
    const result = allocatePayment(
      { feesCents: 0, interestCents: 0, principalCents: 100 },
      500
    );
    expect(result).toEqual({ feesCents: 0, interestCents: 0, principalCents: 500 });
  });

  it('never allocates a negative amount even if outstanding is negative (over-reversed edge case)', () => {
    const result = allocatePayment(
      { feesCents: -100, interestCents: 0, principalCents: 300000 },
      1000
    );
    expect(result.feesCents).toBe(0);
    expect(result.interestCents).toBe(0);
    expect(result.principalCents).toBe(1000);
  });

  it('rejects a non-positive amount', () => {
    expect(() =>
      allocatePayment({ feesCents: 0, interestCents: 0, principalCents: 0 }, 0)
    ).toThrow();
    expect(() =>
      allocatePayment({ feesCents: 0, interestCents: 0, principalCents: 0 }, -100)
    ).toThrow();
  });

  it('rejects a non-integer amount', () => {
    expect(() =>
      allocatePayment({ feesCents: 0, interestCents: 0, principalCents: 0 }, 40.5)
    ).toThrow();
  });
});
