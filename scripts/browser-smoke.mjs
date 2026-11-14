import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const filePath = path.resolve(root, `.${pathname}`);
    if (!filePath.startsWith(root + path.sep) && filePath !== root) throw new Error('Invalid path');
    const body = await readFile(filePath);
    response.writeHead(200, { 'content-type': mime[path.extname(filePath)] ?? 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(`${baseUrl}/tests/browser/smoke.html`);
  await page.locator('#run').click();
  await page.locator('#status[data-status="pass"], #status[data-status="fail"]').waitFor({ timeout: 15000 });
  const harnessStatus = await page.locator('#status').getAttribute('data-status');
  const harnessDetails = await page.locator('#details').textContent();
  assert.equal(harnessStatus, 'pass', `Browser audio harness failed: ${await page.locator('#status').textContent()}\n${harnessDetails}`);

  await page.goto(`${baseUrl}/index.html`);
  const firstKey = page.locator('#keyboard .key').first();
  await firstKey.scrollIntoViewIfNeeded();
  const keyBox = await firstKey.boundingBox();
  await page.mouse.move(keyBox.x + keyBox.width / 2, keyBox.y + keyBox.height / 2);
  await page.mouse.down();
  await page.locator('#message').filter({ hasText: /Nota MIDI 60 ativa/ }).waitFor({ timeout: 15000 });
  assert.match(await page.locator('#state').textContent(), /ENGINE READY/);
  await page.mouse.up();

  await page.locator('#master-level').evaluate((input) => {
    input.value = '42';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('[data-wave="square"]').click();
  await page.locator('#osc2-enabled').check();
  await page.locator('#osc2-wave').selectOption('square');
  await page.locator('#osc2-level').evaluate((input) => { input.value = '65'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#osc2-octave').selectOption('-1');
  await page.locator('#osc2-semitone').evaluate((input) => { input.value = '5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#osc2-fine').evaluate((input) => { input.value = '12'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('[data-tab="global"]').click();
  await page.locator('#filter-mode').selectOption('lowpass');
  await page.locator('#filter-cutoff').evaluate((input) => { input.value = '500'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#filter-resonance').evaluate((input) => { input.value = '350'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#filter-env-attack').evaluate((input) => { input.value = '125'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#filter-env-decay').evaluate((input) => { input.value = '450'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#filter-env-sustain').evaluate((input) => { input.value = '35'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#filter-env-release').evaluate((input) => { input.value = '700'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#pitch-env-attack').evaluate((input) => { input.value = '25'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#pitch-env-decay').evaluate((input) => { input.value = '400'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#pitch-env-sustain').evaluate((input) => { input.value = '20'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#pitch-env-release').evaluate((input) => { input.value = '700'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('[data-tab="matrix"]').click();
  await page.locator('#filter-env-amount').evaluate((input) => { input.value = '-24'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#filter-env-route-enabled').uncheck();
  await page.locator('#lfo1-route-enabled').check();
  await page.locator('#lfo1-amount').evaluate((input) => { input.value = '15'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#eg-osc1-amount').evaluate((input) => { input.value = '12'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#eg-osc1-enabled').uncheck();
  await page.locator('#lfo-osc1-amount').evaluate((input) => { input.value = '-5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#eg-osc2-amount').evaluate((input) => { input.value = '3'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#lfo-osc2-amount').evaluate((input) => { input.value = '7'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#lfo-osc2-enabled').uncheck();
  await page.locator('#pitch-env-osc1-amount').evaluate((input) => { input.value = '24'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#pitch-env-osc1-enabled').check();
  await page.locator('#pitch-env-osc2-amount').evaluate((input) => { input.value = '-12'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#pitch-env-osc2-enabled').uncheck();
  await page.locator('[data-tab="modifiers"]').click();
  await page.locator('#lfo1-waveform').selectOption('triangle');
  await page.locator('#lfo1-rate').evaluate((input) => { input.value = '450'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#attack').evaluate((input) => {
    input.value = '75';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('[data-tab=\"waveform\"]').click();
  await page.locator('#noise-enabled').check();
  await page.locator('#noise-color').selectOption('pink');
  await page.locator('#noise-level').evaluate((input) => { input.value = '70'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#unison-voices').selectOption('4');
  await page.locator('#unison-detune').evaluate((input) => { input.value = '18.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('[data-tab=\"modifiers\"]').click();
  await page.locator('#patch-name').fill('Browser Check');
  await page.locator('#save-patch').click();
  await page.waitForFunction(() => {
    const saved = document.querySelector('#patch-select')?.value === 'Browser Check';
    const failed = document.querySelector('#message')?.textContent.includes('Não foi possível salvar');
    return saved || failed;
  });
  assert.equal(await page.locator('#patch-select').inputValue(), 'Browser Check',
    `Patch save failed: ${await page.locator('#message').textContent()}`);
  assert.equal(await page.locator('#current-patch-title').textContent(), 'Browser Check');
  await page.locator('[data-tab="waveform"]').click();
  await page.locator('#osc2-enabled').uncheck();
  await page.locator('#osc2-wave').selectOption('sine');
  await page.locator('#osc2-level').evaluate((input) => { input.value = '10'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#osc2-octave').selectOption('1');
  await page.locator('#osc2-semitone').evaluate((input) => { input.value = '-5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#osc2-fine').evaluate((input) => { input.value = '-25'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#noise-enabled').uncheck();
  await page.locator('#noise-color').selectOption('white');
  await page.locator('#noise-level').evaluate((input) => { input.value = '10'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#unison-voices').selectOption('1');
  await page.locator('#unison-detune').evaluate((input) => { input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#master-level').evaluate((input) => {
    input.value = '90';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('[data-tab="waveform"]').click();
  await page.locator('[data-wave="sine"]').click();
  await page.locator('[data-tab="global"]').click();
  await page.locator('#filter-mode').selectOption('highpass');
  await page.locator('#filter-cutoff').evaluate((input) => { input.value = '800'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#filter-resonance').evaluate((input) => { input.value = '100'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#filter-env-attack').evaluate((input) => { input.value = '900'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#filter-env-decay').evaluate((input) => { input.value = '100'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#filter-env-sustain').evaluate((input) => { input.value = '90'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#filter-env-release').evaluate((input) => { input.value = '100'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('[data-tab="modifiers"]').click();
  await page.locator('#lfo1-waveform').selectOption('square');
  await page.locator('#lfo1-rate').evaluate((input) => { input.value = '1200'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('[data-tab="matrix"]').click();
  await page.locator('#filter-env-amount').evaluate((input) => { input.value = '36'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#filter-env-route-enabled').check();
  await page.locator('#lfo1-amount').evaluate((input) => { input.value = '-36'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#lfo1-route-enabled').uncheck();
  await page.locator('[data-tab="modifiers"]').click();
  await page.locator('#load-patch').click();
  assert.equal(await page.locator('#master-level').inputValue(), '42');
  assert.equal(await page.locator('#attack').inputValue(), '75');
  assert.equal(await page.locator('#waveform').inputValue(), 'square');
  assert.equal(await page.locator('#osc2-enabled').isChecked(), true);
  assert.equal(await page.locator('#osc2-wave').inputValue(), 'square');
  assert.equal(await page.locator('#osc2-level').inputValue(), '65');
  assert.equal(await page.locator('#osc2-octave').inputValue(), '-1');
  assert.equal(await page.locator('#osc2-semitone').inputValue(), '5');
  assert.equal(await page.locator('#osc2-fine').inputValue(), '12');
  assert.equal(await page.locator('#noise-enabled').isChecked(), true);
  assert.equal(await page.locator('#noise-color').inputValue(), 'pink');
  assert.equal(await page.locator('#noise-level').inputValue(), '70');
  assert.equal(await page.locator('#unison-voices').inputValue(), '4');
  assert.equal(await page.locator('#unison-detune').inputValue(), '18.5');
  assert.equal(await page.locator('#filter-mode').inputValue(), 'lowpass');
  assert.equal(await page.locator('#filter-cutoff').inputValue(), '500');
  assert.equal(await page.locator('#filter-resonance').inputValue(), '350');
  assert.equal(await page.locator('#filter-env-attack').inputValue(), '125');
  assert.equal(await page.locator('#filter-env-decay').inputValue(), '450');
  assert.equal(await page.locator('#filter-env-sustain').inputValue(), '35');
  assert.equal(await page.locator('#filter-env-release').inputValue(), '700');
  assert.equal(await page.locator('#filter-env-amount').inputValue(), '-24');
  assert.equal(await page.locator('#lfo1-waveform').inputValue(), 'triangle');
  assert.equal(await page.locator('#lfo1-rate').inputValue(), '450');
  assert.equal(await page.locator('#lfo1-amount').inputValue(), '15');
  assert.equal(await page.locator('#filter-env-route-enabled').isChecked(), false);
  assert.equal(await page.locator('#lfo1-route-enabled').isChecked(), true);
  assert.equal(await page.locator('#eg-osc1-amount').inputValue(), '12');
  assert.equal(await page.locator('#eg-osc1-enabled').isChecked(), false);
  assert.equal(await page.locator('#lfo-osc1-amount').inputValue(), '-5');
  assert.equal(await page.locator('#eg-osc2-amount').inputValue(), '3');
  assert.equal(await page.locator('#lfo-osc2-amount').inputValue(), '7');
  assert.equal(await page.locator('#lfo-osc2-enabled').isChecked(), false);
  assert.equal(await page.locator('#pitch-env-attack').inputValue(), '25');
  assert.equal(await page.locator('#pitch-env-decay').inputValue(), '400');
  assert.equal(await page.locator('#pitch-env-sustain').inputValue(), '20');
  assert.equal(await page.locator('#pitch-env-release').inputValue(), '700');
  assert.equal(await page.locator('#pitch-env-osc1-amount').inputValue(), '24');
  assert.equal(await page.locator('#pitch-env-osc1-enabled').isChecked(), true);
  assert.equal(await page.locator('#pitch-env-osc2-amount').inputValue(), '-12');
  assert.equal(await page.locator('#pitch-env-osc2-enabled').isChecked(), false);
  assert.equal(await page.locator('#current-patch-title').textContent(), 'Browser Check');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('synzer.patches.v1')).length), 1);

  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => document.querySelector('#state')?.textContent.includes('BACKGROUND'));
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => document.querySelector('#state')?.textContent.includes('ENGINE READY'));

  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  await page.waitForFunction(() => document.querySelector('#state')?.textContent.includes('ENGINE CLOSED'));
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await page.waitForTimeout(50);
  assert.match(await page.locator('#state').textContent(), /ENGINE CLOSED/,
    'pageshow não deve recriar ou retomar o áudio automaticamente');
  await firstKey.scrollIntoViewIfNeeded();
  const resumedKeyBox = await firstKey.boundingBox();
  await page.mouse.move(resumedKeyBox.x + resumedKeyBox.width / 2, resumedKeyBox.y + resumedKeyBox.height / 2);
  await page.mouse.down();
  await page.waitForFunction(() => {
    const text = document.querySelector('#message')?.textContent ?? '';
    return /Nota MIDI 60 ativa/.test(text) || /Falha ao iniciar áudio|Erro no processador/.test(text);
  }, { timeout: 15000 });
  const resumedMessage = await page.locator('#message').textContent();
  assert.match(resumedMessage, /Nota MIDI 60 ativa/, `Audio restart failed: ${resumedMessage}; state=${await page.locator('#state').textContent()}`);
  assert.match(await page.locator('#state').textContent(), /ENGINE READY/);
  await page.mouse.up();

  assert.deepEqual(pageErrors, [], `Browser page errors: ${pageErrors.join('; ')}`);

  const viewportResults = [];
  for (const viewport of [{ width: 360, height: 800, mode: 'portrait' }, { width: 800, height: 360, mode: 'landscape' }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const dimensions = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      appWidth: Math.round(document.querySelector('.app-shell').getBoundingClientRect().width),
    }));
    assert.ok(dimensions.documentWidth <= dimensions.viewportWidth + 1,
      `Horizontal overflow in ${viewport.mode}: ${JSON.stringify(dimensions)}`);
    viewportResults.push({ ...viewport, ...dimensions, horizontalOverflow: false });
  }

  process.stdout.write(JSON.stringify({
    status: 'PASS',
    checks: [
      'AudioContext iniciado por interação real',
      'AudioWorklet carregado no Chromium',
      'Falha de carregamento do Worklet recuperada sem duplicar o nó',
      '12 vozes simultâneas produziram sinal mensurável no AnalyserNode',
      '250 pares repetidos de NOTE_ON/NOTE_OFF sem handles presos',
      'AudioContext suspendeu, retomou e fechou corretamente',
      'Estado de fundo/primeiro plano foi refletido sem retomada automática',
      'pagehide fechou o áudio e pageshow preservou estado fechado',
      'Primeiro toque após pageshow recriou o motor',
      'Teclado da interface principal iniciou uma nota',
      'Controles de waveform/ADSR/master level/filtro, OSC 02, white/pink Noise Generator, 4-lane Unison, Filter EG, LFO 01, EG 03, rotas de cutoff e seis rotas de pitch da Modulation Matrix foram persistidos e restaurados pelo patch local',
    ],
    audioHarness: JSON.parse(harnessDetails),
    responsiveViewports: viewportResults,
    pageErrors,
  }, null, 2) + '\n');
} finally {
  if (browser) await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
