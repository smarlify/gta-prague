import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const COFFEE = 'https://buymeacoffee.com/smarlify';
const PLAYFUL = 'https://playful.smarlify.co/';

test('welcome, pause, and about show coffee and Playful without naming Lasse', async () => {
  const welcome = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const about = await readFile(new URL('../public/about/index.html', import.meta.url), 'utf8');
  const boot = await readFile(new URL('../src/loading-screen.css', import.meta.url), 'utf8');

  for (const html of [welcome, about]) {
    assert.match(html, /Buy Me a Coffee/);
    assert.match(html, /Gaming Hub \(Playful\)/);
    assert.match(html, new RegExp(`href="${COFFEE}" target="_blank" rel="noopener noreferrer"`));
    assert.match(html, new RegExp(`href="${PLAYFUL}" target="_blank" rel="noopener noreferrer"`));
    assert.doesNotMatch(html, /lasse/i);
    assert.doesNotMatch(html, /Text Dave/);
  }

  const phone = boot.slice(boot.indexOf('@media(max-width:700px)'), boot.indexOf('@media(pointer:coarse)'));
  assert.match(phone, /#intro\.boot-screen\{[^}]*width:min\(440px,calc\(100% - 32px\)\)/);
  assert.match(phone, /#intro\.boot-screen\{[^}]*max-width:440px/);
  assert.doesNotMatch(phone, /#intro\.boot-screen\{[^}]*width:auto/);
  assert.match(boot, /#intro\.boot-screen\{[^}]*top:auto;bottom:38px;width:min\(440px,calc\(100% - 32px\)\)/);
  assert.match(boot, /#intro\.boot-screen\{[^}]*margin-inline:auto/);

  assert.match(welcome, /class="coffee-btn" href="https:\/\/buymeacoffee\.com\/smarlify"/);
  assert.match(welcome, /id="pause-overlay"[\s\S]*Gaming Hub \(Playful\)/);
  assert.match(about, /class="secondary" href="https:\/\/buymeacoffee\.com\/smarlify"/);
  assert.match(boot, /\.boot-footer a\.coffee-btn\{[^}]*background:#bf4d2b/);
});
