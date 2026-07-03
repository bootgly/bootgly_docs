# Progress

Both official Progress demos run live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Determined state

A 1000000-iteration loop with a heart-symbol bar, descriptions that change at milestones, and a ~60 fps render throttle. This demo measures raw loop throughput — the rate counter is the star.

<d-block-terminal engine="bootgly-cli" title="Progress — determined" command="demo 19" height="300">
`Progress` with `total = 1000000`: percent, elapsed, ETA and rate are computed on every advance; rendering is throttled to ~60 fps.
</d-block-terminal>

## Indetermined state

When `total` is `0`, Progress switches to the indetermined state: the bar cycles and the percent stays unknown while elapsed time and rate keep ticking. Each of the 1 500 iterations sleeps 5 ms — a realistic pacing animation.

<d-block-terminal engine="bootgly-cli" title="Progress — indetermined" command="demo 20" height="300">
`Progress` with `total = 0` (indetermined): the loop advances 1 500 times with `usleep(5000)` between advances.
</d-block-terminal>
