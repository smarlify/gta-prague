import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {extensionCredit, extensionSourcesText} from '../src/extensions.js';
import {CORRIDOR_PROVENANCE} from '../src/prague-corridors.js';

const index = JSON.parse(fs.readFileSync('public/cities/prague/extensions/index.json', 'utf8'));

test('Prague corridor catalog entries carry an OpenStreetMap provenance note', () => {
 assert.ok(index.extensions.length >= 9);
 for (const entry of index.extensions) {
  assert.equal(entry.provenance.note, CORRIDOR_PROVENANCE.note);
  assert.equal(extensionCredit(entry), CORRIDOR_PROVENANCE.note);
 }
 const line = extensionSourcesText(index.extensions, {helsinki: false});
 assert.match(line, /Troja to Bohnice/);
 assert.match(line, /OpenStreetMap contributors/);
 assert.doesNotMatch(line, /Seurasaari/);
 assert.doesNotMatch(line, /City of Helsinki/);
});

test('a Helsinki extension without a note still uses the municipal credit', () => {
 const entry = {title: 'Mannerheimintie → Töölö → Seurasaari', provenance: {fetchedAt: '2026-10-09'}, counts: {inferredForestTrees: 5608}};
 assert.match(extensionCredit(entry), /City of Helsinki data fetched 2026-10-09/);
 assert.match(extensionCredit(entry), /5,608 forest trees/);
 assert.match(extensionSourcesText([entry], {helsinki: true}), /Seurasaari is car-free in reality/);
});

test('a catalog entry with neither a note nor Helsinki counts fails closed', () => {
 assert.throws(() => extensionCredit({id: 'bohnice', title: 'Troja to Bohnice'}), /missing a provenance note/);
 assert.throws(() => extensionSourcesText([{id: 'bohnice', title: 'Troja to Bohnice', provenance: {}}], {helsinki: false}), /missing a provenance note/);
});
