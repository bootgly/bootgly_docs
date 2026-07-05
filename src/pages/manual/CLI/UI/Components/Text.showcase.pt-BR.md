# Text

A demo oficial do Text roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## Typewriter, fade e shimmer

A demo encadeia os três efeitos: uma linha typewriter, uma linha com fade-in, e a onda shimmer contínua passando letra por letra enquanto um loop de espera simulado conduz `tick()`.

<d-block-terminal engine="bootgly-cli" title="Text — demo ao vivo" command="demo 37" height="340">
`play()` roda os efeitos one-shot; o shimmer roda `start()` → `tick()` (no loop de espera) → `finish()` — o frame final é sempre a linha de conteúdo simples.
</d-block-terminal>

Em saída não interativa (pipes, CI) todo efeito renderiza apenas o frame final simples.

O componente está documentado no [overview do Text](/manual/CLI/UI/Components/Text/overview).
