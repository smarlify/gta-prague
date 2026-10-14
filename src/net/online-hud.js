/**
 * Small HUD control: Online · N (click to leave) / Go online (rejoin).
 * Temp default auto-joins; toggle leaves or rejoins without requiring Google.
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
      ? 'Go offline — leave the demo multiplayer room'
      : 'Rejoin the demo multiplayer room';
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
