import './ads-page.css';
import {signInWithPopup, signOut} from 'firebase/auth';
import {doc, getDoc, setDoc, updateDoc} from 'firebase/firestore';
import {ref, uploadBytes, getDownloadURL} from 'firebase/storage';
import {billboardFirebase} from './firebase.js';
import {CREDIT_PACKS, boardId, checkoutAmount, creditPack, emptyAccount} from '../firebase/functions/ad-credits.js';
import {adsEndpoints} from './billboard-feed.js';

const IMAGE_LIMIT = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function markup({showBack, showPageLink}) {
  const kicker = showBack ? '<p class="ads-kicker"><a class="ads-back" href="/">GTA Praha</a></p>' : '';
  // The in-game Google popup is often blocked. This link is the advertiser page, where sign-in and payment already run.
  const pageLink = showPageLink
    ? '<p id="ads-page-fallback" class="ads-note" hidden><a id="ads-page-link" href="/ads.html">Open the advertiser page</a></p>'
    : '';
  return `${kicker}
    <h1 id="billboard-ads-title">Your ad can be here</h1>
    <p>Zde může být vaše reklama. One landscape image goes on one board. The first payment is the listing fee plus 40 credits. After that, credits only. One credit keeps the image up for one day in Prague.</p>
    <p id="ads-board" class="ads-note" hidden></p>
    <section class="ads-card" id="ads-signed-out">
      <p>Sign in with Google to upload an image and buy credits.</p>
      <button id="ads-sign-in" class="primary-btn" type="button">Sign in with Google</button>
      ${pageLink}
    </section>
    <section class="ads-card" id="ads-account" hidden>
      <div class="ads-balance">
        <p><span>Spent</span><strong id="ads-spent">0</strong></p>
        <p><span>Remaining</span><strong id="ads-remaining">0</strong></p>
      </div>
      <img id="ads-preview" class="ads-preview" alt="" hidden />
      <label>Billboard image
        <input id="ads-file" type="file" accept="image/jpeg,image/png,image/webp" />
      </label>
      <label>Currency
        <select id="ads-currency"></select>
      </label>
      <div id="ads-payment" hidden></div>
      <button id="ads-buy" class="primary-btn" type="button">Add credits</button>
      <p id="ads-price" class="ads-note"></p>
      <button id="ads-sign-out" class="ghost-btn" type="button">Sign out</button>
    </section>
    <p id="ads-status" class="ads-status" role="status"></p>`;
}

function money(currencyId, unitAmount) {
  const pack = creditPack(currencyId);
  const major = pack.zeroDecimal ? unitAmount : unitAmount / 100;
  return new Intl.NumberFormat('en-GB', {style: 'currency', currency: pack.id.toUpperCase()}).format(major);
}

export function mountBillboardAds(root, options) {
  root.innerHTML = markup({showBack: options.showBack !== false, showPageLink: options.showPageLink === true});
  try {
    return bind(root, options);
  } catch (error) {
    const status = root.querySelector('#ads-status');
    if (status) status.textContent = error.message;
    return {sync() {}};
  }
}

function bind(root, options) {
  const q = (id) => root.querySelector(`#${id}`);
  const chosenBoard = () => boardId(options.getBoardId());
  const readReturn = () => options.readReturn?.() || {checkout: '', sessionId: ''};

  function paintChosenBoard() {
    const id = chosenBoard();
    const node = q('ads-board');
    node.hidden = !id;
    node.textContent = id ? `This billboard: ${id}` : '';
    const link = q('ads-page-link');
    if (link) {
      link.href = id ? `/ads.html?board=${encodeURIComponent(id)}` : '/ads.html';
    }
  }

  function selectedCurrency() {
    return q('ads-currency').value || 'eur';
  }

  function paintPrice(account) {
    const amount = checkoutAmount(selectedCurrency(), {feePaid: !!account.feePaid});
    q('ads-buy').textContent = amount.includesFee ? 'Pay the fee and add 40 credits' : 'Add 40 credits';
    q('ads-price').textContent = amount.includesFee
      ? `${money(amount.currency, amount.unitAmount)} includes the one-time listing fee.`
      : `${money(amount.currency, amount.unitAmount)} for 40 credits.`;
  }

  function paintAccount(account) {
    q('ads-spent').textContent = String(account.spent || 0);
    q('ads-remaining').textContent = String(account.credits || 0);
    const preview = q('ads-preview');
    if (account.imageUrl) {
      preview.hidden = false;
      preview.src = account.imageUrl;
      preview.alt = 'Your billboard image';
    } else {
      preview.hidden = true;
      preview.removeAttribute('src');
    }
    paintPrice(account);
  }

  function services() {
    return billboardFirebase();
  }

  async function authedPost(path, body) {
    const user = services().auth.currentUser;
    if (!user) throw new Error('Sign in required');
    const token = await user.getIdToken();
    const response = await fetch(path, {
      method: 'POST',
      headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'},
      body: JSON.stringify(body || {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'The request failed');
    return payload;
  }

  async function ensureAccount(uid) {
    const store = services().firestore;
    const accountRef = doc(store, 'billboardAccounts', uid);
    const snap = await getDoc(accountRef);
    if (!snap.exists()) await setDoc(accountRef, emptyAccount());
    return accountRef;
  }

  async function saveSelectedBoard(uid) {
    const selectedBoardId = chosenBoard();
    if (!selectedBoardId) return;
    await updateDoc(doc(services().firestore, 'billboardAccounts', uid), {selectedBoardId});
  }

  async function refreshAccount(uid) {
    try {
      return await authedPost(adsEndpoints().account, {});
    } catch {
      const snap = await getDoc(doc(services().firestore, 'billboardAccounts', uid));
      return snap.exists() ? snap.data() : emptyAccount();
    }
  }

  async function showAccount(user) {
    q('ads-signed-out').hidden = true;
    q('ads-account').hidden = false;
    await ensureAccount(user.uid);
    await saveSelectedBoard(user.uid);
    paintChosenBoard();
    const params = readReturn();
    if (params.checkout === 'success' && params.sessionId) {
      options.clearReturn?.();
      try {
        const account = await authedPost(adsEndpoints().confirm, {sessionId: params.sessionId});
        paintAccount(account);
        q('ads-status').textContent = 'Credits added.';
        return;
      } catch (error) {
        q('ads-status').textContent = error.message;
      }
    }
    if (params.checkout === 'cancel') {
      options.clearReturn?.();
      q('ads-status').textContent = 'Payment cancelled.';
    }
    paintAccount(await refreshAccount(user.uid));
  }

  function fillCurrencies() {
    const select = q('ads-currency');
    for (const pack of CREDIT_PACKS) {
      const option = document.createElement('option');
      option.value = pack.id;
      option.textContent = pack.id.toUpperCase();
      select.append(option);
    }
    select.value = 'eur';
  }

  async function uploadImage(user, file) {
    if (!IMAGE_TYPES.has(file.type)) throw new Error('Use a jpeg, png, or webp image');
    if (file.size > IMAGE_LIMIT) throw new Error('The image must be under 2 MB');
    const stored = ref(services().storage, `billboards/${user.uid}/face`);
    await uploadBytes(stored, file, {contentType: file.type});
    const imageUrl = await getDownloadURL(stored);
    if (!imageUrl.startsWith('https://firebasestorage.googleapis.com/')) throw new Error('Unexpected image address');
    await updateDoc(doc(services().firestore, 'billboardAccounts', user.uid), {imageUrl});
    paintAccount(await refreshAccount(user.uid));
    q('ads-status').textContent = 'Image saved. It goes up while credits remain.';
  }

  function sync() {
    paintChosenBoard();
    const user = services().auth.currentUser;
    if (!user || user.isAnonymous) {
      q('ads-signed-out').hidden = false;
      q('ads-account').hidden = true;
      return Promise.resolve();
    }
    return showAccount(user);
  }

  fillCurrencies();
  paintChosenBoard();
  q('ads-sign-in').addEventListener('click', async () => {
    q('ads-status').textContent = '';
    try {
      const cred = await signInWithPopup(services().auth, services().provider);
      await showAccount(cred.user);
    } catch (error) {
      const blocked = error?.code === 'auth/popup-blocked' || error?.code === 'auth/operation-not-supported-in-this-environment';
      const fallback = q('ads-page-fallback');
      const link = q('ads-page-link');
      if (blocked && fallback && link) {
        const id = chosenBoard();
        link.href = id ? `/ads.html?board=${encodeURIComponent(id)}` : '/ads.html';
        fallback.hidden = false;
        q('ads-status').textContent = 'Google could not open from the game. Use the advertiser page to sign in and pay.';
      } else {
        q('ads-status').textContent = error.message;
      }
    }
  });
  q('ads-sign-out').addEventListener('click', () => {
    options.dismissPayment?.();
    signOut(services().auth);
  });
  q('ads-currency').addEventListener('change', async () => {
    const user = services().auth.currentUser;
    if (user) paintPrice(await refreshAccount(user.uid));
  });
  q('ads-file').addEventListener('change', async () => {
    const file = q('ads-file').files?.[0];
    const user = services().auth.currentUser;
    if (!file || !user) return;
    q('ads-status').textContent = '';
    try {
      await uploadImage(user, file);
    } catch (error) {
      q('ads-status').textContent = error.message;
    }
  });
  q('ads-buy').addEventListener('click', async () => {
    const user = services().auth.currentUser;
    if (!user) return;
    q('ads-status').textContent = '';
    try {
      const payload = await authedPost(adsEndpoints().checkout, {
        currency: selectedCurrency(),
        boardId: chosenBoard(),
        ...(options.checkoutFields?.() || {}),
      });
      await options.presentCheckout(payload);
    } catch (error) {
      const popupBlocked = error.message === 'popup-blocked';
      const fallback = q('ads-page-fallback');
      const link = q('ads-page-link');
      if (popupBlocked && fallback && link) {
        const id = chosenBoard();
        link.href = id ? `/ads.html?board=${encodeURIComponent(id)}` : '/ads.html';
        fallback.hidden = false;
        q('ads-status').textContent = 'Allow a payment window to check out. Use the advertiser page to pay.';
      } else {
        q('ads-status').textContent = error.message;
      }
    }
  });
  services().auth.onAuthStateChanged((user) => {
    if (!user || user.isAnonymous) {
      q('ads-signed-out').hidden = false;
      q('ads-account').hidden = true;
      return;
    }
    showAccount(user).catch((error) => {
      q('ads-status').textContent = error.message;
    });
  });

  return {sync};
}
