# Spinner

A demo oficial do Spinner roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## Atividade indeterminada

A demo simula resolução de dependências: os frames braille animam enquanto o loop de trabalho conduz `spin()`, `describe()` troca o texto da atividade no meio do caminho e `finish()` substitui a linha pela resolução.

<d-block-terminal engine="bootgly-cli" title="Spinner — demo ao vivo" command="demo 32" height="300">
Animação guiada por tick — o loop chamador conduz `spin()` e o componente limita os repaints (80ms). Sem fork de processo.
</d-block-terminal>

Em saída não interativa (pipes, CI) a descrição imprime uma vez e a linha de resolução encerra — nenhum frame de animação polui os logs.

O componente está documentado no [overview do Spinner](/manual/CLI/UI/Components/Spinner/overview).
