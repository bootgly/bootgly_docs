# Dumper

A demo oficial do Dumper roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato sendo executado.

## Dumps estruturados de valores no terminal

A demo faz o dump de um array tipado, depois de um grafo de objeto completo — sigilos de visibilidade, uma propriedade readonly, um enum, uma closure e um ciclo real — e fecha com os caps de legibilidade em ação.

<d-block-terminal engine="bootgly-cli" title="Dumper — demo ao vivo" command="demo 56" height="420">
Qualquer valor PHP renderizado como uma árvore estruturada e colorizada: nomes de classe em rosa, propriedades em ciano, strings em verde, números em laranja — com guardas *RECURSION* e notas de truncamento.
</d-block-terminal>

Em saída não-interativa (pipes, CI) o mesmo render mantém a estrutura com zero escape codes.

O componente está documentado no [overview do Dumper](/manual/CLI/UI/Atoms/Dumper/overview).
