# Toasts

The official Toasts demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Corner toast notifications

A dashboard frame keeps running its tick loop while toasts of every severity join the stack on staggered lifetimes — watch a mid-stack toast expire and the survivors recompact toward the anchor, the dashboard repainting intact underneath. Pick a position in the tab strip and press Run: the same overlay drives every corner and center. TopRight runs the full showcase with a blocking `flash()`; the variations change only the `Positions` (and one companion setting) — TopLeft adds a `gap` between boxes, Center centers the whole block with `limit = 2`, BottomRight right-aligns each box to a ragged left edge.

<d-block-terminal
  engine="bootgly-cli"
  title="Toasts — live demos"
  commands="TopRight (full):demo 50|TopLeft (gap):demo 50.1|Center (limit 2):demo 50.2|BottomRight (ragged):demo 50.3"
  height="480"
>
`add()` enqueues with a deadline; `render()` per frame dismisses expired toasts, blanking their cells and repainting the covered frame. Just watch — toasts never trap the keyboard. Use the source button to read each demo's PHP file.
</d-block-terminal>

On non-interactive output (pipes, CI) each toast streams one plain classified line — `[SUCCESS] Cache warmed`.

The component is documented in the [Toasts overview](/manual/CLI/UX/Toasts/overview).
