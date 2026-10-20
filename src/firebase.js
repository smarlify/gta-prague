/**
 * Shared Smarlify scoreboard backend (same project as Playful / Traffic Run / Crossy Road).
 * Client config comes from VITE_SCOREBOARD_* at build time (Heroku config / local .env).
 */
import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

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
let storageInstance;
let googleProviderInstance;
let billboardServices;

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

export function getFirebaseStorage() {
  ensureApp();
  if (!storageInstance) storageInstance = getStorage(app);
  return storageInstance;
}

export function getGoogleProvider() {
  ensureApp();
  return googleProviderInstance;
}

// A second app so a Google advertiser sign-in does not replace the game's anonymous player.
export function billboardFirebase() {
  if (billboardServices) return billboardServices;
  const config = readConfig();
  if (!config.apiKey || !config.projectId) {
    throw new Error('Scoreboard backend is not configured. Set VITE_SCOREBOARD_* (see .env.example).');
  }
  const databaseURL = (import.meta.env || {}).VITE_SCOREBOARD_DATABASE_URL
    || (import.meta.env || {}).VITE_MULTIPLAYER_DATABASE_URL;
  if (databaseURL) config.databaseURL = databaseURL;
  const existing = getApps().find((item) => item.name === 'billboards');
  const secondary = existing || initializeApp(config, 'billboards');
  billboardServices = {
    auth: getAuth(secondary),
    firestore: getFirestore(secondary),
    storage: getStorage(secondary),
    provider: new GoogleAuthProvider(),
  };
  return billboardServices;
}

/**
 * Return the current Firebase user, signing in anonymously when none is present.
 * Used so demo-room multiplayer can auto-join without a Google popup.
 */
export async function ensureAuthUser() {
  const authApi = getFirebaseAuth();
  if (authApi.currentUser) return authApi.currentUser;
  const cred = await signInAnonymously(authApi);
  return cred.user;
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

export default { ensureApp, getFirebaseAuth, getFirebaseFirestore, getFirebaseStorage, getGoogleProvider, ensureAuthUser, auth };
