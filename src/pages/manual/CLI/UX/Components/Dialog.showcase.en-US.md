# Dialog

The official Dialog demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Modal over covered frames

A dashboard frame paints first — then a modal `confirm()`, a `prompt()` and an `alert()` open over it in sequence. Watch the dashboard repaint intact after each close: the dialog blanks its rectangle and the covered frame restores itself. The final box wraps the alternate screen instead — the whole terminal comes back untouched.

<d-block-terminal engine="bootgly-cli" title="Dialog — live demo" command="demo 49" height="480">
`cover()` registers what the modal overlaps; `confirm()`/`prompt()`/`alert()` trap the keyboard while open — answer with `y`/`n`, type a tag and press any key to acknowledge.
</d-block-terminal>

On non-interactive output (pipes, CI) no box is painted — the variants keep the Question one-line semantics.

The component is documented in the [Dialog overview](/manual/CLI/UX/Components/Dialog/overview).
