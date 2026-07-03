# Terminal

The `Terminal` class is the hub of everything that happens on the screen in a Bootgly CLI session. It resolves the terminal dimensions at boot, exposes the three I/O entry points — `Input`, `Output` and Mouse `Reporting` — and offers screen-level operations like `clear()`.

You never instantiate it yourself: the `CLI` class creates one `Terminal` during autoboot.

## Instance

```php
use const Bootgly\CLI;

$Terminal = CLI->Terminal;

$Input  = $Terminal->Input;   // keyboard / stdin
$Output = $Terminal->Output;  // screen / stdout
$Mouse  = $Terminal->Mouse;   // mouse reporting
```

Each part has its own manual page: [Input](/manual/CLI/Terminal/Input/overview), [Output](/manual/CLI/Terminal/Output/overview) and [Reporting](/manual/CLI/Terminal/Reporting/overview).

## Terminal size

When the `Terminal` is constructed it resolves the screen dimensions once and stores them in static properties:

```php
use Bootgly\CLI\Terminal;

Terminal::$columns; // e.g. 80
Terminal::$lines;   // e.g. 30

Terminal::$width;   // alias of $columns
Terminal::$height;  // alias of $lines
```

The resolution order for each dimension is:

1. the `COLUMNS` / `LINES` environment variables, when numeric (the ncurses convention);
2. `tput cols` / `tput lines`, when the `exec` function is available;
3. the defaults `80` columns × `30` lines.

This makes the size reliable in every runtime: interactive TTYs get the real size via `tput`, while pipes, CI jobs and embedded runtimes (like the [live showcase](/manual/CLI/showcase) running on PHP WASM) can set the size explicitly:

```bash
COLUMNS=100 LINES=40 bootgly demo 12
```

## Clearing the screen

```php
CLI->Terminal->clear();
```

`clear()` homes the cursor and erases the display — the same thing the `bootgly demo` tour does between chained demos.

## See it live

Every Terminal capability documented in this section runs live in the [CLI showcase](/manual/CLI/showcase) — real framework code executing on PHP 8.4 WebAssembly in your browser.

## Reference

```php
public function clear (): true
```

Writes the cursor-home and erase-in-display escape sequences to the `Output` stream, leaving the cursor at the top-left corner. Always returns `true`.

```php
public function interact (): bool
```

Reads one line from the user with a `>_: ` prompt, keeping a command history (↑/↓) and registering TAB autocompletion against the static `Terminal::$commands` list. Returns `false` when the input stream is closed.
