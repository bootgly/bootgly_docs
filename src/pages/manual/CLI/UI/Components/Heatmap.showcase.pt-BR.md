# Heatmap

O demo oficial do Heatmap roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de código-fonte no terminal para ler o arquivo PHP exato em execução.

## Grades de células

Três demos: as grades estáticas (uma grade `http` pura, uma `websocket` com labels e falhas em vermelho suave e uma grade `deploys` de paleta personalizada); uma grade ao vivo enchendo célula a célula com o contador acompanhando; e falhas caindo em vermelho ao vivo enquanto o resumo atualiza — mais uma grade de paleta personalizada transmitindo na sequência.

<d-block-terminal engine="bootgly-cli" title="Heatmap — demos ao vivo" commands="Heatmap:demo 60|Live:demo 60.1|Falhas:demo 60.2" height="360">
O render é sem cursor; no modo live, `start()`/`feed()`/`finish()` repintam a grade no lugar conforme as células chegam, e os labels de canto são propriedades simples que o host atualiza mid-stream. O runner de testes monta esta grade dentro do card do `bootgly test --view=heatmap` — uma célula por assertion, transmitindo em terminais interativos.
</d-block-terminal>

O componente está documentado no [overview do Heatmap](/manual/CLI/UI/Components/Heatmap/overview).
