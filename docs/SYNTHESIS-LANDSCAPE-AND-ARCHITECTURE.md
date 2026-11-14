# SYNZER — Panorama de síntese e direção arquitetural

**Data:** 13/11/2026  
**Escopo:** sintetizador virtual Synzer, browser-first e Android-first  
**Estado:** pesquisa comparativa e proposta arquitetural; não significa que os motores descritos já estejam implementados.

## 1. Limite e método da pesquisa

“Todos os sintetizadores do mundo” não constitui um catálogo fechado: há instrumentos comerciais, open source, hardware descontinuado, projetos modulares, variantes e instrumentos experimentais. Portanto, esta pesquisa não afirma exaustividade. Ela cobre famílias de síntese e produtos representativos, priorizando documentação oficial de fabricantes e manuais primários. A finalidade é extrair princípios de arquitetura, não copiar produtos, código, presets, interface ou identidade visual.

## 2. O que os sintetizadores relevantes ensinam

| Referência | Arquitetura e capacidades documentadas | O que aproveitar no Synzer |
|---|---|---|
| **Arturia Pigments** | Motores Virtual Analog, wavetable, sample/granular, harmônico aditivo e modal, slots de engine combináveis, utilitários, filtros duplos, modulação visual, efeitos e sequenciamento generativo. [Arturia: visão geral](https://www.arturia.com/products/software-instruments/pigments/overview) | Modelo de múltiplos motores com slots, filtros/FX comuns e modulação integrada. Não precisamos implementar todos os motores antes de criar a estrutura para recebê-los. |
| **Xfer Serum 2** | Osciladores wavetable, multisample, sample, granular e spectral, além de warping, modulação e roteamento de efeitos. [Página oficial](https://xferrecords.com/products/serum-2) · [Manual: sound design](https://xferrecords.com/web-manual/serum-2/exploring-sound-design-in-serum) | Tratar sample, wavetable, granular e espectral como fontes diferentes, mas compatíveis com a mesma cadeia de voz. Importação/conversão de áudio pode ser um fluxo futuro. |
| **Kilohearts Phase Plant** | Estrutura modular de geradores analógicos, samples, wavetable, granular e ruído; grupos, rotas auxiliares, modulação aberta e modulação em taxa de áudio. [Documentação oficial](https://kilohearts.com/docs/phase_plant) | Separar geração, mixagem, modulação e efeitos. Permitir camadas e roteamento sem transformar o motor em um conjunto de ifs específicos para cada oscilador. |
| **Surge XT** | Doze algoritmos de oscilador, incluindo clássico, wavetable, FM, string, ruído e entrada de áudio; modulação por voz e por cena, LFOs que podem assumir formas de envelope, sequência e MSEG. [Manual oficial](https://surge-synthesizer.github.io/manual-xt/) | É uma referência forte para desenho do registry de parâmetros e para distinguir **modulação por voz** de **modulação de parte/global**. |
| **Waldorf Iridium / Iridium Core** | Cinco famílias no mesmo instrumento: wavetable, multi/granular sampling, waveform, Kernel FM e ressonador. [Fabricante](https://waldorfmusic.com/iridium-core/) | Confirma o valor de vários motores especializados sob uma interface e um sistema de controle compartilhados. |
| **Korg opsix mk II** | FM alterada com seis operadores, 40 algoritmos e modos de operador como FM, ring modulation, filtro, filter-FM, wavefolder e efeito. [Especificações oficiais](https://www.korg.com/uk/products/synthesizers/opsix_mk2/specifications.php) | Um motor FM merece um grafo explícito de operadores/algoritmos, não apenas um knob “FM amount” sobre um oscilador comum. |
| **Korg wavestate** | Wave Sequencing 2.0 separa sample, pitch, duração e outros parâmetros em pistas com comprimentos e loops independentes; pistas podem ser moduladas e ter probabilidades. [Manual oficial](https://cdn.korg.com/us/support/download/files/629595d96c362967378a6d6b8ce253ec.pdf) · [Especificações](https://www.korg.com/uk/products/synthesizers/wavestate/specifications.php) | Sequenciamento por lanes pode ser uma camada de movimento/controle que atua sobre qualquer motor, em vez de virar mais um gerador de som. |
| **ASM Hydrasynth** | Wavemorphing, Mutants, filtros duplos, cinco LFOs, cinco envelopes e matriz com 32 slots, 35 fontes e 191 destinos. [Especificações oficiais](https://www.asmhydrasynth.com/hydrasynth-specifications.html) | A matriz de modulação deve ser um sistema central e extensível. Macros, fontes e destinos precisam ser dados registráveis, não ligações rígidas da interface. |
| **Native Instruments Absynth 6** | Motor semi-modular de três canais que combina subtrativa, FM, wavetable e granular. [Anúncio do fabricante](https://blog.native-instruments.com/introducing-absynth-6/) · [Manual](https://docs.native-instruments.com/ni-tech-manuals/absynth-6-user-guide/en/welcome-to-absynth-6) | Referência para instrumentos orientados a texturas evolutivas, canais independentes e combinações híbridas. |
| **Madrona Labs Kaivo** | Granular alimentando modelos físicos, com ressonadores afinados e modelos de corpos materiais. [Fabricante](https://madronalabs.com/products/kaivo) | Modelagem física/modal é uma família própria. Não deve ser simulada com presets de wavetable ou confundida com simples reverb/resonator FX. |
| **Vital** | Wavetable com spectral warping, editor de tabelas, LFOs/envelopes customizáveis, fontes aleatórias, modulação em taxa de áudio e MPE. [Fabricante](https://vital.audio/) | Boa referência para edição visual, visualização de modulação e distorção espectral de tabelas. |
| **VCV Rack** | Ambiente modular com patching de módulos, sinais de áudio/controle e polifonia. [Manual](https://vcvrack.com/manual/) | Demonstra a flexibilidade do patching explícito, mas a interface de rack integral não é o melhor ponto de partida para a tela móvel do Synzer. |

## 3. Taxonomia de capacidades a considerar

A pesquisa aponta para as seguintes famílias, que não são intercambiáveis:

1. **Subtrativa / Virtual Analog:** osciladores periódicos, suboscilador, ruído, filtros e amplificador. É a base atual do Synzer.
2. **Wavetable:** tabela de ciclos com varredura/morph entre frames, interpolação e versões band-limited para reduzir aliasing.
3. **FM / PM:** operadores com relações de frequência, feedback e algoritmos de conexão. Pode produzir timbres harmônicos e inarmônicos com grande complexidade.
4. **Aditiva / harmônica:** soma controlada de parciais, espectro, amplitude e fase por harmônico.
5. **Sample / multisample:** reprodução de áudio gravado, zonas por nota/velocidade, loops e envelopes próprios.
6. **Granular:** reprodução de muitos pequenos grãos de samples, com posição, duração, densidade, janela, pitch e dispersão.
7. **Spectral / resynthesis:** análise e reconstrução no domínio da frequência, com controle de componentes harmônicos e temporais. Mais caro e complexo.
8. **Modal / física:** excitação de modelos ressonantes, cordas, placas, tubos ou corpos. Não equivale a um banco de samples.
9. **Wave sequencing / sequenciamento de parâmetros:** pistas independentes que modulam fontes e parâmetros em sequência.
10. **Modular / semi-modular:** blocos conectáveis por fluxo de áudio e/ou controle. É uma abordagem de arquitetura, não um único algoritmo de síntese.

## 4. Arquitetura recomendada para o Synzer

### 4.1 Princípio: vários motores, um instrumento

Adotar uma arquitetura de **multi-engine modular**, evitando dois extremos: um único motor monolítico que acumule todos os casos especiais ou um clone completo de ambiente Eurorack que complique a experiência touchscreen.

- **Voice Manager:** alocação de vozes, polifonia, note-on/off, voice stealing, pitch e estado por nota.
- **Engine Slots:** fontes sonoras plugáveis, cada uma com parâmetros e capacidades próprias. A primeira evolução deve permitir duas fontes combinadas e uma fonte utilitária, sem obrigar todos os patches a usar todas.
- **Voice Mixer:** nível, pan/posição e combinação das fontes dentro da voz.
- **Filter Rack:** filtros independentes com roteamento serial/paralelo.
- **Modulation Engine:** fontes, destinos, profundidade, polaridade, curva, escopo e modo de execução.
- **Effects Rack:** efeitos de inserção, envio e master, mantendo claramente separado o processamento por voz do processamento da parte.
- **Patch / Preset Model:** representação serializável e versionada de motores, parâmetros, modulações e roteamentos.
- **UI Registry:** metadados de parâmetros e controles para que a interface apresente o painel certo para cada motor sem duplicar lógica DSP.

### 4.2 Contrato conceitual dos motores

Cada motor deve expor um contrato estável para preparação, eventos de nota, renderização de blocos, parâmetros e encerramento. O contrato deve declarar suas capacidades e custo relativo, em vez de o núcleo precisar conhecer os detalhes de cada engine.

Os parâmetros devem ter identificador estável, unidade, faixa, valor padrão, escala, possibilidade de modulação e contexto. Mensagens de interface atualizam parâmetros/eventos; o processamento de áudio permanece no AudioWorklet. Não se deve alocar memória, criar objetos ou executar operações pesadas desnecessárias dentro do loop de renderização.

### 4.3 Modulação em dois escopos

A matriz deve distinguir ao menos:

- **Voice scope:** envelope da nota, velocidade, key tracking, LFO por voz e outras fontes independentes para cada nota.
- **Part/global scope:** LFO compartilhado, macros, tempo, sequenciador e controle de parâmetros globais/FX.

Essa distinção evita um erro estrutural comum: tentar controlar efeitos globais usando uma fonte que só existe dentro de uma voz individual.

No primeiro estágio, implementar modulação em taxa de controle (por bloco ou subdivisão de bloco). Modulação em taxa de áudio deve ser reservada a conexões específicas e testadas, pois multiplica o custo de processamento.

## 5. Priorização proposta

| Etapa | Capacidade | Por quê |
|---|---|---|
| **A — fundação** | Atual motor VA, voz, mixer interno, registry de parâmetros e patch versionado | Consolida a base já existente e evita retrabalho nos motores futuros. |
| **B — modulação** | Envelopes adicionais, LFO, random, velocity, key tracking, macros e matriz por voz/parte | É a infraestrutura que transforma motores isolados em um instrumento expressivo. |
| **C — filtragem e efeitos** | Filtros de estado variável/ladder, dois filtros, roteamento serial/paralelo e FX essenciais | Amplia imediatamente a utilidade do VA e será reaproveitada por todos os motores. |
| **D — wavetable** | Importação/tabelas, varredura, morph e band-limiting | Alto retorno sonoro e integração natural com o fluxo atual de oscilador. |
| **E — FM** | Operadores, algoritmos, feedback e relações de frequência | Abre uma família sonora que não pode ser reproduzida adequadamente só com VA. |
| **F — sample/granular** | Player de sample e depois motor granular | Abre texturas e fontes externas, mas exige gestão de memória, carregamento e orçamento de CPU. |
| **G — aditiva/modal** | Banco de parciais e ressonadores/modelos físicos | Acrescenta síntese harmônica e acústica, com custos e UX próprios. |
| **H — espectral e sequenciamento avançado** | Resíntese spectral, wave sequencing, MSEG e patching avançado | Potencial elevado, mas maior complexidade DSP, de memória e de interface. |

As etapas são uma proposta de sequenciamento, não compromissos de entrega. A ordem pode mudar após medições no Android e protótipos instrumentais.

## 6. Restrições específicas do Synzer

- **Android-first:** manter o processamento no AudioWorklet; validar o desempenho real em ARM64, não extrapolar benchmark x64.
- **Orçamento de CPU:** cada engine deve possuir um perfil de custo e limites configuráveis de vozes, unison, grãos e qualidade.
- **Memória:** tabelas e samples precisam de cache, limites e liberação determinística; granular e spectral não devem carregar materiais sem limite.
- **Renderização sem alocação:** buffers e estruturas quentes devem ser pré-alocados; evitar garbage collection no caminho de áudio.
- **Recuperação de áudio:** estado de AudioContext e políticas de retomada móvel devem continuar explícitos e acionados por gesto do usuário quando necessário.
- **Testes DSP:** frequência, envelope, aliasing, estabilidade numérica, clipping, polifonia e comportamento de modulação precisam de evidência mensurável.
- **Testes de plataforma:** Chromium desktop e viewports emulados não substituem teste físico no POCO/Android.
- **Licenças e originalidade:** aproveitar ideias e padrões públicos de design, sem copiar código fechado, assets, presets, nomes ou interface de produtos proprietários.

## 7. Conclusão

O melhor Synzer não é literalmente a soma de todos os sintetizadores existentes. É um instrumento modular que reúne as famílias de síntese com maior valor musical, oferece uma linguagem de modulação consistente e permite combinar motores sem que cada novo recurso exija reescrever o produto.

**Decisão recomendada:** manter o motor VA atual como primeiro engine; consolidar antes o contrato de voz, mixer, parâmetro e modulação; depois introduzir wavetable e FM como motores independentes. Sample/granular, aditiva, modal e spectral entram progressivamente, após orçamento e testes no Android.

## 8. Fontes primárias

- [Arturia Pigments](https://www.arturia.com/products/software-instruments/pigments/overview)
- [Xfer Serum 2](https://xferrecords.com/products/serum-2)
- [Serum 2 Manual — sound design](https://xferrecords.com/web-manual/serum-2/exploring-sound-design-in-serum)
- [Kilohearts Phase Plant](https://kilohearts.com/docs/phase_plant)
- [Surge XT Manual](https://surge-synthesizer.github.io/manual-xt/)
- [Waldorf Iridium Core](https://waldorfmusic.com/iridium-core/)
- [Korg opsix mk II specifications](https://www.korg.com/uk/products/synthesizers/opsix_mk2/specifications.php)
- [Korg wavestate Manual — Wave Sequencing 2.0](https://cdn.korg.com/us/support/download/files/629595d96c362967378a6d6b8ce253ec.pdf)
- [Korg wavestate specifications](https://www.korg.com/uk/products/synthesizers/wavestate/specifications.php)
- [ASM Hydrasynth specifications](https://www.asmhydrasynth.com/hydrasynth-specifications.html)
- [Native Instruments Absynth 6](https://docs.native-instruments.com/ni-tech-manuals/absynth-6-user-guide/en/welcome-to-absynth-6)
- [Madrona Labs Kaivo](https://madronalabs.com/products/kaivo)
- [Vital](https://vital.audio/)
- [VCV Rack Manual](https://vcvrack.com/manual/)


## 9. Primeiro contrato multi-engine implementado — 13/11/2026

A branch de desenvolvimento agora contém o primeiro registry executável de motores:

- `packages/dsp-engine/src/core/EngineRegistry.js`: catálogo de famílias, registry runtime, validação de identificadores, bloqueio de registro duplicado e criação apenas de motores com factory disponível.
- `createDefaultEngineRegistry()`: registra o Virtual Analog existente como único motor disponível e constrói a instância real de `VoiceEngine`.
- `packages/dsp-engine/src/worklets/synzer-processor.js`: instancia o motor atual por meio do registry, removendo a dependência direta do Worklet sobre a classe concreta.
- `packages/dsp-engine/test/EngineRegistry.test.js`: testes para estado do catálogo, criação de engines, rejeição de duplicatas e motores planejados, metadados imutáveis e factory padrão.

O catálogo reconhece Virtual Analog como disponível. Wavetable, FM/PM, aditiva, sample/multisample, granular, spectral e modelagem física continuam explicitamente planejados, sem implementação declarada.

Este incremento é uma fundação arquitetural: ainda não oferece seleção de motores na interface, mistura entre motores, parâmetros universais, modulação ou presets multi-engine. A abstração já está conectada ao AudioWorklet, mas o runtime continua usando somente o Virtual Analog.

Validação pendente após os commits deste incremento: execução confirmada da suíte Node e do Chromium CI. A leitura dos arquivos no GitHub confirma persistência, mas não substitui execução dos testes.


## 10. Motor FM/PM de quatro operadores integrado — 14/11/2026

A branch de desenvolvimento agora contém um motor FM/PM funcional e selecionável no SOURCE BANK, sem substituir o Virtual Analog ou o oscilador Wavetable existente.

- `packages/dsp-engine/src/core/FMVoiceEngine.js`: quatro operadores senoidais por voz, quatro algoritmos de roteamento, ratio por operador, nível, índice de modulação no operador fonte, feedback do OP04, ADSR independente por operador, polifonia e voice stealing.
- `EngineRegistry`: FM/PM passa a `available` e recebe factory própria. As famílias aditiva, sample, granular, spectral e modelagem física permanecem planejadas.
- `synzer-processor.js` e `SynzerEngine.js`: inicialização por `engineId` e troca de motor via `SET_ENGINE`, sem reconstruir o AudioWorkletNode.
- SOURCE BANK: painel FM próprio com algoritmo, feedback, quatro módulos de operador e envelopes. O teclado existente dispara notas no motor selecionado.
- `PatchStore.js`: serialização e restauração de patches FM no modelo versionado existente.
- `docs/FM-DSP-FOUNDATION.md`: roteamentos, integração e limitações técnicas.

### Evidência de validação

- Suíte Node: 179/179 testes aprovados.
- Chromium: smoke completo aprovado, incluindo nota FM no AudioWorklet e RMS medido por AnalyserNode (`0.03323` no cenário de teste), troca de algoritmo, feedback, ratio, index, envelopes, patch save/load e viewports 360×800 / 800×360 sem overflow horizontal.
- Benchmark FM: 12 vozes, 48 kHz, bloco 128, 2.000 blocos de aquecimento e 10.000 medidos. Um run Linux x64 / Node 22 registrou média 0,16774 ms, p95 0,17987 ms, 6,75% do orçamento de 2,66667 ms por bloco. Não extrapolar esse número para Android.

### Limitações conhecidas

O FM atual produz saída central duplicada em L/R, possui ADSRs próprios, mas ainda não compartilha o filtro TPT, LFO/matriz, Unison, Noise ou rack de efeitos do VA. Os operadores são senoidais e ainda não existe oversampling/anti-aliasing específico para sidebands de FM acima de Nyquist. O motor não foi testado fisicamente no POCO/Android.
