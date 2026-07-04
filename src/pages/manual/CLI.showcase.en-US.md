# Live CLI Showcase

The terminal below runs the **real Bootgly CLI** — the framework's actual demo files, executed by PHP 8.4 compiled to WebAssembly, entirely in your browser. No server is involved: the first run downloads the PHP runtime and a bundle of the framework source, then `bootgly demo N` boots exactly like it does in a native terminal.

<d-block-terminal
  engine="bootgly-cli"
  title="Bootgly CLI — live demos"
  commands="Client/Server:demo 1|Dialog:demo 26|Question:demo 27|Mouse:demo 23|Logs:demo 25|Menu:demo 13|Menu (divisors):demo 14|Menu (unique):demo 15|Menu (horizontal):demo 16|Menu (centered):demo 17|Menu (right-aligned):demo 18|Alert:demo 12|Fieldset:demo 22|Table:demo 21|Progress:demo 19|Progress (indeterminate):demo 20|Writing:demo 2|Text coloring:demo 6|Text styling:demo 7|Cursor positioning:demo 3|Viewport:demo 24"
  height="420"
>
Pick a demo and press Run — the output you see is produced by the same components documented in this manual. Mouse and Menu demos are **interactive**: click the terminal first; in Menu use the arrow keys to aim, Space to select and Enter to confirm; in Mouse just move, click and scroll — right-click exits. Use the source button to read the demo's PHP file.
</d-block-terminal>

## What you are seeing

Each command maps to a real file under [`projects/Demo/CLI/`](https://github.com/bootgly/bootgly/tree/main/projects/Demo/CLI) in the framework repository:

- **Client/Server** — the Terminal Client/Server API (`Input->reading()`): natively it forks two processes joined by a pipe; here each role runs in its own PHP WASM worker and a `MessageChannel` plays the pipe. Click the terminal, type and press Enter — the Client echoes your keys and the Server answers with what you sent. Arrow keys render as emoji, `*` toggles secret mode, `#` toggles hidden mode.
- **Mouse** — real-time Mouse Reporting: the terminal enables SGR tracking and PHP decodes every move, click, drag and scroll with column/row coordinates. Right-click exits.
- **Logs** — the Monitor-mode log viewer: ~20 simulated worker records stream in live, then your keyboard drives it — Space pauses, ↑/↓ select, Enter expands a record, `l` cycles the level, `/` searches, `1-3` toggle channels, `q` quits.
- **Menu** — the interactive selection component, in six variations (divisors, unique selection, horizontal orientation, centered and right alignment). The terminal forwards your keyboard to PHP: arrows aim, Space toggles, Enter confirms — `Ctrl+C` interrupts.
- **Alert, Fieldset, Table** — output components rendering ANSI-styled boxes, labels and aligned columns.
- **Progress** — the animated progress bar: hearts fill up while elapsed time, ETA and rate tick in real time.
- **Writing** — paced, typewriter-style output via `Output->writing()`.
- **Text coloring / styling** — the `Text` escape helpers for foreground/background colors and font styles.
- **Cursor positioning** — cursor movements orchestrating dynamic layouts.
- **Viewport** — the screen panning down and up via `Viewport->panDown()`/`panUp()`, one scroll escape per step.

Component deep-dives live in the per-component pages under **CLI → UI** and **CLI → Terminal**, several of which embed their own live terminals.
