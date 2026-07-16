# Highlighter

A demo oficial do Highlighter roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## PHP com syntax highlighting no terminal

A demo pinta um snippet sem tag como linhas coloridas sem gutter, e depois um excerpt com gutter e linha marcada — a mesma renderização que o framework usa na saída de erro.

<d-block-terminal engine="bootgly-cli" title="Highlighter — demo ao vivo" command="demo 55" height="380">
Código PHP colorizado pelo tokenizer nativo: declarações em magenta, variáveis em ciano, strings em verde — com números de linha e uma linha marcada com ▶.
</d-block-terminal>

Em saída não-interativa (pipes, CI) o mesmo render mantém a estrutura com zero escape codes.

O componente está documentado no [overview do Highlighter](/manual/CLI/UI/Atoms/Highlighter/overview).
