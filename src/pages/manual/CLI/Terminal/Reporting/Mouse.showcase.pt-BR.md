# Mouse Reporting

O exemplo de `Mouse->reporting()` do manual roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. O terminal habilita o rastreamento de mouse SGR, e cada evento que o terminal do navegador reporta é decodificado pelo PHP em tempo real.

## Eventos de mouse em tempo real

Pressione executar e depois **clique uma vez no terminal** para dar foco a ele — a partir daí, cada movimento, clique, arrasto e rolagem é reportado com suas coordenadas de coluna/linha. **Clique direito encerra** (ou use o botão Stop).

<d-block-terminal engine="bootgly-cli" title="Mouse Reporting — ao vivo" command="demo 23" height="380">
`Mouse->reporting()` decodificando sequências de rastreamento SGR: `NONE_CLICK_WITH_MOVEMENT`, `LEFT_CLICK`, `SCROLL_UP`/`SCROLL_DOWN` e combinações com modificadores, cada uma com coordenadas `[coluna, linha]` e o estado do botão. O callback retorna `false` no `RIGHT_CLICK`, o que desabilita o rastreamento e restaura o terminal.
</d-block-terminal>

## O que está acontecendo

1. `$Mouse->report(true)` escreve os escapes de rastreamento (`?1003h` any-event + `?1006h` SGR) — o terminal passa a codificar a atividade do mouse como sequências `\e[<botão;col;linha(M|m)` no stdin.
2. `$Mouse->reporting($callback)` interpreta cada sequência e invoca o callback com a ação `Mousestrokes`, as coordenadas `[col, linha]` e o estado de pressionado.
3. Retornar `false` do callback encerra o loop; `report(false)` restaura o comportamento normal do terminal.

Use o botão de código-fonte no terminal para ler o arquivo PHP exato em execução — o mesmo fluxo documentado na [visão geral do Mouse Reporting](/manual/CLI/Terminal/Reporting/Mouse/overview).
