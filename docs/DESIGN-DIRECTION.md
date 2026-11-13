# SYNZER — Direção visual e arquitetura de interface

**Versão:** UI Foundation 0.1.0  
**Data:** 2026-11-13  
**Estado:** implementado parcialmente no GitHub Pages

## Direção aprovada

A interface do SYNZER passa a usar três referências, com prioridade visual para FRMS:

1. **FRMS (principal):** estrutura de editor modular, navegação por painéis (Waveform, Control, Envelope, Matrix, Modifiers e Global), linguagem visual escura e técnica, camadas separadas e zona de performance inferior. A estrutura do FRMS organiza quatro layers e trabalha com painéis horizontais; o SYNZER adotará essa lógica progressivamente, sem copiar sua interface literalmente.
2. **G-Stomper VA-Beast (complementar):** densidade de controles de instrumento, organização funcional em módulos, leitura rápida de parâmetros e teclado integrado.
3. **ToneBoosters Flowtones (complementar):** identidade de sintetizador virtual analógico, seleção visual de osciladores/formas de onda e edição de parâmetros de síntese.

> Nota de nomenclatura: a referência entendida como “FlowTunes” foi interpretada como **Flowtones**, o editor/sintetizador da ToneBoosters. O aplicativo “Flow Tunes” com esse nome é um reprodutor musical, não o sintetizador.

## Princípios de interface

- Mobile-first, suporte a retrato e paisagem, áreas de toque amplas e scroll horizontal controlado nos tabs.
- Fundo carvão/azul-marinho, superfícies em camadas, linhas discretas e acentos violeta; cores reservadas para estados, seleção e visualização.
- Organização em três zonas: status/preset, editor de síntese e teclado/performance.
- Navegação por módulos consistente, com a camada ativa explicitamente identificada.
- Controles visuais devem refletir parâmetros realmente conectados ao motor DSP.
- Recursos futuros devem ser indicados como planejados/desativados, nunca apresentados como se já processassem áudio.
- O teclado deve manter comportamento multitouch por Pointer Events.

## Estado implementado na UI Foundation 0.1.0

- Header SYNZER e estado do motor.
- Faixa de patch inicial (somente rótulo; gerenciamento de presets ainda não implementado).
- Layer 1 ativa; layers 2–4 visíveis, porém desativadas.
- Painéis Waveform, Control, Envelope, Matrix, Modifiers e Global.
- Seleção funcional de Saw, Square e Sine conectada ao elemento select consumido por main.js.
- Scope esquemático altera a forma exibida conforme o oscilador selecionado; não é captura de áudio em tempo real.
- Envelope gráfico acompanha Attack, Decay, Sustain e Release, e os quatro controles permanecem conectados à voz.
- Teclado de uma oitava C4–C5 com teclas brancas/pretas e multitouch.
- Indicadores de teclas pressionadas e estado de inicialização do AudioWorklet.

## Limites atuais do motor

O motor continua sendo o baseline 0.2.0: um oscilador virtual analógico por voz, formas Saw/Square com PolyBLEP e Sine, ADSR, até 12 vozes e renderização via AudioWorklet.

Ainda não estão implementados: síntese granular, quatro layers reais, dois osciladores por voz, filtros, FM, matriz de modulação, LFOs, arpejador/sequenciador, efeitos, unison, patch save/load, MIDI I/O e importação/captura de samples.

## Critérios para as próximas etapas

1. Validar esta interface no Chrome Android real, em retrato e paisagem, incluindo multitouch e áudio.
2. Formalizar o modelo de estado de patch e de layer antes de adicionar controles que alterem DSP.
3. Evoluir o motor em módulos pequenos, com testes automatizados antes de expor cada parâmetro na UI.
4. Implementar primeiro os controles básicos de oscilador e filtros, depois envelopes/modulação e camadas, sem comprometer a separação entre interface e engine.
5. Manter documentação e testes do pacote-fonte 0.2.0 como baseline e criar versão nova somente com mudanças de motor verificadas.
