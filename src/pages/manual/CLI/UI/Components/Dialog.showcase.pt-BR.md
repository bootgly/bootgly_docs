# Dialog

O demo oficial do Dialog roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## Confirm, prompt e alert

O demo encadeia as três interações: uma confirmação `[Y/n]`, um prompt raw com default e um alert de reconhecimento. Clique no terminal para interagir — digite suas respostas e pressione Enter (respostas vazias assumem os defaults).

<d-block-terminal engine="bootgly-cli" title="Dialog — demo ao vivo" command="demo 26" height="380">
O `confirm()` renderiza uma pergunta sim/não e retorna um booleano; o `prompt()` retorna a resposta raw com trim (ou o default); o `alert()` renderiza um Alert de Atenção e espera Enter em terminais interativos.
</d-block-terminal>

Em entrada não-interativa (pipes, CI), toda resposta cai no seu default — scripts continuam determinísticos.

O componente está documentado no [overview do Dialog](/manual/CLI/UI/Components/Dialog/overview).
