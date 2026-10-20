import {onRequest} from 'firebase-functions/v2/https';
import {defineSecret} from 'firebase-functions/params';
import {initializeApp} from 'firebase-admin/app';
import {getAuth} from 'firebase-admin/auth';
import {getFirestore} from 'firebase-admin/firestore';
import Stripe from 'stripe';
import {PACK_CREDITS, boardId, checkoutAmount, checkoutMetadata, emptyAccount, grantPurchase, pragueDayKey, settleCredits} from './ad-credits.js';
import {billboardCheckoutUrls} from './checkout-urls.js';

initializeApp();

const stripeSecret = defineSecret('STRIPE_SECRET');
const webhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const region = 'europe-west1';
const accounts = () => getFirestore().collection('billboardAccounts');

function publicOrigin() {
  return process.env.ADS_PUBLIC_ORIGIN || 'https://gtapraha.online';
}

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

function grantPaid(account, includesFee) {
  try {
    return grantPurchase(account, {includesFee});
  } catch (error) {
    if (includesFee && account.feePaid) return {...account, credits: (account.credits || 0) + PACK_CREDITS};
    throw error;
  }
}

async function applyPaidSession(session) {
  if (!session || session.payment_status !== 'paid') return {applied: false};
  const uid = session.metadata?.uid;
  if (!uid) throw new Error('Checkout is missing the account');
  const includesFee = session.metadata.includesFee === '1';
  const paymentRef = getFirestore().collection('billboardPayments').doc(session.id);
  const accountRef = accounts().doc(uid);
  let credits = 0;
  await getFirestore().runTransaction(async (tx) => {
    const seen = await tx.get(paymentRef);
    const snap = await tx.get(accountRef);
    const account = snap.exists ? {...emptyAccount(), ...snap.data()} : emptyAccount();
    if (seen.exists) {
      credits = account.credits;
      return;
    }
    const next = grantPaid(account, includesFee);
    const chosen = boardId(session.metadata?.boardId);
    if (chosen) next.selectedBoardId = chosen;
    tx.set(accountRef, next, {merge: true});
    tx.set(paymentRef, {uid});
    credits = next.credits;
  });
  return {applied: true, credits};
}

async function readSettled(uid) {
  const ref = accounts().doc(uid);
  const snap = await ref.get();
  const account = snap.exists ? {...emptyAccount(), ...snap.data()} : emptyAccount();
  const settled = settleCredits(account, pragueDayKey());
  if (!snap.exists || settled.credits !== account.credits || settled.spent !== account.spent || settled.paused !== account.paused || settled.lastSettledDay !== account.lastSettledDay) {
    await ref.set(settled, {merge: true});
  }
  return settled;
}

export const createBillboardCheckout = onRequest({region, cors: true, secrets: [stripeSecret]}, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({error: 'POST only'});
    return;
  }
  try {
    const uid = await uidFromRequest(req);
    const account = await readSettled(uid);
    const amount = checkoutAmount(req.body?.currency, {feePaid: account.feePaid});
    const chosen = boardId(req.body?.boardId) || boardId(account.selectedBoardId);
    if (chosen && account.selectedBoardId !== chosen) await accounts().doc(uid).set({selectedBoardId: chosen}, {merge: true});
    const stripe = new Stripe(stripeSecret.value());
    const origin = publicOrigin();
    const surface = req.body?.surface === 'game' ? 'game' : 'page';
    const embedded = req.body?.ui === 'embedded';
    const urls = billboardCheckoutUrls({origin, boardId: chosen, surface, embedded});
    const sessionBase = {
      mode: 'payment',
      client_reference_id: uid,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: amount.currency,
          unit_amount: amount.unitAmount,
          product_data: {name: amount.includesFee ? 'GTA Praha billboard fee and 40 credits' : 'GTA Praha 40 billboard credits'},
        },
      }],
      metadata: checkoutMetadata(uid, amount, chosen),
    };
    const session = await stripe.checkout.sessions.create(embedded ? {
      ...sessionBase,
      ui_mode: 'embedded',
      redirect_on_completion: 'never',
      return_url: urls.returnUrl,
    } : {
      ...sessionBase,
      success_url: urls.successUrl,
      cancel_url: urls.cancelUrl,
    });
    res.json(embedded ? {clientSecret: session.client_secret} : {url: session.url});
  } catch (error) {
    sendError(res, error);
  }
});

export const confirmBillboardCheckout = onRequest({region, cors: true, secrets: [stripeSecret]}, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({error: 'POST only'});
    return;
  }
  try {
    const uid = await uidFromRequest(req);
    const sessionId = String(req.body?.sessionId || '');
    if (!sessionId.startsWith('cs_')) throw new Error('Missing checkout session');
    const stripe = new Stripe(stripeSecret.value());
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.metadata?.uid !== uid) {
      const error = new Error('That checkout belongs to another account');
      error.status = 403;
      throw error;
    }
    await applyPaidSession(session);
    const account = await readSettled(uid);
    res.json(account);
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

export const stripeBillboardWebhook = onRequest({region, secrets: [stripeSecret, webhookSecret]}, async (req, res) => {
  const stripe = new Stripe(stripeSecret.value());
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, req.get('stripe-signature'), webhookSecret.value());
  } catch (error) {
    res.status(400).json({error: error.message});
    return;
  }
  if (event.type === 'checkout.session.completed') {
    try {
      await applyPaidSession(event.data.object);
    } catch (error) {
      res.status(500).json({error: error.message});
      return;
    }
  }
  res.json({received: true});
});

export const listBillboardCreatives = onRequest({region, cors: true}, async (req, res) => {
  try {
    const today = pragueDayKey();
    const snap = await accounts().limit(200).get();
    const creatives = [];
    for (const doc of snap.docs) {
      const account = {...emptyAccount(), ...doc.data()};
      const settled = settleCredits(account, today);
      if (settled.credits !== account.credits || settled.spent !== account.spent || settled.paused !== account.paused || settled.lastSettledDay !== account.lastSettledDay) {
        await doc.ref.set(settled, {merge: true});
      }
      if (settled.imageUrl && settled.credits > 0) creatives.push({uid: doc.id, imageUrl: settled.imageUrl, credits: settled.credits, selectedBoardId: boardId(settled.selectedBoardId)});
    }
    res.json({day: today, creatives});
  } catch (error) {
    sendError(res, error);
  }
});
