# Frame

A demo oficial do Frame roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de código-fonte no terminal para ler o arquivo PHP exato sendo executado.

## Caixas com Output isolado

Dois frames lado a lado, cada um com seu próprio Output isolado: o da esquerda acumula linhas alimentadas (vista tail), o da direita é limpo e reescrito a cada tick (um relógio). Apenas as linhas que mudaram repintam — um frame quieto escreve zero bytes.

<d-block-terminal engine="bootgly-cli" title="Frame — demo ao vivo" command="demo 45" height="420">
`$Frame->Output->render()` escreve dentro do frame; `clear()` o esvazia; `render()` faz o diff blit do retângulo — bordas, título e padding incluídos, escapes de apagamento nunca emitidos.
</d-block-terminal>

Em saída não interativa (pipes, CI) o mesmo código escreve os retângulos de forma plana.

O componente está documentado no [overview do Frame](/manual/CLI/UI/Base/Frame/overview).
