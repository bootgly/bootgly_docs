# Spinner

A demo oficial do Spinner roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## Atividade indeterminada

A demo simula resolução de dependências: os frames braille animam enquanto o loop de trabalho conduz `spin()`, `describe()` troca o texto da atividade no meio do caminho e `finish()` substitui a linha pela resolução.

<d-block-terminal engine="bootgly-cli" title="Spinner — demo ao vivo" command="demo 32" height="300">
Animação guiada por tick — o loop chamador conduz `spin()` e o componente limita os repaints (80ms). Sem fork de processo.
</d-block-terminal>

## Estilo assistente

Frames star, descrição com shimmer, status `(decorrido · tokens)` ao vivo e tips rotacionando abaixo — o visual de assistente de IA:

<d-block-terminal engine="bootgly-cli" title="Spinner — estilo assistente" command="demo 32.1" height="300">
`set = 'star'`, `effect = Effects::Shimmer`, um `status` reatribuído a cada tick (o token `@elapsed;` formata o tempo decorrido) e um pool de `tips` rotacionando a cada poucos segundos.
</d-block-terminal>

## Sets nomeados e status de download ao vivo

Cada set de animação builtin em sequência — depois uma descrição pulsada com status `(decorrido · MB · velocidade)` guiado por dados:

<d-block-terminal engine="bootgly-cli" title="Spinner — sets nomeados" command="demo 32.2" height="300">
`braille`, `star`, `line`, `arc` e `dots` — um spinner por entrada de `Spinner::$Sets`.
</d-block-terminal>

<d-block-terminal engine="bootgly-cli" title="Spinner — status ao vivo" command="demo 32.3" height="300">
`effect = Effects::Fade` respira a descrição enquanto `$Spinner->status` carrega os contadores do download, repaint a repaint.
</d-block-terminal>

Em saída não interativa (pipes, CI) a descrição imprime uma vez e a linha de resolução encerra — nenhum frame de animação, status, tip ou efeito polui os logs.

O componente está documentado no [overview do Spinner](/manual/CLI/UI/Components/Spinner/overview).
