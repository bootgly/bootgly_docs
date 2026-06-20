# Logs Component

The `Logs` component is a full-screen, real-time log **viewer** for the terminal. It buffers
structured `Record`s, applies live filters (severity, channel, text), and renders a status bar,
a tailing log pane and a keybindings footer — the dashboard you see when an `HTTP_Server_CLI`
runs in **Monitor** mode.

It is not a logger: it never produces records, it consumes them. Records arrive as
newline-delimited JSON (one per line) — typically drained from the IPC pipe that the master and
its workers write to via `ACI\Logs\Handlers\Pipe`.

## Watch logs from a running server

The component is driven by `TCP_Server_CLI::monitoring()` (inherited by `HTTP_Server_CLI`), so the
common path is simply starting a server in Monitor mode — no manual wiring:

```bash
bootgly project Demo-HTTP_Server_CLI start -m
```

The server enters the alternate screen, points every `Logger` at the Monitor pipe, and feeds the
viewer in a non-blocking loop. You get a live, filterable dashboard until you press `q`/`Esc`.

## Drive it yourself

If you build your own monitoring loop, the cycle is: feed bytes, read a key, render a frame.

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Logs;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

$Viewer = new Logs($Input, $Output, max: 5000);

// In a non-blocking loop:
$Viewer->feed($chunk);            // newline-delimited JSON drained from the log pipe
$running = $Viewer->control($key); // a raw keystroke (returns false on quit)
$Viewer->render();                 // draw one full frame
```

`feed()` carries over an incomplete trailing line between calls, so partial pipe reads are safe.
`control()` returns `false` only when the user quits (`q`, or `Esc` while live) — your loop owns
the alternate-screen enter/leave and terminal restore.

## Filter and navigate

`control()` maps the keys below. The same keys are surfaced in the footer the component renders:

| Key | Action |
|---|---|
| `l` | cycle the **severity threshold** (Debug → … → Emergency) |
| `1`–`9` | toggle a **channel** on/off (numbered in the status bar) |
| `/` | **search** — type to filter messages, `Enter`/`Esc` to keep it |
| `space` | **pause** — freezes a snapshot; new logs keep buffering, the view stays put |
| `↑`/`↓`, `PgUp`/`PgDn` | **select** a record (pauses to navigate the frozen snapshot) |
| `Enter` | **expand** the selected record — full detail (every line, `context`, `extra`) |
| `Home`/`End` | jump to the oldest / back to the live tail |
| `q` / `Esc` | leave the viewer |

Multiline messages — exceptions, stack traces — are **collapsed to a single line** with a `⏎N`
marker so a trace never floods the pane. Select the record and press `Enter` to read the whole
thing in a scrollable detail view.

While **paused**, rendering uses a frozen snapshot of the buffer (`$paused` true), so the screen
does not move as new records stream in. `End` (or `space`) resumes the live tail.

## Reference

```php
public function __construct (Input &$Input, Output &$Output, int $max = 5000)
```

Build a viewer bound to a terminal `Input`/`Output`. `$max` is the ring-buffer capacity in
records (oldest dropped past the cap). The loop is expected to configure `Input` for non-blocking
raw reads.

```php
public function feed (string $chunk): void
```

Append raw pipe bytes (newline-delimited JSON records). Complete lines are decoded via
`Record::import()` and buffered; an incomplete trailing fragment is carried to the next call.

```php
public function control (string $key): bool
```

Handle one keystroke — mutates filter, selection, search and detail state. Returns `false` to
quit the viewer, `true` to keep running.

```php
public function render (): void
```

Draw one full frame: the expanded detail view when a record is selected, otherwise the status bar
+ windowed log pane + footer. Uses cursor-home + per-line clear-to-EOL to avoid flicker.

### State (public)

- `$Records` — the live ring buffer (`array<int,Record>`).
- `$level` — current severity threshold (`Levels`, default `Levels::Debug` = show all).
- `$channels` — `channel => bool` visibility map (absent channel = visible).
- `$search` — active message substring (case-insensitive).
- `$paused`, `$searching` — current sub-mode flags.
- `$cursor` — selected record index in the visible list while paused.
- `$Detail` — the expanded `Record` (detail view), or `null` in list mode (read-only).

### Layering

`Logs` lives in `CLI/UI/Components` and consumes `ACI\Logs\{Record, Data\Levels}` plus
`CLI\Terminal` for sizing/keys — it depends downward only. The transport (`ACI\Logs\Handlers\Pipe`)
and the monitoring loop (`WPI`) sit on opposite sides of it and never reach back in.
