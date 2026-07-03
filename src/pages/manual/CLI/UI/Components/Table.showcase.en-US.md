# Table

The official Table demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Header, body, footer and alignment

A dataset with header, body rows (including multibyte text and a `@---;` row separator) and a footer computed with `Data->sum()` — rendered three times, cycling the cell alignment through `left`, `center` and `right`.

<d-block-terminal engine="bootgly-cli" title="Table — live demo" command="demo 21" height="420">
`Table` box-drawing with `Data->Header/Body/Footer->set()`, a footer total via `$Table->Data->sum(column: 1)` and `$Table->Cells->align()` re-rendering the same data in the three alignments.
</d-block-terminal>

The component is documented in the [Table overview](/manual/CLI/UI/Components/Table/overview).
