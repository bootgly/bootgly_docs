# Charts

The official Charts demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## One chart per example

Each tab runs one chart type: a 15-point gradient sparkline; a benchmark-style series as labeled bars; three percentage meters; and the live braille Graph streaming a fake CPU wave — each cell packs two values, colored by height.

<d-block-terminal engine="bootgly-cli" title="Charts — live demos" commands="Sparkline:demo 36|Bars:demo 42|Meter:demo 43|Graph:demo 44" height="360">
Sparkline, Bars and Meter are pure string renders — identical on terminals, pipes and CI logs (`bootgly test benchmark` prints the Bars plot after the marks table). The Graph streams live: `feed()` slides the history and repaints throttled.
</d-block-terminal>

The component is documented in the [Charts overview](/manual/CLI/UI/Components/Charts/overview).
