MControls(fmParameters);
      updateOscillatorSourceUI();
      engine.setEngine('fm');
      engine.setFMParameters(fmParameters);
      patchNameInput.value = patch.name;
      patchTitle.textContent = patch.name;
      message.textContent = `Patch FM \"${patch.name}\" carregado com quatro operadores.`;
      return;
    }
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
    noiseEnabled.checked = parameters['engine.virtual-analog.noise-enabled'];
    noiseColor.value = parameters['engine.virtual-analog.noise-color'];
    noiseLevel.value = String(Math.round(parameters['engine.virtual-analog.noise-level'] * 100));
    noiseLevelOutput.value = `${noiseLevel.value}%`;
    noiseLevelOutput.textContent = noiseLevelOutput.value;
    subEnabled.checked = parameters['engine.virtual-analog.sub-enabled'];
    subWave.value = parameters['engine.virtual-analog.sub-wave'];
    subLevel.value = String(Math.round(parameters['engine.virtual-analog.sub-level'] * 100));
    subLevelOutput.value = `${subLevel.value}%`;
    subLevelOutput.textContent = subLevelOutput.value;
    subOctave.value = String(parameters['engine.virtual-analog.sub-octave']);
    unisonVoices.value = String(parameters['engine.virtual-analog.unison-voices']);
    unisonDetune.value = String(parameters['engine.virtual-analog.unison-detune']);
    unisonDetuneOutput.value = `${Number(unisonDetune.value).toFixed(1)} cents`;
    unisonDetuneOutput.textContent = unisonDetuneOutput.value;
    unisonSpread.value = String(parameters['engine.virtual-analog.unison-spread']);
    unisonSpreadOutput.value = `${unisonSpread.value}%`;
    unisonSpreadOutput.textContent = unisonSpreadOutput.value;
    filterEnvRouteEnabled.checked = parameters['engine.virtual-analog.filter-env-route-enabled'];
    for (const [id, factor, unit] of [
      ['pitch-env-attack', 1000, 'ms'],
      ['pitch-env-decay', 1000, 'ms'],
      ['pitch-env-sustain', 100, '%'],
      ['pitch-env-release', 1000, 'ms'],
    ]) {
      const input = document.querySelector(`#${id}`);
      const output = document.querySelector(`#${id}-value`);
      input.value = String(Math.round(parameters[`engine.virtual-analog.${id}`] * factor));
      output.value = `${input.value}${unit}`;
      output.textContent = output.value;
    }
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
    for (const [id, amountKey, enabledKey] of [
      ['pitch-env-osc1', 'engine.virtual-analog.pitch-env-osc1-amount', 'engine.virtual-analog.pitch-env-osc1-enabled'],
      ['pitch-env-osc2', 'engine.virtual-analog.pitch-env-osc2-amount', 'engine.virtual-analog.pitch-env-osc2-enabled'],
    ]) {
      const amount = document.querySelector(`#${id}-amount`);
      const output = document.querySelector(`#${id}-amount-value`);
      const value = parameters[amountKey];
      amount.value = String(value);
      output.value = `${value > 0 ? '+' : ''}${value} st`;
      output.textContent = output.value;
      document.querySelector(`#${id}-enabled`).checked = parameters[enabledKey];
    }
    for (const [id, amountKey, enabledKey] of [
      ['eg-sub-pitch', 'engine.virtual-analog.eg-sub-pitch-amount', 'engine.virtual-analog.eg-sub-pitch-enabled'],
      ['pitch-env-sub-pitch', 'engine.virtual-analog.pitch-env-sub-pitch-amount', 'engine.virtual-analog.pitch-env-sub-pitch-enabled'],
      ['lfo-sub-pitch', 'engine.virtual-analog.lfo-sub-pitch-amount', 'engine.virtual-analog.lfo-sub-pitch-enabled'],
    ]) {
      const amount = document.querySelector(`#${id}-amount`);
      const output = document.querySelector(`#${id}-amount-value`);
      const value = parameters[amountKey];
      amount.value = String(value);
      output.value = `${value > 0 ? '+' : ''}${value} st`;
      output.textContent = output.value;
      document.querySelector(`#${id}-enabled`).checked = parameters[enabledKey];
    }
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
    osc1Source.value = parameters['engine.virtual-analog.osc-source'];
    updateOscillatorSourceUI();
    engine.setEngine('virtual-analog');
    wavetableMorph.value = String(Math.round(parameters['engine.virtual-analog.wavetable-morph'] * 100));
    updateWavetableMorphReadout();
    updateOscillatorSourceUI();
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
updateWavetableMorphReadout();
updateOscillatorSourceUI();
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
