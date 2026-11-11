import test from 'node:test';
import assert from 'node:assert/strict';
import {UTM_MEDIUM, UTM_SOURCE, withUtm} from '../src/utm.js';

test('withUtm merges Playful-style tags without stripping advertiser params', () => {
  assert.equal(UTM_SOURCE, 'gtapraha');
  assert.equal(UTM_MEDIUM, 'referral');
  assert.equal(
    withUtm('https://smarlify.co/visit?ref=ada', 'billboard'),
    'https://smarlify.co/visit?ref=ada&utm_source=gtapraha&utm_medium=referral&utm_campaign=billboard',
  );
  assert.equal(
    withUtm('https://playful.smarlify.co/?utm_source=other&utm_medium=email&utm_campaign=keep', 'playful'),
    'https://playful.smarlify.co/?utm_source=other&utm_medium=email&utm_campaign=keep',
  );
  assert.equal(withUtm('javascript:alert(1)', 'billboard'), 'javascript:alert(1)');
  assert.equal(withUtm('/about/', 'about'), '/about/');
  assert.equal(withUtm('', 'billboard'), '');
});
