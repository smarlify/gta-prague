// Stylized likenesses for the person already on screen. Colours and a few
// extra pieces (glasses, Dave's beard). No photographs and no downloaded faces.
// Street crowds keep personLook's own seed. Zeman on foot stays the generic rider.
import { personLook } from './person-model.js';

export const GENERIC_JACKET = '#d65f39';
export const GENERIC_PLAYER_SEED = 2026;

/** The orange rider. Dave no longer uses this. Zeman does, when he steps off the boat. */
export function genericPlayerLook() {
  return personLook(GENERIC_PLAYER_SEED, {
    height: 1.75,
    coat: 0,
    skirt: false,
    shirt: GENERIC_JACKET,
    trousers: '#273b4a',
    age: 'adult',
    accessory: null,
    phoneWalk: false,
    stoop: 0,
    outer: 'jacket',
    scarf: null,
    hairStyle: 'short',
    bagType: 'backpack',
    figure: 0,
    glasses: null,
    beard: false,
    jacket: null,
    hairPeek: false,
  });
}

// Shared civilian base so a seed cannot put a scarf, a dog, or a random build
// on a named driver. Jacket colour lives on `shirt` unless `jacket` is set
// (Dave's open beige jacket over a light blue shirt).
const NAMED = {
  coat: 0,
  skirt: false,
  age: 'adult',
  accessory: null,
  phoneWalk: false,
  stoop: 0,
  outer: 'jacket',
  scarf: null,
  bagType: null,
  figure: 0,
  trousers: '#273b4a',
  shoes: '#1b1b1d',
  skin: '#e3b48f',
  beard: false,
  jacket: null,
  hairPeek: false,
  glasses: null,
};

const LIKENESS = {
  filip: {
    seed: 11,
    height: 1.8,
    body: 1.14,
    hair: '#1d1a18',
    hairStyle: 'short',
    glasses: 'sun',
    shirt: '#1c1d20',
  },
  elon: {
    seed: 22,
    height: 1.78,
    body: 0.84,
    hair: '#5a4030',
    hairStyle: 'short',
    glasses: null,
    shirt: '#141518',
  },
  dave: {
    seed: 33,
    height: 1.75,
    body: 1.06,
    hair: '#3b2a20',
    hairStyle: 'fade',
    glasses: null,
    shirt: '#8eb6d9',
    jacket: '#c4a574',
    skin: '#e8bf9e',
    beard: true,
  },
  hrib: {
    seed: 44,
    height: 1.74,
    body: 1,
    hair: '#5a4030',
    hairStyle: 'short',
    glasses: 'frame',
    shirt: '#1f2a3a',
  },
  pavel: {
    seed: 55,
    height: 1.92,
    body: 1.16,
    hair: '#9a958e',
    hairStyle: 'short',
    glasses: null,
    shirt: '#1c1d20',
  },
  slachta: {
    seed: 66,
    height: 1.82,
    body: 1.14,
    hair: '#1d1a18',
    hairStyle: 'short',
    glasses: null,
    shirt: '#1a1e28',
    hairPeek: true,
  },
  kraus: {
    seed: 77,
    height: 1.76,
    body: 1,
    hair: '#9a958e',
    hairStyle: 'short',
    glasses: 'frame',
    shirt: '#243044',
  },
  macinka: {
    seed: 88,
    height: 1.78,
    body: 1,
    hair: '#3b2a20',
    hairStyle: 'short',
    glasses: null,
    shirt: '#d9d7d0',
    jacket: '#1a2744',
  },
};

/** Grey hair, glasses, and a dark jacket on the reclined Challenger figure. */
export const ZEMAN_BOAT = Object.freeze({
  jacket: '#1a2230',
  hair: '#9a958e',
  glasses: '#1a1c20',
  skin: '#e0b090',
});

/** Standing look for a published character. Zeman and anyone else stay generic. */
export function characterLook(characterId) {
  const spec = LIKENESS[characterId];
  if (!spec) return genericPlayerLook();
  const { seed, ...overrides } = spec;
  return personLook(seed, { ...NAMED, ...overrides });
}

/** Write a likeness onto the renderer's look object. Uniform keys are civilian. */
export function applyCharacterLook(look, characterId) {
  const next = characterLook(characterId);
  const rev = (look.paintRev || 0) + 1;
  for (const key of Object.keys(look)) {
    if (key === 'paintRev') continue;
    if (!Object.hasOwn(next, key)) delete look[key];
  }
  Object.assign(look, next);
  look.paintRev = rev;
  return look;
}
