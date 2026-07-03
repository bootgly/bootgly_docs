# Terminal Output

O demo de escrita do Output roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## Escrita cadenciada

O `Output->writing()` digita o texto caractere por caractere, estilo máquina de escrever. O ritmo é controlado pela propriedade `waiting` (microssegundos entre caracteres) — o demo aumenta a velocidade no meio da execução.

<d-block-terminal engine="bootgly-cli" title="Output — escrita cadenciada" command="demo 2" height="300">
`$Output->writing(...)` transmitindo cada caractere com um atraso; `$Output->waiting = 10000` acelera. Veja o texto aparecer gradualmente — cada frame é saída PHP real, transmitida conforme é escrita.
</d-block-terminal>

A classe está documentada no [overview do Output](/manual/CLI/Terminal/Output/overview) — e suas partes têm showcases próprios: [Cursor](/manual/CLI/Terminal/Output/Cursor/showcase), [Text](/manual/CLI/Terminal/Output/Text/showcase) e [Viewport](/manual/CLI/Terminal/Output/Viewport/showcase).
