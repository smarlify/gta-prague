import {onRequest} from 'firebase-functions/v2/https';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import {randomUUID} from 'node:crypto';
import {applyBillboardOpen, boardId, chargeLinkOpen, checkoutAmount, emptyAccount, httpUrl, ownedBoardIds, pragueDayKey, selectBoardForCheckout, settleCredits} from './ad-credits.js';
import {claimAsPaidSession, createRevolutCheckout, paidSessionAccount, settlePaidSession} from './billboard-payment.js';

// Gen2 runs as the Compute Engine service account, which needs roles/datastore.user.
initializeApp();

const region = 'europe-west1';
const accounts = () => getFirestore().collection('billboardAccounts');
const payments = () => getFirestore().collection('billboardPayments');

async function uidFromRequest(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) {
    const error = new Error('Sign in required');
    error.status = 401;
    throw error;
  }
  const decoded = await getAuth().verifyIdToken(token);
  return decoded.uid;
}

function sendError(res, error) {
  const status = error.status || 400;
  res.status(status).json({error: error.message || 'Payment failed'});
}

async function applyPaidSession(session) {
  const uid = paidSessionAccount(session);
  if (!uid) return {applied: false};
  const paymentRef = payments().doc(session.id);
  const accountRef = accounts().doc(uid);
  let credits = 0;
  await getFirestore().runTransaction(async (tx) => {
    const seen = await tx.get(paymentRef);
    const snap = await tx.get(accountRef);
    const account = snap.exists ? {...emptyAccount(), ...snap.data()} : emptyAccount();
    const recorded = seen.exists && seen.data()?.status === 'paid';
    const result = settlePaidSession(account, session, {alreadyRecorded: recorded});
    if (!result.record) {
      credits = result.credits;
      return;
    }
    tx.set(accountRef, result.account, {merge: true});
    tx.set(paymentRef, {uid, status: 'paid', provider: 'revolut'}, {merge: true});
    credits = result.credits;
  });
  return {applied: true, credits};
}

async function settleAccount(ref) {
  const today = pragueDayKey();
  let settled = emptyAccount();
  await getFirestore().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const account = snap.exists ? {...emptyAccount(), ...snap.data()} : emptyAccount();
    settled = settleCredits(account, today);
    const previousIds = Array.isArray(account.boardIds) ? account.boardIds : [];
    const nextIds = Array.isArray(settled.boardIds) ? settled.boardIds : [];
    const boardsChanged = previousIds.length !== nextIds.length
      || previousIds.some((id, index) => id !== nextIds[index]);
    const changed = !snap.exists
      || settled.credits !== account.credits
      || settled.spent !== account.spent
      || settled.paused !== account.paused
      || settled.lastSettledDay !== account.lastSettledDay
      || boardsChanged
      || boardId(settled.selectedBoardId) !== boardId(account.selectedBoardId);
    if (changed) tx.set(ref, settled, {merge: true});
  });
  return settled;
}

async function readSettled(uid) {
  return settleAccount(accounts().doc(uid));
}

export const createBillboardCheckout = onRequest({region, cors: true}, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({error: 'POST only'});
    return;
  }
  try {
    const uid = await uidFromRequest(req);
    const account = await readSettled(uid);
    const amount = checkoutAmount({feePaid: account.feePaid});
    const chosen = boardId(req.body?.boardId) || boardId(account.selectedBoardId);
    const selected = selectBoardForCheckout(account, req.body?.boardId || account.selectedBoardId);
    if (boardId(selected.selectedBoardId) && boardId(selected.selectedBoardId) !== boardId(account.selectedBoardId)) {
      await accounts().doc(uid).set({selectedBoardId: selected.selectedBoardId}, {merge: true});
    }
    const claim = createRevolutCheckout({uid, amount, boardId: chosen, claimId: randomUUID()});
    await payments().doc(claim.claimId).set({
      uid,
      paymentId: claim.paymentId,
      status: 'pending',
      provider: 'revolut',
      metadata: claim.metadata,
    });
    res.json({url: claim.url, claimId: claim.claimId, paymentId: claim.paymentId});
  } catch (error) {
    sendError(res, error);
  }
});

export const confirmBillboardCheckout = onRequest({region, cors: true}, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({error: 'POST only'});
    return;
  }
  try {
    const uid = await uidFromRequest(req);
    const claimId = String(req.body?.claimId || '');
    if (!claimId) {
      const error = new Error('Missing Revolut payment');
      error.status = 400;
      throw error;
    }
    const snap = await payments().doc(claimId).get();
    if (!snap.exists) {
      const error = new Error('Missing Revolut payment');
      error.status = 400;
      throw error;
    }
    const data = snap.data() || {};
    const session = claimAsPaidSession({
      claimId,
      paymentId: data.paymentId,
      metadata: data.metadata,
    }, {uid});
    await applyPaidSession(session);
    res.json(await readSettled(uid));
  } catch (error) {
    sendError(res, error);
  }
});

export const settleBillboardAccount = onRequest({region, cors: true}, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({error: 'POST only'});
    return;
  }
  try {
    const uid = await uidFromRequest(req);
    res.json(await readSettled(uid));
  } catch (error) {
    sendError(res, error);
  }
});

export const listBillboardCreatives = onRequest({region, cors: true}, async (req, res) => {
  try {
    const today = pragueDayKey();
    const snap = await accounts().limit(200).get();
    const creatives = [];
    for (const doc of snap.docs) {
      const settled = await settleAccount(doc.ref);
      if (settled.imageUrl && ownedBoardIds(settled).length) {
        const ids = ownedBoardIds(settled);
        creatives.push({
          uid: doc.id,
          imageUrl: settled.imageUrl,
          credits: settled.credits,
          selectedBoardId: boardId(settled.selectedBoardId) || ids[0] || '',
          boardIds: ids,
          linkUrl: httpUrl(settled.linkUrl),
        });
      }
    }
    res.json({day: today, creatives});
  } catch (error) {
    sendError(res, error);
  }
});

// A player at a board opens that board's public link. One open costs the owner's shared pool one credit.
export const openBillboardVisit = onRequest({region, cors: true, invoker: 'public'}, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({error: 'POST only'});
    return;
  }
  try {
    const id = boardId(req.body?.boardId);
    if (!id) {
      const error = new Error('Missing billboard');
      error.status = 400;
      throw error;
    }
    const snap = await accounts().limit(200).get();
    const loaded = snap.docs.map((doc) => ({uid: doc.id, ...emptyAccount(), ...doc.data()}));
    const preview = applyBillboardOpen(loaded, id);
    if (!preview.ok || !preview.uid) {
      res.status(409).json({error: 'This billboard link is not open'});
      return;
    }
    const ref = accounts().doc(preview.uid);
    let url = '';
    await getFirestore().runTransaction(async (tx) => {
      url = '';
      const fresh = await tx.get(ref);
      const account = {uid: preview.uid, ...emptyAccount(), ...(fresh.exists ? fresh.data() : {})};
      const owns = ownedBoardIds(account).includes(id);
      const link = httpUrl(account.linkUrl);
      const charge = chargeLinkOpen(account);
      if (!owns || !link || !account.imageUrl || !charge.ok) return;
      tx.set(ref, {credits: charge.account.credits, spent: charge.account.spent, paused: charge.account.paused}, {merge: true});
      url = link;
    });
    if (!url) {
      res.status(409).json({error: 'This billboard link is not open'});
      return;
    }
    res.json({url});
  } catch (error) {
    sendError(res, error);
  }
});
