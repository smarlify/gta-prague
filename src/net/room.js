/**
 * Demo-room presence: Google sign-in only. Anonymous stays offline.
 * No slots / host election.
 */
import {
  onDisconnect,
  onValue,
  ref,
  remove,
  set,
} from 'firebase/database';
import { ensureAuthUser, getFirebaseAuth } from '../firebase.js';
import { displayNameFor } from '../high-score.js';
import { currentPresenceName } from './player-name.js';
import { getFirebaseRtdb, rtdbConfigured } from './firebase-rtdb.js';
import {
  DEMO_ROOM,
  PLAYERS_PATH,
  canJoinMultiplayer,
  parsePresence,
  remotePlayersFromMap,
  toRtdb,
} from './protocol.js';

function playerPath(uid) {
  return `${PLAYERS_PATH}/${uid}`;
}

export class PresenceRoom {
  constructor(db, roomId, uid) {
    this.db = db;
    this.roomId = roomId;
    this.uid = uid;
    this.players = {};
    this._unsub = null;
    this._joined = false;
  }

  get remotes() {
    return remotePlayersFromMap(this.players, this.uid);
  }

  onlineCount() {
    return Object.keys(this.players).length;
  }

  listen() {
    if (this._unsub) return;
    this._unsub = onValue(ref(this.db, PLAYERS_PATH), (snap) => {
      this.players = snap.val() || {};
    });
  }

  async publishPlayer(presence) {
    if (!this._joined) return;
    const row = parsePresence(presence, this.uid);
    if (!row || row.uid !== this.uid) return;
    try {
      await set(ref(this.db, playerPath(this.uid)), toRtdb(row));
    } catch (err) {
      console.warn('publishPlayer failed', err);
    }
  }

  async leave() {
    this.dispose();
    try {
      await remove(ref(this.db, playerPath(this.uid)));
    } catch (err) {
      console.warn('leave room failed', err);
    }
    this._joined = false;
  }

  dispose() {
    if (this._unsub) {
      this._unsub();
      this._unsub = null;
    }
  }
}

/**
 * Join demo room when the current user has a uid and RTDB is configured.
 * @returns {Promise<{ kind: 'solo' } | { kind: 'joined', room: PresenceRoom }>}
 */
export async function joinDemoRoom(user = getFirebaseAuth().currentUser) {
  if (!rtdbConfigured()) return { kind: 'solo' };
  if (!canJoinMultiplayer(user)) return { kind: 'solo' };
  try {
    const db = getFirebaseRtdb();
    const uid = user.uid;
    const room = new PresenceRoom(db, DEMO_ROOM, uid);
    const rowRef = ref(db, playerPath(uid));
    await onDisconnect(rowRef).remove();
    // Seed a minimal row so peers see the join immediately.
    await set(rowRef, toRtdb({
      uid,
      name: currentPresenceName(displayNameFor(user) || '') || 'Driver',
      x: 0,
      z: 0,
      heading: 0,
      speed: 0,
      mode: 'car',
      vehicle: { type: 'crossover' },
      wanted: { level: 0, heat: 0, status: 'CLEAR', busted: false },
      police: [],
      updatedAt: Date.now(),
    }));
    room._joined = true;
    room.listen();
    return { kind: 'joined', room };
  } catch (err) {
    console.warn('joinDemoRoom failed', err);
    return { kind: 'solo' };
  }
}

/**
 * Join the demo room for a Google-signed user.
 * Anonymous auth is not enough to publish.
 */
export async function goOnline({
  ensureUser = ensureAuthUser,
  authUser = () => {
    try {
      return getFirebaseAuth().currentUser;
    } catch {
      return null;
    }
  },
  join = joinDemoRoom,
} = {}) {
  let user = authUser();
  if (!canJoinMultiplayer(user)) {
    try {
      user = await ensureUser();
    } catch (err) {
      console.warn('Go online auth failed', err);
      return { kind: 'solo' };
    }
  }
  if (!canJoinMultiplayer(user)) return { kind: 'solo' };
  return join(user);
}
