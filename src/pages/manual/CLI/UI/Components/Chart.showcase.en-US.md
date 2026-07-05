# Chart

The official Chart demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Sparkline and bars

The demo plots a 15-point series as a one-line sparkline, then a benchmark-style series as labeled horizontal bars scaled to the widest value.

<d-block-terminal engine="bootgly-cli" title="Chart — live demo" command="demo 36" height="340">
Pure string render — no cursor movement: the same output lands on interactive terminals, pipes and CI logs. `bootgly test benchmark` prints this Bars plot after the marks table.
</d-block-terminal>

The component is documented in the [Chart overview](/manual/CLI/UI/Components/Chart/overview).
