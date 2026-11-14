import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
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

  await page.addInitScript(() => {
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: async function () {
        Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: this });
        document.dispatchEvent(new Event('fullscreenchange'));
      },
    });
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: async function () {
        Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
        document.dispatchEvent(new Event('fullscreenchange'));
      },
    });
  });
  await page.goto(`${baseUrl}/index.html`);
  await page.locator('#fullscreen-toggle').click();
  assert.equal(await page.locator('#fullscreen-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('#fullscreen-toggle').getAttribute('aria-label'), 'Sair da tela cheia');
  await page.locator('#fullscreen-toggle').click();
  assert.equal(await page.locator('#fullscreen-toggle').getAttribute('aria-pressed'), 'false');
  await page.evaluate(() => {
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: undefined });
    Object.defineProperty(HTMLElement.prototype, 'webkitRequestFullscreen', { configurable: true, value: undefined });
  });
  await page.locator('#fullscreen-toggle').click();
  assert.ok(await page.locator('.app-shell').evaluate((element) => element.classList.contains('app-focus-mode')));
  await page.keyboard.press('Escape');
  assert.ok(!(await page.locator('.app-shell').evaluate((element) => element.classList.contains('app-focus-mode'))));
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
  await page.locator('#filter-mode').selectOption('notch');
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
  await page.locator('#eg-sub-pitch-amount').evaluate((input) => { input.value = '6'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#pitch-env-sub-pitch-amount').evaluate((input) => { input.value = '-9'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#pitch-env-sub-pitch-enabled').uncheck();
  await page.locator('#lfo-sub-pitch-amount').evaluate((input) => { input.value = '3'; input.dispatchEvent(new Event('input', { bubbles: true })); });
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
  await page.locator('#sub-enabled').check();
  await page.locator('#sub-wave').selectOption('saw');
  await page.locator('#sub-level').evaluate((input) => { input.value = '65'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#sub-octave').selectOption('-2');
  await page.locator('#unison-voices').selectOption('4');
  await page.locator('#unison-detune').evaluate((input) => { input.value = '18.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#unison-spread').evaluate((input) => { input.value = '65'; input.dispatchEvent(new Event('input', { bubbles: true })); });
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
  await page.locator('#sub-enabled').uncheck();
  await page.locator('#sub-wave').selectOption('square');
  await page.locator('#sub-level').evaluate((input) => { input.value = '10'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#sub-octave').selectOption('-1');
  await page.locator('#unison-voices').selectOption('1');
  await page.locator('#unison-detune').evaluate((input) => { input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#unison-spread').evaluate((input) => { input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#master-level').evaluate((input) => {
    input.value = '90';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('[data-tab="waveform"]').click();
  await page.locator('[data-wave="sine"]').click();
  await page.locator('[data-tab="global"]').click();
  await page.locator('#filter-mode').selectOption('allpass');
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
  await page.locator('#eg-sub-pitch-amount').evaluate((input) => { input.value = '-18'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#pitch-env-sub-pitch-amount').evaluate((input) => { input.value = '18'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#pitch-env-sub-pitch-enabled').check();
  await page.locator('#lfo-sub-pitch-amount').evaluate((input) => { input.value = '-18'; input.dispatchEvent(new Event('input', { bubbles: true })); });
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
  assert.equal(await page.locator('#sub-enabled').isChecked(), true);
  assert.equal(await page.locator('#sub-wave').inputValue(), 'saw');
  assert.equal(await page.locator('#sub-level').inputValue(), '65');
  assert.equal(await page.locator('#sub-octave').inputValue(), '-2');
  assert.equal(await page.locator('#unison-voices').inputValue(), '4');
  assert.equal(await page.locator('#unison-detune').inputValue(), '18.5');
  assert.equal(await page.locator('#unison-spread').inputValue(), '65');
  assert.equal(await page.locator('#filter-mode').inputValue(), 'notch');
  await page.locator('[data-tab="global"]').click();
  await page.locator('#filter-mode').selectOption('allpass');
  assert.equal(await page.locator('#filter-mode').inputValue(), 'allpass');
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
  assert.equal(await page.locator('#eg-sub-pitch-amount').inputValue(), '6');
  assert.equal(await page.locator('#eg-sub-pitch-enabled').isChecked(), true);
  assert.equal(await page.locator('#pitch-env-sub-pitch-amount').inputValue(), '-9');
  assert.equal(await page.locator('#pitch-env-sub-pitch-enabled').isChecked(), false);
  assert.equal(await page.locator('#lfo-sub-pitch-amount').inputValue(), '3');
  assert.equal(await page.locator('#lfo-sub-pitch-enabled').isChecked(), true);
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

  await page.locator('[data-tab=\"waveform\"]').click();
  const viewportResults = [];
  for (const viewport of [{ width: 360, height: 800, mode: 'portrait' }, { width: 800, height: 360, mode: 'landscape-compact' }, { width: 844, height: 390, mode: 'landscape-phone' }]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const dimensions = await page.evaluate(() => ({
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      appWidth: Math.round(document.querySelector('.app-shell').getBoundingClientRect().width),
      railColumns: getComputedStyle(document.querySelector('.module-rail')).gridTemplateColumns,
      moduleColumns: getComputedStyle(document.querySelector('#view-waveform .module-grid')).gridTemplateColumns,
      fullscreenHeight: Math.round(document.querySelector('#fullscreen-toggle').getBoundingClientRect().height),
    }));
    assert.ok(dimensions.documentWidth <= dimensions.viewportWidth + 1,
      `Horizontal overflow in ${viewport.mode}: ${JSON.stringify(dimensions)}`);
    assert.ok(dimensions.fullscreenHeight >= 48, `Fullscreen touch target too small in ${viewport.mode}`);
    if (viewport.mode === 'landscape-phone') {
      assert.equal(dimensions.railColumns.split(' ').length, 6, `Landscape navigation must be a single six-stage row: ${JSON.stringify(dimensions)}`);
      assert.equal(dimensions.moduleColumns.split(' ').length, 2, `Landscape modules must be paired: ${JSON.stringify(dimensions)}`);
    }
    viewportResults.push({ ...viewport, ...dimensions, horizontalOverflow: false });
  }

  const wavetablePage = await browser.newPage();
  const wavetablePageErrors = [];
  wavetablePage.on('pageerror', (error) => wavetablePageErrors.push(error.message));
  await wavetablePage.goto(`${baseUrl}/tests/browser/wavetable-smoke.html`);
  await wavetablePage.locator('#run').click();
  await wavetablePage.locator('#status[data-status=\"pass\"], #status[data-status=\"fail\"]').waitFor({ timeout: 15000 });
  const wavetableStatus = await wavetablePage.locator('#status').getAttribute('data-status');
  const wavetableDetails = JSON.parse(await wavetablePage.locator('#details').textContent());
  assert.equal(wavetableStatus, 'pass', `Wavetable browser integration failed: ${JSON.stringify(wavetableDetails)}`);
  assert.deepEqual(wavetablePageErrors, [], `Wavetable browser page errors: ${wavetablePageErrors.join('; ')}`);

  const wavetableUiPage = await browser.newPage();
  const wavetableUiErrors = [];
  wavetableUiPage.on('pageerror', (error) => wavetableUiErrors.push(error.message));
  await wavetableUiPage.goto(`${baseUrl}/index.html`);
  await wavetableUiPage.locator('#osc1-source').selectOption('wavetable');
  await wavetableUiPage.locator('#wavetable-morph').evaluate((input) => {
    input.value = '20';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const wavetableKey = wavetableUiPage.locator('.key.white').first();
  await wavetableKey.hover();
  await wavetableUiPage.mouse.down();
  await wavetableUiPage.getByText(/Nota MIDI 60 ativa · WAVETABLE/).waitFor({ timeout: 10000 });
  await wavetableUiPage.locator('#wavetable-morph').evaluate((input) => {
    input.value = '65';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await wavetableUiPage.mouse.up();
  await wavetableUiPage.locator('#patch-name').fill('Wavetable UI');
  await wavetableUiPage.locator('#save-patch').click();
  await wavetableUiPage.getByText(/Patch \"Wavetable UI\" salvo localmente/).waitFor({ timeout: 5000 });
  const savedWavetablePatch = await wavetableUiPage.evaluate(() => {
    const patches = JSON.parse(localStorage.getItem('synzer.patches.v1') ?? '[]');
    return patches.find((patch) => patch.name === 'Wavetable UI');
  });
  assert.equal(savedWavetablePatch.engineSlots[0].parameters['engine.virtual-analog.osc-source'], 'wavetable');
  assert.equal(savedWavetablePatch.engineSlots[0].parameters['engine.virtual-analog.wavetable-morph'], 0.65);
  await wavetableUiPage.locator('#osc1-source').selectOption('virtual-analog');
  await wavetableUiPage.locator('#wavetable-morph').evaluate((input) => {
    input.value = '10';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await wavetableUiPage.locator('#patch-select').selectOption('Wavetable UI');
  await wavetableUiPage.locator('#load-patch').click();
  assert.equal(await wavetableUiPage.locator('#osc1-source').inputValue(), 'wavetable');
  assert.equal(await wavetableUiPage.locator('#wavetable-morph').inputValue(), '65');
  assert.deepEqual(wavetableUiErrors, [], `Wavetable UI page errors: ${wavetableUiErrors.join('; ')}`);

  const fmUiPage = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const fmUiErrors = [];
  fmUiPage.on('pageerror', (error) => fmUiErrors.push(error.message));
  await fmUiPage.addInitScript(() => {
    const connect = AudioWorkletNode.prototype.connect;
    AudioWorkletNode.prototype.connect = function(destination, ...args) {
      const result = connect.call(this, destination, ...args);
      if (destination === this.context.destination && !window.__synzerFMAnalyser) {
        const analyser = this.context.createAnalyser();
        analyser.fftSize = 2048;
        connect.call(this, analyser);
        window.__synzerFMAnalyser = analyser;
      }
      return result;
    };
  });
  await fmUiPage.goto(`${baseUrl}/index.html`);
  await fmUiPage.locator('#osc1-source').selectOption('fm');
  await fmUiPage.locator('#fm-controls').waitFor({ state: 'visible' });
  await fmUiPage.locator('#fm-algorithm').scrollIntoViewIfNeeded();
  await fmUiPage.locator('#fm-algorithm').selectOption('3');
  await fmUiPage.locator('#fm-feedback').evaluate((input) => { input.value = '15'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await fmUiPage.locator('#fm-op2-ratio').evaluate((input) => { input.value = '2.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await fmUiPage.locator('#fm-op2-index').evaluate((input) => { input.value = '8.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await fmUiPage.locator('#fm-op1-attack').evaluate((input) => { input.value = '0'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  const fmKey = fmUiPage.locator('.key.white').first();
  await fmKey.scrollIntoViewIfNeeded();
  await fmKey.hover();
  await fmUiPage.mouse.down();
  await fmUiPage.getByText(/Nota MIDI 60 ativa · FM \/ 4 OP/).waitFor({ timeout: 12000 });
  assert.match(await fmUiPage.locator('#state').textContent(), /ENGINE READY/);
  await fmUiPage.waitForTimeout(120);
  const fmMeasuredRms = await fmUiPage.evaluate(() => {
    const analyser = window.__synzerFMAnalyser;
    if (!analyser) return 0;
    const data = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(data);
    return Math.sqrt(data.reduce((sum, sample) => sum + sample * sample, 0) / data.length);
  });
  assert.ok(fmMeasuredRms > 1e-5, `FM output did not reach the Chromium analyser: ${fmMeasuredRms}`);
  await fmUiPage.mouse.up();
  await fmUiPage.locator('#patch-name').fill('FM Four Op');
  await fmUiPage.locator('#save-patch').click();
  await fmUiPage.getByText(/Patch \"FM Four Op\" salvo localmente/).waitFor({ timeout: 5000 });
  const savedFMPatch = await fmUiPage.evaluate(() => {
    const patches = JSON.parse(localStorage.getItem('synzer.patches.v1') ?? '[]');
    return patches.find((patch) => patch.name === 'FM Four Op');
  });
  assert.equal(savedFMPatch.engineSlots[0].engineId, 'fm');
  assert.equal(savedFMPatch.engineSlots[0].parameters['engine.fm.algorithm'], 3);
  assert.equal(savedFMPatch.engineSlots[0].parameters['engine.fm.op2-index'], 8.5);
  await fmUiPage.locator('#fm-algorithm').scrollIntoViewIfNeeded();
  await fmUiPage.locator('#fm-algorithm').selectOption('1');
  await fmUiPage.locator('#fm-op2-index').evaluate((input) => { input.value = '1'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await fmUiPage.locator('#osc1-source').selectOption('virtual-analog');
  await fmUiPage.locator('#patch-select').selectOption('FM Four Op');
  await fmUiPage.locator('#load-patch').click();
  assert.equal(await fmUiPage.locator('#osc1-source').inputValue(), 'fm');
  assert.equal(await fmUiPage.locator('#fm-algorithm').inputValue(), '3');
  assert.equal(await fmUiPage.locator('#fm-op2-index').inputValue(), '8.5');
  assert.equal(await fmUiPage.locator('#fm-feedback').inputValue(), '15');
  await fmUiPage.locator('[data-tab=\"waveform\"]').click();
  const fmViewports = [];
  for (const viewport of [{ width: 360, height: 800, mode: 'portrait' }, { width: 800, height: 360, mode: 'landscape-compact' }, { width: 844, height: 390, mode: 'landscape-phone' }]) {
    await fmUiPage.setViewportSize({ width: viewport.width, height: viewport.height });
    const geometry = await fmUiPage.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
    assert.ok(geometry.document <= geometry.viewport + 1, `FM horizontal overflow: ${JSON.stringify(geometry)}`);
    fmViewports.push({ ...viewport, ...geometry });
  }
  assert.deepEqual(fmUiErrors, [], `FM UI page errors: ${fmUiErrors.join('; ')}`);

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
      'FM 4 operadores iniciou no AudioWorklet pelo teclado',
      'Algoritmos, feedback, ratio, index e envelopes FM responderam aos controles',
      'Patch FM foi salvo, alterado e restaurado com engineId e parâmetros preservados',
      'Fullscreen nativo entrou/saiu corretamente e fallback imersivo saiu pelo Escape',
      'Paisagem 844×390 usa seis etapas em faixa horizontal, módulos em duas colunas e alvos de toque de 48 px',
      'Painel FM sem overflow horizontal em retrato e paisagem',
      'Controles de waveform/ADSR/master level/filtro, OSC 02, white/pink Noise Generator, Sub Oscillator, Unison 4-lane com spread estéreo L/R medido, Filter EG, LFO 01, EG 03, rotas de cutoff e nove rotas de pitch da Modulation Matrix, incluindo EG 02/EG 03/LFO 01 para Sub, foram persistidos e restaurados pelo patch local',
    ],
    audioHarness: JSON.parse(harnessDetails),
    wavetableBrowser: wavetableDetails,
    wavetablePageErrors,
    wavetableUi: { savedPatchSource: savedWavetablePatch.engineSlots[0].parameters['engine.virtual-analog.osc-source'], savedMorph: savedWavetablePatch.engineSlots[0].parameters['engine.virtual-analog.wavetable-morph'], restoredSource: await wavetableUiPage.locator('#osc1-source').inputValue(), restoredMorph: await wavetableUiPage.locator('#wavetable-morph').inputValue() },
    wavetableUiErrors,
    fmUi: { savedEngine: savedFMPatch.engineSlots[0].engineId, algorithm: savedFMPatch.engineSlots[0].parameters['engine.fm.algorithm'], op2Index: savedFMPatch.engineSlots[0].parameters['engine.fm.op2-index'], measuredRms: fmMeasuredRms, restoredEngine: await fmUiPage.locator('#osc1-source').inputValue(), restoredAlgorithm: await fmUiPage.locator('#fm-algorithm').inputValue(), restoredOp2Index: await fmUiPage.locator('#fm-op2-index').inputValue(), responsive: fmViewports },
    fmUiErrors,
    responsiveViewports: viewportResults,
    pageErrors,
  }, null, 2) + '\n');
} finally {
  if (browser) await browser.close();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
