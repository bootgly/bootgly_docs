# Grid

The official Grid demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## btop-like dashboard

A weighted 2×2 layout filling the terminal: a CPU braille graph and a MEM meter render into their frames' isolated Outputs, a log frame tails its feed and a clock frame is rewritten every tick — 10 FPS, only changed rows repainting.

<d-block-terminal engine="bootgly-cli" title="Grid — live demo" command="demo 46" height="480">
`rows`/`columns` weight the tracks; `place()` anchors each frame with spans; `render()` paints them in placement order; a terminal resize reflows the whole dashboard.
</d-block-terminal>

On non-interactive output (pipes, CI) the same code writes one frame of each rectangle plainly.

The component is documented in the [Grid overview](/manual/CLI/UI/Components/Grid/overview).
