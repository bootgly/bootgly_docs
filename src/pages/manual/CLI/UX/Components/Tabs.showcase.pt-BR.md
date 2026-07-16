# Tabs

A demo oficial do Tabs roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de código-fonte no terminal para ler o arquivo PHP exato sendo executado.

## Dashboard com abas estilo btop

Três frames de aba compartilham um retângulo: um tail de log alimentado a cada tick, um graph braille de CPU ao vivo e uma tabela estática — todos bufferizando de forma independente enquanto escondidos. Clique no terminal e use `←`/`→` ou `Tab`/`Shift+Tab` para ciclar, `1`-`3` para pular; `q` sai. A barra vive na borda superior do frame ativo.

<d-block-terminal engine="bootgly-cli" title="Tabs — demo ao vivo" command="demo 47" height="480">
`add()` cria cada frame de aba; `switching()` dirige as teclas em clock fixo; abas inativas drenam limitadas e revelam seu tail ao serem visitadas.
</d-block-terminal>

Em saída não interativa (pipes, CI) o mesmo código renderiza o retângulo ativo uma vez.

O componente está documentado no [overview do Tabs](/manual/CLI/UX/Components/Tabs/overview).
