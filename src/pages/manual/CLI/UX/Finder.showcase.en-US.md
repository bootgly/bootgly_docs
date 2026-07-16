# Finder

The official Finder demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Live search selector

Two searches run in sequence: first over a static components list, then over a dynamic `source` Closure with simulated latency. Type to filter (case-insensitive), aim with `↑`/`↓`, press `Enter` to confirm the aimed match — and `Esc` to cancel.

<d-block-terminal
  engine="bootgly-cli"
  title="Finder — live demo"
  command="demo 53"
  height="480"
>
A live search selector: a static options list filtered as you type, then a dynamic source Closure called with the query on every edit. Use the source button to read the PHP file.
</d-block-terminal>

On non-interactive input (pipes, CI) the finder degrades to a typed line resolved by case-insensitive exact label match.

The component is documented in the [Finder overview](/manual/CLI/UX/Finder/overview).
