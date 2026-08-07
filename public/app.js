// Hardcoded to the seeded demo account -- see README assumptions.
const ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

const balanceEl = document.getElementById('balance');
const bannerEl = document.getElementById('banner');
const historyBodyEl = document.getElementById('history-body');
const dupBtn = document.getElementById('btn-pay-dup');
const reverseBtn = document.getElementById('btn-reverse');

// Recomputed from the ledger on every refresh() (see updateActionButtons), not
// just tracked in memory, so a page reload doesn't lose it.
let lastPaymentExternalId = null;
let lastPaymentGroupId = null;

function showBanner(message, isError) {
  bannerEl.textContent = message;
  bannerEl.className = isError ? 'error' : 'ok';
}

// Scoped to $400 payments only (externalPaymentId prefix "demo-payment-") so
// the $200 partial payment ("demo-partial-"), which posts through the same
// endpoint, never becomes the reverse/duplicate buttons' target.
function updateActionButtons(entries) {
  const reversedGroupIds = new Set(
    entries.filter((e) => e.reversesPaymentGroupId).map((e) => e.reversesPaymentGroupId)
  );
  const originalPaymentEntries = entries.filter(
    (e) => e.externalPaymentId && e.externalPaymentId.startsWith('demo-payment-')
  );

  const latestPayment = originalPaymentEntries[originalPaymentEntries.length - 1] ?? null;
  lastPaymentExternalId = latestPayment ? latestPayment.externalPaymentId : null;
  dupBtn.disabled = !lastPaymentExternalId;

  const latestUnreversedPayment =
    [...originalPaymentEntries].reverse().find((e) => !reversedGroupIds.has(e.paymentGroupId)) ??
    null;
  lastPaymentGroupId = latestUnreversedPayment ? latestUnreversedPayment.paymentGroupId : null;
  reverseBtn.disabled = !lastPaymentGroupId;
}

async function refresh() {
  const [balanceRes, historyRes] = await Promise.all([
    fetch(`/api/accounts/${ACCOUNT_ID}/balance`),
    fetch(`/api/accounts/${ACCOUNT_ID}/transactions`),
  ]);
  const balance = await balanceRes.json();
  const history = await historyRes.json();

  balanceEl.textContent = balance.balanceDisplay;
  updateActionButtons(history.entries);

  historyBodyEl.innerHTML = '';
  for (const entry of history.entries) {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${new Date(entry.createdAt).toLocaleString()}</td>
      <td>${entry.entryType}</td>
      <td class="${entry.direction}">${entry.direction}</td>
      <td>${entry.amountDisplay}</td>
      <td>${entry.description}</td>
      <td>${entry.paymentGroupId.slice(0, 8)}</td>
      <td>${entry.reversesPaymentGroupId ? entry.reversesPaymentGroupId.slice(0, 8) : ''}</td>
    `;
    historyBodyEl.appendChild(row);
  }
}

async function postJson(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

document.getElementById('btn-pay').addEventListener('click', async () => {
  const externalPaymentId = `demo-payment-${Date.now()}`;
  const { ok, data } = await postJson(`/api/accounts/${ACCOUNT_ID}/payments`, {
    externalPaymentId,
    amountCents: 40000,
  });
  showBanner(
    ok ? `Posted $400 payment (paymentGroupId ${data.paymentGroupId}).` : `Error: ${data.message}`,
    !ok
  );
  await refresh();
});

dupBtn.addEventListener('click', async () => {
  if (!lastPaymentExternalId) {
    showBanner('Record a $400 payment first, then try the duplicate attempt.', true);
    return;
  }
  const { status, data } = await postJson(`/api/accounts/${ACCOUNT_ID}/payments`, {
    externalPaymentId: lastPaymentExternalId,
    amountCents: 40000,
  });
  if (status === 409) {
    showBanner(
      `Blocked: duplicate externalPaymentId "${lastPaymentExternalId}" -- no new ledger entry was created.`,
      true
    );
  } else {
    // Should not happen (the id was just used), but handle defensively.
    showBanner(`Unexpected: ${data.message ?? 'payment was not blocked'}`, true);
  }
  await refresh();
});

document.getElementById('btn-fee').addEventListener('click', async () => {
  const { ok, data } = await postJson(`/api/accounts/${ACCOUNT_ID}/fees`, {
    amountCents: 2500,
  });
  showBanner(ok ? 'Assessed $25 late fee.' : `Error: ${data.message}`, !ok);
  await refresh();
});

document.getElementById('btn-partial').addEventListener('click', async () => {
  const externalPaymentId = `demo-partial-${Date.now()}`;
  const { ok, data } = await postJson(`/api/accounts/${ACCOUNT_ID}/payments`, {
    externalPaymentId,
    amountCents: 20000,
  });
  showBanner(ok ? 'Posted $200 partial payment.' : `Error: ${data.message}`, !ok);
  await refresh();
});

reverseBtn.addEventListener('click', async () => {
  if (!lastPaymentGroupId) return;
  const { ok, status, data } = await postJson(
    `/api/accounts/${ACCOUNT_ID}/payments/${lastPaymentGroupId}/reversal`
  );
  if (ok) {
    showBanner('Reversed the $400 payment (original record left untouched).', false);
  } else if (status === 409) {
    showBanner('This payment was already reversed.', true);
  } else {
    showBanner(`Error: ${data.message}`, true);
  }
  await refresh();
});

refresh();
