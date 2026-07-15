# Toasts

The official Toasts demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Corner toast notifications

A dashboard frame keeps running its tick loop while toasts of every severity join the top-right stack on staggered lifetimes — watch a mid-stack toast expire and the survivors recompact toward the corner, the dashboard repainting intact underneath. A blocking `flash()` closes the show.

<d-block-terminal engine="bootgly-cli" title="Toasts — live demo" command="demo 50" height="480">
`add()` enqueues with a deadline; `render()` per frame dismisses expired toasts, blanking their cells and repainting the covered frame. Just watch — toasts never trap the keyboard.
</d-block-terminal>

On non-interactive output (pipes, CI) each toast streams one plain classified line — `[SUCCESS] Cache warmed`.

### Position variations

The same overlay drives every screen position — run `demo 50.1` (TopLeft, with a gap between boxes), `demo 50.2` (Center, limit 2) and `demo 50.3` (BottomRight, ragged right-aligned widths) to compare.

The component is documented in the [Toasts overview](/manual/CLI/UX/Toasts/overview).
