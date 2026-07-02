# Mouse Reporting

The manual's `Mouse->reporting()` example runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. The terminal enables SGR mouse tracking, and every event the browser terminal reports is decoded by PHP in real time.

## Real-time mouse events

Press Run, then **click the terminal once** to give it focus — from there, every move, click, drag and scroll is reported with its column/row coordinates. **Right-click exits** (or use the Stop button).

<d-block-terminal engine="bootgly-cli" title="Mouse Reporting — live" command="demo 23" height="380">
`Mouse->reporting()` decoding SGR tracking sequences: `NONE_CLICK_WITH_MOVEMENT`, `LEFT_CLICK`, `SCROLL_UP`/`SCROLL_DOWN` and modifier combinations, each with `[column, row]` coordinates and the button state. The callback returns `false` on `RIGHT_CLICK`, which disables tracking and restores the terminal.
</d-block-terminal>

## What is happening

1. `$Mouse->report(true)` writes the tracking escapes (`?1003h` any-event + `?1006h` SGR) — the terminal starts encoding mouse activity as `\e[<button;col;row(M|m)` sequences on stdin.
2. `$Mouse->reporting($callback)` parses each sequence and invokes the callback with the `Mousestrokes` action, the `[col, row]` coordinates and the pressed state.
3. Returning `false` from the callback stops the loop; `report(false)` restores normal terminal behavior.

Use the source button on the terminal to read the exact PHP file being executed — the same flow documented in the [Mouse Reporting overview](/manual/CLI/Terminal/Reporting/Mouse/overview).
