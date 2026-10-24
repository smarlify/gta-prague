import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {authFailureMessage} from '../src/email-auth.js';
import {advertiserIsSignedIn, applyAdvertiserAccess, submitAdvertiserAuth} from '../src/advertiser-auth.js';

function mockRoot() {
  const nodes = {
    'ads-signed-out': {hidden: false},
    'board-payment': {hidden: true},
    'ads-account': {hidden: true},
  };
  return {
    nodes,
    querySelector(selector) {
      const id = selector.startsWith('#') ? selector.slice(1) : '';
      return nodes[id] || null;
    },
  };
}

test('sign-up and sign-in call the stubbed account service and do not touch Firebase', async () => {
  const calls = [];
  const user = {uid: 'advertiser-1', isAnonymous: false, email: 'ada@example.com'};
  const auth = {
    async create(email, password) {
      calls.push(['create', email, password]);
      return user;
    },
    async signIn(email, password) {
      calls.push(['sign-in', email, password]);
      return user;
    },
  };

  const created = await submitAdvertiserAuth('create', '  ada@example.com  ', 'secret1', auth);
  assert.equal(created, user);
  const signedIn = await submitAdvertiserAuth('sign-in', 'ada@example.com', 'secret1', auth);
  assert.equal(signedIn.email, 'ada@example.com');
  assert.deepEqual(calls, [
    ['create', 'ada@example.com', 'secret1'],
    ['sign-in', 'ada@example.com', 'secret1'],
  ]);

  await assert.rejects(() => submitAdvertiserAuth('create', '', 'secret1', auth), /Enter an email and a password/);
  await assert.rejects(() => submitAdvertiserAuth('sign-in', 'ada@example.com', 'short', auth), /at least 6 characters/);
  await assert.rejects(() => submitAdvertiserAuth('google', 'ada@example.com', 'secret1', auth), /Unknown advertiser auth mode/);
  assert.equal(calls.length, 2);
});

test('payment stays hidden until an email account is signed in', () => {
  const root = mockRoot();
  applyAdvertiserAccess(root, null);
  assert.equal(root.nodes['board-payment'].hidden, true);
  assert.equal(root.nodes['ads-account'].hidden, true);
  assert.equal(root.nodes['ads-signed-out'].hidden, false);

  applyAdvertiserAccess(root, {uid: 'anon', isAnonymous: true});
  assert.equal(advertiserIsSignedIn({uid: 'anon', isAnonymous: true}), false);
  assert.equal(root.nodes['board-payment'].hidden, true);

  applyAdvertiserAccess(root, {uid: 'advertiser-1', isAnonymous: false, email: 'ada@example.com'});
  assert.equal(root.nodes['ads-signed-out'].hidden, true);
  assert.equal(root.nodes['board-payment'].hidden, false);
  assert.equal(root.nodes['ads-account'].hidden, false);
});

test('the advertiser page submits account creation and keeps Revolut behind sign-in', () => {
  const adsFlow = readFileSync(new URL('../src/ads-flow.js', import.meta.url), 'utf8');
  const checkout = adsFlow.slice(adsFlow.indexOf('function checkoutMarkup'), adsFlow.indexOf('function markup'));
  assert.match(adsFlow, /submitAdvertiserAuth\(mode/);
  assert.match(adsFlow, /createEmailAccount\(services\(\)\.auth/);
  assert.match(adsFlow, /signInWithEmail\(services\(\)\.auth/);
  assert.match(adsFlow, /applyAdvertiserAccess\(root, user\)/);
  assert.match(adsFlow, /applyAdvertiserAccess\(root, null\)/);
  const signedOut = checkout.slice(checkout.indexOf('id="ads-signed-out"'), checkout.indexOf('id="board-payment"'));
  assert.match(signedOut, /Create an account with your email\./);
  assert.doesNotMatch(signedOut, /50/);
  assert.doesNotMatch(adsFlow, /payment appears after you are signed in/);
  assert.match(checkout, /id="ads-submit"[^>]*type="submit">Create account/);
  assert.match(checkout, /id="board-payment" hidden/);
  assert.match(checkout, /I've paid the 50 €/);
  assert.match(checkout, /class="board-actions"/);
  const css = readFileSync(new URL('../src/ads-page.css', import.meta.url), 'utf8');
  assert.match(css, /\.ads-page #ads-auth \{[^}]*gap:\s*1rem/);
  assert.match(css, /\.ads-page label \{[^}]*gap:\s*0\.5rem/);
  assert.match(css, /\.ads-page \.board-actions \{[^}]*gap:\s*0\.75rem/);
  assert.doesNotMatch(css, /\.ads-card|\.ads-note/);
  assert.equal(authFailureMessage({code: 'auth/invalid-credential'}), 'Email or password does not match.');
  assert.equal(authFailureMessage({code: 'auth/network-request-failed'}), 'The account service did not respond. Check the connection and try again.');
  assert.equal(authFailureMessage({code: 'auth/unauthorized-domain'}), 'This site cannot open accounts yet.');
  assert.equal(authFailureMessage({code: 'auth/operation-not-allowed'}), 'Email sign-in is not enabled yet.');
  assert.equal(authFailureMessage(new Error('Enter an email and a password.')), 'Enter an email and a password.');
});
