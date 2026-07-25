# Prompt

The official Prompt demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Bottom-fixed input (mini REPL)

Click the terminal and type, then press Enter to submit — the input line stays fixed at the bottom while the echoed lines scroll above it in a buffered band. `PgUp`/`PgDn` or the mouse wheel scroll the content — the scrollbar thumb highlights on hover and can be dragged; **`Ctrl+T` toggles the selection mode** (releases the mouse for native select/copy; toggle again to resume); `↑`/`↓` walk the input rows and then the history; `exit` or `Ctrl+D` quits — `Ctrl+C` warns on the bottom border and quits on a second press within 2 seconds.

<d-block-terminal engine="bootgly-cli" title="Prompt — live demo" command="demo 40" height="420">
`feed()` buffers content into the Scrollarea band; `prompting()` yields each submitted line; `finish()` restores the terminal.
</d-block-terminal>

In a real terminal, `Shift+Enter` also breaks the line: the input frame grows one row per break and the rows stay fully editable (`Backspace` at the start of a row merges it into the previous one, `←`/`→` cross the row boundaries), with Enter submitting every row at once. That key needs the extended keyboard protocol, so it may not reach the demo above — this browser terminal does not implement it, and there Enter stays the only submit.

On non-interactive input (pipes, CI) the same code degrades to a plain stdin line loop.

The component is documented in the [Prompt overview](/manual/CLI/UX/Components/Prompt/overview).
