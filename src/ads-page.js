import './ads-page.css';
import {signInWithPopup, signOut} from 'firebase/auth';
import {doc, getDoc, setDoc, updateDoc} from 'firebase/firestore';
import {ref, uploadBytes, getDownloadURL} from 'firebase/storage';
import {billboardFirebase} from './firebase.js';
import {CREDIT_PACKS, checkoutAmount, creditPack, emptyAccount} from '../firebase/functions/ad-credits.js';
import {adsEndpoints} from './billboard-feed.js';

const $ = (id) => document.getElementById(id);
const IMAGE_LIMIT = 2 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function money(currencyId, unitAmount) {
  const pack = creditPack(currencyId);
  const major = pack.zeroDecimal ? unitAmount : unitAmount / 100;
  return new Intl.NumberFormat('en-GB', {style: 'currency', currency: pack.id.toUpperCase()}).format(major);
}

function selectedCurrency() {
  return $('ads-currency').value || 'eur';
}

function paintPrice(account) {
  const amount = checkoutAmount(selectedCurrency(), {feePaid: !!account.feePaid});
  $('ads-buy').textContent = amount.includesFee ? 'Pay the fee and add 40 credits' : 'Add 40 credits';
  $('ads-price').textContent = amount.includesFee
    ? `${money(amount.currency, amount.unitAmount)} includes the one-time listing fee.`
    : `${money(amount.currency, amount.unitAmount)} for 40 credits.`;
}

function paintAccount(account) {
  $('ads-spent').textContent = String(account.spent || 0);
  $('ads-remaining').textContent = String(account.credits || 0);
  const preview = $('ads-preview');
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

async function refreshAccount(uid) {
  const endpoints = adsEndpoints();
  try {
    return await authedPost(endpoints.account, {});
  } catch {
    const snap = await getDoc(doc(services().firestore, 'billboardAccounts', uid));
    return snap.exists() ? snap.data() : emptyAccount();
  }
}

async function showAccount(user) {
  $('ads-signed-out').hidden = true;
  $('ads-account').hidden = false;
  await ensureAccount(user.uid);
  const params = new URLSearchParams(location.search);
  if (params.get('checkout') === 'success' && params.get('session_id')) {
    try {
      const account = await authedPost(adsEndpoints().confirm, {sessionId: params.get('session_id')});
      paintAccount(account);
      $('ads-status').textContent = 'Credits added.';
      return;
    } catch (error) {
      $('ads-status').textContent = error.message;
    }
  }
  if (params.get('checkout') === 'cancel') $('ads-status').textContent = 'Payment cancelled.';
  paintAccount(await refreshAccount(user.uid));
}

function fillCurrencies() {
  const select = $('ads-currency');
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
  const path = `billboards/${user.uid}/face`;
  const stored = ref(services().storage, path);
  await uploadBytes(stored, file, {contentType: file.type});
  const imageUrl = await getDownloadURL(stored);
  if (!imageUrl.startsWith('https://firebasestorage.googleapis.com/')) throw new Error('Unexpected image address');
  await updateDoc(doc(services().firestore, 'billboardAccounts', user.uid), {imageUrl});
  paintAccount(await refreshAccount(user.uid));
  $('ads-status').textContent = 'Image saved. It goes up while credits remain.';
}

function bind() {
  fillCurrencies();
  $('ads-sign-in').addEventListener('click', async () => {
    $('ads-status').textContent = '';
    try {
      const cred = await signInWithPopup(services().auth, services().provider);
      await showAccount(cred.user);
    } catch (error) {
      $('ads-status').textContent = error.message;
    }
  });
  $('ads-sign-out').addEventListener('click', () => signOut(services().auth));
  $('ads-currency').addEventListener('change', async () => {
    const user = services().auth.currentUser;
    if (user) paintPrice(await refreshAccount(user.uid));
  });
  $('ads-file').addEventListener('change', async () => {
    const file = $('ads-file').files?.[0];
    const user = services().auth.currentUser;
    if (!file || !user) return;
    $('ads-status').textContent = '';
    try {
      await uploadImage(user, file);
    } catch (error) {
      $('ads-status').textContent = error.message;
    }
  });
  $('ads-buy').addEventListener('click', async () => {
    const user = services().auth.currentUser;
    if (!user) return;
    $('ads-status').textContent = '';
    try {
      const payload = await authedPost(adsEndpoints().checkout, {currency: selectedCurrency()});
      if (!payload.url) throw new Error('Checkout did not return a payment page');
      location.href = payload.url;
    } catch (error) {
      $('ads-status').textContent = error.message;
    }
  });
  services().auth.onAuthStateChanged((user) => {
    if (!user || user.isAnonymous) {
      $('ads-signed-out').hidden = false;
      $('ads-account').hidden = true;
      return;
    }
    showAccount(user).catch((error) => {
      $('ads-status').textContent = error.message;
    });
  });
}

try {
  bind();
} catch (error) {
  $('ads-status').textContent = error.message;
}
