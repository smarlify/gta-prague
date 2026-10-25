import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('the Drive control shows a C badge for the camera key, hidden on phones', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const hud = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');
  const boot = await readFile(new URL('../src/loading-screen.css', import.meta.url), 'utf8');
  const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
  const view = html.match(/<button id="view-btn"[\s\S]*?<\/button>/)[0];
  assert.match(view, /id="view-label">/);
  assert.match(view, /<kbd>C<\/kbd>/);
  assert.match(html, /id="map-btn"[\s\S]*?<kbd>M<\/kbd>/);
  assert.match(html, /id="look-btn"[\s\S]*?<kbd>T<\/kbd>/);
  assert.match(main, /if\(e\.code==='KeyC'\)\{cycleCamera\(\);return;\}/);
  assert.match(main, /\$\('view-label'\)\.textContent='Drive'/);
  assert.match(hud, /#view-btn kbd,#look-btn kbd,#weather-btn kbd\{margin-left:2px\}/);
  assert.match(hud, /kbd\{display:inline-flex/);
  const phone = hud.slice(hud.indexOf('@media(max-width:700px)'));
  assert.match(phone, /\.nav-btn kbd\{display:none\}/);
  assert.doesNotMatch(phone, /#view-btn\{display:\s*none\}/);
  assert.doesNotMatch(hud, /#view-btn\{display:\s*none\}/);
  const bootPhone = boot.slice(boot.indexOf('@media(max-width:700px)'));
  assert.match(bootPhone, /body \.topbar \.player-name,body \.topbar kbd,#intro \.boot-controls\{display:none\}/);
  assert.doesNotMatch(bootPhone, /#view-btn\{display:\s*none\}/);
});
