# Statusbar

The official Statusbar demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Single-row status bars

The demo renders an App-style bar (screen context + keybinding hints), a custom divider and style, and segments carrying their own colors — measuring stays escape-aware.

<d-block-terminal engine="bootgly-cli" title="Statusbar — live demo" command="demo 57" height="300">
Left segments divider-separated, right segments aligned to the edge, 256-color bar backgrounds — the Console App shell's status row is this exact Atom.
</d-block-terminal>

On non-interactive output (pipes, CI) the same render keeps its alignment with zero escape codes.

The component is documented in the [Statusbar overview](/manual/CLI/UI/Atoms/Statusbar/overview).
