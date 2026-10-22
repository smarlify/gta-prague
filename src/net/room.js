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
  playersPathFor,
  presenceIdentity,
  presenceJoinAllowed,
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
    return playerPresencePath(this.authUid, this.sessionId, this.roomId);
  }

  get remotes() {
    return remotePlayersFromMap(this.players, this.uid);
  }

  onlineCount() {
    return onlinePlayerCount(this.players, this.uid);
  }

  listen() {
    if (this._unsub) return;
    this._unsub = onValue(ref(this.db, playersPathFor(this.roomId)), (snap) => {
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
function safeCurrentUser() {
  try {
    return getFirebaseAuth().currentUser;
  } catch {
    return null;
  }
}

export async function joinDemoRoom(user = null, {
  name,
  sessionId,
  roomId = DEMO_ROOM,
  db = null,
  write = null,
  search = '',
  webdriver = false,
} = {}) {
  // The test runner must not touch the live demo room, even if a database
  // handle was injected. A fake write uses some other room id.
  if (roomId === DEMO_ROOM && !presenceJoinAllowed({ search, webdriver })) {
    return { kind: 'solo' };
  }
  const current = user || safeCurrentUser();
  if (!canJoinMultiplayer(current)) return { kind: 'solo' };
  if (!db && !rtdbConfigured()) return { kind: 'solo' };
  try {
    const database = db || getFirebaseRtdb();
    const room = new PresenceRoom(database, roomId, current.uid, sessionId);
    const rowPath = room.path();
    if (!room.uid || !rowPath || rowPath === PLAYERS_PATH || !rowPath.includes(`/rooms/${roomId}/`)) {
      return { kind: 'solo' };
    }
    const seedName = publishablePlayerName(
      (typeof name === 'string' && name.trim())
        ? name
        : currentPresenceName(displayNameFor(current) || ''),
    );
    const row = toRtdb({
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
    });
    if (write) {
      await write(rowPath, row);
    } else {
      const rowRef = ref(database, rowPath);
      await onDisconnect(rowRef).remove();
      await set(rowRef, row);
    }
    room._joined = true;
    if (!write) room.listen();
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
  search = '',
  webdriver = false,
} = {}) {
  if (!presenceJoinAllowed({ search, webdriver })) return { kind: 'solo' };
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
  return join(user, { name, search, webdriver });
}
