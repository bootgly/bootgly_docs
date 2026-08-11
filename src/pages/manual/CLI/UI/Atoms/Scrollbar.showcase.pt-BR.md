# Scrollbar

O demo oficial de Scrollbar roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato sendo executado.

## Faixa standalone

O demo posiciona uma faixa ao lado de uma janela numerada sobre 100 linhas. A wheel rola a view, passar sobre o thumb o acentua, um press esquerdo no trilho salta a view e arrastar o thumb acompanha o ponteiro.

<d-block-terminal engine="bootgly-cli" title="Scrollbar — demo ao vivo" command="demo 62" height="340">
Wheel rola · hover acentua o thumb · clique no trilho para saltar · arraste o thumb · PgUp/PgDn pagina · `q` encerra.
</d-block-terminal>

Em saída não interativa (pipes, CI) a mesma faixa renderiza suas linhas de glyph puras em fluxo, com zero códigos de escape.

O componente está documentado no [overview do Scrollbar](/manual/CLI/UI/Atoms/Scrollbar/overview).
