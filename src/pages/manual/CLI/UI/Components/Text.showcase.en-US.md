# Text

The official Text demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Typewriter, fade and shimmer

The demo chains the three effects: a typewriter line, a fade-in line, and the continuous shimmer wave passing letter by letter while a simulated wait loop drives `tick()`.

<d-block-terminal engine="bootgly-cli" title="Text — live demo" command="demo 37" height="340">
`play()` runs the one-shot effects; the shimmer runs `start()` → `tick()` (from the waiting loop) → `finish()` — the final frame is always the plain content line.
</d-block-terminal>

On non-interactive output (pipes, CI) every effect renders the final plain frame only.

The component is documented in the [Text overview](/manual/CLI/UI/Components/Text/overview).
