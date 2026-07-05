# Textarea

The official Textarea demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Multiline editing

The demo asks for a commit message. Click the terminal and type — Enter breaks lines, arrows navigate, Backspace merges lines, and Ctrl+D submits the text.

<d-block-terminal engine="bootgly-cli" title="Textarea — live demo" command="demo 39" height="380">
The visible rows window slides with the cursor; a dim `↓ N more` indicator counts hidden lines. On pipes, stdin lines are read until EOF — deterministic.
</d-block-terminal>

The component is documented in the [Textarea overview](/manual/CLI/UI/Components/Textarea/overview).
