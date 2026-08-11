# Prompt Component

The `Prompt` component fixes an input line at the bottom of the terminal while content scrolls above it — like Claude Code, Codex or OpenCode. By default the content area is a buffered [Scrollarea](/manual/CLI/UI/Components/Scrollarea/overview) band: the mouse wheel and `PgUp`/`PgDn` scroll it, the right-edge scrollbar accepts hover, click and drag, and **`Ctrl+T` toggles the selection mode** — it releases the mouse so native text selection and copying work, and resumes it on the next toggle. Alternatively, `buffered = false` switches to the native flow: content joins the terminal scrollback and everything mouse-related stays native, with no internal scrollbar. `prompting()` yields each submitted line, with `↑`/`↓` history recall and `Shift+Enter` multiline input (the frame grows one row per break). Any symbol (`/`, `@`, `!`, …) can open a context menu over the input — completions with descriptions, argument hints, per-trigger frame styling and absorbed modes — and `pick()` opens a bottom sheet over the whole footer, Claude Code-style. The frame also re-anchors itself on terminal resizes. On non-interactive input (pipes, CI) it degrades to a plain stdin line loop — the consumer code stays identical.

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

## Trigger menus

Any symbol becomes a context-menu trigger. Register it in `triggers`: the key is the symbol, the value is either a static option set or a `Closure` receiving the typed query (the token without the symbol) and returning options. Static options come in three shapes — a bare command, `'value' => 'label'` (insert the key, show the label) or the structured `'command' => ['skeleton' => …, 'description' => …]`:

```php
$Prompt->triggers = [
   '/' => [
      '/help' => ['description' => 'List the available commands'],
      '/time' => ['skeleton' => '[timezone]', 'description' => 'Tell the current time'],
      '/echo' => ['skeleton' => '<text>', 'description' => 'Echo the text back'],
      '/exit' => ['description' => 'Quit the REPL'],
   ],
   '@' => static function (string $query): array {
      $files = ['@README.md', '@composer.json', '@bootgly.php'];

      return array_values(array_filter(
         $files,
         static fn (string $file): bool => str_contains($file, $query)
      ));
   }
];
```

When the token under the cursor starts with a registered symbol, a full-width panel opens flush over the input frame — a [Listbox](/manual/CLI/UI/Base/Listbox/overview) inside a [Flyout](/manual/CLI/UI/Base/Flyout/overview) box — filtering static options by prefix (a Closure filters by itself) and lighting the typed token up inside each match. One rule covers both worlds: `/command` works at the input start and `@mention` works mid-sentence.

```text
┌──────────────────────────────────────────────────┐
│ ❯ /help          List the available commands     │
│   /history       Count the submitted lines       │
└──────────────────────────────────────────────────┘
──────────────────────────────────────────────────
❯ /h█
──────────────────────────────────────────────────
```

While the menu is open, `↑`/`↓` aim (circularly — the top wraps to the bottom), `Tab` completes the token to the aimed option, `Esc` closes it (it stays closed until the token changes) and `Enter` completes the aim and submits it in one stroke — `Esc` first to submit the text exactly as typed.

**Pointer.** With the mouse on (band mode), the menu is fully pointer-navigable: moving over an option aims it, a left click selects it (as `Tab` does — the argument hint rises on the resolved command), the wheel browses the list while the pointer is over the panel (and keeps scrolling the content band elsewhere), and the menu's right-edge scrollbar accepts hover, click and drag — a track press jumps the window, dragging the thumb slides it.

**Parts.** `listing` picks what rides beside each command while the menu lists options, and `resolution` what shows once a single option remains — any of `'skeleton'` and `'description'`. Defaults: descriptions while listing; skeleton + description when resolved.

**Argument hints.** After `Tab` resolves a command, its `resolution` parts stay up while the arguments are typed — `/time █` keeps `/time [timezone]` in view. The hint yields to any menu the cursor token opens and closes on submit.

## Trigger styling, modes and breaks

**Styling (`styles`).** An active trigger can recolor the input frame and swap the marker — the visual cue that a different kind of line is being composed:

```php
$Prompt->styles = [
   '/' => ['border' => '@#Cyan:', 'prompt' => '❯ '],
   '!' => ['border' => '@#Red:', 'prompt' => '! ']
];
```

**Modes (`modes`).** A symbol listed in `modes` is *absorbed* when typed into an empty input: it lives in the marker instead of the buffer — like a raw bash `!` mode. `Backspace` on the empty input releases it (as if the invisible leading symbol were erased) and `Enter` rejoins the symbol into the submitted line, so the consumer still receives `!ls`. Symbols outside `modes` stay literal in the text — an `@` mention keeps composing a longer prompt:

```php
$Prompt->modes = ['!'];
```

**Line breaking (`breaks`).** A trigger can lock the input to a single line — `false` suppresses `Shift+Enter` while the symbol is active. Slash commands are one-liners; a bash mode keeps the breaks (a trailing `\` continues the line there):

```php
$Prompt->breaks = ['/' => false];
```

## Shortcut slots

`shortcuts` paints key → action hint slots below the input, taking the `bottom['left']` slot over — the key highlighted by `tint`, the action dim:

```php
$Prompt->shortcuts = [
   'Enter' => 'send',
   'Shift+Enter' => 'break',
   'Tab' => 'complete',
   'Esc' => 'close'
];
```

```text
──────────────────────────────────────────────────
Enter:send  Shift+Enter:break  Tab:complete  Esc:close
```

## Bottom sheet

`pick()` opens a bottom sheet: the [Flyout](/manual/CLI/UI/Base/Flyout/overview) anchored to the terminal footer, **replacing the whole input frame** (input, borders and shortcuts stay covered) while a Listbox browses options inside it — with the dim hint riding on the very last row, Claude Code-style. Options take the trigger shape, so a trigger's own commands browse directly. Call it between `prompting()` yields — a `/help` handler, typically:

```php
foreach ($Prompt->prompting() as $line) {
   if (trim($line) === '/help') {
      $picked = $Prompt->pick(
         $Prompt->triggers['/'],
         title: '@#Cyan:Commands@;',
         hint: '↑/↓ aim · Enter picks into the input · Esc cancels'
      );

      if ($picked !== null) {
         $Prompt->Lines->load($picked); // prefill the input with the pick
      }

      continue;
   }
}
```

```text
┌ Commands ────────────────────────────────────────┐
│ ❯ /help          List the available commands     │
│   /time [timezone]  Tell the current time        │
│   /exit          Quit the REPL                   │
└──────────────────────────────────────────────────┘
 ↑/↓ aim · Enter picks into the input · Esc cancels
```

`↑`/`↓` aim, `Enter` returns the aimed option's value and `Esc` (or `Ctrl+C`/`Ctrl+D`) cancels with `null`. The input frame repaints itself in place when the sheet closes. Prefilling via `Lines->load()` is the sweet spot: the trigger machinery reopens the argument hint on the loaded command by itself. On non-interactive input the sheet never opens — `pick()` returns `null`.

## Terminal resizes

The prompt watches `SIGWINCH`: resizing the terminal re-measures the screen, wipes it and re-anchors everything — the content band refits, the frame repaints at the new bottom and any open menu or sheet recomposes at the new width and height. Without that, terminal emulators reflow the painted rows on their own and tear any bottom-fixed layout. The watcher arms in `start()` and restores the default handler in `finish()`; signal delivery rides `pcntl` (async signals), so environments without it simply keep the boot-time size.

## Non-interactive input

On pipes and CI there is no region and no history: `prompting()` yields stdin lines until EOF and `feed()` writes plainly — deterministic, no escape noise. Trigger menus never interfere and `pick()` returns `null`.

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
public array $triggers
```

Config. Context-menu triggers — the key is the symbol (`'/'`, `'@'`, `'#'`, …), the value is a static option set (bare commands, `'value' => 'label'` pairs or `'command' => ['skeleton' => …, 'description' => …]`) or a `Closure (string $query): array` receiving the typed query without the symbol. Commands are full tokens including the symbol. Default: `[]` (menus disabled).

```php
public array $listing
```

Config. Parts shown beside each command while the menu lists options — any of `'skeleton'`, `'description'`. Default: `['description']`.

```php
public array $resolution
```

Config. Parts shown once a single option remains (command resolved) and while its arguments are typed. Default: `['skeleton', 'description']`.

```php
public array $styles
```

Config. Per-trigger frame styling — `symbol => ['border' => markup, 'prompt' => marker]`: while a symbol's menu or hint is up, `border` recolors the frame lines and paints the marker, and `prompt` replaces the marker text. Default: `[]`.

```php
public array $modes
```

Config. Trigger symbols absorbed as mode prefixes — typed into an empty input, the symbol lives in the marker instead of the buffer; `Backspace` on the empty input releases it and Enter rejoins it into the submitted line. Default: `[]` (symbols stay literal).

```php
public array $breaks
```

Config. Per-trigger line breaking — `symbol => bool`; `false` locks the input to a single line while the symbol is active (`Shift+Enter` is ignored). Absent symbols keep the breaks. Default: `[]`.

```php
public array $shortcuts
```

Config. Shortcut hint slots below the input — `key => action`; they take the `bottom['left']` slot over when set. Default: `[]`.

```php
public string $tint
```

Config. The shortcut-key paint (markup token) — the action stays dim. Default: `'@#White:'`.

```php
public private(set) Lines $Lines
```

Data. The multiline input buffer ([Lines](/manual/CLI/Terminal/Input/Lines/overview)) — one [Line](/manual/CLI/Terminal/Input/Line/overview) per row, plus the active row index and a virtual cursor that walks the whole buffer.

```php
public private(set) Scrollarea $Scrollarea
```

Data. The buffered content band above the frame — its `capacity` and `scrollbar` configs are reachable here (`clear()` empties it — the hook a `/clear` command wants).

```php
public private(set) Flyout $Flyout
```

Data. The [Flyout](/manual/CLI/UI/Base/Flyout/overview) boxing the trigger menus and the bottom sheet — bordered, full-width, dim background by default; restyle it here.

```php
public private(set) Listbox $Listbox
```

Data. The [Listbox](/manual/CLI/UI/Base/Listbox/overview) inside the trigger menus — viewport of 5, cyan tint, scrollbar and circular navigation by default; its `blink`, `viewport` and paints are reachable here. The bottom sheet browses a clone of it, so the visual config carries over.

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

Feeds app content above the bottom-fixed input frame (plain write on non-interactive output). Native flow: the content scrolls into the terminal scrollback while the frame stays fixed. Band mode: the content buffers into the Scrollarea — while scrolled up, the position holds. Template markup is supported. Foreign escape sequences are sanitized: colors (SGR) pass, cursor and erase controls drop — a fed `clear` output cannot wipe the band behind the buffer's back.

### prompting()

```php
public function prompting (): Generator
```

Yields each submitted line until a double `Ctrl+C`, `Ctrl+D` or EOF — a multiline input yields as one string, its rows joined by `\n`. Non-interactive input yields stdin lines until EOF.

### pick()

```php
public function pick (array $options, null|string $title = null, null|string $hint = 'Enter selects · Esc cancels'): null|string
```

Opens the bottom sheet — the full-width Flyout anchored to the terminal footer, replacing the whole input frame while a Listbox browses the options (`↑`/`↓` aim, Enter selects, Esc cancels — the dim `hint` rides on the very last row; `null` hides it). Options take the trigger shape, so `pick($Prompt->triggers['/'])` browses a trigger's own commands. Call it between `prompting()` yields; the input frame repaints itself on close. Returns the selected value — `null` on cancel or non-interactive input.

### finish()

```php
public function finish (): void
```

Resets the scroll region (full screen), restores the input settings and shows the cursor. Idempotent — also invoked by the destructor.
