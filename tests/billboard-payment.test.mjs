import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {REVOLUT_CHECKOUT_URL, REVOLUT_PAYMENT_ID, checkoutAmount} from '../firebase/functions/ad-credits.js';
import {
  claimAsPaidSession,
  createRevolutCheckout,
  createSettlement,
} from '../firebase/functions/billboard-payment.js';

const BOARD = 'praha-1-stare-mesto-01';

test('a confirmed Revolut payment grants 40 credits and the fee once, and a second claim tops up', () => {
  const amount = checkoutAmount({feePaid: false});
  assert.equal(amount.unitAmount, 5000);
  assert.equal(amount.currency, 'eur');
  assert.equal(amount.url, REVOLUT_CHECKOUT_URL);
  const claim = createRevolutCheckout({uid: 'ada', amount, boardId: BOARD, claimId: 'claim-1'});
  assert.equal(claim.url, `https://checkout.revolut.com/pay/${REVOLUT_PAYMENT_ID}`);
  assert.equal(claim.paymentId, REVOLUT_PAYMENT_ID);
  assert.deepEqual(claim.metadata, {uid: 'ada', includesFee: '1', credits: '40', boardId: BOARD});

  const settlement = createSettlement();
  const session = claimAsPaidSession(claim, {uid: 'ada'});
  const first = settlement.apply(session);
  const second = settlement.apply(session);
  assert.equal(first.applied, true);
  assert.equal(first.credits, 40);
  assert.equal(second.credits, 40);
  assert.equal(settlement.account('ada').credits, 40);
  assert.equal(settlement.account('ada').feePaid, true);
  assert.equal(settlement.account('ada').selectedBoardId, BOARD);

  const topUp = createRevolutCheckout({
    uid: 'ada',
    amount: checkoutAmount({feePaid: true}),
    boardId: BOARD,
    claimId: 'claim-2',
  });
  assert.equal(topUp.metadata.includesFee, '0');
  const topped = settlement.apply(claimAsPaidSession(topUp, {uid: 'ada'}));
  assert.equal(topped.credits, 80);
  assert.equal(settlement.account('ada').feePaid, true);

  assert.throws(() => claimAsPaidSession(claim, {uid: 'bob'}), /another account/);
  settlement.apply({...session, id: 'unpaid', payment_status: 'unpaid'});
  assert.equal(settlement.account('ada').credits, 80);

  const handler = readFileSync(new URL('../firebase/functions/index.js', import.meta.url), 'utf8');
  const payment = readFileSync(new URL('../firebase/functions/billboard-payment.js', import.meta.url), 'utf8');
  assert.match(handler, /createRevolutCheckout\(/);
  assert.match(handler, /claimAsPaidSession\(/);
  assert.match(handler, /settlePaidSession\(/);
  assert.doesNotMatch(handler, /stripe/i);
  assert.doesNotMatch(payment, /stripe/i);
  assert.doesNotMatch(readFileSync(new URL('../firebase/functions/package.json', import.meta.url), 'utf8'), /stripe/i);
});
