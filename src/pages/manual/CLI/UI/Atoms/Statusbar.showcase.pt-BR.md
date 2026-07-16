# Statusbar

A demo oficial do Statusbar roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato sendo executado.

## Barras de status de linha única

A demo renderiza uma barra estilo App (contexto de tela + hints de keybinding), divisor e estilo customizados, e segmentos carregando suas próprias cores — a medição continua escape-aware.

<d-block-terminal engine="bootgly-cli" title="Statusbar — demo ao vivo" command="demo 57" height="300">
Segmentos à esquerda separados por divisor, segmentos à direita alinhados à borda, fundos de barra 256-color — a status row do Console App shell é exatamente este Atom.
</d-block-terminal>

Em saída não-interativa (pipes, CI) o mesmo render mantém o alinhamento com zero escape codes.

O componente está documentado no [overview do Statusbar](/manual/CLI/UI/Atoms/Statusbar/overview).
