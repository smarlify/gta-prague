import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {checkoutAmount} from '../firebase/functions/ad-credits.js';
import {billboardCheckoutUrls} from '../firebase/functions/checkout-urls.js';
import {
  checkoutSessionBody,
  confirmPaidCheckout,
  createCheckoutSession,
  createSettlement,
  settleWebhook,
} from '../firebase/functions/billboard-payment.js';

const BOARD = 'praha-1-stare-mesto-01';
const signatureMark = 'boundary-mark';

function paidSession() {
  return {
    id: 'cs_test_billboard_once',
    payment_status: 'paid',
    metadata: {uid: 'ada', includesFee: '1', credits: '40', boardId: BOARD},
  };
}

function stubStripe(session) {
  const created = [];
  const stripe = {
    created,
    checkout: {
      sessions: {
        async create(body) {
          created.push(body);
          return {id: 'cs_created', url: 'https://checkout.stripe.test/session', client_secret: 'cs_created_secret'};
        },
        async retrieve(id) {
          assert.equal(id, session.id);
          return session;
        },
      },
    },
    webhooks: {
      constructEvent(rawBody, signature, secret) {
        if (signature !== 'signed' || secret !== signatureMark) {
          throw new Error('No signatures found matching the expected signature for payload');
        }
        assert.equal(rawBody, '{"type":"checkout.session.completed"}');
        return {type: 'checkout.session.completed', data: {object: session}};
      },
    },
  };
  return stripe;
}

test('a paid checkout grants 40 credits and the fee once, keeps the board, and the webhook matches confirm', async () => {
  const session = paidSession();
  const stripe = stubStripe(session);
  const amount = checkoutAmount('usd', {feePaid: false});
  const urls = billboardCheckoutUrls({origin: 'https://gtapraha.online', boardId: BOARD, surface: 'game'});
  const payload = await createCheckoutSession(stripe, {uid: 'ada', amount, boardId: BOARD, urls, embedded: false});
  assert.equal(payload.url, 'https://checkout.stripe.test/session');
  assert.equal(stripe.created[0].line_items[0].price_data.unit_amount, amount.unitAmount);
  assert.equal(stripe.created[0].line_items[0].price_data.currency, 'usd');
  assert.deepEqual(stripe.created[0].metadata, {uid: 'ada', includesFee: '1', credits: '40', boardId: BOARD});

  const confirmed = createSettlement();
  const first = await confirmPaidCheckout(confirmed, stripe, {uid: 'ada', sessionId: session.id});
  const second = await confirmPaidCheckout(confirmed, stripe, {uid: 'ada', sessionId: session.id});
  assert.equal(first.applied, true);
  assert.equal(first.credits, 40);
  assert.equal(second.credits, 40);
  assert.equal(confirmed.account('ada').credits, 40);
  assert.equal(confirmed.account('ada').feePaid, true);
  assert.equal(confirmed.account('ada').selectedBoardId, BOARD);

  const fromWebhook = createSettlement();
  const delivered = await settleWebhook(fromWebhook, stripe, {
    rawBody: '{"type":"checkout.session.completed"}',
    signature: 'signed',
    secret: signatureMark,
  });
  assert.equal(delivered.status, 200);
  assert.deepEqual(delivered.body, {received: true});
  assert.deepEqual(fromWebhook.account('ada'), confirmed.account('ada'));

  const again = await settleWebhook(fromWebhook, stripe, {
    rawBody: '{"type":"checkout.session.completed"}',
    signature: 'signed',
    secret: signatureMark,
  });
  assert.equal(again.status, 200);
  assert.equal(fromWebhook.account('ada').credits, 40);

  const rejected = await settleWebhook(createSettlement(), stripe, {
    rawBody: '{"type":"checkout.session.completed"}',
    signature: 'tampered',
    secret: signatureMark,
  });
  assert.equal(rejected.status, 400);
  assert.match(rejected.body.error, /signature/i);

  const unpaid = createSettlement();
  unpaid.apply({...session, id: 'cs_unpaid', payment_status: 'unpaid'});
  assert.equal(unpaid.account('ada').credits, 0);
  assert.equal(unpaid.account('ada').feePaid, false);

  const handler = readFileSync(new URL('../firebase/functions/index.js', import.meta.url), 'utf8');
  assert.match(handler, /createCheckoutSession\(/);
  assert.match(handler, /retrieveOwnedSession\(/);
  assert.match(handler, /settlePaidSession\(/);
  assert.match(handler, /acceptWebhook\(/);
});

function testModeSecret() {
  try {
    const text = readFileSync(new URL('../../.env', import.meta.url), 'utf8');
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const name = line.slice(0, line.indexOf('=')).trim();
      const value = line.slice(line.indexOf('=') + 1).trim().replace(/^['"]|['"]$/g, '');
      if (name === 'STRIPE_SECRET_API_KEY' && value.startsWith('sk_test_')) return value;
    }
  } catch {
    return '';
  }
  return '';
}

function redact(error) {
  return String(error?.message || error).replace(/sk_(test|live)_[A-Za-z0-9]+/g, 'sk_[redacted]');
}

function stripeSdk() {
  try {
    return createRequire(new URL('../firebase/functions/package.json', import.meta.url))('stripe');
  } catch {
    return null;
  }
}

const testSecret = testModeSecret();
const StripeSdk = stripeSdk();

test('a test-mode Checkout Session lists the fee amount and board without taking payment', {
  skip: !testSecret ? 'Stripe test key is not configured' : !StripeSdk ? 'Stripe SDK is not installed' : false,
}, async () => {
  const stripe = new StripeSdk(testSecret);
  const amount = checkoutAmount('usd', {feePaid: false});
  const urls = billboardCheckoutUrls({origin: 'https://gtapraha.online', boardId: BOARD, surface: 'game'});
  let session;
  let failure;
  try {
    session = await stripe.checkout.sessions.create(checkoutSessionBody({
      uid: 'payment-test',
      amount,
      boardId: BOARD,
      urls,
      embedded: false,
    }));
    assert.equal(session.amount_total, amount.unitAmount);
    assert.equal(session.currency, 'usd');
    assert.equal(session.payment_status, 'unpaid');
    assert.deepEqual(session.metadata, {uid: 'payment-test', includesFee: '1', credits: '40', boardId: BOARD});
  } catch (error) {
    failure = new Error(redact(error));
  } finally {
    if (session?.id) {
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch {
        // An unpaid session can remain. Expiring it is not required for the assertion.
      }
    }
  }
  if (failure) throw failure;
});
