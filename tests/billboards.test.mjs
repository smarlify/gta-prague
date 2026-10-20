import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {SpatialIndex} from '../src/geo.js';
import {PRAGUE_AREAS} from '../src/area-caption.js';
import {BOARDS_PER_DISTRICT, placePragueBillboards} from '../src/prague-billboards.js';
import storedSites from '../src/prague-billboard-sites.json' with {type: 'json'};
import {
  CREDIT_PACKS,
  PACK_CREDITS,
  PLACEHOLDER_CS,
  PLACEHOLDER_EN,
  checkoutAmount,
  emptyAccount,
  facesForDay,
  grantPurchase,
  paintPlaceholder,
  pragueDayKey,
  settleCredits,
} from '../firebase/functions/ad-credits.js';

function rect(x, z, w, d, extra = {}) {
  return {rings: [[[x, z], [x + w, z], [x + w, z + d], [x, z + d]]], ...extra};
}

test('the empty board says the offer in Czech and English', () => {
  const drawn = [];
  paintPlaceholder({
    fillStyle: '',
    textAlign: '',
    textBaseline: '',
    font: '',
    fillRect() {},
    fillText(text) { drawn.push(text); },
  }, 1024, 512);
  assert.deepEqual(drawn, [PLACEHOLDER_CS, PLACEHOLDER_EN]);
  assert.equal(PLACEHOLDER_CS, 'Zde může být vaše reklama');
  assert.equal(PLACEHOLDER_EN, 'Your ad can be here');
});

test('a placed board sits on the pavement and outside buildings', () => {
  const data = {
    radius: 80,
    roads: [rect(0, 0, 80, 8, {kind: 'Ajorata'})],
    pavement: [rect(0, 8, 80, 12, {kind: 'Jalankulkualue'})],
    buildings: [rect(0, 8, 24, 12, {kind: 'building'})],
    water: [],
  };
  const sites = placePragueBillboards(data, {count: 4, step: 4, minGap: 1, seed: 3, radius: 80});
  assert.ok(sites.length >= 1);
  const buildings = new SpatialIndex(data.buildings);
  const pavement = new SpatialIndex(data.pavement);
  const roads = new SpatialIndex(data.roads);
  for (const site of sites) {
    assert.equal(buildings.at(site.x, site.z), undefined);
    assert.ok(pavement.at(site.x, site.z));
    assert.equal(roads.at(site.x, site.z), undefined);
  }
});

test('stored Prague boards are on the pavement and not inside a building', () => {
  const data = JSON.parse(gunzipSync(readFileSync('public/cities/prague/city.pack')).toString('utf8'));
  assert.equal(storedSites.length, PRAGUE_AREAS.length * BOARDS_PER_DISTRICT);
  const counts = new Map();
  for (const site of storedSites) counts.set(site.district, (counts.get(site.district) || 0) + 1);
  for (const area of PRAGUE_AREAS) assert.equal(counts.get(area.district), BOARDS_PER_DISTRICT, area.district);
  const buildings = new SpatialIndex(data.buildings);
  const pavement = new SpatialIndex(data.pavement);
  const roads = new SpatialIndex(data.roads.filter((road) => (road.kind || '').startsWith('Ajorata') && !(road.kind || '').includes('Tunel')));
  for (const site of storedSites) {
    assert.equal(buildings.at(site.x, site.z), undefined, site.id);
    assert.ok(pavement.at(site.x, site.z), site.id);
    assert.equal(roads.at(site.x, site.z), undefined, site.id);
  }
  for (const start of data.landmarks) {
    const nearest = Math.min(...storedSites.map((site) => Math.hypot(site.x - start.x, site.z - start.z)));
    assert.ok(nearest < 200, `${start.name} is ${Math.round(nearest)} m from the nearest board`);
  }
});

test('the first purchase adds 40 credits and the fee, and a top-up does not charge the fee again', () => {
  const first = checkoutAmount('usd', {feePaid: false});
  assert.equal(first.credits, PACK_CREDITS);
  assert.equal(first.includesFee, true);
  assert.equal(first.unitAmount, 5000);
  const opened = grantPurchase(emptyAccount(), {includesFee: true});
  assert.equal(opened.feePaid, true);
  assert.equal(opened.credits, 40);
  const again = checkoutAmount('eur', {feePaid: true});
  assert.equal(again.credits, 40);
  assert.equal(again.includesFee, false);
  assert.equal(again.unitAmount, 4000);
  const topped = grantPurchase(opened, {includesFee: false});
  assert.equal(topped.credits, 80);
  assert.throws(() => grantPurchase(topped, {includesFee: true}), /already paid/);
  assert.throws(() => grantPurchase(emptyAccount(), {includesFee: false}), /listing fee/);
});

test('currency changes the Checkout price and not the credit count', () => {
  const amounts = CREDIT_PACKS.map((pack) => checkoutAmount(pack.id, {feePaid: false}));
  assert.deepEqual(amounts.map((amount) => amount.credits), amounts.map(() => 40));
  assert.equal(checkoutAmount('czk').unitAmount, 125000);
  assert.equal(checkoutAmount('jpy').unitAmount, 7500);
  assert.equal(checkoutAmount('gbp').unitAmount, 4000);
  assert.equal(checkoutAmount('chf').unitAmount, 4500);
  assert.equal(checkoutAmount('pln').unitAmount, 20000);
  assert.notEqual(checkoutAmount('usd').unitAmount, checkoutAmount('jpy').unitAmount);
});

test('a board returns to the placeholder when credits run out', () => {
  const sites = [{id: 'board-01'}, {id: 'board-02'}];
  const live = settleCredits({...emptyAccount(), credits: 40, feePaid: true, imageUrl: 'https://example.test/ad.jpg', paused: true}, '2026-10-20');
  assert.equal(live.credits, 39);
  const faces = facesForDay(sites, [{uid: 'ada', imageUrl: live.imageUrl, credits: live.credits}], '2026-10-20');
  assert.equal(faces.filter((face) => face.imageUrl).length, 1);
  const gone = settleCredits({...live, lastSettledDay: '2026-10-20', paused: false}, '2026-11-28');
  assert.equal(gone.credits, 0);
  assert.equal(gone.paused, true);
  const empty = facesForDay(sites, [{uid: 'ada', imageUrl: gone.imageUrl, credits: gone.credits}], '2026-11-28');
  assert.deepEqual(empty.map((face) => face.imageUrl), [null, null]);
  assert.equal(pragueDayKey(new Date('2026-01-15T23:30:00Z')), '2026-01-16');
});
