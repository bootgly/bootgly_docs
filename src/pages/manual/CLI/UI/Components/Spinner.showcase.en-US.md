# Spinner

The official Spinner demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Indeterminate activity

The demo simulates dependency resolution: the braille frames animate while the work loop drives `spin()`, `describe()` swaps the activity text mid-flight and `finish()` replaces the line with the resolution.

<d-block-terminal engine="bootgly-cli" title="Spinner — live demo" command="demo 32" height="300">
Tick-driven animation — the caller loop calls `spin()` and the component throttles the repaints (80ms). No process forking involved.
</d-block-terminal>

On non-interactive output (pipes, CI) the description prints once and the resolution line closes it — no animation frames pollute the logs.

The component is documented in the [Spinner overview](/manual/CLI/UI/Components/Spinner/overview).
