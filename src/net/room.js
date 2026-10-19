/**
 * Demo-room presence: any authenticated uid (incl. anonymous) may join.
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
import { publishablePlayerName } from '../character-select.js';
import { currentPresenceName } from './player-name.js';
import { getFirebaseRtdb, rtdbConfigured } from './firebase-rtdb.js';
import {
  DEMO_ROOM,
  PLAYERS_PATH,
  canJoinMultiplayer,
  onlinePlayerCount,
  parsePresence,
  playerPresencePath,
  presenceIdentity,
  presenceSessionId,
  remotePlayersFromMap,
  toRtdb,
} from './protocol.js';

export class PresenceRoom {
  constructor(db, roomId, authUid, sessionId = presenceSessionId()) {
    this.db = db;
    this.roomId = roomId;
    this.authUid = authUid;
    this.sessionId = sessionId;
    this.uid = presenceIdentity(authUid, sessionId);
    this.players = {};
    this._unsub = null;
    this._joined = false;
  }

  path() {
    return playerPresencePath(this.authUid, this.sessionId);
  }

  get remotes() {
    return remotePlayersFromMap(this.players, this.uid);
  }

  onlineCount() {
    return onlinePlayerCount(this.players, this.uid);
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
      await set(ref(this.db, this.path()), toRtdb(row));
    } catch (err) {
      console.warn('publishPlayer failed', err);
    }
  }

  async leave() {
    this.dispose();
    try {
      await remove(ref(this.db, this.path()));
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
 * `name` seeds presence.name (typed / localStorage / the chosen character).
 * @returns {Promise<{ kind: 'solo' } | { kind: 'joined', room: PresenceRoom }>}
 */
export async function joinDemoRoom(user = getFirebaseAuth().currentUser, { name, sessionId } = {}) {
  if (!rtdbConfigured()) return { kind: 'solo' };
  if (!canJoinMultiplayer(user)) return { kind: 'solo' };
  try {
    const db = getFirebaseRtdb();
    const room = new PresenceRoom(db, DEMO_ROOM, user.uid, sessionId);
    const rowPath = room.path();
    if (!room.uid || !rowPath || rowPath === PLAYERS_PATH) return { kind: 'solo' };
    const rowRef = ref(db, rowPath);
    const seedName = publishablePlayerName(
      (typeof name === 'string' && name.trim())
        ? name
        : currentPresenceName(displayNameFor(user) || ''),
    );
    await onDisconnect(rowRef).remove();
    // Seed a minimal row so peers see the join immediately.
    await set(rowRef, toRtdb({
      uid: room.uid,
      name: seedName,
      x: 0,
      z: 0,
      heading: 0,
      speed: 0,
      mode: 'car',
      vehicle: { type: 'roadster' },
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
 * Join the demo room for the current authenticated user (incl. anonymous).
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
  name,
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
  return join(user, { name });
}
