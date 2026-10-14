/**
 * Realtime Database handle beside the shared Auth / Firestore scoreboard app.
 * Uses VITE_SCOREBOARD_DATABASE_URL (or VITE_MULTIPLAYER_DATABASE_URL) on smarlify-api.
 */
import { getDatabase } from 'firebase/database';
import { ensureApp } from '../firebase.js';

function databaseURL() {
  const env = import.meta.env || {};
  return env.VITE_SCOREBOARD_DATABASE_URL
    || env.VITE_MULTIPLAYER_DATABASE_URL
    || '';
}

export function rtdbConfigured() {
  return !!databaseURL();
}

let dbInstance;

export function getFirebaseRtdb() {
  const url = databaseURL();
  if (!url) {
    throw new Error('Realtime Database URL is not configured. Set VITE_SCOREBOARD_DATABASE_URL.');
  }
  if (!dbInstance) {
    dbInstance = getDatabase(ensureApp(), url);
  }
  return dbInstance;
}

/** Test helper — clears the cached Database instance. */
export function _resetRtdbForTests() {
  dbInstance = undefined;
}
