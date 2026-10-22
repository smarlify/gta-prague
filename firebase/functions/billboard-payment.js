import {PACK_CREDITS, REVOLUT_CHECKOUT_URL, REVOLUT_PAYMENT_ID, boardId, checkoutMetadata, emptyAccount, grantPurchase} from './ad-credits.js';

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

// alreadyRecorded is a payment document already marked paid.
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

// Revolut's payment request does not call this server. The signed-in advertiser
// opens the 50 € link, then confirms that claim so one pack is applied.
export function createRevolutCheckout({uid, amount, boardId: chosen, claimId}) {
  if (!uid) throw new Error('Sign in required');
  const id = String(claimId || '');
  if (!id) throw new Error('Missing Revolut payment');
  return {
    claimId: id,
    url: amount?.url || REVOLUT_CHECKOUT_URL,
    paymentId: REVOLUT_PAYMENT_ID,
    provider: 'revolut',
    payment_status: 'unpaid',
    metadata: checkoutMetadata(uid, amount, chosen),
  };
}

export function claimAsPaidSession(claim, {uid}) {
  if (!claim?.claimId) throw new Error('Missing Revolut payment');
  if (claim.paymentId !== REVOLUT_PAYMENT_ID) throw new Error('Unknown Revolut payment');
  if (claim.metadata?.uid !== uid) {
    const error = new Error('That payment belongs to another account');
    error.status = 403;
    throw error;
  }
  return {
    id: claim.claimId,
    payment_status: 'paid',
    metadata: claim.metadata,
  };
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
