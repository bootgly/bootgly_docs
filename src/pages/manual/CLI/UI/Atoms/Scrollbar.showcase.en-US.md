# Scrollbar

The official Scrollbar demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Standalone strip

The demo places a strip beside a numbered window over 100 rows. The wheel scrolls the view, moving over the thumb accents it, a left press on the track jumps the view and dragging the thumb follows the pointer.

<d-block-terminal engine="bootgly-cli" title="Scrollbar — live demo" command="demo 62" height="340">
Wheel scrolls · hover accents the thumb · click the track to jump · drag the thumb · PgUp/PgDn page · `q` quits.
</d-block-terminal>

On non-interactive output (pipes, CI) the same strip renders its bare glyph rows in flow, with zero escape codes.

The component is documented in the [Scrollbar overview](/manual/CLI/UI/Atoms/Scrollbar/overview).
