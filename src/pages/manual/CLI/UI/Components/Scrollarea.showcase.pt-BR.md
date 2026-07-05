# Scrollarea

A demo oficial do Scrollarea roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## Banda de conteúdo bufferizada

Sessenta linhas são alimentadas em uma banda de 12 linhas fixada abaixo do cabeçalho — a visão segue as linhas mais novas. Clique no terminal e pressione `PgUp`/`PgDn` ou use a roda do mouse para rolar a janela; o cursor da scrollbar destaca no hover e aceita clique e arrasto; `q` sai.

<d-block-terminal engine="bootgly-cli" title="Scrollarea — demo ao vivo" command="demo 41" height="480">
`feed()` bufferiza e quebra as linhas; `scroll()` move a visão; `hit()`/`aim()`/`hover()` tornam a scrollbar interativa com mouse; alcançar a última linha a gruda de volta no rodapé.
</d-block-terminal>

Em saída não interativa (pipes, CI) o mesmo código escreve as linhas de forma plana.

O componente está documentado no [overview do Scrollarea](/manual/CLI/UI/Components/Scrollarea/overview).
