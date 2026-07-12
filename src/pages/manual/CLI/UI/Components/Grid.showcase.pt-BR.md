# Grid

A demo oficial do Grid roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de código-fonte no terminal para ler o arquivo PHP exato sendo executado.

## Dashboard estilo btop

Um layout 2×2 com pesos preenchendo o terminal: um graph braille de CPU e um meter de MEM renderizam nos Outputs isolados de seus frames, um frame de log segue seu feed e um frame de relógio é reescrito a cada tick — 10 FPS, repintando apenas as linhas que mudaram.

<d-block-terminal engine="bootgly-cli" title="Grid — demo ao vivo" command="demo 46" height="480">
`rows`/`columns` dão pesos às trilhas; `place()` ancora cada frame com spans; `render()` os pinta na ordem de posicionamento; um resize do terminal refaz o dashboard inteiro.
</d-block-terminal>

Em saída não interativa (pipes, CI) o mesmo código escreve um quadro de cada retângulo de forma plana.

O componente está documentado no [overview do Grid](/manual/CLI/UI/Components/Grid/overview).
