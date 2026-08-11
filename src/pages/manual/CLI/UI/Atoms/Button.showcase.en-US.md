# Button

The official Button demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Hover pills + press Actions

The demo paints four buttons — a bare label, a styled pill, a counter and an icon-only power-off. Hovering paints the background; a left click (or Enter on the Tab-focused button) fires the Action; the `⏻` button's Action quits.

<d-block-terminal engine="bootgly-cli" title="Button — live demo" command="demo 61" height="340">
Move the mouse over the buttons to hover, click to press — or Tab to cycle the focus and Enter to press. Each Action feeds the status line.
</d-block-terminal>

On non-interactive output (pipes, CI) the same buttons render plainly, in flow, with zero escape codes.

The component is documented in the [Button overview](/manual/CLI/UI/Atoms/Button/overview).
