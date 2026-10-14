/**
 * Shared Smarlify scoreboard backend (same project as Playful / Traffic Run / Crossy Road).
 * Client config comes from VITE_SCOREBOARD_* at build time (Heroku config / local .env).
 */
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

function readConfig() {
  const env = import.meta.env || {};
  return {
    apiKey: env.VITE_SCOREBOARD_WEB_KEY,
    authDomain: env.VITE_SCOREBOARD_AUTH_HOST,
    projectId: env.VITE_SCOREBOARD_PROJECT,
    storageBucket: env.VITE_SCOREBOARD_BUCKET,
    messagingSenderId: env.VITE_SCOREBOARD_SENDER,
    appId: env.VITE_SCOREBOARD_APP,
    measurementId: env.VITE_SCOREBOARD_MEASUREMENT,
  };
}

let app;
let authInstance;
let firestoreInstance;
let googleProviderInstance;

export function ensureApp() {
  if (app) return app;
  const config = readConfig();
  if (!config.apiKey || !config.projectId) {
    throw new Error('Scoreboard backend is not configured. Set VITE_SCOREBOARD_* (see .env.example).');
  }
  // Include databaseURL when present so Auth/Firestore and RTDB share one app.
  const databaseURL = (import.meta.env || {}).VITE_SCOREBOARD_DATABASE_URL
    || (import.meta.env || {}).VITE_MULTIPLAYER_DATABASE_URL;
  if (databaseURL) config.databaseURL = databaseURL;
  app = getApps().length ? getApp() : initializeApp(config);
  authInstance = getAuth(app);
  firestoreInstance = getFirestore(app);
  googleProviderInstance = new GoogleAuthProvider();
  return app;
}

export function getFirebaseAuth() {
  ensureApp();
  return authInstance;
}

export function getFirebaseFirestore() {
  ensureApp();
  return firestoreInstance;
}

export function getGoogleProvider() {
  ensureApp();
  return googleProviderInstance;
}

/** Lazy currentUser accessor so unit tests can import high-score without scoreboard env. */
export const auth = {
  get currentUser() {
    try {
      return getFirebaseAuth().currentUser;
    } catch {
      return null;
    }
  },
};

export default { ensureApp, getFirebaseAuth, getFirebaseFirestore, getGoogleProvider, auth };
