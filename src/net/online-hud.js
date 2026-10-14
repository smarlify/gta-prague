/**
 * Small HUD control: Go online (Google) / online count / Go offline.
 * Does not force sign-in to play — multiplayer is opt-in.
 */
import { rtdbConfigured } from './firebase-rtdb.js';

export function bindOnlineHud(root = document, {
  onGoOnline = async () => ({ kind: 'solo' }),
  onGoOffline = async () => {},
  isOnline = () => false,
  onlineCount = () => 0,
} = {}) {
  const btn = root.getElementById?.('online-btn') || root.querySelector?.('#online-btn');
  const label = root.getElementById?.('online-label') || root.querySelector?.('#online-label');
  if (!btn) return { refresh() {}, setBusy() {} };

  let busy = false;

  const refresh = () => {
    const configured = rtdbConfigured();
    btn.hidden = !configured;
    if (!configured) return;
    const online = isOnline();
    const n = onlineCount();
    btn.disabled = busy;
    btn.dataset.online = online ? '1' : '0';
    btn.setAttribute('aria-pressed', online ? 'true' : 'false');
    if (label) {
      label.textContent = busy
        ? '…'
        : online
          ? `Online · ${n}`
          : 'Go online';
    }
    btn.title = online
      ? 'Leave the demo multiplayer room'
      : 'Sign in with Google to see other drivers in the demo room';
  };

  const setBusy = (value) => {
    busy = !!value;
    refresh();
  };

  if (!btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      if (busy) return;
      setBusy(true);
      try {
        if (isOnline()) await onGoOffline();
        else await onGoOnline();
      } finally {
        setBusy(false);
        refresh();
      }
    });
  }

  refresh();
  return { refresh, setBusy };
}
