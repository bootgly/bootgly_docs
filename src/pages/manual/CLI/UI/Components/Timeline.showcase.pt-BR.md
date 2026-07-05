# Timeline

A demo oficial da Timeline roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## Fluxo guiado multi-etapas

A demo percorre um fluxo de deploy de 4 etapas: cada etapa transiciona pending → active → done no lugar, com notas anotando as etapas concluídas.

<d-block-terminal engine="bootgly-cli" title="Timeline — demo ao vivo" command="demo 34" height="340">
`start()` ativa a primeira etapa; cada `advance()` completa a ativa (com nota opcional) e ativa a próxima — o frame vertical repinta no lugar.
</d-block-terminal>

Em saída não interativa (pipes, CI) cada transição anexa uma linha simples — o mesmo fluxo permanece legível em logs.

O componente está documentado no [overview da Timeline](/manual/CLI/UI/Components/Timeline/overview).
