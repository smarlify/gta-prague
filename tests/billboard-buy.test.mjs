import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
import {REVOLUT_CHECKOUT_URL, REVOLUT_QR_PATH} from '../firebase/functions/ad-credits.js';

test('the advertiser pays the 50 € Revolut request and signs in with email', () => {
  const adsFlow = readFileSync(new URL('../src/ads-flow.js', import.meta.url), 'utf8');
  const buy = readFileSync(new URL('../src/billboard-buy.js', import.meta.url), 'utf8');
  const firebase = readFileSync(new URL('../src/firebase.js', import.meta.url), 'utf8');
  const pkg = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
  assert.match(adsFlow, /GTA Praha has sent you a payment request for 50/);
  assert.match(adsFlow, /Revolut Link/);
  assert.match(adsFlow, /Revolut Pay/);
  assert.match(adsFlow, /Scan to pay 50/);
  assert.match(adsFlow, /REVOLUT_CHECKOUT_URL/);
  assert.match(adsFlow, /REVOLUT_QR_PATH/);
  assert.equal(REVOLUT_QR_PATH, '/ads/revolut-50-eur-qr.png');
  assert.equal(existsSync(new URL(`../public${REVOLUT_QR_PATH}`, import.meta.url)), true);
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

test('opening the modal shows sign-in and the Revolut request without EasyList class names', () => {
  const adsFlow = readFileSync(new URL('../src/ads-flow.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/ads-page.css', import.meta.url), 'utf8');
  const markup = adsFlow.slice(adsFlow.indexOf('function markup'), adsFlow.indexOf('export function mountBillboardAds'));
  const paymentAt = markup.indexOf('id="board-payment"');
  const accountAt = markup.indexOf('id="ads-account" hidden');
  assert.ok(paymentAt > 0 && accountAt > paymentAt, 'the 50 € request stays visible before sign-in');
  assert.match(markup, /id="ads-email"/);
  assert.match(markup, /id="ads-password"/);
  assert.match(markup, /id="ads-revolut-qr"/);
  assert.doesNotMatch(markup, /class="ads-card"|class="ads-note"/);
  assert.doesNotMatch(css, /\.ads-card|\.ads-note/);
  assert.match(css, /\.board-panel\[hidden\]/);
});

test('the advertiser page link is updated with the board parameter', () => {
  const adsFlow = readFileSync(new URL('../src/ads-flow.js', import.meta.url), 'utf8');
  assert.match(adsFlow, /link\.href\s*=\s*id\s*\?\s*`\/ads\.html\?board=\$\{encodeURIComponent\(id\)\}`\s*:\s*'\/ads\.html'/);
});
