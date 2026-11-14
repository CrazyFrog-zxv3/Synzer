ted below.


## Modulation Matrix v2 · oscillator pitch destinations

The Matrix v2 revision compiled eight fixed routes at that stage: EG 02 and LFO 01 to filter cutoff, OSC 01 pitch, and OSC 02 pitch; EG 03 to OSC 01 and OSC 02 pitch. Pitch destinations are expressed in bipolar semitones (−48…+48) and each route has an independent typed enable flag and amount parameter. Defaults are neutral (amount 0), preserving legacy patch sound.

Per render quantum, route amounts are snapshotted from the compiled matrix. Per sample, EG 02, EG 03 and LFO source values produce separate pitch offsets for each oscillator. The offsets modify phase increments exponentially (`2 ** (semitones / 12)`), with oscillator frequency capped at 45% of sample rate; PolyBLEP receives the modulated increment for discontinuous waveforms. OSC 01 and OSC 02 remain independently routable. No pitch glide/smoothing, dynamic user-created route graph, additional modulation sources, or pitch destinations for future engines are claimed.

New parameter IDs include the eight pitch routes and the EG 03 ADSR: `pitch-env-attack`, `pitch-env-decay`, `pitch-env-sustain`, `pitch-env-release`, `pitch-env-osc1-amount`, `pitch-env-osc1-enabled`, `pitch-env-osc2-amount`, `pitch-env-osc2-enabled`, all under `engine.virtual-analog.`. EG 03 is independent per voice, has its own ADSR stage, and is summed with the other pitch sources before the exponential frequency conversion. It does not reuse the amplitude or filter envelope. Its default route depths are zero, preserving previous sound. Existing PatchStore schema normalizes missing values to neutral defaults, retaining compatibility with earlier local patches.


## Independent pitch envelope · EG 03

The Virtual Analog engine now provides a third per-voice ADSR source dedicated to oscillator pitch. EG 03 has independent attack, decay, sustain and release stages; it does not reuse the amplitude envelope or EG 02. Its bipolar depth is routed independently to OSC 01 and OSC 02 through the modulation matrix, with each destination having its own amount (−48…+48 semitones) and enable flag.

Defaults: attack 5 ms, decay 80 ms, sustain 0, release 80 ms; both pitch-route amounts default to zero. EG 03 therefore remains sonically neutral until a route amount is raised. The envelope state is created on NOTE_ON, released on NOTE_OFF, updated on active voices without resetting its current stage, and included in local patch save/load. Browser smoke verifies the controls and patch round-trip; unit tests verify pitch ratios, independent release, route compilation and defensive state snapshots.

The DSP loop snapshots the two compiled EG 03 route coefficients once per render quantum and advances the envelope once per sample per voice. The informational benchmark includes EG 03 modulation at 12 voices. Desktop benchmark output is not an Android performance claim; physical-device profiling remains outstanding.


## Noise Generator · white and pink

The Virtual Analog voice now includes an optional per-voice noise source. It is mixed with OSC 01 and OSC 02 before the shared TPT filter and amplitude ADSR, so it follows the same note lifecycle and filter response. Each voice receives a deterministic non-zero uint32 seed derived from its allocation sequence; this makes test renders repeatable while keeping voices decorrelated. The PRNG is xorshift32.

- `noise-enabled`: boolean, default false.
- `noise-color`: `white` or `pink`, default `white`.
- `noise-level`: 0…1 linear, default 0.25.

White noise uses a uniform bipolar sequence. Pink mode uses a multi-pole IIR filter based on the Paul Kellet approximation; it reduces high-frequency energy relative to white noise but is not claimed to be a calibrated 1/f source. Color changes preserve the PRNG stream and pink filter state. The generator is allocated per voice, not shared globally.

When noise is disabled or its level is zero, the renderer retains the prior oscillator mix path bit-for-bit. When active, the three sources are linearly summed and normalized by `1 + osc2Level + noiseLevel`, preventing simple additive peak growth. Noise passes through the existing per-voice filter and amplitude envelope; it has no independent pitch or modulation destination yet. Parameters are typed, included in local patches, restored by the UI, and exercised in the Chromium AudioWorklet smoke test with 12 simultaneous voices.

The informational DSP benchmark now includes 12 active pink-noise generators. Desktop timing is not an ARM64/Android performance claim.


## Unison · up to four detuned lanes per note

The Virtual Analog engine now supports 1–4 simultaneous oscillator lanes per note. The same lane count and symmetric detune apply to OSC 01 and OSC 02. For N lanes, the detune positions span `−D…+D` cents evenly around the center; each lane has independent phase accumulators. Each oscillator's lanes are averaged before OSC 01/OSC 02 level mixing, preventing simple linear growth in amplitude.

- `unison-voices`: integer 1…4, default 1 (legacy single-lane behavior).
- `unison-detune`: 0…50 cents, default 12 cents (ignored at one lane).

Changing lane count while notes are active preserves the primary phase and initializes new lanes from it, avoiding a phase reset. Changing detune preserves all existing phase accumulators. The renderer retains the original single-lane code path bit-for-bit when count is 1. Unison supports a mono-compatible stereo spread control described below. It multiplies oscillator workload per active note, and nonzero spread also uses independent left/right filter states; device profiling on ARM64/Android remains required before increasing default polyphony.

The UI exposes lane count and detune in WAVEFORM; patch save/load and the AudioWorklet smoke scenario cover both parameters. The benchmark runs 12 notes with four lanes on both oscillators, 70% stereo spread, pink noise and the existing filter/envelopes/modulation.


## Sub Oscillator · independent low-frequency layer

The Virtual Analog engine now provides a dedicated sub oscillator per note, independent from OSC 01/02 and the Unison phase lanes. It supports sine, saw and square waveforms, octave −1 or −2, a linear level control and an enable flag. Square and saw use the same PolyBLEP band-limiting path as the main oscillators.

The sub follows the note frequency one or two octaves below and receives the combined OSC 01 pitch modulation (EG 02, EG 03 and LFO 01). Its phase is independent and preserved when waveform, level or octave changes on active voices. It shares the existing voice filter and amplitude envelope. Matrix v4 adds three independent Sub pitch routes; a separate Sub envelope and stereo spread are still not implemented.

Defaults: disabled, square, level 0.25, octave −1. Disabled state preserves the prior oscillator signal bit-for-bit. When enabled, Sub is linearly mixed and normalized with OSC 01/02 and Noise. The sub phase advances without rendering a waveform while disabled to avoid unnecessary oscillator work. Parameters are typed and included in local patch save/load; unit tests cover pitch ratio, independent phase, live updates and neutral defaults, while browser smoke covers the UI and patch round-trip.

## TPT filter coefficient lookup

The TPT state-variable filter no longer evaluates `Math.tan()` on every cutoff automation update. A shared 16,384-interval table spans normalized frequency 0…0.45 cycles/sample; linear interpolation supplies `g = tan(pi × fc / fs)`. The table is initialized once when the module loads and shared by every voice/filter instance. Integrator states are unchanged when cutoff coefficients update.

Regression tests compare the first low-pass sample against the exact tangent equation across sample rates 8–384 kHz and supported cutoff values, with absolute error below 1e−6. A second test replaces `Math.tan` after module initialization and verifies 2,000 cutoff updates do not call it. The Linux x64 maximum-load benchmark remains approximately 0.95 ms/block; repeated runs overlap the prior 0.95 ms baseline, so no measurable desktop speedup is claimed. The optimization removes a transcendental call from the sample update path, but its benefit on ARM64 remains unmeasured.


## Sub pitch modulation routes (Matrix v4)

The Sub Oscillator accepts three independent semitone routes: filter envelope (EG 02), pitch envelope (EG 03), and LFO 01. Their typed parameters are `eg-sub-pitch-amount` / `eg-sub-pitch-enabled`, `pitch-env-sub-pitch-amount` / `pitch-env-sub-pitch-enabled`, and `lfo-sub-pitch-amount` / `lfo-sub-pitch-enabled`. Each amount is bipolar −48…+48 semitones and defaults to zero; each enable defaults true. The Sub pitch is calculated as OSC 01's pitch modulation plus these independent route contributions. Thus existing patches retain their previous pitch behavior. The three route amounts are zero by default; route toggles are enabled by default but remain neutral until an amount is raised. The matrix compiles the three coefficients when parameters change; the render loop snapshots them once per quantum and uses them per sample without iterating routes. The controls live in MATRIX, and PatchStore saves/restores all six values through the typed parameter schema. Legacy patches that omit these parameters are normalized to neutral defaults.

The maximum-load Linux x64 benchmark now activates all three Sub routes alongside OSC 01/02, Unison 4, pink Noise, TPT, EG 02/03 and LFO. Across three runs at 48 kHz, 128-sample blocks and 12 voices with Sub routes active, mean time ranged from 0.95252 to 0.95527 ms/block and p95 from 0.99690 to 0.99915 ms/block (35.72–35.82% and 37.38–37.47% of the theoretical block budget). This is the pre-spread baseline. The stereo-spread worst-case benchmark (four lanes, 70% spread, dual TPT filters) measured mean 1.00835–1.01390 ms/block and p95 1.05453–1.05699 ms/block across three runs (37.81–38.02% and 39.54–39.64% of the theoretical budget). These are desktop references only, not Android/ARM64 performance evidence.


## Unison stereo spread

Unison lanes can now be distributed across left/right channels before the per-voice TPT filters. `engine.virtual-analog.unison-spread` is a 0…100 percentage, default 0. Lane positions follow the same symmetric −1…+1 distribution used by detune; a linear balance law attenuates only the opposite channel for each lane. OSC 01 and OSC 02 use the same lane positions. Sub and Noise remain centered. Spread has an audible effect only with at least two Unison lanes and a stereo output.

Each voice owns left/right TPT filter states when spread is active, preserving filtering after the stereo image is created. At zero spread, or with one lane / mono output, only the left filter is processed and its state is copied to the right filter at the end of the render quantum; this avoids doubling filter cost in the default mono-compatible mode. Returning spread from a nonzero value to zero copies the left integrator state to the right before rendering, avoiding a persistent stereo image. Filter cutoff modulation updates both channels. Live spread changes do not reset oscillator phases.

The WAVEFORM panel exposes the 0…100% control and PatchStore persists it. Tests cover lane separation, center equality at zero, live changes, phase continuity, filter-state synchronization and patch round-trip. Chromium AudioWorklet smoke measures a left/right difference RMS of 0.002871 with 65% spread in the current scenario. Android/ARM64 performance and physical headphone listening remain outstanding.


The local patch-store regression suite also verifies JSON save/load round-trips for all six filter modes (`off`, `lowpass`, `highpass`, `bandpass`, `notch`, `allpass`).

### Parâmetros globais do barramento FX

Os parâmetros do Stereo Feedback Delay são opcionais em patches schema v1 e ficam no escopo global: `global.fx-delay-time` (0.005–2 s), `global.fx-delay-feedback` (-0.95–0.95), `global.fx-delay-mix` (0–1) e `global.fx-delay-ping-pong` (boolean). Patches legados sem esses IDs recebem os defaults do FX 01. O carregamento os restaura no barramento global e não os repassa aos parâmetros internos dos motores VA/FM.
