import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, css, js, engineSource] = await Promise.all([
  readFile(new URL('../../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../../styles.css', import.meta.url), 'utf8'),
  readFile(new URL('../../main.js', import.meta.url), 'utf8'),
  readFile(new URL('../../packages/dsp-engine/src/core/SynzerEngine.js', import.meta.url), 'utf8'),
]);

test('the top bar exposes an accessible fullscreen toggle connected to the app shell', () => {
  assert.match(html, /id="fullscreen-toggle"/);
  assert.match(html, /aria-label="Ativar tela cheia"/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(js, /requestFullscreen/);
  assert.match(js, /exitFullscreen/);
  assert.match(js, /fullscreenchange/);
});

test('fullscreen has a usable viewport fallback when the browser API is unavailable', () => {
  assert.match(js, /app-focus-mode/);
  assert.match(css, /\.app-shell\.app-focus-mode/);
  assert.match(css, /:fullscreen/);
});

test('mobile landscape uses a horizontal six-stage rail and paired work area', () => {
  assert.match(css, /@media\s*\(orientation:\s*landscape\)\s*and\s*\(max-height:\s*600px\)\s*and\s*\(min-width:\s*640px\)/);
  assert.match(css, /\.editor\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^}]*grid-template-rows:\s*auto auto/s);
  assert.match(css, /\.module-rail\s*\{[^}]*grid-template-columns:\s*repeat\(6,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.module-grid,\s*\.envelope-layout\s*\{[^}]*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
  assert.match(css, /\.module-node\s*\{[^}]*min-height:\s*48px/s);
  assert.match(css, /input\[type=\"range\"\]\s*\{\s*min-height:\s*48px/s);
});

test('mobile fullscreen respects safe areas and dynamic viewport height', () => {
  assert.match(css, /height:\s*100dvh/);
  assert.match(css, /\.fullscreen-toggle\s*\{[^}]*min-height:\s*48px/s);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(html, /viewport-fit=cover/);
});


test('stereo feedback delay exposes real AudioWorklet controls with touch-safe toggles', () => {
  assert.match(html, /id="delay-time"/);
  assert.match(html, /id="delay-feedback"/);
  assert.match(html, /id="delay-mix"/);
  assert.match(html, /id="delay-ping-pong"/);
  assert.match(html, /FX 01 · STEREO FEEDBACK DELAY/);
  assert.match(js, /setEffectParameters\(parameters\)/);
  assert.match(engineSource, /SET_EFFECT_PARAMETERS/);
  assert.match(css, /\.route-enable input\s*\{[^}]*width:48px/s);
});


test('stereo algorithm reverb exposes real AudioWorklet controls and independent patch parameters', async () => {
  assert.match(html, /FX 02 · STEREO ALGORITHM REVERB/);
  assert.match(html, /id="reverb-room"/);
  assert.match(html, /id="reverb-damping"/);
  assert.match(html, /id="reverb-mix"/);
  assert.match(html, /id="reverb-width"/);
  assert.match(html, /id="reverb-predelay"/);
  assert.match(html, /id="reverb-early"/);
  assert.match(engineSource, /roomSize/);
  assert.match(engineSource, /reverbMix/);
  assert.match(js, /reverbControls/);
  assert.match(engineSource, /reverbMix/);
});
