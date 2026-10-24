import './ads-page.css';
import {signOut} from 'firebase/auth';
import {doc, getDoc, setDoc, updateDoc} from 'firebase/firestore';
import {ref, uploadBytes, getDownloadURL} from 'firebase/storage';
import {billboardFirebase} from './firebase.js';
import {applyAdvertiserAccess, submitAdvertiserAuth} from './advertiser-auth.js';
import {authFailureMessage, createEmailAccount, signInWithEmail} from './email-auth.js';
import {REVOLUT_CHECKOUT_URL, REVOLUT_QR_PATH, boardId, checkoutAmount, emptyAccount} from '../firebase/functions/ad-credits.js';
import {adsEndpoints} from './billboard-feed.js';

const IMAGE_LIMIT = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const PAGE_LINK = '<p id="ads-page-fallback" class="board-note"><a id="ads-page-link" href="/advertise" target="_blank" rel="noopener noreferrer">Open the advertiser page</a></p>';

function checkoutMarkup() {
  // EasyList hides .ads-card and .ads-note. The advertiser page keeps board-panel.
  return `<section class="board-panel" id="ads-signed-out">
      <p id="ads-intro" class="board-note">Create an account with your email. The 50 € payment appears after you are signed in.</p>
      <form id="ads-auth">
        <label>Email
          <input id="ads-email" name="email" type="email" autocomplete="username" required />
        </label>
        <label>Password
          <input id="ads-password" name="password" type="password" autocomplete="new-password" minlength="6" required />
        </label>
        <p id="ads-password-hint" class="board-note">At least 6 characters.</p>
        <button id="ads-submit" class="primary-btn" type="submit">Create account</button>
        <button id="ads-switch" class="ghost-btn" type="button">I already have an account</button>
      </form>
    </section>
    <section class="board-panel" id="board-payment" hidden>
      <p>GTA Praha has sent you a payment request for 50 €. Pay with Revolut Link, Revolut Pay, or scan the code.</p>
      <p class="ads-pay-label">Revolut Link</p>
      <p><a class="ads-revolut" id="ads-revolut" href="${REVOLUT_CHECKOUT_URL}" target="_blank" rel="noopener noreferrer">${REVOLUT_CHECKOUT_URL}</a></p>
      <a class="ads-revolut primary-btn" id="ads-revolut-pay" href="${REVOLUT_CHECKOUT_URL}" target="_blank" rel="noopener noreferrer">Revolut Pay</a>
      <figure class="ads-qr-block">
        <img id="ads-revolut-qr" src="${REVOLUT_QR_PATH}" width="220" height="220" alt="QR code to pay 50 euro with Revolut" />
        <figcaption>Scan to pay 50 €</figcaption>
      </figure>
    </section>
    <section class="board-panel" id="ads-account" hidden>
      <p id="ads-who" class="board-note"></p>
      <div class="ads-balance">
        <p><span>Spent</span><strong id="ads-spent">0</strong></p>
        <p><span>Remaining</span><strong id="ads-remaining">0</strong></p>
      </div>
      <img id="ads-preview" class="ads-preview" alt="" hidden />
      <label>Billboard image
        <input id="ads-file" type="file" accept="image/jpeg,image/png,image/webp" />
      </label>
      <p id="ads-price" class="board-note"></p>
      <button id="ads-confirm" class="primary-btn" type="button">I've paid the 50 €</button>
      <button id="ads-sign-out" class="ghost-btn" type="button">Sign out</button>
    </section>`;
}

function markup({showBack, showCheckout}) {
  const kicker = showBack ? '<p class="ads-kicker"><a class="ads-back" href="/">GTA Praha</a></p>' : '';
  // The in-game modal keeps the short placeholder. The advertiser page names itself.
  const title = showCheckout ? 'Advertise in GTA Praha' : 'Your ad can be here';
  const lede = showCheckout
    ? 'Zde může být vaše reklama. Your ad can be here. One landscape image goes on one board.'
    : 'Zde může být vaše reklama. One landscape image goes on one board.';
  return `${kicker}
    <h1 id="billboard-ads-title">${title}</h1>
    <p>${lede}</p>
    <p id="ads-board" class="board-note" hidden></p>
    ${showCheckout ? checkoutMarkup() : PAGE_LINK}
    <p id="ads-status" class="ads-status" role="status"></p>`;
}

function paintBoard(root, id) {
  const node = root.querySelector('#ads-board');
  if (node) {
    node.hidden = !id;
    node.textContent = id ? `This billboard: ${id}` : '';
  }
  const link = root.querySelector('#ads-page-link');
  if (link) link.href = id ? `/advertise?board=${encodeURIComponent(id)}` : '/advertise';
}

function bindPageLink(root, options) {
  const sync = () => paintBoard(root, boardId(options.getBoardId()));
  sync();
  return {sync};
}

export function mountBillboardAds(root, options) {
  const showCheckout = options.showCheckout !== false;
  root.innerHTML = markup({showBack: options.showBack !== false, showCheckout});
  if (!showCheckout) return bindPageLink(root, options);
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
    paintBoard(root, chosenBoard());
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
    applyAdvertiserAccess(root, user);
    const who = q('ads-who');
    if (who) who.textContent = user.email ? `Signed in as ${user.email}` : 'Signed in';
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
      applyAdvertiserAccess(root, null);
      return Promise.resolve();
    }
    return showAccount(user);
  }

  let mode = 'create';

  function paintMode() {
    const creating = mode === 'create';
    q('ads-submit').textContent = creating ? 'Create account' : 'Sign in';
    q('ads-switch').textContent = creating ? 'I already have an account' : 'Create an account';
    q('ads-password').autocomplete = creating ? 'new-password' : 'current-password';
    q('ads-intro').textContent = creating
      ? 'Create an account with your email. The 50 € payment appears after you are signed in.'
      : 'Sign in with the email and password you already created.';
  }

  function failureText(error) {
    const message = authFailureMessage(error);
    const missed = error?.code === 'auth/invalid-credential' || error?.code === 'auth/user-not-found' || error?.code === 'auth/wrong-password';
    if (mode === 'sign-in' && missed) return `${message} Create an account if you are new.`;
    return message;
  }

  async function withAuth() {
    if (authBusy) return;
    authBusy = true;
    q('ads-status').textContent = mode === 'create' ? 'Creating your account…' : 'Signing in…';
    q('ads-submit').disabled = true;
    try {
      const user = await submitAdvertiserAuth(mode, q('ads-email').value, q('ads-password').value, {
        create: (email, password) => createEmailAccount(services().auth, email, password),
        signIn: (email, password) => signInWithEmail(services().auth, email, password),
      });
      await showAccount(user);
      q('ads-status').textContent = '';
    } catch (error) {
      if (error?.code === 'auth/email-already-in-use') {
        mode = 'sign-in';
        paintMode();
      }
      q('ads-status').textContent = failureText(error);
    } finally {
      authBusy = false;
      if (q('ads-submit')) q('ads-submit').disabled = false;
    }
  }

  paintChosenBoard();
  paintMode();
  q('ads-auth').addEventListener('submit', (event) => {
    event.preventDefault();
    withAuth();
  });
  q('ads-switch').addEventListener('click', () => {
    mode = mode === 'create' ? 'sign-in' : 'create';
    paintMode();
    q('ads-status').textContent = '';
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
      applyAdvertiserAccess(root, null);
      return;
    }
    showAccount(user).catch((error) => {
      q('ads-status').textContent = error.message;
    });
  });

  return {sync};
}
