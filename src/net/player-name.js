/**
 * Name other players see above a car. The live #player-name field wins over the
 * Google profile and is remembered in this browser.
 *
 * That field is the driver select: its value is the character id, and the
 * selected option's data-name is the name that gets published. A plain text
 * field, if one is still passed in, publishes what was typed.
 *
 * localStorage can fail (private mode / blocked storage); an in-memory
 * fallback keeps the name on the presence row for this tab.
 */
export const PLAYER_NAME_STORAGE_KEY = 'gta-praha-player-name';

/** Session fallback when localStorage is missing or throws. */
let memoryName = '';

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
    const box = storageOf(storage);
    if (box) {
      const fromStore = cleanPlayerName(box.getItem(PLAYER_NAME_STORAGE_KEY));
      if (fromStore) {
        memoryName = fromStore;
        return fromStore;
      }
      // Caller passed a storage object that is simply empty — do not leak the
      // in-memory fallback (keeps unit tests isolated).
      if (storage) return '';
    }
  } catch {
    // fall through to memory
  }
  return cleanPlayerName(memoryName);
}

export function writeStoredPlayerName(value, storage) {
  const name = cleanPlayerName(value);
  memoryName = name;
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

/** Typed / remembered name, otherwise the Google profile, otherwise empty. */
export function currentPresenceName(googleName = '', storage) {
  return readStoredPlayerName(storage) || cleanPlayerName(googleName);
}

/**
 * Resolve the name that must go on the presence row.
 * Live input wins (and is flushed to storage), then localStorage/memory, then Google.
 */
export function resolvePresenceName({
  inputValue = '',
  googleName = '',
  storage,
} = {}) {
  const typed = cleanPlayerName(inputValue);
  if (typed) return writeStoredPlayerName(typed, storage);
  return currentPresenceName(googleName, storage);
}

function isSelectField(input) {
  return String(input?.tagName || '').toUpperCase() === 'SELECT';
}

/** Published name for a driver select: the option's data-name, never the id. */
function selectedOptionName(input) {
  const option = input?.selectedOptions?.[0] || input?.options?.[input.selectedIndex];
  const named = option?.dataset?.name || option?.getAttribute?.('data-name') || '';
  return cleanPlayerName(named);
}

function fieldName(input) {
  if (!input) return '';
  if (isSelectField(input)) return selectedOptionName(input);
  return cleanPlayerName(input.value);
}

/**
 * Wire the name field. A driver select publishes the selected driver's name.
 * A text field still stores what was typed. `onNameChange` fires after each
 * save so the session can republish immediately.
 */
export function bindPlayerNameField(root = document, {
  googleName = () => '',
  onNameChange = null,
} = {}) {
  const input = root.getElementById?.('player-name') || root.querySelector?.('#player-name');

  const getName = () => resolvePresenceName({
    inputValue: fieldName(input),
    googleName: googleName(),
  });

  const prefill = () => {
    if (isSelectField(input)) {
      const named = selectedOptionName(input);
      if (named) return writeStoredPlayerName(named);
      return currentPresenceName(googleName());
    }
    const typing = input && input.ownerDocument?.activeElement === input;
    if (typing) {
      const live = cleanPlayerName(input.value);
      if (live) writeStoredPlayerName(live);
      return live || currentPresenceName(googleName());
    }
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
    const save = () => {
      const name = writeStoredPlayerName(isSelectField(input) ? selectedOptionName(input) : input.value);
      try { onNameChange?.(name); } catch { /* ignore listener errors */ }
    };
    input.addEventListener('input', save);
    input.addEventListener('change', save);
  }

  prefill();
  return { prefill, getName };
}
