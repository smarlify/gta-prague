import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const COFFEE = 'https://buymeacoffee.com/smarlify';
const PLAYFUL = 'https://playful.smarlify.co/';

test('welcome, pause, and about show coffee and Playful without naming Lasse', async () => {
  const welcome = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const about = await readFile(new URL('../public/about/index.html', import.meta.url), 'utf8');
  const boot = await readFile(new URL('../src/loading-screen.css', import.meta.url), 'utf8');
  const hud = await readFile(new URL('../src/style.css', import.meta.url), 'utf8');

  for (const html of [welcome, about]) {
    assert.match(html, /Buy Me a Coffee/);
    assert.match(html, /Gaming Hub \(Playful\)/);
    assert.match(html, new RegExp(`href="${COFFEE}" target="_blank" rel="noopener noreferrer"`));
    assert.match(html, new RegExp(`href="${PLAYFUL}" target="_blank" rel="noopener noreferrer"`));
    assert.doesNotMatch(html, /lasse/i);
    assert.doesNotMatch(html, /Text Dave/);
    assert.doesNotMatch(html, /GTA Prague co-authored/);
    assert.match(html, /An open-source project: co-authored by <a [^>]*>Dave Nekovář<\/a>(?!\.)/);
  }

  const phone = boot.slice(boot.indexOf('@media(max-width:700px)'), boot.indexOf('@media(pointer:coarse)'));
  assert.match(phone, /#intro\.boot-screen\{[^}]*width:min\(440px,calc\(100% - 24px - env\(safe-area-inset-left\)\)\)/);
  assert.match(phone, /#intro\.boot-screen\{[^}]*max-width:440px/);
  assert.doesNotMatch(phone, /#intro\.boot-screen\{[^}]*width:auto/);
  assert.doesNotMatch(phone, /#intro\.boot-screen\{[^}]*margin-inline:auto/);
  assert.match(phone, /#intro\.boot-screen\{[^}]*left:max\(12px,env\(safe-area-inset-left\)\);right:auto;margin-inline:0/);
  assert.match(boot, /#intro\.boot-screen\{[^}]*left:38px;right:auto;top:auto;bottom:38px;width:min\(440px,calc\(100% - 32px\)\);max-width:440px;margin-inline:0/);
  assert.doesNotMatch(boot, /#intro\.boot-screen\{[^}]*margin-inline:auto/);
  assert.match(boot, /#intro\.boot-screen \.boot-links\{[^}]*margin-top:var\(--s-16\)/);
  const pause = hud.match(/#pause-overlay\{[^}]*\}/)[0];
  assert.match(pause, /overflow-y:auto/);
  assert.match(pause, /justify-content:flex-start/);
  assert.doesNotMatch(pause, /justify-content:center/);

  assert.match(welcome, /class="coffee-btn" href="https:\/\/buymeacoffee\.com\/smarlify"/);
  assert.match(welcome, /id="pause-overlay"[\s\S]*Gaming Hub \(Playful\)/);
  assert.match(about, /class="secondary" href="https:\/\/buymeacoffee\.com\/smarlify"/);
  assert.match(boot, /\.boot-footer a\.coffee-btn\{[^}]*background:#bf4d2b/);
});
