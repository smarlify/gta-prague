export const CHECKOUT_MESSAGE_SOURCE = 'gta-praha-billboard-checkout';

export function stripePublishableKey(env = import.meta.env || {}) {
  const key = String(env.VITE_STRIPE_PUBLISHABLE_KEY || '');
  return key.startsWith('pk_') ? key : '';
}

// Embedded Checkout client secrets look like cs_test_..._secret_...
export function sessionIdFromClientSecret(clientSecret) {
  const value = String(clientSecret || '');
  const cut = value.indexOf('_secret_');
  if (cut < 0) return '';
  const id = value.slice(0, cut);
  return id.startsWith('cs_') ? id : '';
}

export function readCheckoutReturn(href) {
  if (!href || href === 'about:blank') return null;
  let url;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const checkout = url.searchParams.get('checkout') || '';
  const sessionId = url.searchParams.get('session_id') || '';
  if (checkout === 'success' && sessionId.startsWith('cs_')) return {checkout, sessionId};
  if (checkout === 'cancel') return {checkout, sessionId: ''};
  return null;
}

// Pull a Checkout return off the game URL and leave the rest of the query alone.
export function takeCheckoutQuery(search) {
  const raw = String(search || '');
  const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
  const checkout = params.get('checkout') || '';
  if (checkout !== 'success' && checkout !== 'cancel') return null;
  const sessionId = params.get('session_id') || '';
  if (checkout === 'success' && !sessionId.startsWith('cs_')) return null;
  const board = params.get('board') || '';
  params.delete('checkout');
  params.delete('session_id');
  params.delete('board');
  const next = params.toString();
  return {checkout, sessionId, board, search: next ? `?${next}` : ''};
}
