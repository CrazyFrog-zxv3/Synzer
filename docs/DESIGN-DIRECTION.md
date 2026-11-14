# SYNZER — Direção visual e arquitetura de interface

**Versão:** UI Identity 0.2.0  
**Data:** 2026-11-14  
**Estado:** nova direção visual implementada em branch de desenvolvimento; validação visual em dispositivo físico pendente.

## Identidade do produto

SYNZER é um sintetizador virtual web, modular e expansível. A interface deve comunicar um instrumento musical complexo, com profundidade de controle e clareza operacional. O objetivo é construir uma identidade própria, não reproduzir a aparência de qualquer referência.

## Hierarquia de referências

1. **G-Stomper VA-Beast — referência principal para densidade e linguagem de instrumento:** organização funcional de módulos, abundância de controles, painel de hardware, leitura de parâmetros, profundidade e ergonomia de um sintetizador de performance.
2. **FRMS — referência de refinamento e clareza:** legibilidade, visualização de sinais, hierarquia de informação e facilidade de navegação. Não copiar composição, navegação por camadas, estrutura horizontal ou disposição dos painéis.
3. **ToneBoosters Flowtones — referência complementar:** expressividade de modulação, relação entre fontes e destinos, visualização de parâmetros e integração do fluxo de sound design.

## Linguagem visual própria

- Chassi de instrumento em grafite, carvão e metal escovado.
- Contraste quente de âmbar para seleção, valores e estados de controle.
- Turquesa reservado para sinal/visualização de áudio.
- Violeta usado apenas como acento secundário para estados de modulação.
- Módulos com cabeçalhos próprios, contornos, sombras internas, indicadores e separação funcional.
- Controles com aparência de hardware: faders, seletores, botões de pressão e indicadores.
- Densidade visual maior, sem sacrificar legibilidade nem alvos touchscreen.

## Composição e navegação

- Em telas médias e grandes, o editor usa uma barra vertical de bancos de módulos à esquerda e a área de edição à direita.
- Em retrato móvel, a navegação volta a uma faixa horizontal compacta para preservar espaço útil.
- Cabeçalho e seletor de patch formam uma faixa de estado independente.
- A zona de performance e teclado é uma seção própria, com acabamento de painel físico.
- Alvos de toque permanecem em 48 px no mínimo, com exceção de navegação compacta em paisagem de baixa altura, onde os tabs podem cair para 44 px.
- A interface deve evitar overflow horizontal e manter foco visível, estados de seleção e suporte a reduced motion.

## Limites de implementação

Esta revisão altera apenas apresentação CSS e documentação de direção visual. IDs, eventos, parâmetros, estado de patch e ligações ao DSP são preservados. Não adiciona capacidades sonoras, novas engines, novos controles funcionais ou processamento de áudio.

O scope de oscilador continua esquemático, não é analisador de áudio em tempo real. A interface deve continuar distinguindo recursos implementados de recursos planejados.

## Critérios de validação

- Testes automatizados para tokens de identidade, navegação adaptativa, foco e alvos de toque.
- CI de DSP e integração de áudio deve continuar verde.
- Verificação de viewport retrato e paisagem no Chromium.
- Inspeção visual no Chrome Android e teste físico no POCO continuam pendentes até execução no aparelho.
