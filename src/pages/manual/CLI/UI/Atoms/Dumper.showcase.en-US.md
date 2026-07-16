# Dumper

The official Dumper demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Structured value dumps in the terminal

The demo dumps a typed array, then a full object graph — visibility sigils, a readonly property, an enum, a closure and a true cycle — and closes with the readability caps in action.

<d-block-terminal engine="bootgly-cli" title="Dumper — live demo" command="demo 56" height="420">
Any PHP value rendered as a structured, colorized tree: class names in pink, properties in cyan, strings in green, numbers in orange — with *RECURSION* guards and truncation notes.
</d-block-terminal>

On non-interactive output (pipes, CI) the same render keeps its structure with zero escape codes.

The component is documented in the [Dumper overview](/manual/CLI/UI/Atoms/Dumper/overview).
