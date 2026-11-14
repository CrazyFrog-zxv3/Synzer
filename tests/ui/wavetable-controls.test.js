import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../index.html', import.meta.url), 'utf8');
const main = await readFile(new URL('../../main.js', import.meta.url), 'utf8');

test('OSC 01 exposes a separate Wavetable source and morph control without replacing VA waveforms', () => {
  assert.match(html, /id="osc1-source"/);
  assert.match(html, /option value="virtual-analog"/);
  assert.match(html, /option value="wavetable"/);
  assert.match(html, /id="wavetable-morph"/);
  assert.match(html, /data-wave="saw"/);
  assert.match(html, /data-wave="square"/);
  assert.match(html, /data-wave="sine"/);
});

test('keyboard note creation passes the Wavetable definition only when OSC 01 selects it', () => {
  assert.match(main, /createDefaultWavetableDefinition\(/);
  assert.match(main, /wavetable:\s*readOscillatorSource\(\) === 'wavetable'/);
  assert.match(main, /setWavetableMorph\(/);
});

test('patch UI restores the selected oscillator source and morph amount', () => {
  assert.match(main, /osc1Source\.value\s*=\s*parameters\['engine\.virtual-analog\.osc-source'\]/);
  assert.match(main, /wavetableMorph\.value\s*=\s*String\(Math\.round\(parameters\['engine\.virtual-analog\.wavetable-morph'\]/);
});
