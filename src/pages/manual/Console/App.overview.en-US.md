# Console App

`Console\App` is the TUI application shell: it owns the terminal lifecycle — alternate screen, raw input, resize tracking, restore-on-exit — and runs a non-blocking loop that reads one keystroke per frame, dispatches it to the keymaps and renders the current screen at a throttled frame rate (`$FPS`).

A frame is composed of a single content pane (the current **Screen** view or an active overlay), **Toast** rows overlaid on top and the **Statusbar** on the last row.

## A minimal app

The project's `boot` closure builds and runs the App:

```php
use Bootgly\API\Projects\Project;

use Console\App;


return new Project(
   name: 'Hello',
   exportable: true,
   boot: function (array $arguments = [], array $options = []): void
   {
      $App = new App;

      $App->Screens->load(__DIR__ . '/screens');
      $App->Statusbar->left = ['Hello'];
      $App->Keymaps->bind('l', 'Logs', function () use ($App): void {
         $App->Screens->switch('Logs');
      });

      $App->boot();
      $App->run('Dashboard');
   }
);
```

## Screens

Screens are **view Closures** navigated by name. A screens directory has a manifest plus one file per screen:

```php
// screens/screens.index.php
return [
   'Dashboard',
   'Logs'
];
```

```php
// screens/Dashboard.php
use Console\App;
use Console\App\Screens\Screen;

return static function (App $App, Screen $Screen): string {
   return "Dashboard — press ? for help, Ctrl+P for the palette";
};
```

The view returns the frame content as a string (lines separated by `\n`); the App cuts every line to the terminal width and keeps the lines that fit above the status bar. Navigate with `switch()` (replace), `push()` (overlay, modal-style) and `pop()` (back) — popping the last screen ends `run()`:

```php
$App->Screens->switch('Logs', state: ['filter' => 'error']);
```

A screen can also be routed inline, without a file, through the `Router` behind `$App->Screens` — an inline route wins over a manifest entry of the same name:

```php
use Console\App;
use Console\App\Screens\Screen;

$App->Screens->Router->route('About', fn (App $App, Screen $Screen): string => 'Bootgly Console');
```

Each `switch()` and `push()` builds a **new** `Screen` — empty `$Keymaps`, the given `$state` — while `pop()` returns to the screen below as it was left. Bind a screen's own keys from its view, once per visit; they are checked before the global ones:

```php
// screens/Logs.php
use Console\App;
use Console\App\Screens\Screen;

return static function (App $App, Screen $Screen): string {
   // ! Screen keymaps: bound once per visit
   if ($Screen->Keymaps->list() === []) {
      $Screen->Keymaps->bind('e', 'Errors only', function () use ($Screen): void {
         $Screen->state['filter'] = 'error';
      });
   }

   $filter = $Screen->state['filter'] ?? 'all';

   return "Logs — filter: $filter";
};
```

## Keymaps

Bindings map a key — or a chord (a key sequence like `g g`) — to a labeled handler:

```php
use Bootgly\CLI\Terminal\Input\Keystrokes;

$App->Keymaps->bind('q', 'Quit', fn () => $App->quit());
$App->Keymaps->bind(Keystrokes::CTRL_P, 'Command palette', fn () => $App->Palette->toggle());
$App->Keymaps->bind(['g', 'g'], 'Go to top', fn () => $App->Toasts->add('Top!'));
```

`boot()` installs three default bindings: `Ctrl+P` (palette), `?` (help overlay, generated from the keymaps) and `q` (quit). Binding the same keys again replaces the earlier binding, so these defaults replace a `Ctrl+P`, `?` or `q` you bound before `boot()` — bind after it to override them.

The help overlay and the palette show each binding's keys as bound: a `Keystrokes` case by its name (`CTRL_P` → `Ctrl+P`, `PAGEDOWN` → `Pagedown`), a plain string as is, a chord joined by spaces (`g g`). A chord waits `$timeout` (800 ms) for its next key; a key that breaks it is tried again as a fresh sequence.

## Chrome widgets

The status row and the toast stack ARE the core components — the App composes the [Statusbar Atom](/manual/CLI/UI/Atoms/Statusbar) on the last row and merges the [Toasts](/manual/CLI/UX/Components/Toasts) stack through its `overlay()` seam (bordered boxes, screen positions, `Alert\Type` severity):

```php
use Bootgly\CLI\UI\Components\Alert\Type;

$App->Statusbar->left = ['Snake', 'Score: 3'];
$App->Statusbar->right = ['[?] help'];

$App->Toasts->add('Saved!');                   // default type, expires in 3s
$App->Toasts->add('Disk full', Type::Failure); // Success | Attention | Failure
```

The **Palette** (`Ctrl+P`) searches the labels of the **global** keymaps (`$App->Keymaps`) as you type — a case-insensitive substring match: `↑`/`↓` to select, `Enter` to run, `Esc` to dismiss; the query edits like a shell line (`←`/`→`, `Home`/`End`, `Backspace`/`Delete`, `Ctrl+U`/`Ctrl+K`/`Ctrl+W`). Screen keymaps never show up there — the `?` help overlay lists them, under the screen name, above the global ones.

## A log pane with Tail

`Console\App\Tail` is the core [Logs](/manual/CLI/UI/Components/Logs) pager — level, channel and text filters, pause and scroll, detail view — bound to a pull source: `follow()` takes a `function (): string|false` that returns the next chunk of newline-delimited JSON records (the lines the File log handler writes; `false` or `''` means drained for now), and `pull()` drains it into the pager.

The App has no slot for it. `render()` returns nothing — it writes a whole frame to the Tail's own `Output` — and the App never hands it a key. To show it on a screen, give it an in-memory `Output`, render it from the view and return what it wrote; to drive it, bind the keys you want on that screen and pass them to `control()`:

```php
use Bootgly\CLI\Terminal;
use Bootgly\CLI\Terminal\Input\Keystrokes;
use Bootgly\CLI\Terminal\Output;
use Console\App;
use Console\App\Screens\Screen;
use Console\App\Tail;

$Log = fopen(__DIR__ . '/app.log', 'r'); // JSON lines, as the File log handler writes them

$Tail = new Tail($App->Input, new Output('php://memory'));
$Tail->follow(fn (): string|false => fread($Log, 65536));

$App->Screens->Router->route('Logs', function (App $App, Screen $Screen) use ($Tail): string {
   // ! The keys this screen passes to the pager (bound once per visit)
   if ($Screen->Keymaps->list() === []) {
      $Screen->Keymaps->bind(Keystrokes::SPACE, 'Pause / resume', fn () => $Tail->control(Keystrokes::SPACE->value));
      $Screen->Keymaps->bind('l', 'Cycle level', fn () => $Tail->control('l'));
      $Screen->Keymaps->bind(Keystrokes::UP, 'Previous record', fn () => $Tail->control(Keystrokes::UP->value));
      $Screen->Keymaps->bind(Keystrokes::DOWN, 'Next record', fn () => $Tail->control(Keystrokes::DOWN->value));
   }

   // @ Render into memory and hand the frame to the App
   $Tail->rows = Terminal::$height - 1; // the App keeps the last row for its status bar
   $Tail->pull();
   $Tail->render();

   $Stream = $Tail->Output->stream;
   $frame = (string) stream_get_contents($Stream, null, 0);
   ftruncate($Stream, 0);
   rewind($Stream);

   return $frame;
});
```

Keep `$row` at 1 — the App places the content itself. Only the keys you forward reach the pager, although its footer lists all of them. `control()` returns `false` for the pager's own quit keys (`q`, and `Esc` while live): leave those to the App, whose global `q` already quits.

The core `Bootgly\CLI\UX\Components\Tail` is a different component: a full-screen follower with its own loop — the one behind [`bootgly logs -f`](/guide/logs/overview/) — that never runs inside an App.

## Core widgets as screen content

Any non-interactive core widget renders straight into a view — `RETURN_OUTPUT` hands the string to the frame. Help screens in [Markdown](/manual/CLI/UI/Components/Markdown), state dumps with the [Dumper](/manual/CLI/UI/Atoms/Dumper), banners with [Figlet](/manual/CLI/UI/Atoms/Figlet), code views with the [Highlighter](/manual/CLI/UI/Atoms/Highlighter), tables and charts — no glue needed:

```php
// screens/State.php
use const Bootgly\CLI;
use Bootgly\API\Component;
use Bootgly\CLI\UI\Atoms\Dumper;
use Console\App;
use Console\App\Screens\Screen;

return static function (App $App, Screen $Screen): string {
   $Dumper = new Dumper(CLI->Terminal->Output);
   $Dumper->value = $Screen->state;

   return "App state:\n" . (string) $Dumper->render(Component::RETURN_OUTPUT);
};
```

> [!NOTE]
> `Table` is the one widget that does not honour `RETURN_OUTPUT` yet — it always writes. Render tabular data through the `Markdown` widget (a Markdown table) instead, as the Cookbook's [Monitor](/cookbook/console/monitor/overview/) does.

The one rule: widgets that run their **own read loop** (Select, Form, Textbox) never render inside a view — the App loop already owns stdin. Screens render strings; actions live in keymaps.

## Testing an App without a terminal

A test builds the App and never calls `boot()` or `run()`: no terminal is taken and no loop starts. Load the screens, switch to one, call its view for the frame and press keys through its keymaps — here a [Bootgly test](/testing/about/testing/overview/) of the `Logs` screen above, in `tests/<suite>/` of the project:

```php
<?php

use Bootgly\ACI\Tests\Suite\Test;
use Console\App;


return new Test(
   description: 'Logs filters the errors on e',
   test: function () {
      $App = new App;
      $App->Screens->load(__DIR__ . '/../../screens');

      $Screen = $App->Screens->switch('Logs');
      $frame = ($Screen->View)($App, $Screen); // the first call binds the screen keys
      yield assert(assertion: str_contains($frame, 'filter: all'), description: 'starts unfiltered');

      $Screen->Keymaps->handle('e');
      $frame = ($Screen->View)($App, $Screen);
      yield assert(assertion: str_contains($frame, 'filter: error'), description: 'e filters the errors');
   }
);
```

`$App->Keymaps->handle()` drives the global bindings the same way. To check a whole frame — status bar included — build the App over in-memory streams and read back what `render()` wrote:

```php
use Bootgly\CLI\Terminal\Input;
use Bootgly\CLI\Terminal\Output;
use Console\App;

$App = new App(new Input(fopen('php://memory', 'r+')), new Output('php://memory'));
$App->Screens->load(__DIR__ . '/../../screens');
$App->Screens->switch('Dashboard');
$App->render();

$frame = (string) stream_get_contents($App->Output->stream, null, 0);
```

## Behavior notes

- **Headless runs**: interactivity comes from `BOOTGLY_TTY` — true when STDIN is a terminal; `BOOTGLY_TTY=0` forces a headless run (see [Console platform](/manual/Console)). Headless, `boot()` only installs the default bindings and `run()` renders a single frame and returns — deterministic, the smoke test for scripts, CI and agents. Piping only the output (`| head`) still takes over the terminal.
- **One key per frame**, dispatched in order: active Palette → help overlay (any key dismisses it, and is consumed) → current Screen keymaps → global keymaps. A key no binding takes is dropped.
- **Exit**: `run()` restores the terminal when its loop ends — after `quit()` or when the screen stack empties. With `pcntl`, `Ctrl+C` and `SIGTERM` exit through the shutdown restore armed by `boot()`.
- **Resizes** (with `pcntl`): `boot()` follows `SIGWINCH` into `Terminal::$columns`/`$lines`/`$width`/`$height`, and the next frame fits the new size.
- Panes (horizontal/vertical splits) are not part of the MVP — one content pane + overlays.

---

## Reference

### Console\App

```php
public function __construct (null|Input $Input = null, null|Output $Output = null)
```

Builds the shell and its widgets — the public `$Keymaps` (the global bindings), `$Palette`, `$Screens`, `$Statusbar` and `$Toasts`. Input/Output default to the CLI Terminal ones; inject in-memory streams for tests.

```php
public function boot (): self
```

Installs the default bindings (`Ctrl+P`, `?`, `q`) and — on an interactive terminal — enters the alternate screen, hides the cursor, switches the input to non-blocking raw mode and follows resizes. It registers no restore of its own: `Screen->open()` registers the screen-buffer restore, and the raw `Input->configure()` arms the terminal-mode and cursor restore plus — with `pcntl` — the `SIGINT`/`SIGTERM` exits (when the input is a terminal).

```php
public function run (null|string $screen = null): void
```

Switches to the initial screen (when given) and runs the main loop until `quit()` or an empty screen stack, then restores the terminal. On a non-interactive run, renders one frame and returns.

```php
public function quit (): void
```

Stops the main loop — it ends after the current frame.

```php
public function render (): void
```

Writes one full frame to `$Output`: the content pane (the help overlay, the active Palette or the current Screen view), the toast rows (interactive runs only) and the status bar.

```php
public int $FPS = 30;
```

Render throttle: the loop sleeps `1 / $FPS` seconds after each frame — which also caps how many keys it reads per second.

```php
public private(set) bool $running = false;
```

Whether the main loop is running — `run()` sets it, `quit()` clears it.

```php
public private(set) bool $help = false;
```

Whether the help overlay is showing. `?` opens it; while it shows, the next key only dismisses it.

```php
public Input $Input;
```

The terminal input the loop reads — the constructor's, or the CLI Terminal's.

```php
public Output $Output;
```

The output every frame is written to — the constructor's, or the CLI Terminal's.

```php
public Screen $Screen;
```

The core `Bootgly\CLI\Terminal\Screen` over `$Output`: the alternate screen buffer and the resize watch. Not to be confused with the `Console\App\Screens\Screen` views.

### Console\App\Screens

```php
public function load (string $path): self
```

Loads a screens manifest (delegates to the Router).

```php
public function switch (string $screen, array $state = []): Screen
```

Activates a new `Screen` for the name, replacing the current one — throws `InvalidArgumentException` when the name does not resolve.

```php
public function push (string $screen, array $state = []): Screen
```

Stacks a new `Screen` for the name on top of the current one (modal-style) — throws `InvalidArgumentException` when the name does not resolve.

```php
public function pop (): null|Screen
```

Removes the topmost screen and returns it (`null` when the stack is already empty); the screen below becomes current as it was left.

```php
public Router $Router;
```

The router that resolves screen names — `load()` delegates to it, and `$App->Screens->Router->route(...)` registers an inline view.

```php
public private(set) array $Stack = [];
```

The navigation stack (`array<int,Screen>`); its last entry is the current screen.

```php
public null|Screen $Current { get; }
```

The screen on top of the stack — rendered and receiving keys — or `null` when the stack is empty.

### Console\App\Screens\Screen

```php
public function __construct (string $name, Closure $View, array $state = [])
```

One navigable screen: its name, its view — `function (App $App, Screen $Screen): string` — and its navigation state. `switch()` and `push()` build it, with empty `$Keymaps`.

```php
public string $name;
```

The screen name (its route) — also the title of its group in the help overlay.

```php
public Keymaps $Keymaps;
```

The screen's own bindings, checked before the global ones.

```php
public Closure $View;
```

The view — `($Screen->View)($App, $Screen)` returns the frame content.

```php
public array $state;
```

Navigation state (`array<string,mixed>`) passed by `switch()`/`push()`; the view and the screen's handlers may change it.

### Console\App\Router

```php
public function load (string $path): self
```

Loads `<path>/screens.index.php` (an array of screen names); each name maps to `<path>/<Name>.php`, lazily required on first resolve. Throws `InvalidArgumentException` when the manifest is missing, does not return a non-empty array, or lists an entry that is not a string — the screen files are only checked when resolved.

```php
public function route (string $screen, Closure $view): self
```

Registers a screen view inline — it takes precedence over a manifest entry of the same name.

```php
public function check (string $screen): bool
```

Checks whether a screen name is routable.

```php
public function resolve (string $screen): Closure
```

Resolves a screen name to its view Closure, requiring its file on the first call and caching it — throws `InvalidArgumentException` for an unknown name, a missing file or a file that does not return a Closure.

### Console\App\Keymaps

```php
public function bind (string|array|Keystrokes $keys, string $label, Closure $handler): self
```

Registers a binding: a key, a `Keystrokes` case or an array of them (a chord). Binding the same keys again replaces the earlier binding. The keys show as bound — a `Keystrokes` case by its name (`Ctrl+P`, `Pagedown`), a string as is, a chord joined by spaces — beside the `$label` in the help overlay and the Palette.

```php
public function handle (string $key, null|float $at = null): bool
```

Consumes a raw keystroke: an exact match runs the handler; a chord prefix is buffered until the next key or the chord timeout (`$timeout`), and a key that breaks a pending chord is tried again as a fresh sequence. Returns whether the key was consumed. `$at` injects the clock (seconds) for tests.

```php
public function reset (): void
```

Resets the pending chord buffer.

```php
public function list (): array
```

Lists the bindings (`keys` as displayed, `label`, `handler`) — feeds the help overlay and the Palette.

```php
public int $timeout = 800;
```

Chord window in milliseconds: a pending chord expires when its next key comes later than that.

### Statusbar and Toasts

The status row and the toast stack are the CORE components, composed by the App pinned to `RETURN_OUTPUT` — see the [Statusbar Atom](/manual/CLI/UI/Atoms/Statusbar) and [Toasts](/manual/CLI/UX/Components/Toasts) references. The App merges the toast boxes through `Toasts::overlay()` (absolute 1-based rows) and relies on `add()`'s plain classified streaming on non-interactive output.

### Console\App\Palette

```php
public function __construct (Keymaps &$Keymaps)
```

Builds the palette over a Keymaps registry, passed by reference — the App passes its global `$Keymaps`, so screen bindings never appear in it.

```php
public function toggle (): void
```

Opens/closes the palette (opening resets the query and selection).

```php
public function control (string $key): bool
```

Handles a keystroke while active: `Esc` closes, `Enter` closes and runs the selected binding, `↑`/`↓` select, any other key edits the query. Always consumes the key.

```php
public function filter (): array
```

Filters the bindings by the current query — a case-insensitive substring of the label; an empty query lists them all.

```php
public function render (int $mode = self::RETURN_OUTPUT): null|string
```

Renders the palette frame content — the query line, up to `$limit` entries and a key hint. It always returns the string: the App composes the frame.

```php
public int $limit = 8;
```

How many entries show at once; the list scrolls with the selection.

```php
public Line $Line;
```

The query editor — the core `Bootgly\CLI\Terminal\Input\Line` (`←`/`→`, `Home`/`End`, `Backspace`/`Delete`, `Ctrl+U`/`Ctrl+K`/`Ctrl+W`).

```php
public private(set) bool $active = false;
```

Whether the palette is open — while it is, it takes every key.

```php
public private(set) int $cursor = 0;
```

The selected entry, in the filtered list; a changed query moves it back to the first entry.

```php
public string $query { get; }
```

The current query — the `$Line` value.

### Console\App\Tail

```php
public function __construct (Input $Input, Output $Output, int $max = 5000)
```

Inherited from the core Logs pager: an input and the `Output` its frames are written to (an in-memory one inside an App); `$max` caps the ring buffer, in records.

```php
public function follow (null|Closure $source): self
```

Binds (or unbinds with `null`) the pull source — `function (): string|false` returning the next chunk of newline-delimited JSON records.

```php
public function pull (): void
```

Drains the bound source into the log buffer — calls it until it returns `false` or `''` (call once per frame).

```php
public function feed (string $chunk): void
```

Appends raw bytes (newline-delimited JSON records) directly — what `pull()` does with each chunk; an incomplete trailing line waits for the next call.

```php
public function control (string $key): bool
```

Handles one pager key (`l`, `1`–`9`, `/`, `Space`, `↑`/`↓`, `PgUp`/`PgDn`, `Home`/`End`, `Enter`, `Esc`). Returns `false` for its quit keys — `q`, and `Esc` while live.

```php
public function render (): void
```

Writes one full frame to `$Output`, from row `$row`: the header, the records and the key footer — or the detail view of the selected record.

```php
public int $row = 1;
```

The frame's anchor row (1-based). Inside an App, keep it at 1.

```php
public int $rows = 0;
```

The frame height in rows — `0` takes the terminal height; the record pane is two rows shorter (header and footer).

Like the core pager, it exposes the buffered `$Records`, its filters — `$level`, `$channels`, `$search` — and its view state — `$paused`, `$searching`, `$cursor` and `$Detail`; see the [Logs](/manual/CLI/UI/Components/Logs) reference.
