# Highlighter

The official Highlighter demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Syntax-highlighted PHP in the terminal

The demo paints a tagless snippet as bare colored lines, then a guttered excerpt with a marked line — the same rendering the framework uses for error output.

<d-block-terminal engine="bootgly-cli" title="Highlighter — live demo" command="demo 55" height="380">
PHP source colorized by the native tokenizer: declarations in magenta, variables in cyan, strings in green — with line numbers and a ▶ marked line.
</d-block-terminal>

On non-interactive output (pipes, CI) the same render keeps its structure with zero escape codes.

The component is documented in the [Highlighter overview](/manual/CLI/UI/Atoms/Highlighter/overview).
