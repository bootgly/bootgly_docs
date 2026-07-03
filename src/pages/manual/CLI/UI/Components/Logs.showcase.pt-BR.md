# Logs

O demo do viewer de Logs roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador, **totalmente interativo**.

## O viewer do modo Monitor

Pressione Run e veja ~20 records simulados de workers entrarem no viewer em tempo real — boots, requisições roteadas, jobs de fila, um warning de rota lenta e uma exceção multilinha (colapsada em uma linha com o marcador `⏎ +N lines`).

Quando o stream assentar, **clique no terminal** e conduza-o com as teclas do rodapé:

- **Espaço** — pausa/retoma o tail ao vivo;
- **↑/↓, PgUp/PgDn** — seleciona um record (pausando automaticamente); **Enter** — expande (a exceção mostra cada linha do stack, context e extra);
- **l** — alterna o limiar de severidade; **/** — busca incremental de texto; **1–3** — liga/desliga os canais `Server`/`Router`/`Queue`;
- **q** ou **Esc** — sai.

<d-block-terminal engine="bootgly-cli" title="Logs — viewer do modo Monitor" command="demo 25" height="420">
`Logs` alimentado com records JSON delimitados por nova linha via `feed()`, renderizado como uma TUI de tela cheia (barra de status, painel de logs filtrado, rodapé de atalhos) e conduzido pelo `control()` — o mesmo viewer que o modo Monitor usa para acompanhar logs dos workers.
</d-block-terminal>

Use o botão de source no terminal para ler o arquivo PHP exato em execução. O componente está documentado no [overview do Logs](/manual/CLI/UI/Components/Logs/overview).
