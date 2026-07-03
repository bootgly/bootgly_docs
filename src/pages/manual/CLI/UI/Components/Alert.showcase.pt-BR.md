# Alert

O demo oficial do Alert roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## Todos os tipos de alerta

Uma instância de `Alert` re-renderizada pelos seus quatro tipos — `Success`, `Attention`, `Failure` e `Default` — cada um com sua própria cor, símbolo e moldura.

<d-block-terminal engine="bootgly-cli" title="Alert — demo ao vivo" command="demo 12" height="340">
O `Alert` renderiza uma caixa de mensagem estilizada por tipo: defina o tipo com `$Alert->Type::Success->set()`, o texto com `$Alert->message`, e chame o `render()`.
</d-block-terminal>

O componente está documentado no [overview do Alert](/manual/CLI/UI/Components/Alert/overview).
