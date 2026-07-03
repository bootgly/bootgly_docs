# Terminal Output

The Output writing demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Paced writing

`Output->writing()` types the text character by character, typewriter style. The pace is controlled by the `waiting` property (microseconds between characters) — the demo increases the speed mid-run.

<d-block-terminal engine="bootgly-cli" title="Output — paced writing" command="demo 2" height="300">
`$Output->writing(...)` streaming each character with a delay; `$Output->waiting = 10000` speeds it up. Watch the text appear gradually — every frame is real PHP output, streamed as it is written.
</d-block-terminal>

The class is documented in the [Output overview](/manual/CLI/Terminal/Output/overview) — and its parts have their own showcases: [Cursor](/manual/CLI/Terminal/Output/Cursor/showcase), [Text](/manual/CLI/Terminal/Output/Text/showcase) and [Viewport](/manual/CLI/Terminal/Output/Viewport/showcase).
