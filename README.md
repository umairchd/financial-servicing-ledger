# Financial Servicing Ledger API

A small append-only financial ledger for a single loan-servicing account: record
payments, allocate them through a fees → interest → principal waterfall, assess
fees, and reverse a payment without ever mutating or deleting history.

## Setup

Requires Node.js and a local PostgreSQL server.

```bash
npm install

# Create a dedicated role + dev/test databases (adjust if you already have a
# preferred Postgres superuser/connection method).
psql -U postgres -d postgres -c "CREATE ROLE ledger_app LOGIN;"
psql -U postgres -d postgres -c "CREATE DATABASE ledger_dev  OWNER ledger_app;"
psql -U postgres -d postgres -c "CREATE DATABASE ledger_test OWNER ledger_app;"

cp .env.example .env   # DATABASE_URL=postgresql://ledger_app@localhost:5432/ledger_dev
# .env.test is already checked in, pointing at ledger_test

npm run migrate up        # apply migrations + seed demo account to ledger_dev
npm run migrate:test up   # apply migrations + seed demo account to ledger_test

npm run dev                # start the API on http://localhost:3000
```

Open `http://localhost:3000` in a browser for the demo UI (served as a static
page by the same Express app).

If your local Postgres uses different credentials/auth, just point `DATABASE_URL`
/ `.env.test` at whatever role and databases you use — nothing else in the setup
is Postgres-flavor-specific. A `docker-compose.yml` running `postgres:16` would be
a drop-in alternative to a local install if preferred.

### Running tests

```bash
npm run test:unit          # pure logic, no DB required
npm run test:integration   # full HTTP -> DB flow, requires ledger_test migrated
npm test                   # both
```

## Architecture

### Data model

Everything is one append-only table, `ledger_entries`. Every financial event —
a payment's fee/interest/principal allocation lines, a fee assessment, a
reversal — is one or more rows sharing a `payment_group_id` (the "financial
event" grouping key). Each row has a `direction` (`debit` increases what's
owed, `credit` decreases it) and a positive `amount_cents`; there is no
negative-number sign convention to get wrong.

The **current balance is never stored** — it's a live derivation:

```sql
SELECT COALESCE(SUM(
  CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END
), 0)
FROM ledger_entries WHERE account_id = $1;
```

Even the starting $3,000 principal is itself a `principal_origination` ledger
row inserted by the seed migration, not a separate mutable field — so there is
nothing outside the ledger that balance could ever drift out of sync with.
Outstanding fees/interest/principal (used by the payment waterfall) are
derived the same way, filtered by `entry_type`.

**Append-only, enforced at the database level, not just by convention**:
`ledger_entries` has Postgres `RULE`s that turn `UPDATE`/`DELETE` into no-ops
(see the `create_ledger_entries` migration). Even a bug in application code
cannot mutate or delete history; a reversal is the only way to change a
payment's effect, and it does so by inserting new rows.

**Reversal** looks up the original payment's allocation rows by
`payment_group_id`, and inserts mirrored rows (opposite `direction`, same
`amount_cents`) tagged with `reverses_payment_group_id` pointing back at the
original. The original rows are only ever read, never written to.

**Idempotency** (duplicate `externalPaymentId` protection) is a real database
constraint, not an application-level check: `payment_postings` has
`PRIMARY KEY (account_id, external_payment_id)`. It's a separate table from
`ledger_entries` because one payment can fan out into up to three allocation
rows (fees/interest/principal) that would otherwise collide on a naive unique
index. The posting-guard row is inserted as the *first* statement of the
payment transaction, so a duplicate fails atomically before any ledger rows
exist for that attempt. `reversal_postings` reuses the identical pattern,
keyed on the original `payment_group_id`, to prevent double-reversal.

### Transactions

Every multi-statement write (posting a payment, reversing one) runs inside a
single Postgres transaction via `withTransaction()` (`src/db/pool.ts`):
`BEGIN` → lock the account row (`SELECT ... FOR UPDATE`, serializing concurrent
writes against the same account) → insert the idempotency marker → read
outstanding balances → insert ledger rows → `COMMIT`, with `ROLLBACK` on any
error. A failed request cannot leave a payment half-posted.

### Payment waterfall

`src/domain/waterfall.ts` is a pure function — outstanding
fees/interest/principal in, an allocation out — applying the payment fees
first, then interest, then principal, each capped at whatever remains. It has
no I/O, so it's covered directly by fast unit tests independent of the
database.

## API

Full endpoint documentation (request/response bodies, error shapes, examples)
is in **[API.md](API.md)**. Summary:

| Method | Path | Notes |
|---|---|---|
| GET | `/api/accounts/:accountId` | Account + current balance |
| GET | `/api/accounts/:accountId/balance` | Derived balance, never stored |
| GET | `/api/accounts/:accountId/transactions` | Full history, chronological |
| POST | `/api/accounts/:accountId/payments` | Record/allocate a payment; `409` if `externalPaymentId` was already posted |
| POST | `/api/accounts/:accountId/fees` | Assess a fee (e.g. the $25 late fee) |
| POST | `/api/accounts/:accountId/payments/:paymentGroupId/reversal` | Reverse a payment; `409` if already reversed |

The demo account is seeded with id `11111111-1111-1111-1111-111111111111`,
`scheduled_payment_cents = 40000`, and starting balance $3,000.

## Assumptions

- Single demo account/currency, no authentication — every endpoint is open.
  The demo UI hardcodes the seeded account id.
- Interest is modeled as a manually-assessable ledger event using the same
  mechanism as the late fee (`entry_type = 'interest_assessment'` is defined
  in the schema and `getOutstanding()` already accounts for it), not an
  automated day-count accrual engine — the spec requires interest as a
  waterfall step, not a rate calculator, and no endpoint currently creates
  this entry type since no required demo event calls for one.
- Overpayment beyond total outstanding fees + interest + principal is applied
  entirely to principal rather than creating a separate credit/refund bucket.
- A payment can be reversed at most once (`reversal_postings` primary key
  enforces this). Reversing a standalone fee assessment isn't implemented —
  the spec only requires reversing the original payment.
- `externalPaymentId` is caller-supplied and scoped per account.
- The reversal API itself is generic — it takes an explicit `paymentGroupId`
  and reverses whichever payment that is. The demo UI's "Record $400 payment"
  button posts a fresh `externalPaymentId` on every click (so it's always
  repeatable), and its "Reverse"/"duplicate attempt" buttons target whichever
  $400 payment was most recently recorded and not yet reversed — reconstructed
  from the transaction history on every page load, not just tracked in memory.

## Out of scope

Not built, because the exercise doesn't call for it at this scale:

- Multi-tenant/school/student onboarding, RBAC, authentication.
- Real payment processing (Stripe ACH/card) — only recording payment events.
- Automated interest accrual/day-count scheduling.
- Event sourcing framework, message queue, or outbox pattern — a single
  Postgres transaction per financial event is sufficient consistency at this
  scale.
- Full double-entry chart-of-accounts bookkeeping — a single-account signed
  ledger with a `direction` column meets the append-only/reproducible-balance
  requirements without that added complexity.
- Reporting/analytics, settlement batching, pagination on history (fine for a
  small demo dataset).
