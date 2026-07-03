# Viewport

The Viewport panning demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Panning the screen

A block of colored content lines is written, then the viewport pans **down** (the content scrolls up, new lines fill in from the bottom) and back **up** (the content scrolls down), one line at a time.

<d-block-terminal engine="bootgly-cli" title="Viewport — panning" command="demo 24" height="380">
`$Output->Viewport->panDown(1)` and `panUp(1)` in animated steps — each call emits one scroll escape (`\e[1S` / `\e[1T`) and the terminal shifts the whole viewport.
</d-block-terminal>

The class is documented in the [Viewport overview](/manual/CLI/Terminal/Output/Viewport/overview).
