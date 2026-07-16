# Form

The official Form demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Sequential fields, revert and summary

The demo declares four fields (a validated Text, a masked Secret, a Select and a Confirm). Click the terminal to interact — answer each field, type `↑` then Enter to go back one field, and edit any field from the final summary Menu before confirming.

<d-block-terminal engine="bootgly-cli" title="Form — live demo" command="demo 28" height="420">
Fields are asked one at a time by their editors (Question, Menu); the Secret field echoes `•` per character; the summary Fieldset + confirm Menu let you edit any field before submitting.
</d-block-terminal>

On non-interactive input (pipes, CI) each field consumes exactly one stdin line — no revert, no summary loop, fully deterministic.

The component is documented in the [Form overview](/manual/CLI/UX/Components/Form/overview).
