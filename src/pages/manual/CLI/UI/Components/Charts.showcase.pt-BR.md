# Charts

A demo oficial do Charts roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## Um chart por exemplo

Cada aba roda um tipo de chart: um sparkline de 15 pontos com gradiente; uma série estilo benchmark como barras rotuladas; três meters de porcentagem; e o Graph braille ao vivo transmitindo uma onda fake de CPU — cada célula empacota dois valores, coloridos pela altura.

<d-block-terminal engine="bootgly-cli" title="Charts — demos ao vivo" commands="Sparkline:demo 36|Bars:demo 42|Meter:demo 43|Graph:demo 44" height="360">
Sparkline, Bars e Meter são renders de string pura — idênticos em terminais, pipes e logs de CI (o `bootgly test benchmark` imprime o plot de Bars após a tabela de marks). O Graph transmite ao vivo: `feed()` desliza o histórico e repinta com throttle.
</d-block-terminal>

O componente está documentado no [overview do Charts](/manual/CLI/UI/Components/Charts/overview).
