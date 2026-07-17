# Differ

A demo oficial do Differ roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato sendo executado.

## Views de diff no terminal

A demo compara uma config de servidor na view unified, renderiza a mesma mudança side-by-side — rows pareadas, números de linha, destaque de palavras intra-linha — e fecha com um hunk apertado de `context: 1` em um arquivo maior.

<d-block-terminal engine="bootgly-cli" title="Differ — demo ao vivo" command="demo 59" height="420">
Dois textos comparados com o motor LCS nativo: linhas removidas em vermelho, adicionadas em verde, headers de hunk em ciano — ou duas colunas numeradas com destaque por palavra quando split.
</d-block-terminal>

Em saída não interativa (pipes, CI) a mesma renderização mantém a estrutura com zero escape codes.

O componente está documentado no [overview do Differ](/manual/CLI/UI/Atoms/Differ/overview).
