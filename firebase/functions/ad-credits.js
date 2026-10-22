// One pack is 40 board-days. Payment is a single 50 € Revolut request.
export const PACK_CREDITS = 40;
export const BILLBOARD_PRICE_EUR = 50;
export const REVOLUT_PAYMENT_ID = '7a5ccc40-cc12-4892-9280-de78ea04baf6';
export const REVOLUT_CHECKOUT_URL = `https://checkout.revolut.com/pay/${REVOLUT_PAYMENT_ID}`;
export const REVOLUT_QR_PATH = '/ads/revolut-50-eur-qr.png';
export const PLACEHOLDER_CS = 'Zde může být vaše reklama';
export const PLACEHOLDER_EN = 'Your ad can be here';

export function checkoutAmount({feePaid = false} = {}) {
  return {
    currency: 'eur',
    unitAmount: BILLBOARD_PRICE_EUR * 100,
    credits: PACK_CREDITS,
    includesFee: !feePaid,
    url: REVOLUT_CHECKOUT_URL,
  };
}

export function emptyAccount() {
  return {credits: 0, spent: 0, feePaid: false, imageUrl: '', paused: true, lastSettledDay: '', selectedBoardId: ''};
}

// Site ids such as praha-1-stare-mesto-01. Empty means the account has not chosen a board.
export function boardId(value) {
  const id = typeof value === 'string' ? value : '';
  if (!id || id.length >= 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return '';
  return id;
}

export function checkoutMetadata(uid, amount, selectedBoardId) {
  return {
    uid,
    includesFee: amount.includesFee ? '1' : '0',
    credits: String(amount.credits),
    boardId: boardId(selectedBoardId),
  };
}

// The first paid checkout includes the listing fee. A later one is credits only.
export function grantPurchase(account, {includesFee}) {
  const current = {...emptyAccount(), ...account, credits: Math.max(0, Math.trunc(account?.credits) || 0)};
  if (includesFee) {
    if (current.feePaid) throw new Error('The listing fee is already paid');
    return {...current, feePaid: true, credits: current.credits + PACK_CREDITS};
  }
  if (!current.feePaid) throw new Error('The listing fee is required before credits');
  return {...current, credits: current.credits + PACK_CREDITS};
}

export function pragueDayKey(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function daysAfter(fromKey, toKey) {
  if (!fromKey || !toKey) return 0;
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86400000));
}

// One credit is one Prague day with an image on a board. Days with no image,
// and days after the balance hits zero, are not charged in a lump later.
export function settleCredits(account, todayKey) {
  const current = {
    ...emptyAccount(),
    ...account,
    credits: Math.max(0, Math.trunc(account?.credits) || 0),
    spent: Math.max(0, Math.trunc(account?.spent) || 0),
  };
  if (!current.imageUrl || current.credits === 0) {
    return {...current, paused: true};
  }
  if (current.paused || !current.lastSettledDay) {
    if (current.lastSettledDay === todayKey) return {...current, paused: false};
    return {
      ...current,
      credits: current.credits - 1,
      spent: current.spent + 1,
      paused: current.credits - 1 === 0,
      lastSettledDay: todayKey,
    };
  }
  const due = daysAfter(current.lastSettledDay, todayKey);
  const spend = Math.min(current.credits, Math.max(0, due));
  return {
    ...current,
    credits: current.credits - spend,
    spent: current.spent + spend,
    paused: current.credits - spend === 0,
    lastSettledDay: todayKey,
  };
}

function earlierAccount(a, b) {
  const left = String(a?.uid || '');
  const right = String(b?.uid || '');
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

// A live creative owns the board it selected. Unbought boards stay empty.
// Two live buyers of the same board keep the earlier account id for the day.
export function assignBoards(boardIds, creatives) {
  const live = (creatives || []).filter((item) => item?.imageUrl && item.credits > 0 && boardId(item.selectedBoardId));
  const assigned = new Map();
  for (const id of boardIds) {
    const claimants = live.filter((item) => item.selectedBoardId === id).sort(earlierAccount);
    if (claimants[0]) assigned.set(id, claimants[0]);
  }
  return assigned;
}

export function facesForDay(sites, creatives, dayKey) {
  // The Prague day settles credits. A bought board does not move to another site that day.
  void dayKey;
  const assigned = assignBoards(sites.map((site) => site.id), creatives);
  return sites.map((site) => {
    const creative = assigned.get(site.id);
    return {id: site.id, imageUrl: creative?.imageUrl || null};
  });
}

export function paintPlaceholder(ctx, width, height) {
  ctx.fillStyle = '#14181c';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#f4efe6';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(height * 0.12)}px Arial, sans-serif`;
  ctx.fillText(PLACEHOLDER_CS, width / 2, height * 0.42);
  ctx.font = `500 ${Math.round(height * 0.08)}px Arial, sans-serif`;
  ctx.fillText(PLACEHOLDER_EN, width / 2, height * 0.62);
}
