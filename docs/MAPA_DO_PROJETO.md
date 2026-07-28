# Rock Arena — mapa técnico do projeto

Atualizado em 27/07/2026.

## Estado atual

Versão funcional atual: **Web Demo V1.4.1 — Crowd Visibility + Mobile Touch
Controls**.

O último commit registrado é:

`485a6c8 Rock Arena Web Demo V1.3 - Stable Candidate`

Existem alterações locais posteriores, ainda não registradas em commit:

- disciplina de input / punição por lane errada;
- shake local para `Wrong Input`;
- shake local para notas perdidas.

Essas alterações foram preservadas.

## Como executar

Na raiz do projeto:

```text
npm start
```

O projeto é uma aplicação web sem framework. O servidor local abre a raiz na
porta `8080`.

## Estrutura ativa

```text
rock arena/
├── index.html
├── package.json
├── README.md
├── assets/
│   ├── audio/
│   │   ├── song.mp3
│   │   ├── song2.mp3
│   │   └── song3.mp3
│   ├── images/
│   └── videos/
├── data/
│   └── charts/
│       ├── charts.js
│       ├── song2_difficulties.js
│       └── song3_difficulties.js
├── docs/
│   ├── Rock Arena - Pitch Deck.pdf
│   └── MAPA_DO_PROJETO.md
├── src/
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── game.js
├── tools/
└── archive/
```

## Responsabilidade de cada parte

### `index.html`

Contém as cinco telas da demo:

1. menu inicial;
2. seleção de música e dificuldade;
3. seleção de instrumento;
4. gameplay;
5. resultado.

Também contém o HUD, modal de calibração, vídeos de fundo, áudio e canvas da
highway.

### `src/js/game.js`

É o motor atual do jogo. Concentra:

- banco de músicas;
- estado global da partida;
- geração e carregamento dos charts;
- fluxo entre telas;
- áudio e vídeo;
- renderização da highway;
- input de teclado, toque e gamepad;
- acertos, erros, holds, combo e score;
- rival simulada;
- domínio da plateia;
- habilidades individuais;
- Showtime coletivo;
- reações da arena;
- tela de resultados;
- ferramentas de diagnóstico.

Por ser um único arquivo grande, novas expansões devem ser feitas de maneira
local e segura antes de uma futura separação em módulos.

### `src/css/style.css`

Contém todo o visual:

- telas e menus;
- HUD;
- highway;
- arena e overlays;
- crowd lights;
- mensagens;
- especiais;
- resultados;
- shakes locais de erro.

### `data/charts`

`charts.js` inicializa o banco `SONGS_CHARTS`.

`song2_difficulties.js` e `song3_difficulties.js` substituem os dados das
músicas 2 e 3 por charts completos, divididos por:

- instrumento;
- dificuldade;
- notas e holds.

## Fluxo principal

```text
Menu
→ música + dificuldade
→ instrumento
→ startGameplay()
→ generateClassChart()
→ intro em vídeo
→ áudio + vídeo do instrumento + highway
→ batalha contra rival simulada
→ resultado
```

## Músicas e charts

### `song1` — Ride Like The Wind

- BPM configurado: 125;
- áudio: `assets/audio/song.mp3`;
- não possui chart estruturado completo;
- usa o gerador procedural antigo como fallback.

### `song2` — Californication

- BPM configurado: 96;
- áudio: `assets/audio/song2.mp3`;
- offset geral: `3.062s`;
- possui charts reais para quatro instrumentos e quatro dificuldades.

| Instrumento | Fácil | Normal | Difícil | Expert |
|---|---:|---:|---:|---:|
| Guitarra solo | 94 | 239 | 447 | 593 |
| Guitarra base | 171 | 438 | 459 | 834 |
| Baixo | 176 | 270 | 468 | 582 |
| Bateria | 396 | 637 | 888 | 1164 |

### `song3` — Hellraiser

- áudio: `assets/audio/song3.mp3`;
- possui charts reais para quatro instrumentos e quatro dificuldades;
- o arquivo final de dificuldades informa BPM 96;
- offsets por instrumento ficam em torno de `10.78s`;
- o metadado geral também contém `offset: 0.604`, portanto os dois conceitos
  precisam ser padronizados antes de criar novas ferramentas de sincronização.

| Instrumento | Fácil | Normal | Difícil | Expert |
|---|---:|---:|---:|---:|
| Guitarra solo | 225 | 323 | 612 | 938 |
| Guitarra base | 216 | 406 | 602 | 864 |
| Baixo | 153 | 264 | 296 | 296 |
| Bateria | 428 | 695 | 806 | 886 |

## Controles

### Teclado

- lanes: `A`, `S`, `D`, `K`, `L`;
- especial individual: `Espaço`;
- Showtime: `Enter`.

### Gamepad

| Ação | PlayStation | Xbox | Índice interno |
|---|---|---|---:|
| Lane 1 | L2 | LT | 0 |
| Lane 2 | L1 | LB | 1 |
| Lane 3 | R1 | RB | 2 |
| Lane 4 | R2 | RT | 3 |
| Lane 5 | X/Cross | A | 4 |
| Especial individual | Quadrado | X | — |
| Showtime | Círculo | B | — |

## Sistemas já funcionais

- charts por música, instrumento e dificuldade para `song2` e `song3`;
- calibração global de áudio;
- notas tap e hold;
- cinco lanes;
- score, combo, precisão e multiplicador;
- punição por nota perdida;
- punição por input em lane vazia;
- proteção anti-button-mashing com cooldown de 80ms;
- feedback e shake local por erro;
- rival simulada por dificuldade;
- cabo de guerra pelo domínio da plateia;
- Arena Reaction;
- mensagens contextuais;
- habilidades individuais por instrumento;
- Showtime coletivo;
- navegação e gameplay com gamepad;
- tela de resultados;
- ferramentas de inspeção de charts e arena.

## Identidade dos instrumentos

| Classe | Papel | Especial |
|---|---|---|
| Guitarra solo | Ataque | Solo Incendiário |
| Guitarra base | Defesa | Parede Sonora |
| Baixo | Controle | Groove Profundo |
| Bateria | Energia | Ritmo de Guerra |

## Apresentação gráfica atual

A base visual da partida ainda é composta principalmente por:

- vídeo de introdução;
- um vídeo em loop por instrumento;
- vídeo especial da banda completa;
- overlays de cor e luz;
- pequenos pontos de crowd light;
- pulsos, flashes e movimentos controlados no fundo.

A highway permanece estável na frente dessas camadas.

Portanto, a arena reage, mas ainda não possui uma plateia independente e
dirigida pelo estado da partida. Essa é a expansão visual mais coerente com a
visão do projeto.

## Pontos de atenção encontrados

### 1. Diagnóstico ligado em produção

`DEBUG_DEMO_BATTLE` está como `true`.

Durante uma partida ele imprime o domínio da plateia aproximadamente a cada
segundo, além de outros eventos. Antes de uma versão apresentável, o padrão deve
ser `false` ou controlado por URL/configuração.

### 2. `song1` ainda depende de aleatoriedade

Somente `song2` e `song3` possuem charts completos. `song1` ainda pode exibir
notas procedurais e aleatórias.

### 3. Metadados de BPM e offset de `song3`

O card da música mostra 137 BPM, mas o chart final informa 96 BPM. O chart
também possui offset geral e offsets por instrumento com valores muito
diferentes. O gameplay usa os tempos já gravados nas notas, por isso funciona,
mas essa inconsistência dificultará editores e futuras conversões.

### 4. Código legado ainda presente

Há referências antigas como `comboShieldHits`, `grooveAnchorActive` e elementos
visuais já removidos. Elas não impediram a execução, mas devem ser catalogadas
antes de qualquer refatoração.

### 5. Disciplina de input

O novo sistema pune lanes extras, mas o processamento de várias teclas no mesmo
instante é sequencial. É necessário um teste manual específico para confirmar
que a ordem dos botões nunca permite manter combo residual após uma “patada”.

### 6. Precisão não inclui Wrong Input

O Wrong Input quebra combo e drena energia/domínio, mas não entra diretamente
na contagem de notas perdidas usada pela precisão. Isso deve ser uma decisão de
design consciente.

### 7. Licenciamento

As músicas comerciais são adequadas para prototipagem interna. Uma demo
publicada ou comercial precisará de licenças ou faixas próprias.

### 8. Arquivos duplicados e históricos

Existe um chart grande de Hellraiser também na raiz e há muitos assets no
diretório `archive`. Eles não fazem parte do carregamento atual. Não apagar até
comparar e confirmar que são cópias ou material histórico.

### 9. Favicon ausente

O navegador solicita `/favicon.ico` e recebe 404. Isso não afeta a gameplay,
mas contradiz os relatórios anteriores de “zero 404” e deve ser corrigido no
polimento de apresentação.

## Validação executada

Foi validado no navegador:

- menu inicial;
- seleção de música e dificuldade;
- seleção de instrumento;
- início da partida;
- `song3 + drums + hard`;
- carregamento de 806 notas;
- áudio `song3.mp3`;
- vídeo `drums.mp4`;
- highway e HUD;
- rival e domínio da plateia;
- ausência de erros de JavaScript;
- um 404 não funcional referente apenas a `/favicon.ico`.

Os arquivos JavaScript ativos também passaram por verificação de sintaxe.

## Expansão implementada

### V1.4 — Crowd System Foundation

Foi criada uma plateia independente em camadas, sem substituir o fundo por
outro vídeo:

1. silhuetas estilizadas geradas por código;
2. bastões de luz gerados por código;
3. brilho e pulso ligados ao domínio;
4. ondas de reação para combo, virada, especial e Showtime;
5. integração com o Arena Reaction já existente.

Regras aplicadas:

- não mover a highway;
- não cobrir os receptores;
- vermelho e azul devem refletir `crowdDominance`;
- efeitos intensos devem ser eventos curtos;
- respeitar `prefers-reduced-motion`;
- reduzir automaticamente a quantidade de elementos em telas menores.

O diagnóstico agora fica desligado por padrão e pode ser ativado acrescentando
`?debug` ao endereço local.

### V1.4.1 — Mobile Touch Controls

- silhuetas ampliadas e com recorte frontal mais visível;
- vídeo mantido como palco de fundo;
- cinco botões touch para as lanes;
- botões touch para Especial e Showtime;
- suporte a multitouch e holds;
- vibração curta em ações e erros quando o aparelho oferece suporte;
- HUD compacto em celular horizontal;
- aviso para girar o aparelho quando estiver na vertical;
- redução automática da quantidade de elementos gráficos em telas menores.

## Próxima expansão recomendada

### V1.5 — Arena Director

Centralizar os eventos visuais da arena e dirigir:

- reações por seção musical;
- spotlights por instrumento;
- telão/LED com eventos da batalha;
- intensidade visual por combo e dificuldade;
- vitórias, derrotas e viradas;
- perfis de qualidade gráfica.

## Ordem de evolução sugerida

1. registrar checkpoint da V1.4;
2. consolidar o Arena Director;
3. polir menus e resultados;
4. padronizar charts, BPM e offsets;
5. remover legado somente depois de testes de regressão.
