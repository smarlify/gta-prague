// Named strips past the playable circle. The inner city already holds the
// road polygons and the driving graph out to the download edge; a corridor
// only opens that ground and, past the terrain grid, supplies heights.

// The sources dialog reads provenance.note. These corridors are OpenStreetMap
// outlines, not a municipal extract, so they carry a note instead of fetchedAt
// and forest-tree counts.
export const CORRIDOR_PROVENANCE = Object.freeze({
 provider: 'OpenStreetMap contributors',
 license: 'ODbL',
 licenseUrl: 'https://www.openstreetmap.org/copyright',
 note: '© OpenStreetMap contributors (ODbL): playable outline of mapped roads beyond the city disk, including extra carriageways from OpenStreetMap; buildings stay on the main city build',
});

// Troja, Bohnice, and the Stromovka edge ship the same layers as the centre.
// The shorter strips stay outlines.
export const NORTH_LAYER_IDS = Object.freeze(['troja', 'bohnice']);
export const NORTH_LAYER_NOTE = '© OpenStreetMap contributors (ODbL): roads, pavement, buildings, trees, and street furniture for Troja, Bohnice, and the Stromovka edge. Bored tunnels are omitted. Bridge decks, park planting, and surface colours follow the centre.';

export const CORRIDOR_SPECS = Object.freeze([
 {id: 'zlute-lazne', title: 'Podolí to Žluté lázně',
  test: text => /žluté lázně|zlute lazne|modřansk|modransk|podolsk|u přehrady|u prehrady/i.test(text)},
 {id: 'barrandov', title: 'Smíchov to Barrandovský most',
  test: text => /barrandov|strakonick|lihovar/i.test(text)},
 {id: 'troja', title: 'Troja, the zoo and the botanic garden',
  test: text => /trojsk|zoolog|přívoz|privoz|přírodní|prirodni/i.test(text)},
 {id: 'palmovka', title: 'Karlín to Palmovka',
  test: text => /palmov|zenklov|libeňsk|libensk/i.test(text)},
 {id: 'bohnice', title: 'Troja to Bohnice',
  test: text => /bohnic|lodžsk|lodzsk|čimick|cimick|ústeck|usteck|pazder|havránk|havrank/i.test(text)},
 {id: 'kobylisy', title: 'Kobylisy',
  test: text => /kobylis|střelnič|strelnic|klapkov/i.test(text)},
 {id: 'severni-spojka', title: 'Severní spojka, Letňany to Černý Most',
  test: text => /kbelsk|cínoveck|cinoveck|chlumeck|vysočansk|vysocansk|novopack|severní spojka|severni spojka/i.test(text)},
 {id: 'jizni-spojka', title: 'Jižní spojka',
  test: text => /jižní spojka|jizni spojka/i.test(text)},
]);

export function corridorIdFor(name = '') {
 const text = String(name);
 if (!text.trim()) return null;
 return CORRIDOR_SPECS.find(spec => spec.test(text))?.id || null;
}

export function circleRing(radius, steps = 96) {
 const ring = [];
 for (let i = 0; i < steps; i++) {
  const t = i / steps * Math.PI * 2;
  ring.push([Math.cos(t) * radius, Math.sin(t) * radius]);
 }
 ring.push(ring[0]);
 return ring;
}

// Closed ring, Ramer–Douglas–Peucker. Keeps the shape inside a few metres.
export function simplifyRing(ring, epsilon = 4) {
 if (!ring || ring.length < 5) return ring;
 const open = ring.slice(0, -1);
 const keep = douglas(open, epsilon);
 const out = keep.map(p => [Math.round(p[0]), Math.round(p[1])]);
 out.push(out[0]);
 return out;
}

function douglas(points, epsilon) {
 if (points.length < 3) return points.slice();
 let far = 0, index = 0;
 const a = points[0], b = points[points.length - 1];
 for (let i = 1; i < points.length - 1; i++) {
  const d = segmentDistance(points[i], a, b);
  if (d > far) { far = d; index = i; }
 }
 if (far <= epsilon) return [a, b];
 return [...douglas(points.slice(0, index + 1), epsilon).slice(0, -1), ...douglas(points.slice(index), epsilon)];
}

function segmentDistance(p, a, b) {
 const dx = b[0] - a[0], dz = b[1] - a[1], len = dx * dx + dz * dz;
 if (len < 1e-6) return Math.hypot(p[0] - a[0], p[1] - a[1]);
 const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len));
 return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t);
}

export function ringBBox(ring) {
 const b = [Infinity, Infinity, -Infinity, -Infinity];
 for (const p of ring) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }
 return b;
}

export function multiBBox(multi) {
 const b = [Infinity, Infinity, -Infinity, -Infinity];
 for (const poly of multi) for (const p of poly[0] || []) {
  b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]);
 }
 return b;
}

// Samples along the outer ring, only past the terrain grid.
export function heightSamples(multi, {minRadius = 7400, step = 40} = {}) {
 const out = [];
 for (const poly of multi) {
  const ring = poly[0];
  if (!ring || ring.length < 2) continue;
  let carried = step;
  for (let i = 1; i < ring.length; i++) {
   const a = ring[i - 1], b = ring[i];
   const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
   if (!(len > 0)) continue;
   let at = step - carried;
   while (at <= len) {
    const t = at / len, x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t;
    if (Math.hypot(x, z) >= minRadius) out.push({x: Math.round(x), z: Math.round(z)});
    at += step;
   }
   carried = len - (at - step);
   if (carried < 0) carried = 0;
  }
 }
 return out;
}
