# Differ

The official Differ demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Diff views in the terminal

The demo diffs a server config in the unified view, renders the same change side-by-side — paired rows, line numbers, intra-line word highlight — and closes with a tight `context: 1` hunk on a larger file.

<d-block-terminal engine="bootgly-cli" title="Differ — live demo" command="demo 59" height="420">
Two texts compared with the native LCS engine: removed lines red, added lines green, hunk headers cyan — or two line-numbered columns with word-level highlight when split.
</d-block-terminal>

On non-interactive output (pipes, CI) the same render keeps its structure with zero escape codes.

The component is documented in the [Differ overview](/manual/CLI/UI/Atoms/Differ/overview).
