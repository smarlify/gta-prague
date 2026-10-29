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
  return {credits: 0, spent: 0, feePaid: false, imageUrl: '', linkUrl: '', paused: true, lastSettledDay: '', selectedBoardId: ''};
}

// An advertiser link is an http(s) address. Anything else is dropped.
export function httpUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw || raw.length > 2000) return '';
  let url;
  try {
    url = new URL(raw);
  } catch {
    return '';
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
  if (!url.hostname || url.username || url.password || url.href.length > 2000) return '';
  return url.href;
}

// Site ids such as praha-1-stare-mesto-01. Empty means the account has not chosen a board.
export function boardId(value) {
  const id = typeof value === 'string' ? value : '';
  if (!id || id.length >= 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return '';
  return id;
}

// Paid boards live on the account. A legacy purchase may only have selectedBoardId.
// Reading always keeps that id, even when boardIds was stored without it.
export function ownedBoardIds(account) {
  const ids = [];
  const push = (value) => {
    const id = boardId(value);
    if (id && !ids.includes(id)) ids.push(id);
  };
  if (Array.isArray(account?.boardIds)) {
    for (const value of account.boardIds) push(value);
  }
  push(account?.selectedBoardId);
  return ids;
}

export function withOwnedBoards(account) {
  const boardIds = ownedBoardIds(account);
  // The legacy single id stays on the first board, so a later purchase cannot move the poster off it.
  return {
    ...account,
    boardIds,
    selectedBoardId: boardIds[0] || '',
  };
}

// A second purchase appends a board. The credit balance stays on this same account.
export function addOwnedBoard(account, id) {
  const chosen = boardId(id);
  const boardIds = ownedBoardIds(account);
  if (chosen && !boardIds.includes(chosen)) boardIds.push(chosen);
  return withOwnedBoards({...account, boardIds});
}

function storedBoardIds(account) {
  if (!Array.isArray(account?.boardIds)) return [];
  const ids = [];
  for (const value of account.boardIds) {
    const id = boardId(value);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

// A stored board list is a completed purchase. A lone selectedBoardId counts only after payment.
function hasPaidBoards(account) {
  if (storedBoardIds(account).length) return true;
  return !!(boardId(account?.selectedBoardId) && (account?.feePaid || creditCount(account?.credits) > 0));
}

// The first checkout may record a board before any are paid. A later one must not replace paid boards.
export function selectBoardForCheckout(account, chosen) {
  const id = boardId(chosen);
  const current = {...emptyAccount(), ...account};
  if (!id || hasPaidBoards(current)) return current;
  if (boardId(current.selectedBoardId) === id) return current;
  return {...current, selectedBoardId: id};
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
  const paid = hasPaidBoards(account);
  const owned = paid ? ownedBoardIds(account) : storedBoardIds(account);
  const current = {
    ...emptyAccount(),
    ...account,
    credits: Math.max(0, Math.trunc(account?.credits) || 0),
    spent: Math.max(0, Math.trunc(account?.spent) || 0),
    ...(paid ? {boardIds: owned} : {}),
    selectedBoardId: boardId(account?.selectedBoardId) || owned[0] || '',
  };
  // A zero balance pauses new link opens. The saved image stays on the boards they own.
  if (!current.imageUrl || current.credits === 0) {
    return withOwnedBoards({...current, paused: true});
  }
  if (current.paused || !current.lastSettledDay) {
    if (current.lastSettledDay === todayKey) return withOwnedBoards({...current, paused: false});
    return withOwnedBoards({
      ...current,
      credits: current.credits - 1,
      spent: current.spent + 1,
      paused: current.credits - 1 === 0,
      lastSettledDay: todayKey,
    });
  }
  const due = daysAfter(current.lastSettledDay, todayKey);
  const spend = Math.min(current.credits, Math.max(0, due));
  return withOwnedBoards({
    ...current,
    credits: current.credits - spend,
    spent: current.spent + spend,
    paused: current.credits - spend === 0,
    lastSettledDay: todayKey,
  });
}

function earlierAccount(a, b) {
  const left = String(a?.uid || '');
  const right = String(b?.uid || '');
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function displayOrder(a, b) {
  const aFunded = a?.credits > 0 ? 0 : 1;
  const bFunded = b?.credits > 0 ? 0 : 1;
  if (aFunded !== bFunded) return aFunded - bFunded;
  return earlierAccount(a, b);
}

// A creative with an image owns every board on its account, even at zero credits.
// Two buyers of the same board prefer whoever still has credits, then the earlier account id.
export function assignBoards(boardIds, creatives) {
  const live = (creatives || []).filter((item) => item?.imageUrl && ownedBoardIds(item).length);
  const assigned = new Map();
  for (const id of boardIds) {
    const claimants = live.filter((item) => ownedBoardIds(item).includes(id)).sort(displayOrder);
    if (claimants[0]) assigned.set(id, claimants[0]);
  }
  return assigned;
}

function creditCount(value) {
  return Math.max(0, Math.trunc(Number(value) || 0));
}

// One successful open of a board URL. The account balance is shared by every board that person owns.
// A zero balance does not open and does not go negative. This does not also settle a Prague day.
export function chargeLinkOpen(account) {
  const credits = creditCount(account?.credits);
  const spent = creditCount(account?.spent);
  const current = {...emptyAccount(), ...account, credits, spent};
  if (credits < 1) return {ok: false, account: withOwnedBoards(current)};
  const nextCredits = credits - 1;
  return {
    ok: true,
    account: withOwnedBoards({
      ...current,
      credits: nextCredits,
      spent: spent + 1,
      paused: nextCredits === 0 ? true : current.paused,
    }),
  };
}

// Charges the person whose ad is on that board. Another buyer's balance is left as it was.
export function applyBillboardOpen(accounts, siteId) {
  const list = (accounts || []).map((account) => ({...account}));
  const id = boardId(siteId);
  const assigned = assignBoards(id ? [id] : [], list);
  const creative = id ? assigned.get(id) : undefined;
  const url = httpUrl(creative?.linkUrl);
  if (!creative?.uid || !url || !(creative.credits > 0)) return {ok: false, url: '', accounts: list};
  const index = list.findIndex((account) => account.uid === creative.uid);
  if (index < 0) return {ok: false, url: '', accounts: list};
  const charge = chargeLinkOpen(list[index]);
  if (!charge.ok) return {ok: false, url: '', accounts: list};
  const next = list.slice();
  next[index] = charge.account;
  return {ok: true, url, uid: creative.uid, accounts: next};
}

export function facesForDay(sites, creatives, dayKey) {
  // The Prague day settles credits. A bought board does not move to another site that day.
  void dayKey;
  const assigned = assignBoards(sites.map((site) => site.id), creatives);
  return sites.map((site) => {
    const creative = assigned.get(site.id);
    return {id: site.id, imageUrl: creative?.imageUrl || null, linkUrl: creative ? httpUrl(creative.linkUrl) : ''};
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
