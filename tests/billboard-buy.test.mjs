import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {billboardCheckoutUrls} from '../firebase/functions/checkout-urls.js';
import {CHECKOUT_MESSAGE_SOURCE, readCheckoutReturn, sessionIdFromClientSecret, stripePublishableKey, takeCheckoutQuery} from '../src/billboard-return.js';

test('the in-game checkout never returns through the ads page', () => {
  const game = billboardCheckoutUrls({
    origin: 'https://gtapraha.online',
    boardId: 'praha-1-stare-mesto-01',
    surface: 'game',
    embedded: true,
  });
  assert.equal(game.returnUrl.includes('ads.html'), false);
  assert.equal(game.successUrl.includes('ads.html'), false);
  assert.equal(game.cancelUrl.includes('ads.html'), false);
  assert.match(game.returnUrl, /\{CHECKOUT_SESSION_ID\}/);
  assert.match(game.returnUrl, /^https:\/\/gtapraha\.online\/\?checkout=success/);
  const hosted = billboardCheckoutUrls({
    origin: 'https://gtapraha.online',
    boardId: 'praha-1-stare-mesto-01',
    surface: 'game',
    embedded: false,
  });
  assert.match(hosted.successUrl, /billboard-checkout-return\.html/);
  assert.equal(hosted.successUrl.includes('ads.html'), false);
  const page = billboardCheckoutUrls({origin: 'https://gtapraha.online', boardId: 'praha-1-stare-mesto-01', surface: 'page'});
  assert.match(page.successUrl, /\/ads\.html\?checkout=success/);
});

test('a checkout return identifies the session without loading the ads page', () => {
  assert.equal(sessionIdFromClientSecret('cs_test_abc123_secret_xyz'), 'cs_test_abc123');
  assert.equal(sessionIdFromClientSecret('not-a-session'), '');
  assert.deepEqual(readCheckoutReturn('https://gtapraha.online/billboard-checkout-return.html?checkout=success&session_id=cs_live_abc'), {
    checkout: 'success',
    sessionId: 'cs_live_abc',
  });
  assert.equal(readCheckoutReturn('https://gtapraha.online/ads.html?checkout=success&session_id=cs_live_abc').sessionId, 'cs_live_abc');
  assert.equal(readCheckoutReturn('https://gtapraha.online/?start=petrin'), null);
  assert.equal(stripePublishableKey({VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_example'}), 'pk_test_example');
  assert.equal(stripePublishableKey({VITE_STRIPE_PUBLISHABLE_KEY: 'sk_test_example'}), '');
  const taken = takeCheckoutQuery('?start=petrin&checkout=success&session_id=cs_test_abc&board=praha-1-stare-mesto-01');
  assert.equal(taken.board, 'praha-1-stare-mesto-01');
  assert.equal(taken.sessionId, 'cs_test_abc');
  assert.equal(taken.search, '?start=petrin');
  const html = readFileSync(new URL('../public/billboard-checkout-return.html', import.meta.url), 'utf8');
  assert.match(html, new RegExp(CHECKOUT_MESSAGE_SOURCE));
  assert.doesNotMatch(html, /ads\.html/);
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

test('popup-blocked payment shows the advertiser page fallback', () => {
  const adsFlow = readFileSync(new URL('../src/ads-flow.js', import.meta.url), 'utf8');
  const billboardBuy = readFileSync(new URL('../src/billboard-buy.js', import.meta.url), 'utf8');
  assert.match(billboardBuy, /throw new Error\('popup-blocked'\)/);
  assert.match(adsFlow, /error\.message === 'popup-blocked'/);
  assert.match(adsFlow, /link\.href = id \? `\/ads\.html\?board=\$\{encodeURIComponent\(id\)\}` : '\/ads\.html'/);
  assert.match(adsFlow, /fallback\.hidden = false/);
});
