import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REVOLUT_CHECKOUT_URL} from '../firebase/functions/ad-credits.js';

test('the advertiser pays the 50 € Revolut request and signs in with email', () => {
  const adsFlow = readFileSync(new URL('../src/ads-flow.js', import.meta.url), 'utf8');
  const buy = readFileSync(new URL('../src/billboard-buy.js', import.meta.url), 'utf8');
  const firebase = readFileSync(new URL('../src/firebase.js', import.meta.url), 'utf8');
  const pkg = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  assert.match(adsFlow, /GTA Praha has sent you a payment request for 50/);
  assert.match(adsFlow, /REVOLUT_CHECKOUT_URL/);
  assert.match(adsFlow, /id="ads-email"/);
  assert.match(adsFlow, /id="ads-password"/);
  assert.match(adsFlow, /createEmailAccount/);
  assert.match(adsFlow, /signInWithEmail/);
  assert.match(adsFlow, /ads-confirm/);
  assert.equal(REVOLUT_CHECKOUT_URL, 'https://checkout.revolut.com/pay/7a5ccc40-cc12-4892-9280-de78ea04baf6');
  assert.doesNotMatch(adsFlow, /signInWithPopup|GoogleAuthProvider|Sign in with Google|stripe/i);
  assert.doesNotMatch(buy, /stripe|loadStripe|signInWithPopup/i);
  assert.doesNotMatch(firebase, /GoogleAuthProvider|signInWithPopup/);
  assert.doesNotMatch(pkg, /stripe/i);
});

test('the modal close control is a phone-sized button and the city controls stay', () => {
  const css = readFileSync(new URL('../src/billboard-buy.css', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  assert.match(css, /#billboard-buy-close\s*\{[^}]*min-height:\s*44px/);
  assert.match(css, /#billboard-buy-close\s*\{[^}]*touch-action:\s*manipulation/);
  for (const id of ['view-btn', 'map-btn', 'help-btn', 'sound-btn', 'zoom-in', 'zoom-out', 'time-btn', 'weather-btn']) {
    assert.equal(css.includes(id), false, id);
  }
  assert.match(main, /onClose\(\)\{if\(started&&!mapOpen&&!police\?\.busted\)setPaused\(false\)/);
  assert.match(main, /billboardBuy\?\.isOpen\(\)&&e\.code!=='Escape'/);
});

test('the advertiser page link is updated with the board parameter', () => {
  const adsFlow = readFileSync(new URL('../src/ads-flow.js', import.meta.url), 'utf8');
  assert.match(adsFlow, /link\.href\s*=\s*id\s*\?\s*`\/ads\.html\?board=\$\{encodeURIComponent\(id\)\}`\s*:\s*'\/ads\.html'/);
});
