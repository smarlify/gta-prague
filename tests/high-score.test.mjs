import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
  GAME_ID,
  GAME_NAME,
  scoreFromDistance,
  formatHighScore,
  isEmbedded,
  postGameOver,
  isGoogleUser,
  displayNameFor,
  bindHighScoreUI,
} from '../src/high-score.js';

test('high score is distance in whole metres (HUD / BUSTED already track this)', () => {
  assert.equal(GAME_ID, 'gta-praha');
  assert.equal(GAME_NAME, 'GTA Praha');
  assert.equal(scoreFromDistance(1234.6), 1235);
  assert.equal(scoreFromDistance(-3), 0);
  assert.equal(scoreFromDistance(undefined), 0);
  assert.equal(formatHighScore(250), '250 m');
  assert.equal(formatHighScore(2540), '2.54 km');
});

test('GAME_OVER postMessage only when iframed, with gameId gta-praha', () => {
  const messages = [];
  const fakeParent = { postMessage: (data, target) => messages.push({ data, target }) };
  const prev = globalThis.window;
  globalThis.window = { parent: fakeParent };
  try {
    assert.equal(isEmbedded(), true);
    assert.equal(postGameOver(1800, { level: 3 }), true);
    assert.deepEqual(messages[0].data, {
      type: 'GAME_OVER',
      gameId: 'gta-praha',
      gameName: 'GTA Praha',
      score: 1800,
      level: 3,
    });
    assert.equal(messages[0].target, '*');
  } finally {
    if (prev === undefined) delete globalThis.window;
    else globalThis.window = prev;
  }

  const self = {};
  self.parent = self;
  globalThis.window = self;
  try {
    assert.equal(isEmbedded(), false);
    assert.equal(postGameOver(99), false);
  } finally {
    if (prev === undefined) delete globalThis.window;
    else globalThis.window = prev;
  }
});

test('Google display name preferred over email local-part', () => {
  assert.equal(isGoogleUser(null), false);
  assert.equal(isGoogleUser({ isAnonymous: true }), false);
  assert.equal(displayNameFor({ isAnonymous: false, displayName: 'Ada', email: 'ada@gmail.com' }), 'Ada');
  assert.equal(displayNameFor({ isAnonymous: false, displayName: null, email: 'ada@gmail.com' }), 'ada');
});

function mockScoreDoc() {
  return {
    elements: {},
    getElementById(id) {
      if (!this.elements[id]) {
        this.elements[id] = {
          id,
          hidden: id === 'high-score-panel' || id === 'high-score-guest',
          disabled: false,
          textContent: id === 'high-score-google' ? 'Continue with Google' : '',
          value: '',
          dataset: {},
          addEventListener() {},
        };
      }
      return this.elements[id];
    },
  };
}

test('logged-out iframe posts to parent and keeps Google as fallback', async () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="high-score-panel"/);
  assert.match(html, /id="high-score-google"/);

  const doc = mockScoreDoc();
  const messages = [];
  const prev = globalThis.window;
  globalThis.window = { parent: { postMessage: (data) => messages.push(data) } };

  const ui = bindHighScoreUI(doc, {
    getDistance: () => 3200,
    onEmbedded: postGameOver,
    save: async () => { throw new Error('should not save when embedded and logged out'); },
    authApi: { currentUser: null },
  });

  const result = ui.offer(3200);
  assert.equal(result.embedded, true);
  assert.equal(result.score, 3200);
  assert.equal(messages[0].type, 'GAME_OVER');
  assert.equal(messages[0].score, 3200);
  assert.equal(doc.elements['high-score-panel'].hidden, false);
  assert.equal(doc.elements['high-score-google'].hidden, false);
  assert.equal(doc.elements['high-score-guest'].hidden, true);
  assert.match(doc.elements['high-score-status'].textContent, /Playful/);
  assert.match(doc.elements['high-score-status'].textContent, /Google/);

  if (prev === undefined) delete globalThis.window;
  else globalThis.window = prev;
});

test('signed-in standalone auto-saves and hides Google/guest chooser', async () => {
  const prev = globalThis.window;
  const self = {};
  self.parent = self;
  globalThis.window = self;
  const saved = [];
  const standDoc = mockScoreDoc();
  const stand = bindHighScoreUI(standDoc, {
    getDistance: () => 500,
    save: async (entry) => { saved.push(entry); return entry; },
    authApi: {
      currentUser: { isAnonymous: false, displayName: 'Driver', email: 'd@gmail.com', uid: 'uid' },
    },
  });
  const out = stand.offer(500);
  assert.equal(out.embedded, false);
  assert.equal(standDoc.elements['high-score-google'].hidden, true);
  assert.equal(standDoc.elements['high-score-guest'].hidden, true);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(saved[0]?.name, 'Driver');
  assert.equal(saved[0]?.score, 500);
  assert.equal(saved[0]?.email, 'd@gmail.com');
  assert.match(standDoc.elements['high-score-status'].textContent, /Saved as Driver/);
  assert.equal(standDoc.elements['high-score-google'].hidden, true);

  if (prev === undefined) delete globalThis.window;
  else globalThis.window = prev;
});

test('signed-in iframe auto-saves, hides chooser, and still posts GAME_OVER', async () => {
  const doc = mockScoreDoc();
  const messages = [];
  const saved = [];
  const prev = globalThis.window;
  globalThis.window = { parent: { postMessage: (data) => messages.push(data) } };

  const ui = bindHighScoreUI(doc, {
    getDistance: () => 1800,
    onEmbedded: postGameOver,
    save: async (entry) => { saved.push(entry); return entry; },
    authApi: {
      currentUser: { isAnonymous: false, displayName: 'Ada', email: 'ada@gmail.com', uid: 'ada' },
    },
  });

  const result = ui.offer(1800);
  assert.equal(result.embedded, true);
  assert.equal(messages[0]?.type, 'GAME_OVER');
  assert.equal(doc.elements['high-score-google'].hidden, true);
  assert.equal(doc.elements['high-score-guest'].hidden, true);
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(saved[0]?.name, 'Ada');
  assert.equal(saved[0]?.score, 1800);

  if (prev === undefined) delete globalThis.window;
  else globalThis.window = prev;
});
