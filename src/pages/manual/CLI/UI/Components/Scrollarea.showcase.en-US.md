# Scrollarea

The official Scrollarea demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Buffered content band

Sixty rows are fed into a 12-row band pinned below the header — the view follows the newest rows. Click the terminal and press `PgUp`/`PgDn` or use the mouse wheel to scroll the window; the scrollbar thumb highlights on hover and can be clicked and dragged; `q` quits.

<d-block-terminal engine="bootgly-cli" title="Scrollarea — live demo" command="demo 41" height="480">
`feed()` buffers and wraps the rows; `scroll()` moves the view; `hit()`/`aim()`/`hover()` make the scrollbar mouse-interactive; reaching the last row sticks it back to the bottom.
</d-block-terminal>

On non-interactive output (pipes, CI) the same code writes the rows plainly.

The component is documented in the [Scrollarea overview](/manual/CLI/UI/Components/Scrollarea/overview).
