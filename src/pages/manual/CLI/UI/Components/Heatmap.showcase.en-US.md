# Heatmap

The official Heatmap demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Cell grids

Three demos: the static grids (a bare `http` grid, a labeled `websocket` grid with soft-red failures and a custom-palette `deploys` grid); a live grid filling cell by cell with its counter following; and live failures landing red while the summary updates — plus a custom-palette grid streaming right after.

<d-block-terminal engine="bootgly-cli" title="Heatmap — live demos" commands="Heatmap:demo 60|Live:demo 60.1|Failures:demo 60.2" height="360">
The render is cursor-free; in live mode `start()`/`feed()`/`finish()` repaint the grid in place as cells arrive, and the corner labels are plain properties the host updates mid-stream. The test runner mounts this grid inside its `bootgly test --view=heatmap` card — one cell per assertion, streaming on interactive terminals.
</d-block-terminal>

The component is documented in the [Heatmap overview](/manual/CLI/UI/Components/Heatmap/overview).
