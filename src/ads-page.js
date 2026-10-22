import {mountBillboardAds} from './ads-flow.js';
import {boardId} from '../firebase/functions/ad-credits.js';

const root = document.querySelector('#ads-root');
if (root) {
  mountBillboardAds(root, {
    showBack: true,
    getBoardId: () => boardId(new URLSearchParams(location.search).get('board')),
  });
}
