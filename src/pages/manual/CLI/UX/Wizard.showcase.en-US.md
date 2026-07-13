# Wizard

The official Wizard demo runs live below — real framework code on PHP 8.4 WebAssembly, in your browser. Use the source button on the terminal to read the exact PHP file being executed.

## Declarative multi-step flow

Four steps declared upfront — the timeline stays fixed at the top while each step's component renders below it. Click the terminal and answer: type a project name, pick the interface with `↑`/`↓` + Enter (WPI slots a Port step in right after), then confirm to build — or refuse to watch the flow fail with a red `✖`.

<d-block-terminal engine="bootgly-cli" title="Wizard — live demo" command="demo 48" height="480">
`add()` binds each label to a handler; `run()` repaints a fresh screen per step — past ✔ green, active ◉ cyan, future ○ gray — and mid-run additions insert right after the active step.
</d-block-terminal>

On non-interactive output (pipes, CI) the same code appends one plain line per transition.

The component is documented in the [Wizard overview](/manual/CLI/UX/Wizard/overview).
