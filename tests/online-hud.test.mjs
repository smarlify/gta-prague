import test from 'node:test';
import assert from 'node:assert/strict';
import { bindOnlineHud } from '../src/net/online-hud.js';

class El {
  constructor(id) {
    this.id = id;
    this.textContent = '';
    this.hidden = false;
    this.dataset = {};
    this.attrs = {};
    this.children = [];
    this.listeners = {};
  }

  addEventListener(type, fn) {
    (this.listeners[type] ||= []).push(fn);
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }

  replaceChildren(...nodes) {
    this.children = [...nodes];
    this.textContent = this.children.map((node) => node.textContent).join('\n');
  }

  contains(node) {
    return node === this || this.children.includes(node);
  }
}

function fakeDoc() {
  const btn = new El('online-btn');
  const label = new El('online-label');
  const panel = new El('online-players');
  panel.hidden = true;
  const els = new Map([
    ['online-btn', btn],
    ['online-label', label],
    ['online-players', panel],
  ]);
  return {
    els,
    listeners: {},
    getElementById: (id) => els.get(id) || null,
    createElement: (tag) => new El(tag),
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    },
  };
}

async function click(el, event) {
  const handler = el.listeners.click[0];
  await handler(event);
}

test('an online click lists the room snapshot and does not leave', async () => {
  const doc = fakeDoc();
  let offline = 0;
  let online = 0;
  const now = Date.now();
  const players = {
    me: { uid: 'me', name: 'Ada', x: 0, z: 0, heading: 0, speed: 0, mode: 'car', updatedAt: now },
    other: { uid: 'other', name: 'Bo', x: 1, z: 1, heading: 0, speed: 0, mode: 'car', updatedAt: now },
    quiet: { uid: 'quiet', name: '   ', x: 2, z: 2, heading: 0, speed: 0, mode: 'car', updatedAt: now },
    leftover: { uid: 'leftover', name: 'Driver', x: 3, z: 3, heading: 0, speed: 0, mode: 'car', updatedAt: now },
    parked: { uid: 'parked', name: 'Cara', x: 4, z: 4, heading: 0, speed: 0, mode: 'car', updatedAt: now - 120_000 },
  };
  bindOnlineHud(doc, {
    isOnline: () => true,
    onlineCount: () => 3,
    players: () => players,
    selfUid: () => 'me',
    onGoOffline: async () => { offline += 1; },
    onGoOnline: async () => { online += 1; },
  });
  const btn = doc.els.get('online-btn');
  const panel = doc.els.get('online-players');
  await click(btn, { target: btn, stopPropagation() {} });
  assert.equal(offline, 0);
  assert.equal(online, 0);
  assert.equal(panel.hidden, false);
  assert.match(panel.textContent, /Ada \(you\)/);
  assert.match(panel.textContent, /Bo/);
  assert.doesNotMatch(panel.textContent, /Cara/);
  assert.doesNotMatch(panel.textContent, /Driver/);
  const you = panel.children.find((row) => row.dataset.you === '1');
  assert.equal(you.textContent, 'Ada (you)');

  await click(btn, { target: btn, stopPropagation() {} });
  assert.equal(panel.hidden, true);
  assert.equal(offline, 0);

  await click(btn, { target: btn, stopPropagation() {} });
  await doc.listeners.click[0]({ target: { id: 'outside' } });
  assert.equal(panel.hidden, true);
  assert.equal(offline, 0);
});

test('an offline click still rejoins', async () => {
  const doc = fakeDoc();
  let offline = 0;
  let online = 0;
  bindOnlineHud(doc, {
    isOnline: () => false,
    onlineCount: () => 0,
    players: () => ({}),
    onGoOffline: async () => { offline += 1; },
    onGoOnline: async () => { online += 1; },
  });
  const btn = doc.els.get('online-btn');
  const panel = doc.els.get('online-players');
  await click(btn, { target: btn, stopPropagation() {} });
  assert.equal(online, 1);
  assert.equal(offline, 0);
  assert.equal(panel.hidden, true);
  assert.equal(panel.textContent, '');
});
