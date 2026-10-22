import './billboard-buy.css';
import {mountBillboardAds} from './ads-flow.js';
import {boardId} from '../firebase/functions/ad-credits.js';

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

  function status(message) {
    const node = shell.querySelector('#ads-status');
    if (node) node.textContent = message;
  }

  function ensure() {
    if (flow) return flow;
    flow = mountBillboardAds(flowRoot, {
      showBack: false,
      showCheckout: false,
      getBoardId: () => board,
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
      const params = new URLSearchParams(win.location.search);
      if (!params.has('checkout') && !params.has('session_id')) return;
      params.delete('checkout');
      params.delete('session_id');
      const next = params.toString();
      win.history.replaceState(null, '', `${win.location.pathname}${next ? `?${next}` : ''}`);
    },
  };
}
