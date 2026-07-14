# Dialog

A demo oficial do Dialog roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de código-fonte no terminal para ler o arquivo PHP exato sendo executado.

## Modal sobre frames cobertos

Um frame de dashboard pinta primeiro — então um `confirm()` modal, um `prompt()` e um `alert()` abrem sobre ele em sequência. Observe o dashboard repintar intacto após cada fechamento: o dialog apaga seu retângulo com espaços e o frame coberto se restaura. A caixa final envolve a tela alternativa — o terminal inteiro volta intocado.

<d-block-terminal engine="bootgly-cli" title="Dialog — demo ao vivo" command="demo 49" height="480">
`cover()` registra o que o modal sobrepõe; `confirm()`/`prompt()`/`alert()` capturam o teclado enquanto abertos — responda com `y`/`n`, digite uma tag e pressione qualquer tecla para reconhecer.
</d-block-terminal>

Em saída não interativa (pipes, CI) nenhuma caixa é pintada — as variantes mantêm a semântica de uma linha do Question.

O componente está documentado no [overview do Dialog](/manual/CLI/UX/Dialog/overview).
