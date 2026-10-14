/**
 * GTA Praha high score = distance driven this run (metres), already tracked on the car
 * and on the BUSTED "THE DRIVE" panel. Higher is better.
 *
 * Playful (iframe): postMessage GAME_OVER so the hub LeaderboardPopup can save.
 * Standalone (gtapraha.online / Heroku): Google sign-in, then write the same
 * Firestore path Playful uses — leaderboards/gta-praha/scores.
 */
import { signInWithPopup } from 'firebase/auth';
import { addDoc, collection, Timestamp } from 'firebase/firestore';
import { auth, getFirebaseAuth, getFirebaseFirestore, getGoogleProvider } from './firebase.js';
import { formatDistance } from './finale.js';

export const GAME_ID = 'gta-praha';
export const GAME_NAME = 'GTA Praha';

const GOOGLE_LABEL = 'Continue with Google';
const SAVE_LABEL = 'Save score';
/** Temp: hide Continue with Google in the BUSTED strip. Sign-in code stays wired. */
const SHOW_CONTINUE_WITH_GOOGLE = false;

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

export function isGoogleUser(user = auth.currentUser) {
  return !!(user && !user.isAnonymous);
}

export function displayNameFor(user = auth.currentUser) {
  if (!isGoogleUser(user)) return null;
  return user.displayName || user.email?.split('@')[0] || null;
}

export async function signInWithGoogle() {
  const result = await signInWithPopup(getFirebaseAuth(), getGoogleProvider());
  return result.user;
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
  signIn = signInWithGoogle,
  save = saveHighScore,
  authApi = auth,
  onGoogleSignedIn = null,
} = {}) {
  const panel = root.getElementById?.('high-score-panel') || root.querySelector?.('#high-score-panel');
  const scoreEl = root.getElementById?.('high-score-value');
  const statusEl = root.getElementById?.('high-score-status');
  const googleBtn = root.getElementById?.('high-score-google');
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
    if (googleBtn) googleBtn.disabled = value || saved;
    if (guestSubmit) guestSubmit.disabled = value || saved;
    if (guestName) guestName.disabled = value || saved;
  };

  const showGuestFallback = (show) => {
    if (guestForm) guestForm.hidden = !show;
  };

  /** Hide Continue with Google / Save as guest — used when already signed in. */
  const hideChooser = () => {
    if (googleBtn) googleBtn.hidden = true;
    showGuestFallback(false);
  };

  /** Logged-out chooser: Google primary (when enabled), else guest name only. */
  const showLoggedOutChooser = (scoreOk) => {
    if (googleBtn) {
      googleBtn.hidden = !(scoreOk && SHOW_CONTINUE_WITH_GOOGLE);
      googleBtn.textContent = GOOGLE_LABEL;
      googleBtn.disabled = false;
    }
    // While Google is hidden, offer guest save immediately so scores still ship.
    showGuestFallback(!!scoreOk && !SHOW_CONTINUE_WITH_GOOGLE);
  };

  /** Signed-in retry: single Save score control, no Google/guest pair. */
  const showSaveRetry = () => {
    if (googleBtn) {
      googleBtn.hidden = false;
      googleBtn.textContent = SAVE_LABEL;
      googleBtn.disabled = false;
    }
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

  const onGoogleClick = async () => {
    if (busy || saved || offeredScore <= 0) return;

    // Already signed in: Save score retry (never re-prompt Google/guest).
    if (isGoogleUser(authApi.currentUser)) {
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
      return;
    }

    setBusy(true);
    setStatus('Signing in…');
    showGuestFallback(false);
    try {
      const user = await signIn();
      try { await onGoogleSignedIn?.(user); } catch (err) { console.warn('onGoogleSignedIn failed', err); }
      await persist(user);
    } catch (err) {
      console.error('High score Google sign-in failed:', err);
      setBusy(false);
      setStatus('Google sign-in failed. You can still save with a guest name.', 'error');
      if (googleBtn) {
        googleBtn.hidden = !SHOW_CONTINUE_WITH_GOOGLE;
        googleBtn.textContent = GOOGLE_LABEL;
      }
      showGuestFallback(true);
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
      await persist(authApi.currentUser && isGoogleUser(authApi.currentUser) ? authApi.currentUser : null, name);
    } catch (err) {
      console.error('High score guest save failed:', err);
      setBusy(false);
      setStatus('Could not save score. Try again.', 'error');
    }
  };

  if (googleBtn && !googleBtn.dataset.bound) {
    googleBtn.dataset.bound = '1';
    googleBtn.addEventListener('click', onGoogleClick);
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
    if (googleBtn) {
      googleBtn.hidden = !SHOW_CONTINUE_WITH_GOOGLE;
      googleBtn.disabled = false;
      googleBtn.textContent = GOOGLE_LABEL;
    }
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

    const signedIn = isGoogleUser(authApi.currentUser);

    // Hub path: always notify Playful. If already signed in here, auto-save and
    // skip the Google/guest chooser. Logged-out embeds keep Google as fallback.
    if (isEmbedded()) {
      onEmbedded(score);
      if (signedIn) {
        autoSaveSignedIn(authApi.currentUser);
      } else {
        showLoggedOutChooser(true);
        setStatus(
          SHOW_CONTINUE_WITH_GOOGLE
            ? 'Score sent to Playful — sign in there, or use Google here.'
            : 'Score sent to Playful — sign in there, or save with a guest name here.',
          'info',
        );
      }
      return { embedded: true, score };
    }

    // Standalone: auto-save when already signed in; otherwise Google / guest.
    if (signedIn) {
      autoSaveSignedIn(authApi.currentUser);
    } else {
      showLoggedOutChooser(true);
      setStatus(
        SHOW_CONTINUE_WITH_GOOGLE
          ? 'Save this run with Google to appear on the high-score table.'
          : 'Save this run with a guest name to appear on the high-score table.',
      );
    }

    return { embedded: false, score };
  };

  return { offer, reset, scoreFromDistance };
}
