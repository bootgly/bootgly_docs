# Alert

The official Alert demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## All alert types

One `Alert` instance re-rendered through its four types — `Success`, `Attention`, `Failure` and `Default` — each with its own color, symbol and framing.

<d-block-terminal engine="bootgly-cli" title="Alert — live demo" command="demo 12" height="340">
`Alert` renders a styled message box per type: set the type with `$Alert->Type::Success->set()`, the text with `$Alert->message`, and call `render()`.
</d-block-terminal>

The component is documented in the [Alert overview](/manual/CLI/UI/Components/Alert/overview).
