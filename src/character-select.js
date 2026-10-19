// Welcome-card choice: which car is parked for the camera and for Start, and
// which name the local player publishes. Nothing chosen means the Roadster.
import {locationPageTitle} from './worldhood-brand.js';

export const CHARACTER_STORAGE_KEY = 'gta-praha-character';

export const CHARACTERS = Object.freeze([
  Object.freeze({
    id: 'filip',
    label: 'Mercedes G — Filip Turek',
    name: 'Filip Turek',
    type: 'gwagen',
    flies: false,
    pavlova: true,
  }),
  Object.freeze({
    id: 'elon',
    label: 'Roadster — Elon Musk',
    name: 'Elon Musk',
    type: 'roadster',
    flies: true,
    pavlova: false,
  }),
  Object.freeze({
    id: 'dave',
    label: 'Škoda Scala — Dave N.',
    name: 'Dave N.',
    type: 'scala',
    flies: false,
    pavlova: false,
  }),
]);

export const DEFAULT_CHARACTER_ID = 'elon';

export function characterById(id) {
  return CHARACTERS.find((choice) => choice.id === id) || CHARACTERS.find((choice) => choice.id === DEFAULT_CHARACTER_ID);
}

function storageOf(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

export function readCharacterId(storage) {
  try {
    const id = storageOf(storage)?.getItem(CHARACTER_STORAGE_KEY);
    return CHARACTERS.some((choice) => choice.id === id) ? id : DEFAULT_CHARACTER_ID;
  } catch {
    return DEFAULT_CHARACTER_ID;
  }
}

export function readCharacter(storage) {
  return characterById(readCharacterId(storage));
}

export function writeCharacterId(storage, id) {
  const choice = characterById(id);
  try {
    storageOf(storage)?.setItem(CHARACTER_STORAGE_KEY, choice.id);
  } catch {
    // A private window still keeps the choice for this visit via the caller.
  }
  return choice;
}

/** Leftover test rows were published under this placeholder. Real names stay. */
export function isIdleDriverName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === 'driver';
}

export function isIdleDriverRecord(value) {
  if (!value || typeof value !== 'object') return false;
  const raw = typeof value.name === 'string' ? value.name : '';
  const name = raw.replace(/\s+/g, ' ').trim();
  return !name || isIdleDriverName(name);
}

/** Never publish the placeholder. An empty or Driver name becomes the chosen character, or Elon. */
export function publishablePlayerName(name, fallback = characterById(DEFAULT_CHARACTER_ID).name) {
  const clean = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 48);
  if (!clean || isIdleDriverName(clean)) return fallback;
  return clean;
}

export function playerPageTitle(name, place) {
  const who = publishablePlayerName(name);
  return `${who} · ${locationPageTitle(place)}`;
}

export function bindCharacterPicker({
  doc = document,
  storage,
  onChange,
} = {}) {
  const root = doc.getElementById?.('character-picker');
  let current = readCharacter(storage);
  const buttons = root ? [...root.querySelectorAll('[data-character]')] : [];

  function paint() {
    for (const button of buttons) {
      const on = button.dataset.character === current.id;
      button.setAttribute('aria-checked', on ? 'true' : 'false');
    }
  }

  function choose(id) {
    current = writeCharacterId(storage, id);
    paint();
    onChange?.(current);
    return current;
  }

  for (const button of buttons) {
    if (button.dataset.bound) continue;
    button.dataset.bound = '1';
    button.addEventListener('click', () => choose(button.dataset.character));
  }

  paint();
  onChange?.(current);
  return { get: () => current, choose };
}
