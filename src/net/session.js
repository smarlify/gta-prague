/**
 * Multiplayer session glue: auto-join demo room, throttled publish, remotes.
 */
import { onAuthStateChanged } from 'firebase/auth';
import { ensureAuthUser, getFirebaseAuth } from '../firebase.js';
import { displayNameFor } from '../high-score.js';
import { publishablePlayerName } from '../character-select.js';
import { bindPlayerNameField, rememberGoogleName } from './player-name.js';
import { applyCrashImpulse } from '../crash-physics.js';
import {
  buildPresence,
  canJoinMultiplayer,
  presencePublishHz,
  presencePublishes,
} from './protocol.js';
import { rtdbConfigured } from './firebase-rtdb.js';
import { goOnline, joinDemoRoom } from './room.js';
import { createRemotePresence } from './remote-presence.js';
import { bindOnlineHud } from './online-hud.js';
import { ARREST_RANGE } from '../driver-starts.js';

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
  if (visual.police || visual.type === 'police') {
    return {
      type: 'police',
      police: true,
      livery: visual.livery || 'praha',
      variant: visual.variant === 'van' ? 'van' : 'estate',
    };
  }
  const type = visual.type || playerCars?.group?.userData?.type || 'roadster';
  let colour = visual.paint;
  if (colour && typeof colour === 'object' && typeof colour.getStyle === 'function') {
    colour = colour.getStyle();
  }
  if (!colour || typeof colour !== 'string') colour = paintHex(playerCars?.group) || '#c5c9ce';
  return { type, colour };
}

function arrestFrom(block, busted) {
  const scene = block?.arrest;
  if (scene) {
    return {
      active: true,
      phase: scene.doorAt != null ? 'cuff' : 'reach',
      t: scene.t || 0,
    };
  }
  if (busted) return { active: true, phase: 'bust', t: 0 };
  return { active: false, phase: 'idle', t: 0 };
}

export function createMultiplayerSession(scene, {
  getTravel = () => null,
  getPolice = () => null,
  getPlayerCars = () => null,
  getRoadblock = () => null,
  getCar = () => null,
  getSiren = () => false,
  getAmbulances = () => [],
  getPeerArrest = () => null,
  onPeerArrest = () => {},
  doc = document,
} = {}) {
  const remotes = createRemotePresence(scene);
  let room = null;
  let authUnsub = null;
  let lastHudKey = '';
  let afkSince = 0;
  let lastPublishMs = 0;
  let pendingImpulse = null;
  const appliedImpulses = new Map();
  let beatTimer = null;
  /** Force the next step() to publish even before the Hz interval (name edits). */
  let publishSoon = false;
  /** Filled after `api` exists so the name field can trigger an immediate publish. */
  let requestNamePublish = () => { publishSoon = true; };

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
    const result = await goOnline({ name: presenceName() });
    if (result.kind !== 'joined') return;
    if (room) await room.leave();
    room = result.room;
    hud.refresh();
  };

  const hud = bindOnlineHud(doc, {
    isOnline,
    onlineCount,
    players: () => (room ? room.players : {}),
    selfUid: () => (room ? room.uid : ''),
    onGoOnline: join,
  });

  const names = bindPlayerNameField(doc, {
    googleName: () => {
      try { return displayNameFor() || ''; } catch { return ''; }
    },
    onNameChange: () => { requestNamePublish(); },
  });
  const presenceName = () => publishablePlayerName(names.getName());

  const api = {
    isOnline,
    onlineCount,
    remotes,
    livePlayers() {
      return (room?.remotes || []).filter((row) => Number.isFinite(row.x) && Number.isFinite(row.z));
    },
    async ensureJoinedIfSignedIn() {
      const user = (() => {
        try { return getFirebaseAuth().currentUser; } catch { return null; }
      })();
      if (!rtdbConfigured() || !canJoinMultiplayer(user) || room) return;
      const result = await joinDemoRoom(user, { name: presenceName() });
      if (result.kind === 'joined') {
        room = result.room;
        hud.refresh();
      }
    },
    /** Call when high-score email sign-in succeeds mid-session. */
    async onAccountSignedIn() {
      await this.ensureJoinedIfSignedIn();
    },
    publishCrash(impulse) {
      if (!impulse?.uid) return;
      pendingImpulse = { ...impulse, at: impulse.at || Date.now() };
    },
    step(dt, { paused = false, afk = false, busted = false } = {}) {
      if (!room) {
        remotes.clear();
        afkSince = 0;
      } else {
        const simDt = Number.isFinite(dt) ? Math.max(0, dt) : 0;
        remotes.update(room.remotes, simDt);
        const now = Date.now();
        for (const remote of room.remotes) {
          const hit = remote.impulse;
          if (!hit || hit.uid !== room.uid) continue;
          const key = `${remote.uid}:${hit.at}`;
          if (appliedImpulses.has(key)) continue;
          appliedImpulses.set(key, hit.at);
          const car = getCar();
          if (car) applyCrashImpulse(car, hit);
        }
        for (const [key, at] of appliedImpulses) {
          if (now - at > 4000) appliedImpulses.delete(key);
        }
        if (!busted) {
          const me = getTravel()?.actor;
          for (const remote of room.remotes) {
            if (remote.arrest?.target !== room.uid || !remote.siren || !remote.vehicle?.police) continue;
            if (!me || !Number.isFinite(me.x)) continue;
            if (Math.hypot(remote.x - me.x, remote.z - me.z) > ARREST_RANGE + 2) continue;
            onPeerArrest();
            break;
          }
        }
        if (afk) {
          if (!afkSince) afkSince = now;
        } else {
          afkSince = 0;
        }
        if (pendingImpulse && now - pendingImpulse.at > 2500) pendingImpulse = null;
        const publishing = presencePublishes({ paused, afk, busted });
        const interval = 1000 / presencePublishHz({ afk, busted });
        const due = publishSoon || !lastPublishMs || now - lastPublishMs >= interval;
        if (publishing && due) {
          publishSoon = false;
          lastPublishMs = now;
          const travel = getTravel();
          const actor = travel?.actor || travel?.car;
          const police = getPolice();
          const snap = police?.snapshot?.();
          const block = getRoadblock();
          let arrest = arrestFrom(block?.snapshot?.(), !!(busted || snap?.busted));
          if (!busted) {
            const peer = getPeerArrest();
            if (peer?.target) arrest = peer;
          }
          const showForce = (snap?.level > 0) || !!(snap?.busted || busted) || arrest.active;
          const vehicle = vehicleFromTravel(travel, getPlayerCars());
          const presence = buildPresence({
            uid: room.uid,
            name: presenceName(),
            x: actor?.x,
            z: actor?.z,
            heading: actor?.heading,
            speed: actor?.speed,
            mode: travel?.mode || 'car',
            vehicle,
            wanted: snap
              ? { level: snap.level, heat: snap.heat, status: snap.status, busted: !!(snap.busted || busted) }
              : (busted ? { level: 0, heat: 0, status: 'BUSTED', busted: true } : null),
            police: showForce ? snap?.units : [],
            officers: showForce ? block?.footCops?.() : [],
            arrest,
            afk: !!afk && !busted,
            afkSince,
            siren: !!getSiren() && !!vehicle?.police,
            impulse: pendingImpulse,
            ambulances: getAmbulances(),
          });
          if (presence) void room.publishPlayer(presence);
        }
      }
      const hudKey = `${isOnline()}:${onlineCount()}`;
      if (hudKey !== lastHudKey) {
        lastHudKey = hudKey;
        hud.refresh();
      }
    },
    async dispose() {
      if (beatTimer) clearInterval(beatTimer);
      beatTimer = null;
      if (authUnsub) authUnsub();
      await leave();
    },
  };

  requestNamePublish = () => {
    publishSoon = true;
    if (!room) return;
    const busted = !!getPolice()?.busted;
    api.step(0, { paused: false, afk: false, busted });
  };

  try {
    if (rtdbConfigured()) {
      void ensureAuthUser().catch((err) => console.warn('multiplayer auth failed', err));
    }
    authUnsub = onAuthStateChanged(getFirebaseAuth(), async (user) => {
      if (!canJoinMultiplayer(user)) {
        await leave();
        return;
      }
      rememberGoogleName(displayNameFor(user) || '');
      names.prefill();
      // Auto-join demo for any authenticated uid (incl. anonymous).
      if (!room) {
        const result = await joinDemoRoom(user, { name: presenceName() });
        if (result.kind === 'joined') room = result.room;
      } else {
        requestNamePublish();
      }
      hud.refresh();
    });
  } catch {
    // Scoreboard env missing — HUD stays hidden via rtdbConfigured.
  }

  // A hidden tab stops requestAnimationFrame, so the pose stream would die and
  // peers would cull the player. Heartbeat once a second while the document is hidden.
  beatTimer = setInterval(() => {
    if (!doc?.hidden || !room) return;
    const busted = !!getPolice()?.busted;
    api.step(1, { paused: true, afk: !busted, busted });
  }, 1000);
  return api;
}
