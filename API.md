# API Documentation

Base path: `/api`. No authentication (see README assumptions). All request/response
bodies are JSON.

Money is always an integer number of **cents** (`amountCents`, `balanceCents`, etc.).
Response bodies also include a human-readable `*Display` string (e.g.
`amountDisplay: "$400.00"`) for convenience, but the integer-cents field is canonical.

The seeded demo account: `id = 11111111-1111-1111-1111-111111111111`,
`scheduledPaymentCents = 40000`, starting balance $3,000.

---

## GET /api/accounts/:accountId

Account details plus current balance.

**Response `200`**
```json
{
  "id": "11111111-1111-1111-1111-111111111111",
  "scheduledPaymentCents": 40000,
  "createdAt": "2026-08-07T22:46:15.000Z",
  "accountId": "11111111-1111-1111-1111-111111111111",
  "balanceCents": 300000,
  "balanceDisplay": "$3000.00",
  "asOf": "2026-08-07T23:00:00.000Z"
}
```

**Errors**: `404 not_found` if the account doesn't exist.

---

## GET /api/accounts/:accountId/balance

Current balance, derived live from `ledger_entries` (never a stored value).

**Response `200`**
```json
{
  "accountId": "11111111-1111-1111-1111-111111111111",
  "balanceCents": 300000,
  "balanceDisplay": "$3000.00",
  "asOf": "2026-08-07T23:00:00.000Z"
}
```

**Errors**: `404 not_found`.

---

## GET /api/accounts/:accountId/transactions

Full transaction history, chronological (`ORDER BY created_at ASC, id ASC`).

**Response `200`**
```json
{
  "accountId": "11111111-1111-1111-1111-111111111111",
  "entries": [
    {
      "id": "3f2a1c...",
      "accountId": "11111111-1111-1111-1111-111111111111",
      "entryType": "principal_origination",
      "direction": "debit",
      "amountCents": 300000,
      "amountDisplay": "$3000.00",
      "paymentGroupId": "00000000-0000-0000-0000-000000000001",
      "reversesPaymentGroupId": null,
      "externalPaymentId": null,
      "description": "Original principal balance",
      "createdAt": "2026-08-07T22:46:15.000Z"
    }
  ]
}
```

`entryType` is one of: `principal_origination`, `fee_assessment`,
`interest_assessment` (schema supports it; no endpoint currently creates one —
see README), `payment_fees`, `payment_interest`, `payment_principal`,
`reversal_fees`, `reversal_interest`, `reversal_principal`.

`externalPaymentId` is populated only on rows belonging to a posted payment
(joined from `payment_postings`); it's `null` for fee-assessment and reversal
rows.

**Errors**: `404 not_found`.

---

## POST /api/accounts/:accountId/payments

Records a payment and allocates it through the fees → interest → principal
waterfall.

**Request body**
```json
{ "externalPaymentId": "ext-payment-123", "amountCents": 40000 }
```

**Response `201`** — one entry per non-zero allocation line (1 to 3 entries):
```json
{
  "paymentGroupId": "b8276f55-3b2c-4975-b7ba-4c9cd80430e8",
  "entries": [
    {
      "id": "...",
      "entryType": "payment_fees",
      "direction": "credit",
      "amountCents": 2500,
      "amountDisplay": "$25.00",
      "paymentGroupId": "b8276f55-3b2c-4975-b7ba-4c9cd80430e8",
      "reversesPaymentGroupId": null,
      "description": "Payment allocation: fees ($25.00)",
      "createdAt": "..."
    },
    {
      "entryType": "payment_principal",
      "amountCents": 37500,
      "description": "Payment allocation: principal ($375.00)",
      "...": "..."
    }
  ],
  "balanceCents": 262500
}
```

**Errors**
- `422 validation_error` — `amountCents` missing/not a positive integer, or `externalPaymentId` missing.
- `404 not_found` — unknown `accountId`.
- `409 duplicate_external_payment_id` — this `externalPaymentId` was already posted for this account. No new ledger rows are created.
  ```json
  {
    "error": "duplicate_external_payment_id",
    "message": "Payment with this externalPaymentId has already been posted",
    "existingPaymentGroupId": "b8276f55-3b2c-4975-b7ba-4c9cd80430e8"
  }
  ```

---

## POST /api/accounts/:accountId/fees

Assesses a fee (e.g. the $25 late fee) as a single standalone ledger event.

**Request body**
```json
{ "amountCents": 2500, "description": "Late fee" }
```
`description` is optional; defaults to `"Late fee assessed ($25.00)"`.

**Response `201`**
```json
{
  "paymentGroupId": "a56b09ad-...",
  "entry": {
    "entryType": "fee_assessment",
    "direction": "debit",
    "amountCents": 2500,
    "description": "Late fee",
    "...": "..."
  },
  "balanceCents": 302500
}
```

**Errors**: `422 validation_error` (bad amount), `404 not_found`.

---

## POST /api/accounts/:accountId/payments/:paymentGroupId/reversal

Reverses a previously posted payment by inserting new, mirrored ledger rows —
the original rows are never modified or deleted.

No request body.

**Response `201`**
```json
{
  "reversalPaymentGroupId": "63623a41-...",
  "entries": [
    {
      "entryType": "reversal_principal",
      "direction": "debit",
      "amountCents": 37500,
      "reversesPaymentGroupId": "b8276f55-3b2c-4975-b7ba-4c9cd80430e8",
      "description": "Reversal of: Payment allocation: principal ($375.00)",
      "...": "..."
    }
  ],
  "balanceCents": 300000
}
```

**Errors**
- `404 not_found` — no payment with that `paymentGroupId` exists for this account.
- `422 validation_error` — `paymentGroupId` refers to a financial event with no reversible payment lines (e.g. a fee assessment — only payments can be reversed).
- `409 already_reversed` — this payment was already reversed.
  ```json
  {
    "error": "already_reversed",
    "message": "This payment has already been reversed",
    "existingReversalPaymentGroupId": "63623a41-..."
  }
  ```

---

## Error shape (all endpoints)

Every non-2xx response is:
```json
{ "error": "<machine-readable code>", "message": "<human-readable>", "...": "additional context per error type, see above" }
```

| Status | `error` | Meaning |
|---|---|---|
| 404 | `not_found` | Unknown account, or unknown paymentGroupId for a reversal |
| 422 | `validation_error` | Bad/missing request fields |
| 409 | `duplicate_external_payment_id` | Duplicate payment blocked (idempotency) |
| 409 | `already_reversed` | Payment already reversed |
| 500 | `internal_error` | Unexpected server error |
