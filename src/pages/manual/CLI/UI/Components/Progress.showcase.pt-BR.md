# Progress

Os dois demos oficiais do Progress executam ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de código-fonte no terminal para ler o arquivo PHP exato sendo executado.

## Estado determinado

Um loop de 1000000 iterações com barra de símbolos de coração, descrições que mudam em marcos, e throttle de renderização de ~60 fps. Este demo mede o throughput bruto do loop — o contador de taxa é a estrela.

<d-block-terminal engine="bootgly-cli" title="Progress — determinado" command="demo 19" height="300">
`Progress` com `total = 1000000`: percentual, tempo decorrido, ETA e taxa são computados a cada advance; a renderização é limitada a ~60 fps.
</d-block-terminal>

## Estado indeterminado

Quando `total` é `0`, o Progress muda para o estado indeterminado: a barra cicla e o percentual permanece desconhecido enquanto tempo decorrido e taxa continuam atualizando. Cada uma das 1 500 iterações dorme 5 ms — uma animação de ritmo realista.

<d-block-terminal engine="bootgly-cli" title="Progress — indeterminado" command="demo 20" height="300">
`Progress` com `total = 0` (indeterminado): o loop avança 1 500 vezes com `usleep(5000)` entre os advances.
</d-block-terminal>

## Grade multi-bar

Quatro trilhas independentes — cada uma com seu total e ritmo — dispostas 2 por linha visual. `tick()` repinta a grade inteira; `finish()` completa todas as trilhas.

<d-block-terminal engine="bootgly-cli" title="Progress — multi-bar" command="demo 35" height="300">
Bars de trilha adicionadas via `Progress->Bars->add()` avançam independentemente; `columns = 2` monta a grade.
</d-block-terminal>
