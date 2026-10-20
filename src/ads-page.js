import {mountBillboardAds} from './ads-flow.js';
import {boardId} from '../firebase/functions/ad-credits.js';

const root = document.querySelector('#ads-root');
if (root) {
  mountBillboardAds(root, {
    showBack: true,
    getBoardId: () => boardId(new URLSearchParams(location.search).get('board')),
    readReturn: () => {
      const params = new URLSearchParams(location.search);
      return {checkout: params.get('checkout') || '', sessionId: params.get('session_id') || ''};
    },
    clearReturn() {
      const board = new URLSearchParams(location.search).get('board');
      const next = new URLSearchParams();
      if (board) next.set('board', board);
      const search = next.toString();
      history.replaceState(null, '', `${location.pathname}${search ? `?${search}` : ''}`);
    },
    checkoutFields: () => ({surface: 'page'}),
    async presentCheckout(payload) {
      if (!payload?.url) throw new Error('Checkout did not return a payment page');
      location.assign(payload.url);
    },
  });
}
