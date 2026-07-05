# Timeline

The official Timeline demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Multi-step guided flow

The demo walks a 4-step deploy flow: each step transitions pending → active → done in place, with notes annotating the completed steps.

<d-block-terminal engine="bootgly-cli" title="Timeline — live demo" command="demo 34" height="340">
`start()` activates the first step; each `advance()` completes the active one (with an optional note) and activates the next — the vertical frame repaints in place.
</d-block-terminal>

On non-interactive output (pipes, CI) each transition appends one plain line instead — the same flow stays readable in logs.

The component is documented in the [Timeline overview](/manual/CLI/UI/Components/Timeline/overview).
