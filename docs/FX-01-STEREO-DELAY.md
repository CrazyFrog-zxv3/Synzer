# SYNZER FX 01 — Stereo Feedback Delay

**Status:** implementado e integrado ao AudioWorklet na branch `feature/synth-filter-modes-v0.1.0`.

## Roteamento

O delay é um barramento global pós-motor. O sinal de Virtual Analog, Wavetable ou FM é renderizado primeiro e atravessa o mesmo processador estéreo depois da síntese. O efeito não altera fase de osciladores, envelopes por voz ou estados dos filtros internos.

## Parâmetros

- Time: 5 ms a 2 s, com leitura fracionária interpolada.
- Feedback: -95% a +95%.
- Wet/Dry: 0% a 100%, mistura linear.
- Ping-Pong: alterna o caminho de realimentação entre L/R; desligado mantém realimentação por canal.
- Mudanças de tempo são suavizadas ao longo de aproximadamente 20 ms.
- Buffer circular alocado uma vez, com capacidade para 2 s por canal; o processamento por bloco não cria arrays ou nós novos.

## Segurança e limites

- O feedback é limitado para evitar crescimento instável em condições normais.
- O modo inicial é 0% wet, portanto a saída permanece transparente até o usuário elevar a mistura.
- Não há sincronização de tempo por BPM, subdivisões musicais, filtro de feedback, ducking ou automação por LFO neste incremento.
- Os parâmetros do FX ainda não fazem parte do patch v1. Salvar e carregar patches não persiste este estado; ele permanece em memória durante a sessão.
- O teste de desempenho disponível foi executado em Linux x64/Node 22, não no Android. Não constitui garantia de CPU, latência ou estabilidade no POCO.

## Validação

- Testes unitários: impulso atrasado, feedback ping-pong alternado, validação de limites, suavização e saída finita, bypass wet=0.
- Testes AudioWorklet: atualização validada e rejeição sem corromper estado.
- Teste de controlador: parâmetros preservados antes da inicialização e atualizados no Worklet ativo.
- Browser smoke Chromium: controles de time, feedback, mix e ping-pong respondem sem erros de página.
- Benchmark: `npm run bench:delay`, 48 kHz, blocos de 128 amostras, stereo ping-pong, feedback 82%, wet 55%; resultado é informativo e específico do runner.

## Persistência em patches

Desde o incremento de persistência, os patches VA e FM guardam TIME, FEEDBACK, WET/DRY e PING-PONG em `globalParameters` usando os IDs `global.fx-delay-time`, `global.fx-delay-feedback`, `global.fx-delay-mix` e `global.fx-delay-ping-pong`. O schema permanece na versão 1: os campos são opcionais e patches anteriores continuam válidos. Ao carregar um patch sem metadados FX, o barramento recebe os defaults do FX 01 (`375 ms`, `28%`, `0% wet`, ping-pong desligado). Os parâmetros FX são separados do mapa enviado aos motores de síntese.

## FX 02 — Stereo Algorithm Reverb

O barramento global agora inclui um Reverb estéreo algorítmico Schroeder após o Delay. A rede usa quatro comb filters amortecidos em paralelo por canal, seguidos de duas etapas all-pass de difusão por canal. Os comprimentos são escalados pela taxa de amostragem e os buffers são pré-alocados fora do caminho por amostra.

Parâmetros: `roomSize` (0–0.98, controla o feedback/tempo de decaimento), `damping` (0–1, amortecimento do estado dos combs), `reverbMix` (0–1, mistura wet/dry independente do Delay), `width` (0–1, largura estéreo do retorno), `preDelayMs` (0–200 ms antes da rede reverberante) e `earlyLevel` (0–1, nível independente das primeiras reflexões). As reflexões iniciais usam taps discretos assimétricos por canal e crossfeed estéreo dedicado; a cauda difusa recebe o sinal após o predelay. O retorno wet tem ganho interno conservador para limitar acúmulo. Wet inicia em 0%.

Limites: é um algoritmo Schroeder compacto, não uma convolução; não carrega IRs, não oferece predelay, modulação de cauda, early-reflection modelado ou ducking. O damping atua no feedback dos combs. O custo depende da taxa de amostragem e do tamanho dos blocos. O teste de benchmark Node/Linux não substitui medição em Android.

Os seis parâmetros são persistidos em patches v1 como campos globais opcionais `global.fx-reverb-room-size`, `global.fx-reverb-damping`, `global.fx-reverb-mix` e `global.fx-reverb-width`, `global.fx-reverb-predelay-ms` e `global.fx-reverb-early-level`. Patches antigos sem esses campos recebem defaults seguros.
