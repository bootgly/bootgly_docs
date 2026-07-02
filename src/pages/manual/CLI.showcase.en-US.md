# Live CLI Showcase

The terminal below runs the **real Bootgly CLI** — the framework's actual demo files, executed by PHP 8.4 compiled to WebAssembly, entirely in your browser. No server is involved: the first run downloads the PHP runtime and a bundle of the framework source, then `bootgly demo N` boots exactly like it does in a native terminal.

<d-block-terminal
  engine="bootgly-cli"
  title="Bootgly CLI — live demos"
  commands="Alert:demo 12|Fieldset:demo 22|Table:demo 21|Progress:demo 19|Progress (indeterminate):demo 20|Writing:demo 2|Text coloring:demo 6|Text styling:demo 7|Cursor positioning:demo 3"
  height="420"
>
Pick a demo and press Run — the output you see is produced by the same components documented in this manual. Use the source button to read the demo's PHP file.
</d-block-terminal>

## What you are seeing

Each command maps to a real file under [`projects/Demo/CLI/`](https://github.com/bootgly/bootgly/tree/main/projects/Demo/CLI) in the framework repository:

- **Alert, Fieldset, Table** — output components rendering ANSI-styled boxes, labels and aligned columns.
- **Progress** — the animated progress bar: hearts fill up while elapsed time, ETA and rate tick in real time.
- **Writing** — paced, typewriter-style output via `Output->writing()`.
- **Text coloring / styling** — the `Text` escape helpers for foreground/background colors and font styles.
- **Cursor positioning** — cursor movements orchestrating dynamic layouts.

Component deep-dives live in the per-component pages under **CLI → UI** and **CLI → Terminal**, several of which embed their own live terminals.
