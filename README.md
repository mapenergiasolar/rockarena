# Rock Arena - Battle of Bands Online (Demo)

Jogo de ritmo e competição de bandas online em HTML5.

## Nova Estrutura de Pastas (Etapa 1 - Runtime Reorganizado)

O projeto foi reorganizado para separar de forma segura o código, os dados de charts e as mídias:

* **`/index.html`**: Ponto de entrada do jogo.
* **`/src/`**: Código-fonte do jogo.
  * **`css/style.css`**: Folha de estilos.
  * **`js/game.js`**: Mecânicas e lógica do motor do jogo.
* **`/data/`**: Dados de suporte.
  * **`charts/`**: Tabelas de notas do jogo (`charts.js`, `song2_difficulties.js`, `song3_difficulties.js`).
  * **`midi/`**: Arquivos MIDI e Guitar Pro originais de referência.
* **`/assets/`**: Mídias ativas usadas no jogo.
  * **`audio/`**: Trilhas sonoras em MP3.
  * **`images/`**: Imagens ativas de interface e classes.
  * **`videos/`**: Loops de vídeo de fundo de gameplay e menus.
* **`/tools/`**: Scripts de compilação, inspetores MIDI e analisadores de áudio.
* **`/docs/`**: Documentação comercial e comercialização (Pitch Deck PDF).
* **`/archive/`**: Mídias não utilizadas, capturas antigas e protótipos de chart obsoletos.

## Como Executar Localmente

1. Certifique-se de possuir o Node.js instalado.
2. Inicie o servidor local de desenvolvimento executando:
   ```bash
   npm start
   ```
3. Abra `http://localhost:8080` no seu navegador de preferência.
