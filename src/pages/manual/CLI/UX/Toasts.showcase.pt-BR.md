# Toasts

A demo oficial do Toasts roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de código-fonte no terminal para ler o arquivo PHP exato sendo executado.

## Notificações toast de canto

Um frame de dashboard segue rodando seu loop de tick enquanto toasts de todas as severidades entram na pilha do canto superior direito com vidas escalonadas — observe um toast do meio da pilha expirar e os sobreviventes recompactarem em direção ao canto, com o dashboard repintando intacto embaixo. Um `flash()` bloqueante fecha o show.

<d-block-terminal engine="bootgly-cli" title="Toasts — demo ao vivo" command="demo 50" height="480">
`add()` enfileira com deadline; `render()` por frame descarta toasts expirados, apagando suas células e repintando o frame coberto. Só observe — toasts nunca capturam o teclado.
</d-block-terminal>

Em saída não interativa (pipes, CI) cada toast escreve uma linha classificada — `[SUCCESS] Cache warmed`.

### Variações de posição

O mesmo overlay dirige todas as posições da tela — rode `demo 50.1` (TopLeft, com espaço entre as caixas), `demo 50.2` (Center, limit 2) e `demo 50.3` (BottomRight, larguras irregulares alinhadas à direita) para comparar.

O componente está documentado no [overview do Toasts](/manual/CLI/UX/Toasts/overview).
