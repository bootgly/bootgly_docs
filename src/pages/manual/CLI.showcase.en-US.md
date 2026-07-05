# Live CLI Showcase

The terminal below runs the **real Bootgly CLI** — the framework's actual demo files, executed by PHP 8.4 compiled to WebAssembly, entirely in your browser. No server is involved: the first run downloads the PHP runtime and a bundle of the framework source, then `bootgly demo N` boots exactly like it does in a native terminal.

<d-block-terminal
  engine="bootgly-cli"
  title="Bootgly CLI — live demos"
  commands="Client/Server:demo 1|Question:demo 27|Form:demo 28|Menu:demo 13|Alert:demo 12|Fieldset:demo 22|Table:demo 21|Chart:demo 36|Progress:demo 19|Scrollarea:demo 41|Spinner:demo 32|Timer:demo 33|Timeline:demo 34|Text (effects):demo 37|Textarea:demo 39|Prompt:demo 40|Logs:demo 25|Mouse:demo 23|Writing:demo 2|Text:demo 6|Cursor:demo 3|Viewport:demo 24"
  height="420"
>
Pick a demo and press Run — the output you see is produced by the same components documented in this manual. Mouse and Menu demos are **interactive**: click the terminal first; in Menu use the arrow keys to aim, Space to select and Enter to confirm; in Mouse just move, click and scroll — right-click exits. Use the source button to read the demo's PHP file.
</d-block-terminal>

## What you are seeing

Each command maps to a real file under [`projects/Demo/CLI/`](https://github.com/bootgly/bootgly/tree/main/projects/Demo/CLI) in the framework repository. One example per component runs here — every variation lives in that component's own Showcase subpage:

- **Client/Server** — the Terminal Client/Server API (`Input->reading()`): natively it forks two processes joined by a pipe; here each role runs in its own PHP WASM worker and a `MessageChannel` plays the pipe. Click the terminal, type and press Enter — the Client echoes your keys and the Server answers with what you sent. Arrow keys render as emoji, `*` toggles secret mode, `#` toggles hidden mode.
- **Mouse** — real-time Mouse Reporting: the terminal enables SGR tracking and PHP decodes every move, click, drag and scroll with column/row coordinates. Right-click exits.
- **Logs** — the Monitor-mode log viewer: ~20 simulated worker records stream in live, then your keyboard drives it — Space pauses, ↑/↓ select, Enter expands a record, `l` cycles the level, `/` searches, `1-3` toggle channels, `q` quits.
- **Question** — validated line input: the Validator rejects invalid answers with a Failure Alert and re-asks (the masked/secret variation lives in the [Question showcase](/manual/CLI/UI/Components/Question/showcase)).
- **Form** — the sequential multi-field component: Text, Secret, Select and Confirm fields asked one at a time (`↑` + Enter goes back), ending in a summary Fieldset + confirm Menu.
- **Menu** — the interactive selection component: arrows aim, Space toggles, Enter confirms the selection or the aimed option, letters filter — `Ctrl+C` interrupts (divisors, unique selection, horizontal, alignments, viewport + filter and grid variations live in the [Menu showcase](/manual/CLI/UI/Components/Menu/showcase)).
- **Alert, Fieldset, Table** — output components rendering ANSI-styled boxes, labels and aligned columns.
- **Charts** — the ANSI chart family: gradient-colored sparkline, labeled bars and meters (the live braille Graph streams in the [Charts showcase](/manual/CLI/UI/Components/Charts/showcase); Bars is also printed by `bootgly test benchmark`).
- **Progress** — the animated progress bar: hearts fill up while elapsed time, ETA and rate tick in real time (indeterminate and multi-bar grid variations live in the [Progress showcase](/manual/CLI/UI/Components/Progress/showcase)).
- **Text (effects)** — animated text: typewriter, fade-in and the shimmering color wave passing letter by letter.
- **Textarea** — the multiline editor: Enter breaks lines, arrows navigate, Ctrl+D submits (stdin lines until EOF on pipes).
- **Scrollarea** — the buffered content band: 60 fed rows in a 12-row window; `PgUp`/`PgDn` or the mouse wheel scroll it, and the scrollbar accepts hover, click and drag.
- **Prompt** — the bottom-fixed input (mini REPL): the content band buffers `feed()` output above the input frame — wheel/`PgUp`/`PgDn` scroll it (draggable scrollbar), `Ctrl+T` toggles native text selection, `↑`/`↓` recall history, `Alt+Enter` goes multiline.
- **Spinner** — the indeterminate activity indicator: braille frames animate while the work loop drives `spin()`, ending in a resolution line.
- **Timer** — the countdown component: remaining time and percentage tick on the wall clock; the Handler fires once at zero.
- **Timeline** — the multi-step guided flow: steps transition pending → active → done (or failed) with notes, in a connected vertical frame.
- **Writing** — paced, typewriter-style output via `Output->writing()`.
- **Text** — the `Text` escape helpers for colors and font styles (styling and modifying variations live in the [Text showcase](/manual/CLI/Terminal/Output/Text/showcase)).
- **Cursor** — cursor movements orchestrating dynamic layouts (shaping and visualizing variations live in the [Cursor showcase](/manual/CLI/Terminal/Output/Cursor/showcase)).
- **Viewport** — the screen panning down and up via `Viewport->panDown()`/`panUp()`, one scroll escape per step.

Component deep-dives live in the per-component pages under **CLI → UI**, **CLI → UX** and **CLI → Terminal**, several of which embed their own live terminals.
