// Welcome-card choice: which car is parked for the camera and for Start, and
// which name the local player publishes. Nothing in the address rolls one of the three.
// The card cycles that choice with the same ‹ › row as the district and street.
import {rollIndex, slug} from './cities.js';
import {cycleIndex} from './start-picker.js';
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

/** The choice `step` places away. -1 from Filip is Dave, and +1 from Dave is Filip. */
export function cycleCharacter(id, step) {
  const index = CHARACTERS.findIndex((choice) => choice.id === id);
  return CHARACTERS[cycleIndex(CHARACTERS.length, index, step)];
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

// ?driver= values, same slug style as ?start= / ?time= / ?weather=.
const DRIVER_QUERY = {
  elon: 'elon',
  'elon-musk': 'elon',
  turek: 'filip',
  'filip-turek': 'filip',
  filip: 'filip',
  dave: 'dave',
  'dave-n': 'dave',
};

/** The character named by ?driver=, or null when the param is missing or unknown. */
export function driverFromSearch(search = '') {
  const raw = new URLSearchParams(search).get('driver');
  if (raw == null) return null;
  const id = DRIVER_QUERY[slug(raw)];
  return id ? characterById(id) : null;
}

/**
 * A known ?driver= pins that choice.
 * A missing param rolls Filip, Elon, or Dave once and does not read the saved driver.
 * An unknown value stays on the Roadster.
 */
export function resolveDriver(search = '', storage, roll = Math.random) {
  void storage;
  const params = new URLSearchParams(search);
  if (!params.has('driver')) return CHARACTERS[rollIndex(CHARACTERS.length, roll)];
  return driverFromSearch(search) || characterById(DEFAULT_CHARACTER_ID);
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
  initial,
  onChange,
} = {}) {
  const root = doc.getElementById?.('character-picker');
  let current = initial ? characterById(initial) : readCharacter(storage);
  const buttons = root ? [...root.querySelectorAll('[data-character]')] : [];
  const label = doc.getElementById?.('character-label');
  const prev = doc.getElementById?.('character-prev');
  const next = doc.getElementById?.('character-next');

  function paint() {
    for (const button of buttons) {
      const on = button.dataset.character === current.id;
      button.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    if (label) label.textContent = current.label;
  }

  function choose(id) {
    current = writeCharacterId(storage, id);
    paint();
    onChange?.(current);
    return current;
  }

  function step(direction) {
    if (!direction) return current;
    return choose(cycleCharacter(current.id, direction).id);
  }

  for (const button of buttons) {
    if (button.dataset.bound) continue;
    button.dataset.bound = '1';
    button.addEventListener('click', () => choose(button.dataset.character));
  }

  // Same as the place arrows: a click (detail > 0) blurs so Enter still starts
  // the game. ←/→ on a focused car arrow cycles the car and stops, so the
  // place row keeps its own arrows.
  const arrow = (button, direction) => {
    if (!button || button.dataset.bound) return;
    button.dataset.bound = '1';
    button.addEventListener('click', (event) => {
      if (event?.detail > 0) button.blur?.();
      step(direction);
    });
    button.addEventListener('keydown', (event) => {
      const keyStep = event.code === 'ArrowLeft' ? -1 : event.code === 'ArrowRight' ? 1 : 0;
      if (!keyStep) return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) step(keyStep);
    });
  };
  arrow(prev, -1);
  arrow(next, 1);

  paint();
  onChange?.(current);
  return { get: () => current, choose, step };
}
