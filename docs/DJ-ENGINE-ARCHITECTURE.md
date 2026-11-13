# SYNZER DJ Engine — arquitetura inicial

**Estado:** implementação inicial isolada em branch de desenvolvimento  
**Branch:** `feature/dj-deck-transport-v0.1.0`  
**Base:** `main` em `55a2f8c81e35d7cbd99e62cada64944485ac10dd`

## Decisão de continuidade

O repositório atual contém uma bancada de síntese virtual analógica, não uma aplicação DJ. A linha de síntese foi preservada integralmente. O núcleo DJ começa em `packages/dj-engine/`, sem reutilizar nomes ou contratos de síntese como se fossem decks.

A interface e o motor de síntese existentes não são removidos nem promovidos automaticamente à experiência DJ. A integração futura deve ser deliberada e testada.

## Camadas propostas

- **DeckTransport:** decodificação de arquivo local, buffer PCM, play/pause/stop/seek e rate.
- **DeckState:** identidade da faixa, metadados, posição, duração e estados de transporte.
- **DeckAudioGraph:** ganho por deck e conexão ao mixer.
- **MixerBus:** canais independentes, ganho, EQ, filtro, crossfader e medição.
- **Library:** seleção/importação local e metadados.
- **Analysis:** BPM, beatgrid e waveform, fora do caminho crítico de renderização.
- **Performance:** hot cues, loops e beatjump, dependentes de uma linha temporal de deck estável.

## Incremento 0.1.0 — DeckTransport

Implementa um transporte por deck com Web Audio API:
- decodificação de ArrayBuffer/File;
- reprodução, pausa, parada e busca;
- ajuste de playback rate entre 0.25× e 4×;
- ganho linear entre 0 e 2;
- proteção contra conclusão obsoleta de decodificação;
- propriedade explícita de nós e descarte sem fechar o AudioContext compartilhado.

## Limites explícitos

Este incremento não implementa scratch, beatgrid, sync, pitch fader musical, EQ, filtro, mixer, crossfader, cue split, waveform de áudio, stems ou biblioteca persistente. Playback rate é uma mudança de velocidade com alteração de pitch; não é time-stretch independente.

## Critérios de integração

1. Testes determinísticos do transporte.
2. Integração com um deck de UI sem tocar no motor DSP existente.
3. Teste de reprodução com arquivos locais em navegador Android.
4. Somente depois, introduzir dois decks e um MixerBus com roteamento independente.
