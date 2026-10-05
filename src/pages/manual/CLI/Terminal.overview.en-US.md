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

```bash :toolbar="true";
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

Reads one line from the user with a `>_: ` prompt, keeping a command history (↑/↓) and registering TAB autocompletion against the static `Terminal::$commands` list. Returns `false` when the input stream is closed; otherwise it returns what the executed command returns — always `true` on a base Terminal, while a subclass may return `false` for a command that answers asynchronously, so the caller waits for that output before prompting again. It blocks the caller until a line is typed and needs ext-readline; a caller that must keep working while nobody types uses `prompting()`.

```php
public function prompting (Closure $Supervise): Generator
```

Prompts for command lines without blocking the caller while it waits and yields each complete line (`Generator<int,string>`). `$Supervise` runs before every wait for input and returns how long that wait may last in microseconds (`0` polls), or `false` to end the prompt; any signal cuts a wait short. On a terminal the line is edited through readline (TAB completion against `Terminal::$commands`, ↑/↓ recall of the lines passed to `execute()`) and a half-typed line survives every wait; Ctrl-D on an empty line or a hangup ends the prompt. On libedit an unfinished ESC, ^V or ^R holds the wait until the next key; a signal still cuts it short. Without ext-readline a terminal shows the same `>_: ` prompt and is read as plain lines that the terminal itself edits: no recall or TAB completion, and the arrow keys reach the line as escape bytes. Any other stdin (a pipe, a file, `/dev/null`) is read as plain lines without a prompt, and at its end the prompt keeps running `$Supervise` without input. Each yielded line arrives with the prompt disarmed, so the caller runs it with the terminal in its own mode.

```php
public function disarm (): void
```

Removes the readline callback handler `prompting()` installed — a no-op when none is — and rewrites the signal handlers readline replaced while it was armed. Call it before the process exits or re-execs from inside a prompt — an `exit()` from a signal handler dispatched while the prompt runs, or a `pcntl_exec()`, skips the generator's `finally` — or the terminal is left raw.

```php
public private(set) bool $armed
```

Whether the readline callback handler of `prompting()` is installed right now.

```php
public bool $editing
```

Whether `prompting()` edits the line through readline (TAB completion, recall of executed lines): stdin is a terminal and ext-readline is loaded. The server consoles announce autocompletion and history only when it is `true`.
