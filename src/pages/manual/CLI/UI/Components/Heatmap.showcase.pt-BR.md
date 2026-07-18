# Heatmap

O demo oficial do Heatmap roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de código-fonte no terminal para ler o arquivo PHP exato em execução.

## Cards de dashboard

O demo renderiza três cards: uma suíte `http` verde (uma célula por assertion, score de 94% — células skipped salpicadas em bege), uma suíte `websocket` onde as células failed em vermelho suave se destacam sobre o rosa, e um card `deploys` com paleta e estado positivo totalmente personalizados.

<d-block-terminal engine="bootgly-cli" title="Heatmap — demo ao vivo" commands="Heatmap:demo 60" height="360">
O render é one-shot e sem cursor — truecolor com fallback automático para 256 cores. O runner de testes usa o mesmo componente como `bootgly test --view=heatmap`, um card por suíte.
</d-block-terminal>

O componente está documentado no [overview do Heatmap](/manual/CLI/UI/Components/Heatmap/overview).
