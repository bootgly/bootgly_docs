# Finder

A demo oficial do Finder roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de código-fonte no terminal para ler o arquivo PHP exato sendo executado.

## Seletor com busca ao vivo

Duas buscas rodam em sequência: primeiro sobre uma lista estática de componentes, depois sobre uma Closure `source` dinâmica com latência simulada. Digite para filtrar (case-insensitive), mire com `↑`/`↓`, pressione `Enter` para confirmar o item mirado — e `Esc` para cancelar.

<d-block-terminal
  engine="bootgly-cli"
  title="Finder — demo ao vivo"
  command="demo 53"
  height="480"
>
Um seletor com busca ao vivo: uma lista estática de opções filtrada enquanto você digita, depois uma Closure source dinâmica chamada com a query a cada edição. Use o botão de código-fonte para ler o arquivo PHP.
</d-block-terminal>

Em entrada não interativa (pipes, CI) o finder degrada para uma linha digitada resolvida por correspondência exata de label (case-insensitive).

O componente está documentado no [overview do Finder](/manual/CLI/UX/Components/Finder/overview).
