# SYNZER — Direção visual e arquitetura de interface

**Versão:** UI Identity 0.3.0  
**Data:** 14/11/2026  
**Estado:** navegação por etapas do fluxo de sinal implementada na branch de desenvolvimento; validação visual em dispositivo físico pendente.

## Identidade do produto

SYNZER é um sintetizador virtual web, modular e expansível. A identidade deve parecer um instrumento próprio: legível e refinado, com profundidade física de painel e resposta visual contínua. Não reutilizar a arquitetura de navegação de qualquer produto de referência.

## Hierarquia de referências

1. **FRMS — referência visual principal:** clareza de leitura, refinamento, hierarquia tipográfica, organização de parâmetros e visualização de sinais. Não copiar abas, navegação por camadas, composição, geometria de painéis ou fluxo de interação.
2. **G-Stomper VA-Beast — referência de profundidade e acabamento:** chassi, painéis sobrepostos, densidade de controles, microindicadores, botões físicos, knobs/faders e sensação de instrumento de hardware. Extrair princípios de acabamento, sem duplicar a estrutura da interface.
3. **Flowtones / Flowtunes — referência complementar de fluidez:** transições, continuidade visual entre fontes e destinos, movimento das formas e modulações, feedback expressivo e sensação de fluxo. Não reproduzir layouts ou componentes proprietários.

## Decisão de arquitetura visual: sinal, não abas

A navegação deixa de ser uma coleção de páginas genéricas (WAVEFORM, CONTROL, ENVELOPE, MATRIX, MODIFIERS, GLOBAL) e passa a representar etapas reconhecíveis de um instrumento:

- **01 SOURCE BANK:** fontes OSC, Sub e Noise.
- **02 VOICE CORE:** polifonia, Unison e nível global.
- **03 ENVELOPE LAB:** envelopes de amplitude, filtro e pitch.
- **04 MOD PATCHBAY:** ligação de fontes de modulação aos destinos.
- **05 MOTION GENERATOR:** LFO e parâmetros de movimento.
- **06 FILTER CHAMBER:** filtro TPT e resposta.

Os identificadores internos de navegação são preservados para manter compatibilidade com o código e os testes já existentes. Os nomes, semântica, hierarquia e apresentação são próprios do Synzer. A navegação é um mapa de processo com cartões de módulo, indicadores de estado e continuidade visual, não uma faixa de tabs.

## Linguagem visual

- Grafite profundo, carvão e metal escovado como estrutura do chassi.
- Âmbar para foco, seleção e ação; turquesa para sinal/áudio; violeta apenas para modulação.
- Painéis em camadas, bordas chanfradas simuladas, sombras internas/externas, LEDs, microtextos técnicos e indicadores de escala.
- Knobs, faders, seletores e botões devem manter proporções e alvos confortáveis em touchscreen.
- Transições curtas e contínuas na troca de módulos; animações não podem alterar nem interromper o fluxo de áudio.
- Em retrato, o mapa torna-se uma grade 3×2 de módulos; em paisagem e telas amplas, mantém-se como coluna lateral.

## Limites de implementação

Esta revisão altera navegação, apresentação, semântica e feedback de interface. Os mesmos parâmetros e IDs de controles DSP são preservados. Não cria engines ou funções sonoras não implementadas.

O osciloscópio atual de OSC continua uma visualização esquemática. Wavetable é uma fonte integrada a OSC 01, não uma engine independente no EngineRegistry. FM, granular e rack avançado de efeitos seguem em desenvolvimento.

## Critérios de validação

- Testes automatizados para mapa de módulos, seleção sem tabs, hierarquia e responsividade.
- CI DSP deve permanecer verde.
- Chromium real nos viewports retrato 360×800 e paisagem 800×360, sem overflow e sem erros JavaScript.
- Validar que todos os seis módulos continuam acessíveis e os controles existentes continuam alterando o DSP.
- Inspeção em Chrome Android e teste físico no POCO continuam pendentes até execução no aparelho.
