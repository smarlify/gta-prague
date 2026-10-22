/**
 * GTA Praha high score = distance driven this run (metres), already tracked on the car
 * and on the BUSTED "THE DRIVE" panel. Higher is better.
 *
 * Playful (iframe): postMessage GAME_OVER so the hub LeaderboardPopup can save.
 * Standalone (gtapraha.online / Heroku): email sign-in, then write the same
 * Firestore path Playful uses — leaderboards/gta-praha/scores.
 */
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { auth, getFirebaseAuth, getFirebaseFirestore } from './firebase.js';
import { authFailureMessage, createEmailAccount, signInWithEmail } from './email-auth.js';
import { formatDistance } from './finale.js';
import { cleanPlayerName, readStoredPlayerName } from './net/player-name.js';

export const GAME_ID = 'gta-praha';
export const GAME_NAME = 'GTA Praha';

const SAVE_LABEL = 'Save score';

/** Whole metres driven this run — the leaderboard sort key. */
export function scoreFromDistance(metres) {
  return Math.max(0, Math.round(Number(metres) || 0));
}

export function formatHighScore(metres) {
  return formatDistance(scoreFromDistance(metres));
}

export function isEmbedded() {
  return typeof window !== 'undefined' && window.parent !== window;
}

/**
 * Notify the Playful hub. Returns true when a message was sent.
 * Includes gameId so the hub can match gta-praha without relying on display name alone.
 */
export function postGameOver(score, extra = {}) {
  if (!isEmbedded()) return false;
  window.parent.postMessage({
    type: 'GAME_OVER',
    gameId: GAME_ID,
    gameName: GAME_NAME,
    score: scoreFromDistance(score),
    ...extra,
  }, '*');
  return true;
}

export function isAccountUser(user = auth.currentUser) {
  return !!(user && !user.isAnonymous);
}

export function displayNameFor(user = auth.currentUser) {
  if (!isAccountUser(user)) return null;
  return user.displayName || user.email?.split('@')[0] || null;
}

/** Write one row to the shared Playful leaderboard collection. */
export async function saveHighScore({ score, name, email, uid }) {
  const metres = scoreFromDistance(score);
  if (metres <= 0) throw new Error('Score must be greater than zero');
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Name is required');

  const data = {
    name: trimmed,
    score: metres,
    gameName: GAME_NAME,
    createdAt: Timestamp.now(),
  };
  if (email) data.email = email;
  if (uid) data.uid = uid;

  await addDoc(collection(getFirebaseFirestore(), 'leaderboards', GAME_ID, 'scores'), data);
  return data;
}

/**
 * Wire the BUSTED overlay high-score strip.
 * Call once when the end screen appears; safe to call again after another arrest.
 */
export function bindHighScoreUI(root = document, {
  getDistance = () => 0,
  onEmbedded = postGameOver,
  signIn = (email, password) => signInWithEmail(getFirebaseAuth(), email, password),
  createAccount = (email, password) => createEmailAccount(getFirebaseAuth(), email, password),
  save = saveHighScore,
  authApi = auth,
  onAccountSignedIn = null,
  getPlayerName = () => readStoredPlayerName(),
} = {}) {
  const panel = root.getElementById?.('high-score-panel') || root.querySelector?.('#high-score-panel');
  const scoreEl = root.getElementById?.('high-score-value');
  const statusEl = root.getElementById?.('high-score-status');
  const saveBtn = root.getElementById?.('high-score-save');
  const accountForm = root.getElementById?.('high-score-account');
  const accountEmail = root.getElementById?.('high-score-email');
  const accountPassword = root.getElementById?.('high-score-password');
  const accountSignIn = root.getElementById?.('high-score-sign-in');
  const accountCreate = root.getElementById?.('high-score-create');
  const guestForm = root.getElementById?.('high-score-guest');
  const guestName = root.getElementById?.('high-score-name');
  const guestSubmit = root.getElementById?.('high-score-guest-submit');
  if (!panel) return { offer() {}, reset() {} };

  let offeredScore = 0;
  let busy = false;
  let saved = false;

  const setStatus = (text, kind = '') => {
    if (!statusEl) return;
    statusEl.textContent = text || '';
    statusEl.dataset.kind = kind;
  };

  const setBusy = (value) => {
    busy = value;
    if (saveBtn) saveBtn.disabled = value || saved;
    if (accountEmail) accountEmail.disabled = value || saved;
    if (accountPassword) accountPassword.disabled = value || saved;
    if (accountSignIn) accountSignIn.disabled = value || saved;
    if (accountCreate) accountCreate.disabled = value || saved;
    if (guestSubmit) guestSubmit.disabled = value || saved;
    if (guestName) guestName.disabled = value || saved;
  };

  const showGuestFallback = (show) => {
    if (guestForm) guestForm.hidden = !show;
  };

  /** Hide email sign-in / Save as guest — used when already signed in. */
  const hideChooser = () => {
    if (saveBtn) saveBtn.hidden = true;
    if (accountForm) accountForm.hidden = true;
    showGuestFallback(false);
  };

  /** Logged-out chooser: email account, plus a guest name. */
  const showLoggedOutChooser = (scoreOk) => {
    if (saveBtn) saveBtn.hidden = true;
    if (accountForm) accountForm.hidden = !scoreOk;
    showGuestFallback(!!scoreOk);
  };

  /** Signed-in retry: single Save score control. */
  const showSaveRetry = () => {
    if (saveBtn) {
      saveBtn.hidden = false;
      saveBtn.textContent = SAVE_LABEL;
      saveBtn.disabled = false;
    }
    if (accountForm) accountForm.hidden = true;
    showGuestFallback(false);
  };

  const markSaved = (name) => {
    saved = true;
    setBusy(false);
    hideChooser();
    setStatus(name ? `Saved as ${name}.` : 'Score saved.', 'ok');
  };

  const persist = async (user, guestLabel) => {
    const name = displayNameFor(user) || guestLabel;
    const row = await save({
      score: offeredScore,
      name,
      email: user?.email || undefined,
      uid: user?.uid || undefined,
    });
    markSaved(row.name);
  };

  const autoSaveSignedIn = (user) => {
    const name = displayNameFor(user);
    hideChooser();
    setStatus(name ? `Signed in as ${name}. Saving…` : 'Saving…');
    setBusy(true);
    persist(user).catch((err) => {
      console.error('High score auto-save failed:', err);
      setBusy(false);
      setStatus('Could not save. Try again.', 'error');
      showSaveRetry();
    });
  };

  /** HUD name already stored: save it and do not ask again. */
  const saveWithStoredName = (name) => {
    hideChooser();
    setStatus(`Saving as ${name}…`);
    setBusy(true);
    persist(null, name).catch((err) => {
      console.error('High score saved-name save failed:', err);
      setBusy(false);
      setStatus('Could not save score. Try again.', 'error');
      if (guestName) guestName.value = name;
      if (accountForm) accountForm.hidden = true;
      showGuestFallback(true);
    });
  };

  const storedHudName = () => cleanPlayerName(getPlayerName());

  const accountCredentials = () => {
    const email = accountEmail?.value?.trim() || '';
    const password = accountPassword?.value || '';
    if (!email || !password) {
      setStatus('Enter an email and a password.', 'error');
      return null;
    }
    if (password.length < 6) {
      setStatus('Use a password of at least 6 characters.', 'error');
      return null;
    }
    return {email, password};
  };

  const signInAndSave = async (mode) => {
    if (busy || saved || offeredScore <= 0) return;
    const creds = accountCredentials();
    if (!creds) return;
    setBusy(true);
    setStatus(mode === 'create' ? 'Creating account…' : 'Signing in…');
    try {
      const user = mode === 'create'
        ? await createAccount(creds.email, creds.password)
        : await signIn(creds.email, creds.password);
      try { await onAccountSignedIn?.(user); } catch (err) { console.warn('onAccountSignedIn failed', err); }
      await persist(user);
    } catch (err) {
      console.error('High score email sign-in failed:', err);
      setBusy(false);
      setStatus(`${authFailureMessage(err)} You can still save with a guest name.`, 'error');
      showLoggedOutChooser(true);
    }
  };

  const onSaveClick = async () => {
    if (busy || saved || offeredScore <= 0) return;
    if (!isAccountUser(authApi.currentUser)) return;
    setBusy(true);
    setStatus('Saving…');
    try {
      await persist(authApi.currentUser);
    } catch (err) {
      console.error('High score save failed:', err);
      setBusy(false);
      setStatus('Could not save. Try again.', 'error');
      showSaveRetry();
    }
  };

  const onGuestSubmit = async (event) => {
    event?.preventDefault?.();
    if (busy || saved || offeredScore <= 0) return;
    const name = guestName?.value?.trim();
    if (!name) {
      setStatus('Enter a name to appear on the leaderboard.', 'error');
      return;
    }
    setBusy(true);
    setStatus('Saving…');
    try {
      await persist(authApi.currentUser && isAccountUser(authApi.currentUser) ? authApi.currentUser : null, name);
    } catch (err) {
      console.error('High score guest save failed:', err);
      setBusy(false);
      setStatus('Could not save score. Try again.', 'error');
    }
  };

  if (saveBtn && !saveBtn.dataset.bound) {
    saveBtn.dataset.bound = '1';
    saveBtn.addEventListener('click', onSaveClick);
  }
  if (accountForm && !accountForm.dataset.bound) {
    accountForm.dataset.bound = '1';
    accountForm.addEventListener('submit', (event) => {
      event?.preventDefault?.();
      signInAndSave('sign-in');
    });
  }
  if (accountCreate && !accountCreate.dataset.bound) {
    accountCreate.dataset.bound = '1';
    accountCreate.addEventListener('click', () => signInAndSave('create'));
  }
  if (guestForm && !guestForm.dataset.bound) {
    guestForm.dataset.bound = '1';
    guestForm.addEventListener('submit', onGuestSubmit);
  }

  const reset = () => {
    offeredScore = 0;
    saved = false;
    busy = false;
    panel.hidden = true;
    showGuestFallback(false);
    if (saveBtn) saveBtn.hidden = true;
    if (accountForm) accountForm.hidden = true;
    if (accountEmail) { accountEmail.value = ''; accountEmail.disabled = false; }
    if (accountPassword) { accountPassword.value = ''; accountPassword.disabled = false; }
    if (guestName) { guestName.value = ''; guestName.disabled = false; }
    if (guestSubmit) guestSubmit.disabled = false;
    setStatus('');
  };

  const offer = (metres = getDistance()) => {
    const score = scoreFromDistance(metres);
    offeredScore = score;
    saved = false;
    if (scoreEl) scoreEl.textContent = formatHighScore(score);
    panel.hidden = false;

    if (score <= 0) {
      hideChooser();
      setStatus('Drive farther next time to post a high score.', 'info');
      return { embedded: isEmbedded(), score };
    }

    const signedIn = isAccountUser(authApi.currentUser);
    const hudName = storedHudName();

    // Hub path: always notify Playful. Signed-in or already-named players
    // auto-save. Otherwise the guest field is the fallback.
    if (isEmbedded()) {
      onEmbedded(score);
      if (signedIn) {
        autoSaveSignedIn(authApi.currentUser);
      } else if (hudName) {
        saveWithStoredName(hudName);
      } else {
        showLoggedOutChooser(true);
        setStatus('Score sent to Playful — sign in with email, or save with a guest name here.', 'info');
      }
      return { embedded: true, score };
    }

    // Standalone: auto-save when already signed in or the HUD name is saved.
    if (signedIn) {
      autoSaveSignedIn(authApi.currentUser);
    } else if (hudName) {
      saveWithStoredName(hudName);
    } else {
      showLoggedOutChooser(true);
      setStatus('Sign in with email, or save this run with a guest name.');
    }

    return { embedded: false, score };
  };

  return { offer, reset, scoreFromDistance };
}
