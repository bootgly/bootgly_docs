# Spinner

The official Spinner demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Indeterminate activity

The demo simulates dependency resolution: the braille frames animate while the work loop drives `spin()`, `describe()` swaps the activity text mid-flight and `finish()` replaces the line with the resolution.

<d-block-terminal engine="bootgly-cli" title="Spinner — live demo" command="demo 32" height="300">
Tick-driven animation — the caller loop calls `spin()` and the component throttles the repaints (80ms). No process forking involved.
</d-block-terminal>

## Assistant style

Star frames, a shimmered description, a live `(elapsed · tokens)` status and rotating tips below — the AI-assistant look:

<d-block-terminal engine="bootgly-cli" title="Spinner — assistant style" command="demo 32.1" height="300">
`set = 'star'`, `effect = Effects::Shimmer`, a `status` reassigned every tick (the `@elapsed;` token formats the running time) and a `tips` pool rotating every few seconds.
</d-block-terminal>

## Named sets and live download status

Every builtin animation set in sequence — then a pulsed description with a data-driven `(elapsed · MB · speed)` status:

<d-block-terminal engine="bootgly-cli" title="Spinner — named sets" command="demo 32.2" height="300">
`braille`, `star`, `line`, `arc` and `dots` — one spinner per `Spinner::$Sets` entry.
</d-block-terminal>

<d-block-terminal engine="bootgly-cli" title="Spinner — live status" command="demo 32.3" height="300">
`effect = Effects::Fade` breathes the description while `$Spinner->status` carries the download counters, repaint by repaint.
</d-block-terminal>

On non-interactive output (pipes, CI) the description prints once and the resolution line closes it — no animation frames, status, tips or effects pollute the logs.

The component is documented in the [Spinner overview](/manual/CLI/UI/Components/Spinner/overview).
