// One pack is 40 board-days. The currency only changes what Checkout charges.
export const PACK_CREDITS = 40;
export const PLACEHOLDER_CS = 'Zde může být vaše reklama';
export const PLACEHOLDER_EN = 'Your ad can be here';

// Major units. JPY has no minor unit; the others are charged in hundredths.
export const CREDIT_PACKS = Object.freeze([
  Object.freeze({id: 'czk', fee: 250, pack: 1000, zeroDecimal: false}),
  Object.freeze({id: 'eur', fee: 10, pack: 40, zeroDecimal: false}),
  Object.freeze({id: 'usd', fee: 10, pack: 40, zeroDecimal: false}),
  Object.freeze({id: 'gbp', fee: 8, pack: 32, zeroDecimal: false}),
  Object.freeze({id: 'chf', fee: 9, pack: 36, zeroDecimal: false}),
  Object.freeze({id: 'pln', fee: 40, pack: 160, zeroDecimal: false}),
  Object.freeze({id: 'jpy', fee: 1500, pack: 6000, zeroDecimal: true}),
]);

export function creditPack(currencyId) {
  const pack = CREDIT_PACKS.find((item) => item.id === String(currencyId || '').toLowerCase());
  if (!pack) throw new Error(`Unknown currency "${currencyId}"`);
  return pack;
}

export function checkoutAmount(currencyId, {feePaid = false} = {}) {
  const pack = creditPack(currencyId);
  const major = feePaid ? pack.pack : pack.fee + pack.pack;
  const unitAmount = pack.zeroDecimal ? major : Math.round(major * 100);
  return {currency: pack.id, unitAmount, credits: PACK_CREDITS, includesFee: !feePaid};
}

export function emptyAccount() {
  return {credits: 0, spent: 0, feePaid: false, imageUrl: '', paused: true, lastSettledDay: ''};
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

function hashString(text) {
  let hash = 2166136261;
  const value = String(text);
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let next = Math.imul(state ^ (state >>> 15), 1 | state);
    next = (next + Math.imul(next ^ (next >>> 7), 61 | next)) ^ next;
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededOrder(items, seedText) {
  const rand = mulberry32(hashString(seedText));
  return items
    .map((item, index) => ({item, index, n: rand()}))
    .sort((a, b) => a.n - b.n || a.index - b.index)
    .map((row) => row.item);
}

// One live image per board. Extra boards stay on the placeholder.
export function assignBoards(boardIds, creatives, dayKey) {
  const live = (creatives || []).filter((item) => item?.imageUrl && item.credits > 0);
  const boards = seededOrder(boardIds, `boards:${dayKey}`);
  const ads = seededOrder(live, `ads:${dayKey}`);
  const assigned = new Map();
  const count = Math.min(boards.length, ads.length);
  for (let i = 0; i < count; i++) assigned.set(boards[i], ads[i]);
  return assigned;
}

export function facesForDay(sites, creatives, dayKey) {
  const assigned = assignBoards(sites.map((site) => site.id), creatives, dayKey);
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
