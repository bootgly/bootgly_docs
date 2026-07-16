# Toasts

A demo oficial do Toasts roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de código-fonte no terminal para ler o arquivo PHP exato sendo executado.

## Notificações toast de canto

Um frame de dashboard segue rodando seu loop de tick enquanto toasts de todas as severidades entram na pilha com vidas escalonadas — observe um toast do meio da pilha expirar e os sobreviventes recompactarem em direção à âncora, com o dashboard repintando intacto embaixo. Escolha uma posição na barra de abas e clique Run: o mesmo overlay dirige todos os cantos e o centro. TopRight roda o showcase completo com um `flash()` bloqueante; as variações mudam apenas as `Positions` (e um ajuste acompanhante) — TopLeft adiciona um `gap` entre as caixas, Center centraliza o bloco inteiro com `limit = 2`, BottomRight alinha cada caixa à direita numa borda esquerda irregular.

<d-block-terminal
  engine="bootgly-cli"
  title="Toasts — demos ao vivo"
  commands="TopRight (cheio):demo 50|TopLeft (gap):demo 50.1|Center (limit 2):demo 50.2|BottomRight (irregular):demo 50.3"
  height="480"
>
`add()` enfileira com deadline; `render()` por frame descarta toasts expirados, apagando suas células e repintando o frame coberto. Só observe — toasts nunca capturam o teclado. Use o botão de código-fonte para ler o arquivo PHP de cada demo.
</d-block-terminal>

Em saída não interativa (pipes, CI) cada toast escreve uma linha classificada — `[SUCCESS] Cache warmed`.

O componente está documentado no [overview do Toasts](/manual/CLI/UX/Components/Toasts/overview).
