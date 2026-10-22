import './ads-page.css';
import {signOut} from 'firebase/auth';
import {doc, getDoc, setDoc, updateDoc} from 'firebase/firestore';
import {ref, uploadBytes, getDownloadURL} from 'firebase/storage';
import {billboardFirebase} from './firebase.js';
import {authFailureMessage, createEmailAccount, signInWithEmail} from './email-auth.js';
import {REVOLUT_CHECKOUT_URL, REVOLUT_QR_PATH, boardId, checkoutAmount, emptyAccount} from '../firebase/functions/ad-credits.js';
import {adsEndpoints} from './billboard-feed.js';

const IMAGE_LIMIT = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function markup({showBack, showPageLink}) {
  const kicker = showBack ? '<p class="ads-kicker"><a class="ads-back" href="/">GTA Praha</a></p>' : '';
  const pageLink = showPageLink
    ? '<p id="ads-page-fallback" class="ads-note"><a id="ads-page-link" href="/ads.html">Open the advertiser page</a></p>'
    : '';
  return `${kicker}
    <h1 id="billboard-ads-title">Your ad can be here</h1>
    <p>Zde může být vaše reklama. One landscape image goes on one board.</p>
    <p id="ads-board" class="ads-note" hidden></p>
    <section class="ads-card" id="ads-signed-out">
      <p>Sign in with email to upload an image and pay.</p>
      <form id="ads-auth">
        <label>Email
          <input id="ads-email" type="email" autocomplete="username" required />
        </label>
        <label>Password
          <input id="ads-password" type="password" autocomplete="current-password" minlength="6" required />
        </label>
        <button id="ads-sign-in" class="primary-btn" type="submit">Sign in</button>
        <button id="ads-create" class="ghost-btn" type="button">Create account</button>
      </form>
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
      <p>GTA Praha has sent you a payment request for 50 €. Pay with Revolut Link, Revolut Pay, or scan the code.</p>
      <p class="ads-pay-label">Revolut Link</p>
      <p><a class="ads-revolut" id="ads-revolut" href="${REVOLUT_CHECKOUT_URL}" target="_blank" rel="noopener noreferrer">${REVOLUT_CHECKOUT_URL}</a></p>
      <a class="ads-revolut primary-btn" id="ads-revolut-pay" href="${REVOLUT_CHECKOUT_URL}" target="_blank" rel="noopener noreferrer">Revolut Pay</a>
      <figure class="ads-qr-block">
        <img id="ads-revolut-qr" src="${REVOLUT_QR_PATH}" width="220" height="220" alt="QR code to pay 50 euro with Revolut" />
        <figcaption>Scan to pay 50 €</figcaption>
      </figure>
      <p id="ads-price" class="ads-note"></p>
      <button id="ads-confirm" class="primary-btn" type="button">I've paid the 50 €</button>
      <button id="ads-sign-out" class="ghost-btn" type="button">Sign out</button>
    </section>
    <p id="ads-status" class="ads-status" role="status"></p>`;
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
  let pendingClaim = '';
  let authBusy = false;

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

  function paintPrice(account) {
    const amount = checkoutAmount({feePaid: !!account.feePaid});
    q('ads-price').textContent = amount.includesFee
      ? 'The 50 € request covers the listing fee and 40 credits. One credit keeps the image up for one day in Prague.'
      : 'The 50 € request adds another 40 credits. One credit keeps the image up for one day in Prague.';
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

  function credentials() {
    const email = q('ads-email').value.trim();
    const password = q('ads-password').value;
    if (!email || !password) throw new Error('Enter an email and a password.');
    if (password.length < 6) throw new Error('Use a password of at least 6 characters.');
    return {email, password};
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
    paintAccount(await refreshAccount(user.uid));
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

  async function withAuth(action) {
    if (authBusy) return;
    authBusy = true;
    q('ads-status').textContent = '';
    try {
      const {email, password} = credentials();
      const user = await action(email, password);
      await showAccount(user);
    } catch (error) {
      q('ads-status').textContent = authFailureMessage(error);
    } finally {
      authBusy = false;
    }
  }

  paintChosenBoard();
  q('ads-auth').addEventListener('submit', (event) => {
    event.preventDefault();
    withAuth((email, password) => signInWithEmail(services().auth, email, password));
  });
  q('ads-create').addEventListener('click', () => {
    withAuth((email, password) => createEmailAccount(services().auth, email, password));
  });
  q('ads-sign-out').addEventListener('click', () => {
    pendingClaim = '';
    signOut(services().auth);
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
  function startClaim({announce = false} = {}) {
    if (pendingClaim) return Promise.resolve(pendingClaim);
    let user = null;
    try {
      user = services().auth.currentUser;
    } catch (error) {
      q('ads-status').textContent = error.message;
      return Promise.resolve('');
    }
    if (!user) return Promise.resolve('');
    return authedPost(adsEndpoints().checkout, {boardId: chosenBoard()}).then((payload) => {
      pendingClaim = payload.claimId || '';
      if (!pendingClaim) throw new Error('Checkout did not return a payment.');
      if (announce) q('ads-status').textContent = 'After you pay the 50 € on Revolut, confirm it here.';
      return pendingClaim;
    });
  }

  for (const link of root.querySelectorAll('.ads-revolut')) {
    link.addEventListener('click', () => {
      q('ads-status').textContent = '';
      startClaim({announce: true}).catch((error) => {
        q('ads-status').textContent = error.message;
      });
    });
  }
  q('ads-confirm').addEventListener('click', async () => {
    q('ads-status').textContent = '';
    q('ads-confirm').disabled = true;
    try {
      const claimId = await startClaim();
      if (!claimId) return;
      const account = await authedPost(adsEndpoints().confirm, {claimId});
      pendingClaim = '';
      paintAccount(account);
      q('ads-status').textContent = 'Credits added.';
    } catch (error) {
      q('ads-status').textContent = error.message;
    } finally {
      q('ads-confirm').disabled = false;
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
