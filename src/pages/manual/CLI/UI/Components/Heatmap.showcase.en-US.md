# Heatmap

The official Heatmap demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Dashboard cards

The demo renders three cards: a green `http` suite (one cell per assertion, 94% score — skipped cells sprinkled in beige), a `websocket` suite where soft-red failed cells stand out against the pink, and a `deploys` card with a fully custom palette and positive state.

<d-block-terminal engine="bootgly-cli" title="Heatmap — live demo" commands="Heatmap:demo 60" height="360">
The render is one-shot and cursor-free — truecolor with an automatic 256-color fallback. The test runner wires the same component as `bootgly test --view=heatmap`, one card per suite.
</d-block-terminal>

The component is documented in the [Heatmap overview](/manual/CLI/UI/Components/Heatmap/overview).
