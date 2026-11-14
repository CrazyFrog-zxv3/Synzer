uate((input) => { input.value = '2.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await fmUiPage.locator('#fm-op2-index').evaluate((input) => { input.value = '8.5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await fmUiPage.locator('[data-tab=\"global\"]').click();
  await fmUiPage.locator('#delay-time').evaluate((input) => { input.value = '125'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await fmUiPage.locator('#delay-feedback').evaluate((input) => { input.value = '55'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await fmUiPage.locator('#delay-mix').evaluate((input) => { input.value = '35'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await fmUiPage.locator('#delay-ping-pong').check();
  await fmUiPage.locator('#fx-rack-order').selectOption('reverb,delay');
  await fmUiPage.locator('#fx-rack-delay-enabled').uncheck();
  await fmUiPage.locator('#reverb-room').fill('86');
  await fmUiPage.locator('#reverb-damping').fill('62');
  await fmUiPage.locator('#reverb-mix').fill('45');
  await fmUiPage.locator('#reverb-width').fill('90');
  await fmUiPage.locator('#reverb-predelay').fill('48');
  await fmUiPage.locator('#reverb-early').fill('82');
  await fmUiPage.locator('#reverb-mod-rate').fill('0.82');
  await fmUiPage.locator('#reverb-mod-depth').fill('1.15');
  assert.equal(await fmUiPage.locator('#delay-time').inputValue(), '125');
  assert.equal(await fmUiPage.locator('#delay-feedback').inputValue(), '55');
  assert.equal(await fmUiPage.locator('#delay-mix').inputValue(), '35');
  assert.equal(await fmUiPage.locator('#delay-ping-pong').isChecked(), true);
  assert.equal(await fmUiPage.locator('#reverb-room').inputValue(), '86');
  assert.equal(await fmUiPage.locator('#reverb-damping').inputValue(), '62');
  assert.equal(await fmUiPage.locator('#reverb-mix').inputValue(), '45');
  assert.equal(await fmUiPage.locator('#reverb-width').inputValue(), '90');
  assert.equal(await fmUiPage.locator('#reverb-predelay').inputValue(), '48');
  assert.equal(await fmUiPage.locator('#reverb-early').inputValue(), '82');
  assert.equal(await fmUiPage.locator('#reverb-mod-rate').inputValue(), '0.82');
  assert.equal(await fmUiPage.locator('#reverb-mod-depth').inputValue(), '1.15');
  assert.equal(await fmUiPage.locator('#fx-rack-order').inputValue(), 'reverb,delay');
  assert.equal(await fmUiPage.locator('#fx-rack-delay-enabled').isChecked(), false);
  assert.equal(await fmUiPage.locator('#fx-rack-reverb-enabled').isChecked(), true);
  assert.equal(await fmUiPage.locator('#reverb-mod-rate').inputValue(), '0.82');
  assert.equal(await fmUiPage.locator('#reverb-mod-depth').inputValue(), '1.15');
  await fmUiPage.locator('[data-tab=\"waveform\"]').click();
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
  assert.equal(savedFMPatch.globalParameters['global.fx-delay-time'], 0.125);
  assert.equal(savedFMPatch.globalParameters['global.fx-delay-feedback'], 0.55);
  assert.equal(savedFMPatch.globalParameters['global.fx-delay-mix'], 0.35);
  assert.equal(savedFMPatch.globalParameters['global.fx-delay-ping-pong'], true);
  assert.equal(savedFMPatch.globalParameters['global.fx-reverb-room-size'], 0.86);
  assert.equal(savedFMPatch.globalParameters['global.fx-reverb-damping'], 0.62);
  assert.equal(savedFMPatch.globalParameters['global.fx-reverb-mix'], 0.45);
  assert.equal(savedFMPatch.globalParameters['global.fx-reverb-width'], 0.9);
  assert.equal(savedFMPatch.globalParameters['global.fx-reverb-predelay-ms'], 48);
  assert.equal(savedFMPatch.globalParameters['global.fx-reverb-early-level'], 0.82);
  assert.equal(savedFMPatch.globalParameters['global.fx-reverb-modulation-rate'], 0.82);
  assert.equal(savedFMPatch.globalParameters['global.fx-reverb-modulation-depth'], 1.15);
  assert.equal(savedFMPatch.globalParameters['global.fx-rack-order'], 'reverb,delay');
  assert.equal(savedFMPatch.globalParameters['global.fx-rack-delay-enabled'], false);
  assert.equal(savedFMPatch.globalParameters['global.fx-rack-reverb-enabled'], true);
  await fmUiPage.locator('#fm-algorithm').scrollIntoViewIfNeeded();
  await fmUiPage.locator('#fm-algorithm').selectOption('1');
  await fmUiPage.locator('#fm-op2-index').evaluate((input) => { input.value = '1'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await fmUiPage.locator('[data-tab=\"global\"]').click();
  await fmUiPage.locator('#delay-time').evaluate((input) => { input.value = '900'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await fmUiPage.locator('#delay-feedback').evaluate((input) => { input.value = '-20'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await fmUiPage.locator('#delay-mix').evaluate((input) => { input.value = '5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await fmUiPage.locator('#delay-ping-pong').uncheck();
  await fmUiPage.locator('#fx-rack-order').selectOption('delay,reverb');
  await fmUiPage.locator('#fx-rack-delay-enabled').check();
  await fmUiPage.locator('#fx-rack-reverb-enabled').uncheck();
  await fmUiPage.locator('#reverb-room').fill('10');
  await fmUiPage.locator('#reverb-damping').fill('10');
  await fmUiPage.locator('#reverb-mix').fill('10');
  await fmUiPage.locator('#reverb-width').fill('10');
  await fmUiPage.locator('#reverb-mod-rate').fill('0.1');
  await fmUiPage.locator('#reverb-mod-depth').fill('0.1');
  await fmUiPage.locator('[data-tab=\"waveform\"]').click();
  await fmUiPage.locator('#osc1-source').selectOption('virtual-analog');
  await fmUiPage.locator('#patch-select').selectOption('FM Four Op');
  await fmUiPage.locator('#load-patch').click();
  assert.equal(await fmUiPage.locator('#osc1-source').inputValue(), 'fm');
  assert.equal(await fmUiPage.locator('#fm-algorithm').inputValue(), '3');
  assert.equal(await fmUiPage.locator('#fm-op2-index').inputValue(), '8.5');
  assert.equal(await fmUiPage.locator('#fm-feedback').inputValue(), '15');
  assert.equal(await fmUiPage.locator('#delay-time').inputValue(), '125');
  assert.equal(await fmUiPage.locator('#delay-feedback').inputValue(), '55');
  assert.equal(await fmUiPage.locator('#delay-mix').inputValue(), '35');
  assert.equal(await fmUiPage.locator('#delay-ping-pong').isChecked(), true);
  assert.equal(await fmUiPage.locator('#reverb-room').inputValue(), '86');
  assert.equal(await fmUiPage.locator('#reverb-damping').inputValue(), '62');
  assert.equal(await fmUiPage.locator('#reverb-mix').inputValue(), '45');
  assert.equal(await fmUiPage.locator('#reverb-width').inputValue(), '90');
  assert.equal(await fmUiPage.locator('#reverb-predelay').inputValue(), '48');
  assert.equal(await fmUiPage.locator('#reverb-early').inputValue(), '82');
  assert.equal(await fmUiPage.locator('#reverb-mod-rate').inputValue(), '0.82');
  assert.equal(await fmUiPage.locator('#reverb-mod-depth').inputValue(), '1.15');
  assert.equal(await fmUiPage.locator('#reverb-mod-rate').inputValue(), '0.82');
  assert.equal(await fmUiPage.locator('#reverb-mod-depth').inputValue(), '1.15');
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
      'Delay estéreo global recebeu tempo, feedback, wet/dry e ping-pong pelo painel FX',
      'Patch FM, parâmetros dos FX 01/02 e roteamento do FX Rack foram salvos, alterados e restaurados',
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
