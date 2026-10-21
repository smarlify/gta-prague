import './billboard-buy.css';
import {mountBillboardAds} from './ads-flow.js';
import {boardId} from '../firebase/functions/ad-credits.js';
import {mountEmbeddedCheckout, openBillboardPaymentWindow} from './billboard-checkout.js';
import {sessionIdFromClientSecret, stripePublishableKey, takeCheckoutQuery} from './billboard-return.js';

export function createBillboardBuy({root, onOpen = () => {}, onClose = () => {}, win = window} = {}) {
  const doc = root?.ownerDocument || document;
  const shell = doc.createElement('div');
  shell.id = 'billboard-buy';
  shell.hidden = true;
  const panel = doc.createElement('div');
  panel.className = 'billboard-buy-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'billboard-ads-title');
  const bar = doc.createElement('div');
  bar.className = 'billboard-buy-bar';
  const closeButton = doc.createElement('button');
  closeButton.id = 'billboard-buy-close';
  closeButton.type = 'button';
  closeButton.textContent = 'Close';
  const flowRoot = doc.createElement('div');
  flowRoot.className = 'ads-page';
  bar.append(closeButton);
  panel.append(bar, flowRoot);
  shell.append(panel);
  root?.append(shell);

  let openFlag = false;
  let suppressBackdrop = 0;
  let board = '';
  let flow = null;
  let stopWindow = () => {};
  let embedded = null;
  let pendingReturn = {checkout: '', sessionId: ''};
  const covered = [];

  function cover(active) {
    if (!root) return;
    if (active) {
      for (const el of root.children) {
        if (el === shell || el.inert) continue;
        el.inert = true;
        covered.push(el);
      }
      return;
    }
    for (const el of covered) el.inert = false;
    covered.length = 0;
  }

  function dismissPayment() {
    stopWindow();
    stopWindow = () => {};
    try {
      embedded?.destroy();
    } catch {
      // Stripe may already have unmounted the form.
    }
    embedded = null;
    const payment = shell.querySelector('#ads-payment');
    if (payment) {
      payment.hidden = true;
      payment.replaceChildren();
    }
    const buy = shell.querySelector('#ads-buy');
    if (buy) buy.disabled = false;
  }

  function status(message) {
    const node = shell.querySelector('#ads-status');
    if (node) node.textContent = message;
  }

  async function presentCheckout(payload) {
    dismissPayment();
    if (payload?.clientSecret && stripePublishableKey()) {
      const payment = shell.querySelector('#ads-payment');
      const sessionId = sessionIdFromClientSecret(payload.clientSecret);
      if (!payment || !sessionId) throw new Error('Checkout did not return a payment page');
      const buy = shell.querySelector('#ads-buy');
      if (buy) buy.disabled = true;
      payment.hidden = false;
      try {
        embedded = await mountEmbeddedCheckout({
          publishableKey: stripePublishableKey(),
          clientSecret: payload.clientSecret,
          element: payment,
          onComplete: () => {
            dismissPayment();
            pendingReturn = {checkout: 'success', sessionId};
            flow?.sync()?.catch((error) => status(error.message));
          },
        });
      } catch (error) {
        dismissPayment();
        throw error;
      }
      return;
    }
    if (!payload?.url) throw new Error('Checkout did not return a payment page');
    stopWindow = openBillboardPaymentWindow(payload.url, {
      win,
      onResult(result) {
        stopWindow = () => {};
        if (result.checkout === 'success' && result.sessionId) {
          pendingReturn = {checkout: 'success', sessionId: result.sessionId};
          flow?.sync()?.catch((error) => status(error.message));
          return;
        }
        if (result.checkout === 'cancel') {
          pendingReturn = {checkout: 'cancel', sessionId: ''};
          flow?.sync()?.catch((error) => status(error.message));
          return;
        }
        if (result.checkout === 'closed') status('Payment window closed.');
      },
    });
  }

  function ensure() {
    if (flow) return flow;
    flow = mountBillboardAds(flowRoot, {
      showBack: false,
      showPageLink: true,
      getBoardId: () => board,
      readReturn: () => pendingReturn,
      clearReturn() {
        pendingReturn = {checkout: '', sessionId: ''};
      },
      checkoutFields: () => ({surface: 'game', ui: stripePublishableKey() ? 'embedded' : 'hosted'}),
      dismissPayment,
      presentCheckout,
    });
    return flow;
  }

  function open(id) {
    board = boardId(id);
    openFlag = true;
    shell.hidden = false;
    cover(true);
    onOpen();
    try {
      ensure().sync()?.catch((error) => status(error.message));
    } catch (error) {
      status(error.message);
    }
    closeButton.focus();
    suppressBackdrop = performance.now() + 500;
  }

  function close() {
    if (!openFlag) return;
    openFlag = false;
    shell.hidden = true;
    dismissPayment();
    cover(false);
    onClose();
  }

  closeButton.addEventListener('click', close);
  shell.addEventListener('click', (event) => {
    if (event.target !== shell || performance.now() < suppressBackdrop) return;
    close();
  });

  return {
    open,
    close,
    isOpen: () => openFlag,
    consumeLocationReturn() {
      const taken = takeCheckoutQuery(win.location.search);
      if (!taken) return;
      win.history.replaceState(null, '', `${win.location.pathname}${taken.search}`);
      pendingReturn = {checkout: taken.checkout, sessionId: taken.sessionId};
      open(taken.board);
    },
  };
}
