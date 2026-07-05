# Timer

The official Timer demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Countdown with callback

The demo runs a 5-second countdown: the remaining time and the percentage tick in place, and the `Handler` fires exactly once at zero with the elapsed wall-clock time.

<d-block-terminal engine="bootgly-cli" title="Timer — live demo" command="demo 33" height="300">
`run()` drives the whole lifecycle: wall-clock ticks (usleep drift never desynchronizes the countdown), throttled repaints and the one-shot completion Handler.
</d-block-terminal>

On non-interactive output (pipes, CI) only the initial and the final frames render — deterministic logs.

The component is documented in the [Timer overview](/manual/CLI/UI/Components/Timer/overview).
