utput = document.querySelector(`#${route}-amount-value`);
  enabled.addEventListener('change', applySynthParameters);
  amount.addEventListener('input', () => {
    const value = Number(amount.value);
    output.value = `${value > 0 ? '+' : ''}${value} st`;
    output.textContent = output.value;
    applySynthParameters();
  });
}
lfoWaveform.addEventListener('change', () => {
  updateLfoWaveformGraph();
  applySynthParameters();
});
lfoRate.addEventListener('input', () => {
  lfoRateOutput.value = `${(Number(lfoRate.value) / 100).toFixed(2)} Hz`;
  lfoRateOutput.textContent = lfoRateOutput.value;
  applySynthParameters();
});
lfoAmount.addEventListener('input', () => {
  const amount = Number(lfoAmount.value);
  lfoAmountOutput.value = `${amount > 0 ? '+' : ''}${amount} st`;
  lfoAmountOutput.textContent = lfoAmountOutput.value;
  updateLfoWaveformGraph();
  applySynthParameters();
});
updateLfoWaveformGraph();

const patchNameInput = document.querySelector('#patch-name');
const patchTitle = document.querySelector('#current-patch-title');
const patchSelect = document.querySelector('#patch-select');
const savePatchButton = document.querySelector('#save-patch');
const loadPatchButton = document.querySelector('#load-patch');

function refreshPatchList(selectedName = '') {
  const names = listPatches(localStorage);
  patchSelect.replaceChildren(new Option('Saved patches', ''));
  for (const name of names) patchSelect.add(new Option(name, name));
  patchSelect.value = selectedName;
  loadPatchButton.disabled = names.length === 0 || !patchSelect.value;
}

patchSelect.addEventListener('change', () => {
  loadPatchButton.disabled = !patchSelect.value;
});

savePatchButton.addEventListener('click', () => {
  try {
    const name = patchNameInput.value.trim();
    const patch = createVirtualAnalogPatch(engine.getParameters(), name);
    savePatch(localStorage, patch);
    patchNameInput.value = patch.name;
    patchTitle.textContent = patch.name;
    refreshPatchList(patch.name);
    message.textContent = `Patch "${patch.name}" salvo localmente neste navegador.`;
  } catch (error) {
    message.textContent = `Não foi possível salvar o patch: ${error.message}`;
  }
});

loadPatchButton.addEventListener('click', () => {
  try {
    if (!patchSelect.value) return;
    const patch = loadPatch(localStorage, patchSelect.value);
    const parameters = applyVirtualAnalogPatch(patch);
    masterLevel.value = String(Math.round(parameters['global.master-level'] * 100));
    masterLevelOutput.value = `${masterLevel.value}%`;
    masterLevelOutput.textContent = `${masterLevel.value}%`;
    document.querySelector('#attack').value = String(Math.round(parameters['engine.virtual-analog.amp-attack'] * 1000));
    document.querySelector('#decay').value = String(Math.round(parameters['engine.virtual-analog.amp-decay'] * 1000));
    document.querySelector('#sustain').value = String(Math.round(parameters['engine.virtual-analog.amp-sustain'] * 100));
    document.querySelector('#release').value = String(Math.round(parameters['engine.virtual-analog.amp-release'] * 1000));
    osc2Enabled.checked = parameters['engine.virtual-analog.osc2-enabled'];
    osc2Wave.value = parameters['engine.virtual-analog.osc2-wave'];
    osc2Level.value = String(Math.round(parameters['engine.virtual-analog.osc2-level'] * 100));
    osc2LevelOutput.value = `${osc2Level.value}%`;
    osc2LevelOutput.textContent = osc2LevelOutput.value;
    osc2Octave.value = String(parameters['engine.virtual-analog.osc2-octave']);
    osc2Semitone.value = String(parameters['engine.virtual-analog.osc2-semitone']);
    osc2SemitoneOutput.value = `${osc2Semitone.value} st`;
    osc2SemitoneOutput.textContent = osc2SemitoneOutput.value;
    osc2Fine.value = String(parameters['engine.virtual-analog.osc2-fine']);
    osc2FineOutput.value = `${osc2Fine.value} cents`;
    osc2FineOutput.textContent = osc2FineOutput.value;
    updateOscillator2Readouts();
    filterEnvRouteEnabled.checked = parameters['engine.virtual-analog.filter-env-route-enabled'];
    for (const [id, factor] of [['pitch-env-attack', 1000], ['pitch-env-decay', 1000], ['pitch-env-sustain', 100], ['pitch-env-release', 1000]]) {
      const input = document.querySelector(`#${id}`);
      const output = document.querySelector(`#${id}-value`);
      input.value = String(Math.round(parameters[`engine.virtual-analog.${id}`] * factor));
      output.value = `${input.value}${factor === 100 ? '%' : 'ms'}`;
      output.textContent = output.value;
    }
    document.querySelector('#pitch-env-osc1-enabled').checked = parameters['engine.virtual-analog.pitch-env-osc1-enabled'];
    document.querySelector('#pitch-env-osc1-amount').value = String(parameters['engine.virtual-analog.pitch-env-osc1-amount']);
    document.querySelector('#pitch-env-osc1-amount-value').value = `${parameters['engine.virtual-analog.pitch-env-osc1-amount'] > 0 ? '+' : ''}${parameters['engine.virtual-analog.pitch-env-osc1-amount']} st`;
    document.querySelector('#pitch-env-osc1-amount-value').textContent = document.querySelector('#pitch-env-osc1-amount-value').value;
    document.querySelector('#pitch-env-osc2-enabled').checked = parameters['engine.virtual-analog.pitch-env-osc2-enabled'];
    document.querySelector('#pitch-env-osc2-amount').value = String(parameters['engine.virtual-analog.pitch-env-osc2-amount']);
    document.querySelector('#pitch-env-osc2-amount-value').value = `${parameters['engine.virtual-analog.pitch-env-osc2-amount'] > 0 ? '+' : ''}${parameters['engine.virtual-analog.pitch-env-osc2-amount']} st`;
    document.querySelector('#pitch-env-osc2-amount-value').textContent = document.querySelector('#pitch-env-osc2-amount-value').value;
    updatePitchEnvelopeGraph();
    document.querySelector('#eg-osc1-enabled').checked = parameters['engine.virtual-analog.eg-osc1-pitch-enabled'];
    document.querySelector('#eg-osc1-amount').value = String(parameters['engine.virtual-analog.eg-osc1-pitch-amount']);
    document.querySelector('#eg-osc1-amount-value').value = `${parameters['engine.virtual-analog.eg-osc1-pitch-amount'] > 0 ? '+' : ''}${parameters['engine.virtual-analog.eg-osc1-pitch-amount']} st`;
    document.querySelector('#eg-osc1-amount-value').textContent = document.querySelector('#eg-osc1-amount-value').value;
    document.querySelector('#eg-osc2-enabled').checked = parameters['engine.virtual-analog.eg-osc2-pitch-enabled'];
    document.querySelector('#eg-osc2-amount').value = String(parameters['engine.virtual-analog.eg-osc2-pitch-amount']);
    document.querySelector('#eg-osc2-amount-value').value = `${parameters['engine.virtual-analog.eg-osc2-pitch-amount'] > 0 ? '+' : ''}${parameters['engine.virtual-analog.eg-osc2-pitch-amount']} st`;
    document.querySelector('#eg-osc2-amount-value').textContent = document.querySelector('#eg-osc2-amount-value').value;
    document.querySelector('#lfo-osc1-enabled').checked = parameters['engine.virtual-analog.lfo-osc1-pitch-enabled'];
    document.querySelector('#lfo-osc1-amount').value = String(parameters['engine.virtual-analog.lfo-osc1-pitch-amount']);
    document.querySelector('#lfo-osc1-amount-value').value = `${parameters['engine.virtual-analog.lfo-osc1-pitch-amount'] > 0 ? '+' : ''}${parameters['engine.virtual-analog.lfo-osc1-pitch-amount']} st`;
    document.querySelector('#lfo-osc1-amount-value').textContent = document.querySelector('#lfo-osc1-amount-value').value;
    document.querySelector('#lfo-osc2-enabled').checked = parameters['engine.virtual-analog.lfo-osc2-pitch-enabled'];
    document.querySelector('#lfo-osc2-amount').value = String(parameters['engine.virtual-analog.lfo-osc2-pitch-amount']);
    document.querySelector('#lfo-osc2-amount-value').value = `${parameters['engine.virtual-analog.lfo-osc2-pitch-amount'] > 0 ? '+' : ''}${parameters['engine.virtual-analog.lfo-osc2-pitch-amount']} st`;
    document.querySelector('#lfo-osc2-amount-value').textContent = document.querySelector('#lfo-osc2-amount-value').value;
    lfoRouteEnabled.checked = parameters['engine.virtual-analog.lfo1-route-enabled'];
    filterMode.value = parameters['engine.virtual-analog.filter-mode'];
    filterCutoff.value = String(Math.round(Math.log(parameters['engine.virtual-analog.filter-cutoff'] / 20) / Math.log(1000) * 1000));
    filterCutoffOutput.value = parameters['engine.virtual-analog.filter-cutoff'] >= 1000 ? `${(parameters['engine.virtual-analog.filter-cutoff'] / 1000).toFixed(2)} kHz` : `${Math.round(parameters['engine.virtual-analog.filter-cutoff'])} Hz`;
    filterCutoffOutput.textContent = filterCutoffOutput.value;
    filterResonance.value = String(Math.round(parameters['engine.virtual-analog.filter-resonance'] * 100));
    filterResonanceOutput.value = `${parameters['engine.virtual-analog.filter-resonance'].toFixed(2)} Q`;
    filterResonanceOutput.textContent = filterResonanceOutput.value;
    for (const [id, unit] of [
      ['filter-env-attack', 'ms'],
      ['filter-env-decay', 'ms'],
      ['filter-env-sustain', '%'],
      ['filter-env-release', 'ms'],
      ['filter-env-amount', 'st'],
    ]) {
      const value = parameters[`engine.virtual-analog.${id.replace('filter-env-', 'filter-env-')}`];
      const input = document.querySelector(`#${id}`);
      const output = document.querySelector(`#${id}-value`);
      input.value = String(id === 'filter-env-amount' ? value : Math.round(value * (unit === '%' ? 100 : 1000)));
      output.value = id === 'filter-env-amount'
        ? `${value > 0 ? '+' : ''}${value} ${unit}`
        : `${input.value}${unit}`;
      output.textContent = output.value;
    }
    updateFilterEnvelopeGraph();
    lfoWaveform.value = parameters['engine.virtual-analog.lfo1-waveform'];
    lfoRate.value = String(Math.round(parameters['engine.virtual-analog.lfo1-rate'] * 100));
    lfoRateOutput.value = `${parameters['engine.virtual-analog.lfo1-rate'].toFixed(2)} Hz`;
    lfoRateOutput.textContent = lfoRateOutput.value;
    lfoAmount.value = String(parameters['engine.virtual-analog.lfo1-amount']);
    lfoAmountOutput.value = `${parameters['engine.virtual-analog.lfo1-amount'] > 0 ? '+' : ''}${parameters['engine.virtual-analog.lfo1-amount']} st`;
    lfoAmountOutput.textContent = lfoAmountOutput.value;
    updateLfoWaveformGraph();
    for (const [id, unit] of [['attack', 'ms'], ['decay', 'ms'], ['sustain', '%'], ['release', 'ms']]) {
      const input = document.querySelector(`#${id}`);
      const output = document.querySelector(`#${id}-value`);
      output.value = `${input.value}${unit}`;
      output.textContent = `${input.value}${unit}`;
    }
    updateEnvelopeGraph();
    setWaveform(parameters['engine.virtual-analog.osc-wave']);
    engine.setParameters(parameters);
    patchNameInput.value = patch.name;
    patchTitle.textContent = patch.name;
    message.textContent = `Patch "${patch.name}" carregado. Parâmetros aplicados ao motor.`;
  } catch (error) {
    message.textContent = `Não foi possível carregar o patch: ${error.message}`;
  }
});

try {
  refreshPatchList();
} catch (error) {
  message.textContent = `Armazenamento local indisponível: ${error.message}`;
}

document.querySelector('#stop-all').addEventListener('click', () => {
  for (const pointerId of [...activePointers.keys()]) releasePointer(pointerId);
  message.textContent = 'Notas liberadas. As caudas ADSR continuam até o fim do release.';
});

setWaveform('saw');
updateEnvelopeGraph();
syncHeldKeys();

window.addEventListener('pagehide', async () => {
  for (const record of activePointers.values()) {
    record.released = true;
    record.button.classList.remove('down');
  }
  activePointers.clear();
  syncHeldKeys();

  state.classList.remove('on');
  stateLabel.textContent = 'ENGINE CLOSING';
  workletState.textContent = 'CLOSING';
  message.textContent = 'Fechando o motor de áudio ao sair desta página.';

  try {
    await engine.close();
    stateLabel.textContent = 'ENGINE CLOSED · TOUCH TO RESTART';
    workletState.textContent = 'CLOSED';
    message.textContent = 'Motor fechado. Ao voltar, toque no teclado para reinicializar o áudio.';
  } catch (error) {
    stateLabel.textContent = 'ENGINE CLOSE ERROR';
    workletState.textContent = 'CLOSE ERROR';
    message.textContent = `Falha ao fechar o motor: ${error.message}`;
  }
});
