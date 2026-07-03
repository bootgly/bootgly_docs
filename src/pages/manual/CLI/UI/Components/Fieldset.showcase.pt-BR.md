# Fieldset

O demo oficial do Fieldset roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## Emoldurando conteúdo — e outros componentes

Três variações de moldura (conteúdo mais largo que o título, título mais largo que o conteúdo, e sem título), seguidas de composição: um `Menu` inteiro renderizado **dentro** de um Fieldset ao colocar o Menu em modo `RETURN_OUTPUT` e usar sua saída como conteúdo do Fieldset.

<d-block-terminal engine="bootgly-cli" title="Fieldset — demo ao vivo" command="demo 22" height="420">
O `Fieldset` desenha uma caixa ao redor de `$Fieldset->content`, embutindo o `$Fieldset->title` na borda superior. Qualquer string serve como conteúdo — inclusive a saída renderizada de outro componente.
</d-block-terminal>

O componente está documentado no [overview do Fieldset](/manual/CLI/UI/Components/Fieldset/overview).
