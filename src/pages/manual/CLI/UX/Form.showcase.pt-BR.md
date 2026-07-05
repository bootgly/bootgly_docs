# Form

A demo oficial do Form roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato sendo executado.

## Campos sequenciais, revert e resumo

A demo declara quatro campos (um Text validado, um Secret mascarado, um Select e um Confirm). Clique no terminal para interagir — responda cada campo, digite `↑` e Enter para voltar um campo, e edite qualquer campo no Menu de resumo final antes de confirmar.

<d-block-terminal engine="bootgly-cli" title="Form — demo ao vivo" command="demo 28" height="420">
Os campos são perguntados um por vez pelos seus editores (Question, Menu); o campo Secret ecoa `•` por caractere; o Fieldset de resumo + Menu de confirmação permitem editar qualquer campo antes de submeter.
</d-block-terminal>

Em entrada não interativa (pipes, CI) cada campo consome exatamente uma linha do stdin — sem revert, sem loop de resumo, totalmente determinístico.

O componente está documentado no [overview do Form](/manual/CLI/UX/Form/overview).
