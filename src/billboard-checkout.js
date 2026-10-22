import {loadStripe} from '@stripe/stripe-js';
import {CHECKOUT_MESSAGE_SOURCE, readCheckoutReturn} from './billboard-return.js';

const stripeClients = new Map();

function stripeClient(publishableKey) {
  let pending = stripeClients.get(publishableKey);
  if (!pending) {
    pending = loadStripe(publishableKey);
    stripeClients.set(publishableKey, pending);
  }
  return pending;
}

export async function mountEmbeddedCheckout({publishableKey, clientSecret, element, onComplete}) {
  const stripe = await stripeClient(publishableKey);
  if (!stripe) throw new Error('Card payment is not configured');
  const checkout = await stripe.initEmbeddedCheckout({clientSecret, onComplete});
  element.replaceChildren();
  checkout.mount(element);
  return checkout;
}

// Hosted Checkout in another window. The game tab stays on the city.
export function openBillboardPaymentWindow(url, {onResult, win = window} = {}) {
  const popup = win.open(url, 'gta-praha-billboard-checkout', 'popup,width=480,height=780');
  if (!popup) throw new Error('Allow a payment window to check out');
  let settled = false;
  let timer = 0;
  const stop = () => {
    if (settled) return;
    settled = true;
    win.removeEventListener('message', onMessage);
    clearInterval(timer);
    try {
      if (!popup.closed) popup.close();
    } catch {
      // The payment window may already be gone.
    }
  };
  const finish = (result) => {
    if (settled) return;
    stop();
    onResult(result);
  };
  const onMessage = (event) => {
    if (event.origin !== win.location.origin) return;
    const data = event.data;
    if (!data || data.source !== CHECKOUT_MESSAGE_SOURCE) return;
    const parsed = readCheckoutReturn(`https://return.invalid/?checkout=${encodeURIComponent(data.checkout || '')}&session_id=${encodeURIComponent(data.sessionId || '')}`);
    if (parsed) finish(parsed);
    else if (data.checkout === 'cancel') finish({checkout: 'cancel', sessionId: ''});
  };
  win.addEventListener('message', onMessage);
  timer = win.setInterval(() => {
    if (popup.closed) {
      finish({checkout: 'closed', sessionId: ''});
      return;
    }
    let href = '';
    try {
      href = popup.location.href;
    } catch {
      return;
    }
    const parsed = readCheckoutReturn(href);
    if (parsed) finish(parsed);
  }, 400);
  return stop;
}
