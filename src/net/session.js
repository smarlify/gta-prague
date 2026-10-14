/**
 * Multiplayer session glue: auto-join demo room, throttled publish, remotes.
 */
import { onAuthStateChanged } from 'firebase/auth';
import { ensureAuthUser, getFirebaseAuth } from '../firebase.js';
import { displayNameFor } from '../high-score.js';
import { PLAYER_HZ, buildPresence, canJoinMultiplayer } from './protocol.js';
import { rtdbConfigured } from './firebase-rtdb.js';
import { goOnline, joinDemoRoom } from './room.js';
import { createRemotePresence } from './remote-presence.js';
import { bindOnlineHud } from './online-hud.js';

function paintHex(group) {
  let paint = null;
  group?.traverse?.((o) => {
    if (!paint && o.isMesh && o.material?.name === 'paint' && o.material.color) paint = o.material;
  });
  return paint ? `#${paint.color.getHexString()}` : null;
}

export function vehicleFromTravel(travel, playerCars) {
  if (!travel || travel.mode !== 'car') return null;
  const visual = travel.car?.visual || {};
  const type = visual.type || playerCars?.group?.userData?.type || 'crossover';
  let colour = visual.paint;
  if (colour && typeof colour === 'object' && typeof colour.getStyle === 'function') {
    colour = colour.getStyle();
  }
  if (!colour || typeof colour !== 'string') colour = paintHex(playerCars?.group) || '#c5c9ce';
  return { type, colour };
}

export function createMultiplayerSession(scene, {
  getTravel = () => null,
  getPolice = () => null,
  getPlayerCars = () => null,
  doc = document,
} = {}) {
  const remotes = createRemotePresence(scene);
  let room = null;
  let publishAcc = 0;
  let authUnsub = null;
  let lastHudKey = '';

  const isOnline = () => !!room;
  const onlineCount = () => (room ? room.onlineCount() : 0);

  const leave = async () => {
    if (room) {
      await room.leave();
      room = null;
    }
    remotes.clear();
    hud.refresh();
  };

  const join = async () => {
    if (!rtdbConfigured()) return;
    const result = await goOnline();
    if (result.kind !== 'joined') return;
    if (room) await room.leave();
    room = result.room;
    hud.refresh();
  };

  const hud = bindOnlineHud(doc, {
    isOnline,
    onlineCount,
    onGoOnline: join,
    onGoOffline: leave,
  });

  try {
    if (rtdbConfigured()) {
      void ensureAuthUser().catch((err) => console.warn('multiplayer auth failed', err));
    }
    authUnsub = onAuthStateChanged(getFirebaseAuth(), async (user) => {
      if (!canJoinMultiplayer(user)) {
        await leave();
        return;
      }
      // Temp default: auto-join demo for every authenticated uid (incl. anonymous).
      if (!room) {
        const result = await joinDemoRoom(user);
        if (result.kind === 'joined') room = result.room;
      }
      hud.refresh();
    });
  } catch {
    // Scoreboard env missing — HUD stays hidden via rtdbConfigured.
  }

  return {
    isOnline,
    onlineCount,
    remotes,
    async ensureJoinedIfSignedIn() {
      const user = (() => {
        try { return getFirebaseAuth().currentUser; } catch { return null; }
      })();
      if (!rtdbConfigured() || !canJoinMultiplayer(user) || room) return;
      const result = await joinDemoRoom(user);
      if (result.kind === 'joined') {
        room = result.room;
        hud.refresh();
      }
    },
    /** Call when high-score Google sign-in succeeds mid-session. */
    async onGoogleSignedIn() {
      await this.ensureJoinedIfSignedIn();
    },
    step(dt, { paused = false } = {}) {
      if (room && !paused) {
        remotes.update(room.remotes, dt);
        publishAcc += dt;
        if (publishAcc >= 1 / PLAYER_HZ) {
          publishAcc = 0;
          const travel = getTravel();
          const actor = travel?.actor || travel?.car;
          const police = getPolice();
          const snap = police?.snapshot?.();
          const presence = buildPresence({
            uid: room.uid,
            name: displayNameFor() || 'Driver',
            x: actor?.x,
            z: actor?.z,
            heading: actor?.heading,
            speed: actor?.speed,
            mode: travel?.mode || 'car',
            vehicle: vehicleFromTravel(travel, getPlayerCars()),
            wanted: snap
              ? { level: snap.level, heat: snap.heat, status: snap.status, busted: snap.busted }
              : null,
            police: snap?.level > 0 ? snap.units : [],
          });
          if (presence) void room.publishPlayer(presence);
        }
      } else if (!room) {
        remotes.clear();
      }
      const hudKey = `${isOnline()}:${onlineCount()}`;
      if (hudKey !== lastHudKey) {
        lastHudKey = hudKey;
        hud.refresh();
      }
    },
    async dispose() {
      if (authUnsub) authUnsub();
      await leave();
    },
  };
}
