/**
 * Small HUD control: Online · N opens the room list; Go online rejoins.
 * The button does not leave the demo room.
 */
import { rtdbConfigured } from './firebase-rtdb.js';

function presenceName(row) {
  const name = typeof row?.name === 'string' ? row.name.trim() : '';
  return name || 'Driver';
}

function snapshotRows(players, selfUid) {
  const map = players && typeof players === 'object' ? players : {};
  const self = typeof selfUid === 'string' ? selfUid : '';
  return Object.entries(map).map(([key, row]) => {
    const uid = (row && typeof row.uid === 'string' && row.uid) || key;
    return {
      name: presenceName(row),
      you: !!self && uid === self,
    };
  });
}

function rowLabel(row) {
  return row.you ? `${row.name} (you)` : row.name;
}

function renderPlayers(panel, root, rows) {
  if (!panel) return;
  if (typeof root.createElement === 'function' && typeof panel.replaceChildren === 'function') {
    const items = rows.map((row) => {
      const li = root.createElement('li');
      li.textContent = rowLabel(row);
      if (row.you && li.dataset) li.dataset.you = '1';
      return li;
    });
    panel.replaceChildren(...items);
    return;
  }
  panel.textContent = rows.map(rowLabel).join('\n');
}

export function bindOnlineHud(root = document, {
  onGoOnline = async () => ({ kind: 'solo' }),
  isOnline = () => false,
  onlineCount = () => 0,
  players = () => ({}),
  selfUid = () => '',
} = {}) {
  const btn = root.getElementById?.('online-btn') || root.querySelector?.('#online-btn');
  const label = root.getElementById?.('online-label') || root.querySelector?.('#online-label');
  const panel = root.getElementById?.('online-players') || root.querySelector?.('#online-players');
  if (!btn) return { refresh() {}, setBusy() {} };

  let busy = false;
  let open = false;

  const paintList = () => {
    renderPlayers(panel, root, snapshotRows(players(), selfUid()));
  };

  const setOpen = (next) => {
    open = !!next && isOnline();
    if (panel) panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) paintList();
  };

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
      ? 'Who is in the demo room'
      : 'Rejoin the demo multiplayer room';
    if (!online) setOpen(false);
    else if (open) paintList();
  };

  const setBusy = (value) => {
    busy = !!value;
    refresh();
  };

  const onButtonClick = async (event) => {
    event?.stopPropagation?.();
    if (busy) return;
    if (isOnline()) {
      setOpen(!open);
      return;
    }
    setBusy(true);
    try {
      await onGoOnline();
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const onRootClick = (event) => {
    if (!open) return;
    const target = event?.target;
    if (!target || target === btn) return;
    if (typeof btn.contains === 'function' && btn.contains(target)) return;
    if (panel && (target === panel || (typeof panel.contains === 'function' && panel.contains(target)))) return;
    setOpen(false);
  };

  if (!btn.dataset.bound) {
    btn.dataset.bound = '1';
    btn.addEventListener('click', onButtonClick);
    root.addEventListener?.('click', onRootClick);
  }

  refresh();
  return { refresh, setBusy };
}
