# Timer

A demo oficial do Timer roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## Contagem regressiva com callback

A demo roda uma contagem de 5 segundos: o tempo restante e a porcentagem atualizam no lugar, e o `Handler` dispara exatamente uma vez no zero com o tempo decorrido do relógio de parede.

<d-block-terminal engine="bootgly-cli" title="Timer — demo ao vivo" command="demo 33" height="300">
`run()` conduz o ciclo inteiro: ticks pelo relógio de parede (drift de usleep nunca dessincroniza a contagem), repaints com throttle e o Handler de conclusão one-shot.
</d-block-terminal>

Em saída não interativa (pipes, CI) apenas os frames inicial e final renderizam — logs determinísticos.

O componente está documentado no [overview do Timer](/manual/CLI/UI/Components/Timer/overview).
