import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const css = await readFile(new URL('../../styles.css', import.meta.url), 'utf8');
const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');

test('SYNZER uses an original signal-stage navigator instead of copied synthesizer tabs', () => {
  assert.match(html, /class="module-rail"/);
  assert.doesNotMatch(html, /class="editor-tabs"/);
  const rail = html.match(/<nav class="module-rail"[\s\S]*?<\/nav>/)?.[0] ?? '';
  assert.ok(rail, 'module rail must exist');
  for (const label of ['SOURCE BANK', 'VOICE CORE', 'ENVELOPE LAB', 'MOD PATCHBAY', 'MOTION GENERATOR', 'FILTER CHAMBER']) {
    assert.ok(rail.includes(label), `missing original stage label: ${label}`);
  }
  for (const id of ['waveform', 'control', 'envelope', 'matrix', 'modifiers', 'global']) {
    assert.match(rail, new RegExp(`data-tab="${id}"`));
  }
  assert.match(rail, /aria-current="step"/);
  assert.doesNotMatch(rail, />\s*(WAVEFORM|CONTROL|MATRIX|MODIFIERS|GLOBAL)\s*</);
  assert.doesNotMatch(html, /LAYER EDITOR/);
});

test('the module rail reads as a sculpted signal instrument, not a flat tab list', () => {
  for (const selector of ['.module-rail {', '.module-node {', '.module-node[aria-current="step"]', '.module-node::after']) {
    assert.ok(css.includes(selector), `missing instrument navigation style: ${selector}`);
  }
  assert.match(css, /grid-template-columns:\s*minmax\(184px,\s*214px\)\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /cubic-bezier\(/);
  assert.match(css, /@keyframes\s+stage-arrive/);
});

test('portrait navigation becomes a compact three-by-two module field without horizontal overflow', () => {
  assert.match(css, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.module-rail\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /overflow-x:\s*hidden/);
});

test('touch controls retain accessible targets, focus, and reduced-motion support', () => {
  assert.match(css, /--tap-target:\s*48px/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /input\[type="range"\][^{]*\{[^}]*min-height:\s*48px/s);
});
