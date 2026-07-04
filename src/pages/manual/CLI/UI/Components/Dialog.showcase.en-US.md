# Dialog

The official Dialog demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Confirm, prompt and alert

The demo chains the three interactions: a `[Y/n]` confirmation, a raw prompt with a default, and an acknowledgement alert. Click the terminal to interact — type your answers and press Enter (empty answers assume the defaults).

<d-block-terminal engine="bootgly-cli" title="Dialog — live demo" command="demo 26" height="380">
`confirm()` renders a yes/no question and returns a boolean; `prompt()` returns the trimmed raw answer (or the default); `alert()` renders an Attention Alert and waits for Enter on interactive terminals.
</d-block-terminal>

On non-interactive input (pipes, CI), every answer falls back to its default — scripts stay deterministic.

The component is documented in the [Dialog overview](/manual/CLI/UI/Components/Dialog/overview).
