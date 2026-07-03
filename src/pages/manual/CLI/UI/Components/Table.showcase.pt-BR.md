# Table

O demo oficial da Table roda ao vivo abaixo — código real do framework em PHP 8.4 WebAssembly, no seu navegador. Use o botão de source no terminal para ler o arquivo PHP exato em execução.

## Header, body, footer e alinhamento

Um conjunto de dados com header, linhas de body (incluindo texto multibyte e um separador de linha `@---;`) e um footer calculado com `Data->sum()` — renderizado três vezes, alternando o alinhamento das células entre `left`, `center` e `right`.

<d-block-terminal engine="bootgly-cli" title="Table — demo ao vivo" command="demo 21" height="420">
Box-drawing da `Table` com `Data->Header/Body/Footer->set()`, total no footer via `$Table->Data->sum(column: 1)` e `$Table->Cells->align()` re-renderizando os mesmos dados nos três alinhamentos.
</d-block-terminal>

O componente está documentado no [overview da Table](/manual/CLI/UI/Components/Table/overview).
