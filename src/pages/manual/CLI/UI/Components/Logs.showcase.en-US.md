# Logs

The Logs viewer demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser, **fully interactive**.

## The Monitor-mode viewer

Press Run and watch ~20 simulated worker records stream into the viewer in real time — boots, routed requests, queue jobs, a slow-route warning and a multiline exception (collapsed to one line with a `⏎ +N lines` marker).

When the stream settles, **click the terminal** and drive it with the footer keys:

- **Space** — pause/resume the live tail;
- **↑/↓, PgUp/PgDn** — select a record (pausing automatically); **Enter** — expand it (the exception shows every stack line, context and extra);
- **l** — cycle the severity threshold; **/** — incremental text search; **1–3** — toggle the `Server`/`Router`/`Queue` channels;
- **q** or **Esc** — quit.

<d-block-terminal engine="bootgly-cli" title="Logs — Monitor-mode viewer" command="demo 25" height="420">
`Logs` fed with newline-delimited JSON records via `feed()`, rendered as a full-screen TUI (status bar, filtered log pane, keybindings footer) and driven by `control()` — the same viewer the Monitor mode uses to tail worker logs.
</d-block-terminal>

Use the source button on the terminal to read the exact PHP file being executed. The component is documented in the [Logs overview](/manual/CLI/UI/Components/Logs/overview).
