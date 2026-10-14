/**
 * Name other players see above a car. The typed name wins over the Google
 * profile and is remembered in this browser so the next visit is already filled in.
 */
export const PLAYER_NAME_STORAGE_KEY = 'gta-praha-player-name';

export function cleanPlayerName(value, max = 24) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function storageOf(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function readStoredPlayerName(storage) {
  try {
    return cleanPlayerName(storageOf(storage)?.getItem(PLAYER_NAME_STORAGE_KEY));
  } catch {
    return '';
  }
}

export function writeStoredPlayerName(value, storage) {
  const name = cleanPlayerName(value);
  try {
    const box = storageOf(storage);
    if (!box) return name;
    if (name) box.setItem(PLAYER_NAME_STORAGE_KEY, name);
    else box.removeItem(PLAYER_NAME_STORAGE_KEY);
  } catch {
    // Private mode and blocked storage still let this visit publish the field.
  }
  return name;
}

/** Save a Google profile name only when the player has not typed one. */
export function rememberGoogleName(googleName, storage) {
  if (readStoredPlayerName(storage)) return readStoredPlayerName(storage);
  const google = cleanPlayerName(googleName);
  if (google) writeStoredPlayerName(google, storage);
  return readStoredPlayerName(storage);
}

/** Typed localStorage name, otherwise the Google profile, otherwise empty. */
export function currentPresenceName(googleName = '', storage) {
  return readStoredPlayerName(storage) || cleanPlayerName(googleName);
}

/**
 * Wire the name field. Edits are stored immediately and the next presence
 * publish picks them up. A saved name is written into the field on load.
 */
export function bindPlayerNameField(root = document, { googleName = () => '' } = {}) {
  const input = root.getElementById?.('player-name') || root.querySelector?.('#player-name');

  const prefill = () => {
    const typing = input && input.ownerDocument?.activeElement === input;
    if (typing) return cleanPlayerName(input.value);
    const stored = readStoredPlayerName();
    if (stored) {
      if (input && input.value !== stored) input.value = stored;
      return stored;
    }
    const google = rememberGoogleName(googleName());
    if (google && input) input.value = google;
    return google;
  };

  if (input && !input.dataset.bound) {
    input.dataset.bound = '1';
    const save = () => writeStoredPlayerName(input.value);
    input.addEventListener('input', save);
    input.addEventListener('change', save);
  }

  prefill();
  return { prefill };
}
