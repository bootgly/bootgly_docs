# Prompt

A demo oficial do Prompt roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## Entrada fixa no rodapé (mini REPL)

Clique no terminal e digite — a linha de entrada fica fixa no rodapé enquanto as linhas ecoadas rolam acima em uma banda bufferizada. `PgUp`/`PgDn` ou a roda do mouse rolam o conteúdo — o cursor da scrollbar destaca no hover e pode ser arrastado; **`Ctrl+T` alterna o modo seleção** (libera o mouse para selecionar/copiar nativo; alterne de novo para retomar); `↑`/`↓` percorrem o histórico; `Alt+Enter` acumula entrada multilinha; `exit` ou `Ctrl+D` sai — `Ctrl+C` avisa na borda inferior e sai no segundo toque em até 2 segundos.

<d-block-terminal engine="bootgly-cli" title="Prompt — demo ao vivo" command="demo 40" height="420">
`feed()` bufferiza conteúdo na banda Scrollarea; `prompting()` entrega cada linha submetida; `finish()` restaura o terminal.
</d-block-terminal>

Em entrada não interativa (pipes, CI) o mesmo código degrada para um loop simples de linhas do stdin.

O componente está documentado no [overview do Prompt](/manual/CLI/UX/Components/Prompt/overview).
