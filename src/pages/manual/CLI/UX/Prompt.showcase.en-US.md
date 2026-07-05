# Prompt

The official Prompt demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Bottom-fixed input (mini REPL)

Click the terminal and type — the input line stays fixed at the bottom while the echoed lines scroll above it in a buffered band. `PgUp`/`PgDn` or the mouse wheel scroll the content — the scrollbar thumb highlights on hover and can be dragged; **`Ctrl+T` toggles the selection mode** (releases the mouse for native select/copy; toggle again to resume); `↑`/`↓` recall the history; `Alt+Enter` accumulates multiline input; `exit` or `Ctrl+D` quits — `Ctrl+C` warns on the bottom border and quits on a second press within 2 seconds.

<d-block-terminal engine="bootgly-cli" title="Prompt — live demo" command="demo 40" height="420">
`feed()` buffers content into the Scrollarea band; `prompting()` yields each submitted line; `finish()` restores the terminal.
</d-block-terminal>

On non-interactive input (pipes, CI) the same code degrades to a plain stdin line loop.

The component is documented in the [Prompt overview](/manual/CLI/UX/Prompt/overview).
