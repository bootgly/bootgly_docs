# Prompt Component

The `Prompt` component fixes an input line at the bottom of the terminal while content scrolls above it — like Claude Code, Codex or OpenCode. By default the content area is a buffered [Scrollarea](/manual/CLI/UI/Components/Scrollarea/overview) band: the mouse wheel and `PgUp`/`PgDn` scroll it, the right-edge scrollbar accepts hover, click and drag, and **`Ctrl+T` toggles the selection mode** — it releases the mouse so native text selection and copying work, and resumes it on the next toggle. Alternatively, `buffered = false` switches to the native flow: content joins the terminal scrollback and everything mouse-related stays native, with no internal scrollbar. `prompting()` yields each submitted line, with `↑`/`↓` history recall and `Alt+Enter` multiline input. On non-interactive input (pipes, CI) it degrades to a plain stdin line loop — the consumer code stays identical.

A live demo is available in the [showcase](/manual/CLI/UX/Prompt/showcase).

## Instance

To use the component, it is necessary to create an instance passing as parameters the instances of the `Input` and `Output` components:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Prompt;

$Terminal = CLI->Terminal;

$Prompt = new Prompt($Terminal->Input, $Terminal->Output);
$Prompt->prompt = '>_ ';
```

## Prompting in a loop

Drive `prompting()` with a `foreach` — each iteration is one submitted line. Use `feed()` for every app output so it enters the content band above the fixed input (call `start()` first when feeding before the loop — the band owns the content area):

```php
$Prompt->start();
$Prompt->feed('Welcome — type lines; `exit` quits.');

foreach ($Prompt->prompting() as $line) {
   if (trim($line) === 'exit') {
      break;
   }

   $Prompt->feed("echo: {$line}");
}

$Prompt->finish();
```

`Ctrl+D` or EOF end the loop immediately. `Ctrl+C` asks for confirmation: the first press shows a notice on the bottom border — press `Ctrl+C` again within 2 seconds to end; otherwise the notice expires (any other key also dismisses it) and the editing continues. The notice text is the `interruption` config. Always let `finish()` run (it also runs on destruct) — it resets the scroll region; a leaked region breaks the terminal.

## Borders and fixed texts

The input row is framed by border lines above and below it, with four fixed text slots — left and right, above the top border and below the bottom border. The texts accept Template markup and can be updated at any time (the next repaint reflects them):

```php
$Prompt->top = ['left' => '@#Cyan:Bootgly REPL@;', 'right' => '@#Black:v0.20@;'];
$Prompt->bottom = ['left' => '@#Black:? for help@;', 'right' => '@#Black:0 lines@;'];
$Prompt->border = '─';
```

```text
[content scrolls here...]
Bootgly REPL                                v0.20
─────────────────────────────────────────────────
>_ type here█
─────────────────────────────────────────────────
? for help                                0 lines
```

Empty `top`/`bottom` slots skip their text line — the frame shrinks and the content region grows.

## Scrolling the content

**Buffered band (default).** The content area is a [Scrollarea](/manual/CLI/UI/Components/Scrollarea/overview) band (1000 visual rows by default; long lines wrap): `PgUp`/`PgDn` page it, the **mouse wheel** scrolls three rows per notch and the right-edge scrollbar is interactive — the thumb highlights on hover and can be clicked and dragged (a track click jumps the view). While scrolled up, new feeds hold the position; submitting a line (or reaching the last row) sticks the view back to the bottom. The input frame never moves.

**Selection mode (`Ctrl+T`).** Mouse reporting is global by terminal design — while it is on, native text selection pauses. `Ctrl+T` toggles the selection mode: the mouse is released (a notice shows on the bottom border), so selecting and copying work natively — move, click and drag freely; typing keeps working and `PgUp`/`PgDn` still scroll the band. `Ctrl+T` again resumes the mouse (wheel + scrollbar). `Shift` also bypasses the reporting at any time; set `$Prompt->mouse = false;` to keep the mouse fully native for the whole session.

**Native flow (`$Prompt->buffered = false;`).** Fed content joins the terminal's own flow while the input frame stays bottom-fixed: each feed clears the frame (its rows never pollute the scrollback), writes the content above it and scrolls the screen through its last row — the only path into the real scrollback — then repaints the frame at the bottom. Everything mouse-related stays native (no mouse reporting, no internal scrollbar) — Claude Code-style.

## History and multiline

`↑`/`↓` walk the submitted-lines history (the current draft is preserved and comes back with `↓`). `Alt+Enter` accumulates the current line and clears the input — Enter then submits all accumulated lines joined by `\n`; a dim `…+N` hint marks pending lines.

## Non-interactive input

On pipes and CI there is no region and no history: `prompting()` yields stdin lines until EOF and `feed()` writes plainly — deterministic, no escape noise.

## Reference

### Properties

```php
public string $prompt
```

Config. The input line prefix. Default: `'>_ '`.

```php
public int $history
```

Config. Max history entries (a bounded ring). Default: `100`.

```php
public string $border
```

Config. The border line character rendered above and below the input row. Default: `'─'`.

```php
public array $top
```

Config. Fixed texts above the top border — `['left' => ..., 'right' => ...]` (Template markup supported; both empty skips the line). Default: both empty.

```php
public array $bottom
```

Config. Fixed texts below the bottom border — same shape as `top`. Default: both empty.

```php
public string $interruption
```

Config. The notice shown on the bottom border after the first `Ctrl+C` — a second press within 2 seconds ends the loop; otherwise the notice expires. Default: `'Press Ctrl+C again to exit'`.

```php
public bool $buffered
```

Config. Buffered content band (internal scrollbar + mouse reporting; `Ctrl+T` toggles the selection mode). `false` switches to the native flow: content joins the terminal scrollback — wheel scrolling, text selection and copying stay fully native. Default: `true`.

```php
public bool $mouse
```

Config (band mode). Mouse support — the wheel scrolls the band; the scrollbar accepts hover, click and drag. Native text selection pauses while the reporting is on (`Ctrl+T` toggles it; `Shift` bypasses it). Default: `true`.

```php
public string $selection
```

Config (band mode). The notice shown on the bottom border while the selection mode is on. Default: `'Selection mode · Ctrl+T resumes the mouse'`.

```php
public private(set) Line $Line
```

Data. The line editor engine backing the input row.

```php
public private(set) Scrollarea $Scrollarea
```

Data. The buffered content band above the frame — its `capacity` and `scrollbar` configs are reachable here.

```php
public private(set) array $entries
```

Data (read-only). The history entries, oldest first.

```php
public private(set) bool $finished
```

Metadata (read-only). `true` after `finish()`.

### start()

```php
public function start (): void
```

Enters raw input mode and draws the input frame (band mode also clips the content scroll region and arms the mouse reporting). Invoked automatically by `prompting()`.

### feed()

```php
public function feed (string $content): void
```

Feeds app content above the bottom-fixed input frame (plain write on non-interactive output). Native flow: the content scrolls into the terminal scrollback while the frame stays fixed. Band mode: the content buffers into the Scrollarea — while scrolled up, the position holds. Template markup is supported.

### prompting()

```php
public function prompting (): Generator
```

Yields each submitted line until a double `Ctrl+C`, `Ctrl+D` or EOF. Non-interactive input yields stdin lines until EOF.

### finish()

```php
public function finish (): void
```

Resets the scroll region (full screen), restores the input settings and shows the cursor. Idempotent — also invoked by the destructor.
