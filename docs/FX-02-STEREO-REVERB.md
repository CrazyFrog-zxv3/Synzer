# SYNZER FX 02 — Stereo Algorithm Reverb

**Status:** implementado e integrado ao AudioWorklet, UI da FILTER CHAMBER e patches v1 na branch `feature/synth-filter-modes-v0.1.0`.

## Arquitetura do sinal

O barramento global recebe a saída do motor de síntese após o FX 01 Stereo Feedback Delay. O FX 02 combina predelay, reflexões iniciais discretas e uma cauda difusa Schroeder. A rede usa quatro comb filters amortecidos em paralelo e duas etapas all-pass por canal. Os buffers são pré-alocados; a fase da modulação permanece contínua entre blocos.

As primeiras reflexões usam quatro taps assimétricos por canal e crossfeed estéreo dedicado. `EARLY LEVEL` controla essa camada separadamente da cauda difusa. `STEREO WIDTH` atua sobre o campo wet completo, incluindo early reflections e cauda; em zero, o retorno wet é somado ao centro.

## Controles

- `roomSize`: 0–0.98, define o feedback/tempo de decaimento da rede.
- `damping`: 0–1, amortecimento do estado dos combs.
- `reverbMix`: 0–1, wet/dry independente do Delay; inicia em zero.
- `width`: 0–1, largura estéreo do retorno wet completo.
- `preDelayMs`: 0–200 ms antes da rede reverberante.
- `earlyLevel`: 0–1, nível das primeiras reflexões.
- `modulationRateHz`: 0.05–2 Hz, velocidade lenta de modulação dos estágios de difusão.
- `modulationDepthMs`: 0–2 ms, profundidade da modulação fracionária dos all-pass; inicia em zero para preservar a cauda anterior.

A modulação usa leitura interpolada dos buffers all-pass e deslocamentos de fase entre canais/estágios. Não altera o feedback dos combs. Depth zero usa caminho inteiro sem interpolação fracionária e mantém resposta determinística. A fase avança por amostra e não reinicia nos limites de bloco.

## Persistência

Os parâmetros são campos globais opcionais em patches v1. IDs novos: `global.fx-reverb-modulation-rate` e `global.fx-reverb-modulation-depth`. Patches anteriores recebem defaults neutros (`0.35 Hz`, `0 ms`). Os valores são compartilhados pelos motores VA, Wavetable e FM através do barramento global.

## Limites conhecidos

- Algoritmo Schroeder compacto, não convolução; não carrega IRs.
- Taps de early reflections são discretos e fixos, não uma modelagem geométrica de sala.
- Sem BPM sync, ducking, automação externa ou roteamento modular de efeitos.
- A modulação é um movimento de difusão, não um chorus independente nem modulação de pitch do sinal seco.
- Testes e benchmark desktop não comprovam desempenho, estabilidade ou qualidade auditiva no POCO/Android físico.

## Validação atual

- Testes unitários: parâmetros/ranges, saída finita e limitada no room size máximo, compatibilidade mono em width zero, reset determinístico, modulação mensurável, continuidade entre blocos e modo neutro com depth zero.
- AudioWorklet: parâmetros validados, atualizações independentes do Delay e erros rejeitados sem corromper o estado.
- Patch store: round-trip VA/FM e defaults compatíveis com patches legados.
- Chromium smoke: FX 02 e patch FM com RATE/DEPTH alterados, salvos e restaurados; sem erros de página.
- Benchmark Node/Linux x64, Node 22, 48 kHz, blocos de 128, 20.000 iterações, modulação ativa a 0.7 Hz / 1.2 ms: consultar a saída mais recente de `npm run bench:reverb`; é medida informativa do runner, não benchmark Android.
