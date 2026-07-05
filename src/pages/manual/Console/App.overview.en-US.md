# Console App

`Console\App` is the TUI application shell: it owns the terminal lifecycle — alternate screen, raw input, resize tracking, restore-on-exit — and runs a non-blocking loop that drains keystrokes, dispatches keymaps and renders the current screen at a throttled frame rate.

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

The view returns the frame content as a string (lines separated by `\n`); the App fits every line to the terminal width. Navigate with `switch()` (replace), `push()` (overlay, modal-style) and `pop()` (back):

```php
$App->Screens->switch('Logs', state: ['filter' => 'error']);
```

Each `Screen` carries its own `$Keymaps` (checked before the global ones) and a `$state` array passed by the navigation call.

## Keymaps

Bindings map a key — or a chord (a key sequence like `g g`) — to a labeled handler:

```php
use Bootgly\CLI\Terminal\Input\Keystrokes;

$App->Keymaps->bind('q', 'Quit', fn () => $App->quit());
$App->Keymaps->bind(Keystrokes::CTRL_P, 'Command palette', fn () => $App->Palette->toggle());
$App->Keymaps->bind(['g', 'g'], 'Go to top', fn () => $App->Toasts->add('Top!'));
```

`boot()` installs three default bindings: `Ctrl+P` (palette), `?` (help overlay, auto-generated from the keymaps) and `q` (quit).

## Chrome widgets

```php
$App->Statusbar->left = ['Snake', 'Score: 3'];
$App->Statusbar->right = ['[?] help'];

$App->Toasts->add('Saved!');                    // info, expires in 3s
$App->Toasts->add('Disk full', level: 'error'); // info | warning | error
```

The **Palette** (`Ctrl+P`) searches the registered keymaps incrementally — type to filter, `↑`/`↓` to select, `Enter` to run, `Esc` to dismiss.

**Tail** is a log-viewer widget — the core [Logs](/manual/CLI/UI/Components/Logs) pager bound to a pull source:

```php
use const Bootgly\CLI;
use Console\App\Tail;

$Tail = new Tail(CLI->Terminal->Input, CLI->Terminal->Output);
$Tail->follow(fn (): string|false => $LogPipe->read(65536));
$Tail->pull();    // drain the source each frame
$Tail->render();  // full frame (or anchor with $Tail->row / $Tail->rows)
```

## Behavior notes

- **Non-interactive runs** (pipes, CI): `boot()` skips the terminal takeover and `run()` renders a single frame and returns — deterministic and safe.
- **Input dispatch order**: active Palette → help overlay → current Screen keymaps → global keymaps.
- **Interactive core components** (Menu, Form, Question) run their own read loops — do **not** call them inside a screen view: the App loop already owns stdin. Screens render strings; actions live in keymaps.
- Panes (horizontal/vertical splits) are not part of the MVP — one content pane + overlays.

---

## Reference

### Console\App

```php
public function __construct (null|Input $Input = null, null|Output $Output = null)
```

Builds the shell and its widgets. Input/Output default to the CLI Terminal ones; inject in-memory streams for tests.

```php
public function boot (): self
```

Installs the default bindings and — on an interactive TTY — enters the alternate screen, hides the cursor, switches the input to raw non-blocking mode, tracks resizes and registers the restore-on-exit (shutdown + SIGINT).

```php
public function run (null|string $screen = null): void
```

Switches to the initial screen (when given) and runs the main loop until `quit()` or an empty screen stack. On a non-interactive run, renders one frame and returns.

```php
public function quit (): void
```

Stops the main loop.

```php
public function render (): void
```

Renders one full frame: content pane, toast overlay rows and the status bar.

### Console\App\Screens

```php
public function load (string $path): self
```

Loads a screens manifest (delegates to the Router).

```php
public function switch (string $screen, array $state = []): Screen
```

Activates a screen, replacing the current one.

```php
public function push (string $screen, array $state = []): Screen
```

Overlays a screen on top of the current one (modal-style).

```php
public function pop (): null|Screen
```

Pops the topmost screen, returning to the previous one.

### Console\App\Router

```php
public function load (string $path): self
```

Loads `<path>/screens.index.php` (an array of screen names); each name maps to `<path>/<Name>.php`, lazily required on first resolve.

```php
public function route (string $screen, Closure $view): self
```

Registers a screen view inline.

```php
public function check (string $screen): bool
```

Checks whether a screen name is routable.

```php
public function resolve (string $screen): Closure
```

Resolves a screen name to its view Closure — throws `InvalidArgumentException` on unknown names or invalid files.

### Console\App\Keymaps

```php
public function bind (string|array|Keystrokes $keys, string $label, Closure $handler): self
```

Registers a binding: a key, a `Keystrokes` case or an array of them (a chord).

```php
public function handle (string $key, null|float $at = null): bool
```

Consumes a raw keystroke: exact matches run the handler; chord prefixes buffer until the next key or the chord timeout (`$timeout`, 800 ms). Returns whether the key was consumed.

```php
public function reset (): void
```

Resets the pending chord buffer.

```php
public function list (): array
```

Lists the bindings (`keys`, `label`, `handler`) — feeds the help overlay and the Palette.

### Console\App\Statusbar

```php
public function render (int $mode = self::RETURN_OUTPUT): null|string
```

Renders the status row: `$left` segments ▏-separated, `$right` segments right-aligned to the terminal width.

### Console\App\Toasts

```php
public function add (string $message, string $level = 'info', null|float $ttl = null, null|float $at = null): self
```

Queues a toast (`info` | `warning` | `error`), expiring after `$ttl` seconds (default `$ttl` property, 3s).

```php
public function expire (null|float $at = null): void
```

Drops expired toasts.

```php
public function render (int $mode = self::RETURN_OUTPUT): null|string
```

Renders the visible toasts (up to `$limit`) as right-aligned overlay rows.

### Console\App\Palette

```php
public function toggle (): void
```

Opens/closes the palette (opening resets the query and selection).

```php
public function control (string $key): bool
```

Handles a keystroke while active — always consumes it.

```php
public function filter (): array
```

Filters the bindings by the current query (matched against the labels).

```php
public function render (int $mode = self::RETURN_OUTPUT): null|string
```

Renders the palette frame content.

### Console\App\Tail

```php
public function follow (null|Closure $source): self
```

Binds (or unbinds with `null`) the pull source — `function (): string|false` returning the next chunk of newline-delimited JSON records.

```php
public function pull (): void
```

Drains the bound source into the log buffer (call once per frame).
