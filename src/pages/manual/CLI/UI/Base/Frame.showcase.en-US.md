# Frame

The official Frame demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Isolated Output boxes

Two frames side by side, each with its own isolated Output: the left one accumulates fed rows (tail view), the right one is cleared and rewritten every tick (a clock). Only the rows that changed repaint — a quiet frame writes zero bytes.

<d-block-terminal engine="bootgly-cli" title="Frame — live demo" command="demo 45" height="420">
`$Frame->Output->render()` writes into the frame; `clear()` empties it; `render()` diff-blits the rectangle — borders, title and padding included, erase escapes never emitted.
</d-block-terminal>

On non-interactive output (pipes, CI) the same code writes the rectangles plainly.

The component is documented in the [Frame overview](/manual/CLI/UI/Base/Frame/overview).
