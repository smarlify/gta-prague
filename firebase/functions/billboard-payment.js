import {PACK_CREDITS, boardId, checkoutMetadata, emptyAccount, grantPurchase} from './ad-credits.js';

// The first checkout that still says the fee is due records it. A repeat of that
// metadata after the fee is already recorded still adds the credit pack.
export function grantPaid(account, includesFee) {
  try {
    return grantPurchase(account, {includesFee});
  } catch (error) {
    if (includesFee && account.feePaid) return {...account, credits: (account.credits || 0) + PACK_CREDITS};
    throw error;
  }
}

// Null means the session is not a paid checkout. A paid session with no account throws.
export function paidSessionAccount(session) {
  if (!session || session.payment_status !== 'paid') return null;
  const uid = session.metadata?.uid;
  if (!uid) throw new Error('Checkout is missing the account');
  return uid;
}

// alreadyRecorded is the payment document. Confirm and the webhook share this decision.
export function settlePaidSession(account, session, {alreadyRecorded = false} = {}) {
  const uid = paidSessionAccount(session);
  if (!uid) return {applied: false, account};
  const current = {...emptyAccount(), ...account};
  if (alreadyRecorded) return {applied: true, account: current, credits: current.credits, record: false, uid};
  const includesFee = session.metadata.includesFee === '1';
  const next = grantPaid(current, includesFee);
  const chosen = boardId(session.metadata?.boardId);
  if (chosen) next.selectedBoardId = chosen;
  return {applied: true, account: next, credits: next.credits, record: true, uid};
}

export function checkoutSessionBody({uid, amount, boardId: chosen, urls, embedded}) {
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
  if (embedded) {
    return {
      ...sessionBase,
      ui_mode: 'embedded',
      redirect_on_completion: 'never',
      return_url: urls.returnUrl,
    };
  }
  return {
    ...sessionBase,
    success_url: urls.successUrl,
    cancel_url: urls.cancelUrl,
  };
}

export async function createCheckoutSession(stripe, args) {
  const session = await stripe.checkout.sessions.create(checkoutSessionBody(args));
  return args.embedded ? {clientSecret: session.client_secret} : {url: session.url};
}

export async function retrieveOwnedSession(stripe, {uid, sessionId}) {
  if (!String(sessionId || '').startsWith('cs_')) throw new Error('Missing checkout session');
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.metadata?.uid !== uid) {
    const error = new Error('That checkout belongs to another account');
    error.status = 403;
    throw error;
  }
  return session;
}

export function acceptWebhook(stripe, rawBody, signature, secret) {
  try {
    return {ok: true, event: stripe.webhooks.constructEvent(rawBody, signature, secret)};
  } catch (error) {
    return {ok: false, status: 400, error: error.message};
  }
}

// In-memory stand-in for the billboardPayments / billboardAccounts transaction.
export function createSettlement() {
  const accounts = new Map();
  const payments = new Set();
  return {
    account(uid) {
      return accounts.get(uid) || emptyAccount();
    },
    apply(session) {
      const uid = session?.metadata?.uid;
      const current = uid && accounts.has(uid) ? accounts.get(uid) : emptyAccount();
      const result = settlePaidSession(current, session, {alreadyRecorded: Boolean(session?.id && payments.has(session.id))});
      if (result.record && result.uid) {
        accounts.set(result.uid, result.account);
        payments.add(session.id);
      }
      return result;
    },
  };
}

export async function confirmPaidCheckout(settlement, stripe, {uid, sessionId}) {
  const session = await retrieveOwnedSession(stripe, {uid, sessionId});
  return settlement.apply(session);
}

export async function settleWebhook(settlement, stripe, {rawBody, signature, secret}) {
  const accepted = acceptWebhook(stripe, rawBody, signature, secret);
  if (!accepted.ok) return {status: accepted.status, body: {error: accepted.error}};
  if (accepted.event.type === 'checkout.session.completed') {
    try {
      await settlement.apply(accepted.event.data.object);
    } catch (error) {
      return {status: 500, body: {error: error.message}};
    }
  }
  return {status: 200, body: {received: true}};
}
