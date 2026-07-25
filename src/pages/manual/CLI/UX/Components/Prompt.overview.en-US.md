# Prompt Component

The `Prompt` component fixes an input line at the bottom of the terminal while content scrolls above it — like Claude Code, Codex or OpenCode. By default the content area is a buffered [Scrollarea](/manual/CLI/UI/Components/Scrollarea/overview) band: the mouse wheel and `PgUp`/`PgDn` scroll it, the right-edge scrollbar accepts hover, click and drag, and **`Ctrl+T` toggles the selection mode** — it releases the mouse so native text selection and copying work, and resumes it on the next toggle. Alternatively, `buffered = false` switches to the native flow: content joins the terminal scrollback and everything mouse-related stays native, with no internal scrollbar. `prompting()` yields each submitted line, with `↑`/`↓` history recall and `Shift+Enter` multiline input (the frame grows one row per break). On non-interactive input (pipes, CI) it degrades to a plain stdin line loop — the consumer code stays identical.

A live demo is available in the [showcase](/manual/CLI/UX/Components/Prompt/showcase).

## Instance

To use the component, it is necessary to create an instance passing as parameters the instances of the `Input` and `Output` components:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Components\Prompt;

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

**Breaking a line (`Shift+Enter`).** `Shift+Enter` breaks the line at the cursor and is the only line break — Enter always submits. Every break grows the input frame by one row (the content band above gives that row up): broken lines are real rows, stacked under the prompt marker, with the continuation rows indented to align under it. Only the active row carries the cursor cell. Enter then submits every row at once, joined by `\n`:

```text
[content scrolls here...]
─────────────────────────────────────────────────
>_ SELECT id, name
   FROM users
   WHERE active = 1█
─────────────────────────────────────────────────
```

**Editing across rows.** The whole buffer stays editable: `Backspace` at the start of a row merges it into the previous one (the cursor lands at the seam), `Delete` at the end of a row pulls the next row up, `←`/`→` cross the row boundaries and `Home`/`End`/`Ctrl+U`/`Ctrl+K`/`Ctrl+W` act on the current row.

**History (`↑`/`↓`).** `↑`/`↓` walk the input rows first and only reach the submitted-lines history at the edges — `↑` on the first row, `↓` on the last. The current draft is preserved and comes back with `↓`, and recalling a multiline entry restores its rows instead of pasting them into a single line.

**Terminal support.** `Shift+Enter` has no legacy encoding: a plain terminal sends `CR` for Enter and `Shift+Enter` alike, so the modifier never reaches the program. Reporting it takes the extended keyboard protocol, which `start()` negotiates on its own (`$Prompt->Input->extended = true` — the kitty `CSI u` push plus the xterm `modifyOtherKeys` request), so nothing has to be set up. Terminals that implement it include kitty, ghostty, foot and WezTerm (kitty protocol) and xterm (`modifyOtherKeys`); the rest ignore the negotiation and never see the key — there `Shift+Enter` arrives as a plain Enter and submits, so the input stays single-line.

## Non-interactive input

On pipes and CI there is no region and no history: `prompting()` yields stdin lines until EOF and `feed()` writes plainly — deterministic, no escape noise.

## Reference

### Properties

```php
public string $prompt
```

Config. The input line prefix — its width is also the indent of the continuation rows. Default: `'> '`.

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
public private(set) Lines $Lines
```

Data. The multiline input buffer ([Lines](/manual/CLI/Terminal/Input/Lines/overview)) — one [Line](/manual/CLI/Terminal/Input/Line/overview) per row, plus the active row index and a virtual cursor that walks the whole buffer.

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

Enters raw input mode — negotiating the extended keyboard protocol, which is what makes `Shift+Enter` reportable — and draws the input frame (band mode also clips the content scroll region and arms the mouse reporting). Invoked automatically by `prompting()`.

### feed()

```php
public function feed (string $content): void
```

Feeds app content above the bottom-fixed input frame (plain write on non-interactive output). Native flow: the content scrolls into the terminal scrollback while the frame stays fixed. Band mode: the content buffers into the Scrollarea — while scrolled up, the position holds. Template markup is supported.

### prompting()

```php
public function prompting (): Generator
```

Yields each submitted line until a double `Ctrl+C`, `Ctrl+D` or EOF — a multiline input yields as one string, its rows joined by `\n`. Non-interactive input yields stdin lines until EOF.

### finish()

```php
public function finish (): void
```

Resets the scroll region (full screen), restores the input settings and shows the cursor. Idempotent — also invoked by the destructor.
