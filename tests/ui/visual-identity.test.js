import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../../styles.css', import.meta.url), 'utf8');

test('SYNZER visual system has an original industrial instrument palette', () => {
  for (const token of [
    '--synzer-ink',
    '--synzer-chassis',
    '--synzer-metal',
    '--synzer-amber',
    '--synzer-signal',
    '--synzer-violet',
  ]) {
    assert.match(css, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('wide layouts use a vertical instrument bank instead of FRMS-like horizontal editor tabs', () => {
  assert.match(css, /@media\s*\(min-width:\s*721px\)[\s\S]*?\.editor-tabs\s*\{[^}]*flex-direction:\s*column/s);
  assert.match(css, /\.editor\s*\{[^}]*grid-template-columns:\s*minmax\(132px,\s*168px\)\s+minmax\(0,\s*1fr\)/s);
});

test('touch controls retain accessible targets, focus, and reduced-motion support', () => {
  assert.match(css, /--tap-target:\s*48px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /input\[type="range"\][^{]*\{[^}]*min-height:\s*48px/s);
});

test('portrait layouts restore a compact horizontal module selector without horizontal page overflow', () => {
  assert.match(css, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.editor-tabs\s*\{[^}]*flex-direction:\s*row/s);
  assert.match(css, /overflow-x:\s*hidden/);
});
