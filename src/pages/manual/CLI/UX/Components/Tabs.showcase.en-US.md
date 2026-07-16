# Tabs

The official Tabs demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## btop-like tabbed dashboard

Three tab frames share one rectangle: a log tail fed every tick, a live braille CPU graph and a static table — all buffering independently while hidden. Click the terminal, then use `←`/`→` or `Tab`/`Shift+Tab` to cycle, `1`-`3` to jump; `q` quits. The bar rides the active frame's top border.

<d-block-terminal engine="bootgly-cli" title="Tabs — live demo" command="demo 47" height="480">
`add()` creates each tab frame; `switching()` drives the keys at a fixed clock; inactive tabs drain bounded and reveal their tail when visited.
</d-block-terminal>

On non-interactive output (pipes, CI) the same code renders the active rectangle once.

The component is documented in the [Tabs overview](/manual/CLI/UX/Components/Tabs/overview).
