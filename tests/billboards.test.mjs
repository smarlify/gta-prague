import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {SpatialIndex} from '../src/geo.js';
import {PRAGUE_AREAS} from '../src/area-caption.js';
import * as THREE from 'three';
import {BILLBOARD_BUY_REACH, BILLBOARD_BUY_RELEASE, BILLBOARD_BUY_RELEASE_HOLD, BOARDS_PER_DISTRICT, BUY_BILLBOARD_LABEL, VISIT_BILLBOARD_LABEL, billboardBuyOffer, billboardCallToAction, billboardFromPointer, billboardPurchaseUrl, billboardTextureSize, billboardVisitUrl, nearestBillboard, openBillboardLink, placePragueBillboards} from '../src/prague-billboards.js';
import storedSites from '../src/prague-billboard-sites.json' with {type: 'json'};
import {
  PACK_CREDITS,
  REVOLUT_CHECKOUT_URL,
  addOwnedBoard,
  applyBillboardOpen,
  boardId,
  checkoutMetadata,
  selectBoardForCheckout,
  PLACEHOLDER_CS,
  PLACEHOLDER_EN,
  checkoutAmount,
  emptyAccount,
  facesForDay,
  grantPurchase,
  httpUrl,
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

test('the Revolut request is 50 € and the first purchase records the fee', () => {
  const first = checkoutAmount({feePaid: false});
  assert.equal(first.credits, PACK_CREDITS);
  assert.equal(first.includesFee, true);
  assert.equal(first.unitAmount, 5000);
  assert.equal(first.currency, 'eur');
  assert.equal(first.url, REVOLUT_CHECKOUT_URL);
  const opened = grantPurchase(emptyAccount(), {includesFee: true});
  assert.equal(opened.feePaid, true);
  assert.equal(opened.credits, 40);
  const again = checkoutAmount({feePaid: true});
  assert.equal(again.credits, 40);
  assert.equal(again.includesFee, false);
  assert.equal(again.unitAmount, 5000);
  const topped = grantPurchase(opened, {includesFee: false});
  assert.equal(topped.credits, 80);
  assert.throws(() => grantPurchase(topped, {includesFee: true}), /already paid/);
  assert.throws(() => grantPurchase(emptyAccount(), {includesFee: false}), /listing fee/);
});

test('a board returns to the placeholder when credits run out', () => {
  const sites = [{id: 'board-01'}, {id: 'board-02'}];
  const live = settleCredits({...emptyAccount(), credits: 40, feePaid: true, imageUrl: 'https://example.test/ad.jpg', paused: true, selectedBoardId: 'board-01'}, '2026-10-20');
  assert.equal(live.credits, 39);
  assert.equal(live.selectedBoardId, 'board-01');
  const buyer = {uid: 'ada', imageUrl: live.imageUrl, credits: live.credits, selectedBoardId: 'board-01'};
  const faces = facesForDay(sites, [buyer], '2026-10-20');
  assert.equal(faces[0].imageUrl, live.imageUrl);
  assert.equal(faces[1].imageUrl, null);
  const gone = settleCredits({...live, lastSettledDay: '2026-10-20', paused: false}, '2026-11-28');
  assert.equal(gone.credits, 0);
  assert.equal(gone.paused, true);
  assert.equal(gone.selectedBoardId, 'board-01');
  const empty = facesForDay(sites, [{...buyer, credits: gone.credits}], '2026-11-28');
  assert.deepEqual(empty.map((face) => face.imageUrl), [null, null]);
  assert.equal(pragueDayKey(new Date('2026-01-15T23:30:00Z')), '2026-01-16');
});

test('the buy button is on the page and names the nearest board', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  assert.match(html, /<button id="buy-billboard" type="button" hidden>Buy this billboard<\/button>/);
  assert.equal(BUY_BILLBOARD_LABEL, 'Buy this billboard');
  assert.doesNotMatch(html, /href="\/ads\.html"/);
  assert.doesNotMatch(html, />Advertise</);
  assert.doesNotMatch(html, /<kbd>[^<]*Buy this billboard/);
  assert.ok(html.indexOf('id="buy-billboard"') > html.indexOf('id="zoom-out"'), 'the action sits with the play HUD, not on the welcome card');
  assert.doesNotMatch(css, /#buy-billboard\{[^}]*display:\s*none/);
  assert.match(css, /@media\(pointer:coarse\)\{#buy-billboard\{[^}]*touch-action:manipulation/);
  assert.equal(BILLBOARD_BUY_REACH, 18);
  assert.equal(BILLBOARD_BUY_RELEASE, 26);
  assert.ok(BILLBOARD_BUY_RELEASE_HOLD > 0.14);
  const sites = [
    {id: 'praha-1-stare-mesto-02', x: 12, z: 0},
    {id: 'praha-1-stare-mesto-01', x: -4, z: 0},
    {id: 'praha-2-vysehrad-01', x: 40, z: 0},
  ];
  const onFoot = nearestBillboard({x: 0, z: 0, travelMode: 'walk'}, sites);
  const driving = nearestBillboard({x: 0, z: 0, travelMode: 'car'}, sites);
  assert.equal(onFoot.id, 'praha-1-stare-mesto-01');
  assert.equal(driving.id, onFoot.id);
  assert.equal(billboardPurchaseUrl(onFoot.id), '/advertise?board=praha-1-stare-mesto-01');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const buy = readFileSync(new URL('../src/billboard-buy.js', import.meta.url), 'utf8');
  assert.match(main, /billboardBuyOffer\(car,pragueBoards\?\.sites,billboardOffer,\{dt\}\)/);
  assert.doesNotMatch(main, /location\.assign\(billboardPurchaseUrl/);
  assert.match(main, /billboardBuy\.open\(id\)/);
  assert.match(main, /billboardFromPointer\(event,camera,pragueBoards\?\.group,pragueBoards\?\.sites\)/);
  assert.match(buy, /billboard-buy-close/);
  assert.match(buy, /textContent = 'Close'/);
  assert.doesNotMatch(buy, /location\.assign|location\.href/);
  assert.doesNotMatch(buy, /Escape|keydown/);
  assert.equal(nearestBillboard({x: 18, z: 0}, [{id: 'edge', x: 0, z: 0}]).id, 'edge');
  assert.equal(nearestBillboard({x: 18.2, z: 0}, [{id: 'edge', x: 0, z: 0}]), null);
  assert.equal(nearestBillboard({x: 0, z: 0}, [{id: 'praha-b', x: 5, z: 0}, {id: 'praha-a', x: -5, z: 0}]).id, 'praha-a');
});

test('the buy action stays up through a short gap and hides only after a clear one', () => {
  const board = [{id: 'edge', x: 0, z: 0}];
  const onFoot = billboardBuyOffer({x: 10, z: 0, travelMode: 'walk'}, board);
  const driving = billboardBuyOffer({x: 10, z: 0, travelMode: 'car'}, board);
  assert.equal(onFoot.show, true);
  assert.equal(driving.id, onFoot.id);
  assert.equal(billboardBuyOffer({x: 20, z: 0}, board).show, false, '26 m does not turn the action on');

  let state = billboardBuyOffer({x: 18, z: 0}, board);
  assert.equal(state.id, 'edge');
  state = billboardBuyOffer({x: 18.2, z: 0}, board, state, {dt: 0.14});
  assert.equal(state.show, true, 'a centimetre past 18 m keeps the action');
  state = billboardBuyOffer({x: 26, z: 0}, board, state, {dt: 2});
  assert.equal(state.show, true);
  assert.equal(state.awayFor, 0, 'the release line itself is still beside the board');

  state = billboardBuyOffer({x: NaN, z: 0}, board, state, {dt: 0.016});
  assert.equal(state.show, true, 'one missing position does not hide it');
  assert.equal(state.id, 'edge');
  state = billboardBuyOffer({x: 22, z: 0}, board, state, {dt: 0.14});
  assert.equal(state.show, true);
  assert.equal(state.awayFor, 0, 'back inside the band clears the release clock');

  state = billboardBuyOffer({x: 40, z: 0}, board, state, {dt: 5});
  assert.equal(state.show, true, 'one far sample does not hide it');
  state = billboardBuyOffer({x: 22, z: 0}, board, state, {dt: 0.14});
  assert.equal(state.awayFor, 0);

  state = billboardBuyOffer({x: 40, z: 0}, board, state, {dt: 0.14});
  assert.equal(state.show, true);
  state = billboardBuyOffer({x: 40, z: 0}, board, state, {dt: BILLBOARD_BUY_RELEASE_HOLD});
  assert.equal(state.show, false, 'a sustained gap past 26 m hides it');
  assert.equal(billboardBuyOffer({x: 22, z: 0}, board, state).show, false, 'coming back only to the band does not turn it on again');
  assert.equal(billboardBuyOffer({x: 18, z: 0}, board, state).id, 'edge');

  const pair = [{id: 'far-board', x: 0, z: 0}, {id: 'near-board', x: 30, z: 0}];
  const latched = billboardBuyOffer({x: 24, z: 0}, pair, {id: 'far-board', awayFor: 0});
  assert.equal(latched.id, 'near-board');
  assert.equal(latched.show, true);
});

test('a click on the billboard face names that board', () => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 50);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const group = new THREE.Group();
  const face = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
  face.name = 'praha-1-stare-mesto-01';
  group.add(face);
  group.updateMatrixWorld(true);
  const rect = {left: 0, top: 0, width: 100, height: 100};
  const hit = billboardFromPointer({clientX: 50, clientY: 50, target: {getBoundingClientRect: () => rect}}, camera, group, []);
  assert.equal(hit, 'praha-1-stare-mesto-01');
  const miss = billboardFromPointer({clientX: 2, clientY: 2, target: {getBoundingClientRect: () => rect}}, camera, group, []);
  assert.equal(miss, '');
});

test('a selected board id paints that site rather than a random one', () => {
  const sites = [
    {id: 'praha-1-stare-mesto-01'},
    {id: 'praha-1-stare-mesto-02'},
    {id: 'praha-2-vysehrad-01'},
  ];
  const ada = {uid: 'ada', imageUrl: 'https://example.test/ada.jpg', credits: 12, selectedBoardId: 'praha-2-vysehrad-01'};
  const owned = facesForDay(sites, [ada], '2026-10-20');
  assert.deepEqual(owned.map((face) => face.imageUrl), [null, null, ada.imageUrl]);
  const loose = facesForDay(sites, [{...ada, selectedBoardId: ''}], '2026-10-21');
  assert.deepEqual(loose.map((face) => face.imageUrl), [null, null, null]);
  const bob = {uid: 'bob', imageUrl: 'https://example.test/bob.jpg', credits: 4, selectedBoardId: 'praha-2-vysehrad-01'};
  const shared = facesForDay(sites, [bob, ada], '2026-10-22');
  assert.equal(shared[2].imageUrl, ada.imageUrl);
  const broke = {uid: 'amy', imageUrl: 'https://example.test/amy.jpg', credits: 0, selectedBoardId: 'praha-1-stare-mesto-01'};
  const funded = {uid: 'zoe', imageUrl: 'https://example.test/zoe.jpg', credits: 2, selectedBoardId: 'praha-1-stare-mesto-01'};
  const kept = facesForDay(sites, [broke, funded, ada], '2026-10-20');
  assert.equal(kept[0].imageUrl, funded.imageUrl);
  assert.equal(kept[1].imageUrl, null);
  assert.equal(boardId('praha-1-stare-mesto-01'), 'praha-1-stare-mesto-01');
  assert.equal(boardId('../credits'), '');
  const amount = checkoutAmount({feePaid: false});
  assert.equal(checkoutMetadata('ada', amount, 'praha-1-stare-mesto-01').boardId, 'praha-1-stare-mesto-01');
  const linked = facesForDay(sites, [{...ada, linkUrl: 'https://smarlify.co/visit'}], '2026-10-20');
  assert.equal(linked[2].linkUrl, 'https://smarlify.co/visit');
  assert.equal(linked[0].linkUrl, '');
  assert.equal(linked[0].imageUrl, null);
});

test('a paid board visits its link and an empty board stays for sale', () => {
  assert.equal(httpUrl('https://smarlify.co/visit'), 'https://smarlify.co/visit');
  assert.equal(httpUrl('  http://example.com/a  '), 'http://example.com/a');
  assert.equal(httpUrl('javascript:alert(1)'), '');
  assert.equal(httpUrl('https://user:secret@example.com'), '');
  assert.equal(httpUrl(''), '');
  const buy = billboardCallToAction(null);
  assert.equal(buy.kind, 'buy');
  assert.equal(buy.label, BUY_BILLBOARD_LABEL);
  const shown = billboardCallToAction({imageUrl: 'https://example.test/ad.jpg', linkUrl: ''});
  assert.equal(shown.kind, 'shown');
  assert.equal(shown.label, '');
  const visit = billboardCallToAction({imageUrl: 'https://example.test/ad.jpg', linkUrl: 'https://smarlify.co/visit'});
  assert.equal(visit.kind, 'visit');
  assert.equal(visit.label, VISIT_BILLBOARD_LABEL);
  assert.equal(visit.url, 'https://smarlify.co/visit');
  assert.equal(billboardCallToAction({imageUrl: 'https://example.test/ad.jpg', linkUrl: 'javascript:alert(1)'}).kind, 'shown');
  assert.equal(billboardCallToAction({linkUrl: 'https://smarlify.co'}).kind, 'buy');
  const opened = [];
  assert.equal(openBillboardLink('https://smarlify.co/visit', (href) => opened.push(href)), true);
  assert.deepEqual(opened, ['https://smarlify.co/visit']);
  assert.equal(openBillboardLink('javascript:alert(1)', () => opened.push('nope')), false);
  assert.deepEqual(opened, ['https://smarlify.co/visit']);
  const fitted = billboardTextureSize(3024, 1964);
  assert.equal(fitted.scaled, true);
  assert.equal(fitted.width, 2048);
  assert.ok(fitted.height < 2048);
  assert.equal(billboardTextureSize(800, 400).scaled, false);
  const settled = settleCredits({
    ...emptyAccount(),
    credits: 12,
    feePaid: true,
    imageUrl: 'https://example.test/ad.jpg',
    linkUrl: 'https://smarlify.co/visit',
    paused: false,
    lastSettledDay: '2026-10-25',
    selectedBoardId: 'board-01',
  }, '2026-10-25');
  assert.equal(settled.credits, 12);
  assert.equal(settled.linkUrl, 'https://smarlify.co/visit');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const ads = readFileSync(new URL('../src/ads-flow.js', import.meta.url), 'utf8');
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(html, /Buy this billboard/);
  assert.match(main, /action\.kind==='shown'/);
  assert.match(main, /beginBillboardVisit\(id,href\)/);
  assert.match(main, /beginBillboardVisit\(id,action\.url\)/);
  assert.match(main, /requestBillboardOpen\(id\)/);
  assert.match(main, /openBillboardLink\(url/);
  assert.match(main, /billboardVisitUrl\(/);
  assert.match(main, /action\.kind==='visit'/);
  assert.match(ads, /id="ads-link"/);
  assert.match(ads, /type="url"/);
  assert.match(ads, /\{linkUrl\}/);
  assert.doesNotMatch(ads.slice(ads.indexOf('async function saveLink'), ads.indexOf('function sync')), /credits/);
  assert.match(rules, /request\.auth\.uid == uid/);
  assert.match(rules, /moneyUnchanged\(\)/);
  assert.match(rules, /hasOnly\(\['imageUrl', 'selectedBoardId', 'linkUrl'\]\)/);
  assert.match(rules, /linkUrlOk\(\)/);
  assert.doesNotMatch(rules, /allow read: if true/);
});

test('paid boards share one credit pool and an open costs that owner one credit', () => {
  const sites = [
    {id: 'praha-1-stare-mesto-01'},
    {id: 'praha-1-stare-mesto-02'},
    {id: 'praha-2-vysehrad-01'},
  ];
  const pending = selectBoardForCheckout(emptyAccount(), 'praha-1-stare-mesto-01');
  assert.equal(pending.selectedBoardId, 'praha-1-stare-mesto-01');
  const held = addOwnedBoard({
    ...pending,
    credits: 40,
    feePaid: true,
    imageUrl: 'https://example.test/ada.jpg',
    linkUrl: 'https://smarlify.co/visit',
  }, 'praha-1-stare-mesto-01');
  assert.equal(selectBoardForCheckout(held, 'praha-2-vysehrad-01').selectedBoardId, 'praha-1-stare-mesto-01');
  const both = addOwnedBoard(held, 'praha-2-vysehrad-01');
  assert.deepEqual(both.boardIds, ['praha-1-stare-mesto-01', 'praha-2-vysehrad-01']);
  assert.equal(both.credits, 40);
  const ada = {uid: 'ada', ...both};
  const bob = {
    uid: 'bob',
    imageUrl: 'https://example.test/bob.jpg',
    credits: 7,
    spent: 1,
    selectedBoardId: 'praha-1-stare-mesto-02',
    linkUrl: 'https://example.test/bob',
  };
  const faces = facesForDay(sites, [ada, bob], '2026-10-25');
  assert.equal(faces[0].imageUrl, ada.imageUrl);
  assert.equal(faces[0].linkUrl, 'https://smarlify.co/visit');
  assert.equal(faces[1].imageUrl, bob.imageUrl);
  assert.equal(faces[1].linkUrl, 'https://example.test/bob');
  assert.equal(faces[2].imageUrl, ada.imageUrl);
  assert.equal(faces[2].linkUrl, 'https://smarlify.co/visit');

  const opened = applyBillboardOpen([ada, bob], 'praha-1-stare-mesto-01');
  assert.equal(opened.ok, true);
  assert.equal(opened.url, 'https://smarlify.co/visit');
  assert.equal(opened.uid, 'ada');
  assert.equal(opened.accounts.find((account) => account.uid === 'ada').credits, 39);
  assert.equal(opened.accounts.find((account) => account.uid === 'ada').spent, 1);
  assert.equal(opened.accounts.find((account) => account.uid === 'bob').credits, 7);
  assert.equal(opened.accounts.find((account) => account.uid === 'bob').spent, 1);

  const second = applyBillboardOpen(opened.accounts, 'praha-2-vysehrad-01');
  assert.equal(second.ok, true);
  assert.equal(second.url, 'https://smarlify.co/visit');
  assert.equal(second.accounts.find((account) => account.uid === 'ada').credits, 38);
  assert.equal(second.accounts.find((account) => account.uid === 'bob').credits, 7);

  const dry = applyBillboardOpen([{...ada, credits: 0, spent: 40}, bob], 'praha-1-stare-mesto-01');
  assert.equal(dry.ok, false);
  assert.equal(dry.url, '');
  assert.equal(dry.accounts.find((account) => account.uid === 'ada').credits, 0);
  assert.equal(dry.accounts.find((account) => account.uid === 'bob').credits, 7);
  const hidden = facesForDay(sites, [dry.accounts.find((account) => account.uid === 'ada'), bob], '2026-10-25');
  assert.equal(hidden[0].imageUrl, null);
  assert.equal(hidden[2].imageUrl, null);
  assert.equal(hidden[1].imageUrl, bob.imageUrl);
  const last = applyBillboardOpen([{...ada, credits: 1, spent: 3}], 'praha-2-vysehrad-01');
  assert.equal(last.ok, true);
  assert.equal(last.accounts[0].credits, 0);
  assert.equal(last.accounts[0].paused, true);
  assert.equal(last.accounts[0].spent, 4);
  const none = applyBillboardOpen(last.accounts, 'praha-1-stare-mesto-01');
  assert.equal(none.ok, false);
  assert.equal(none.accounts[0].credits, 0);
  assert.equal(none.accounts[0].spent, 4);

  const quiet = applyBillboardOpen([{...ada, linkUrl: ''}, bob], 'praha-2-vysehrad-01');
  assert.equal(quiet.ok, false);
  assert.equal(quiet.accounts.find((account) => account.uid === 'ada').credits, 40);

  assert.equal(billboardVisitUrl({charged: 'https://smarlify.co/visit', status: 200, localHref: 'https://example.test/stale'}), 'https://smarlify.co/visit');
  assert.equal(billboardVisitUrl({charged: '', status: 409, localHref: 'https://smarlify.co/visit'}), '');
  assert.equal(billboardVisitUrl({charged: '', status: 404, localHref: 'https://smarlify.co/visit'}), 'https://smarlify.co/visit');
  assert.equal(billboardVisitUrl({charged: '', status: 0, localHref: 'javascript:alert(1)'}), '');
});
