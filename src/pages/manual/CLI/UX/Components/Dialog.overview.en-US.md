# Dialog Component

The `Dialog` component is a modal box painted **over** the running interface: the body renders through an internal [Frame](/manual/CLI/UI/Base/Frame/overview) at absolute coordinates while an interactive session owns every keystroke — nothing else reads stdin until it closes. Closing restores the screen by repainting the [Boxing](/manual/CLI/UI/Base/Frame/overview) components it covered — or the whole main buffer, when the session wraps the alternate screen. Ready-made variants answer the common cases: `confirm()`, `alert()` and `prompt()`.

It is different from the inline [Alert](/manual/CLI/UI/Components/Alert/overview) UI component: an `Alert` is a typed banner written into the normal output flow (non-blocking, non-positioned), while `Dialog::alert()` blocks over the interface until acknowledged and restores what it covered.

A live demo is available in the [showcase](/manual/CLI/UX/Components/Dialog/showcase).

## Instance

Create an instance passing the terminal `Input` and `Output` (the UX composite signature). By default the box auto-centers against the terminal; disable `centered` to place it explicitly. Style goes through the internal Frame — title, borders, colors:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Components\Dialog;

$Terminal = CLI->Terminal;

$Dialog = new Dialog($Terminal->Input, $Terminal->Output);
$Dialog->width = 44;
$Dialog->height = 7;
$Dialog->Frame->title = 'Deploy';
```

## Confirming

`confirm()` asks a modal yes/no question: `y`/`n` answer it; Enter, Esc and EOF assume the default. The box opens, traps the keyboard, and closes restoring the screen — all in one call:

```php
if ($Dialog->confirm('Deploy the app to production?', default: true) === true) {
   // ... deploy ...
}
```

## Alerting

`alert()` shows a modal message acknowledged by any key:

```php
$Dialog->alert('Deploy complete.');
```

## Prompting

`prompt()` asks a modal line of text with the full line editor (arrows, Home/End, Backspace/Delete, kill keys). Enter submits the trimmed value — an empty (or whitespace-only) submit keeps the default; Esc and EOF keep the default:

```php
$tag = $Dialog->prompt('Release tag', default: 'v1.0.0');
```

## Covering components

A terminal cannot read its own cells back, so a modal cannot snapshot what sits under it. Instead, `cover()` registers the components the rectangle overlaps — on `close()` the rectangle is blanked and each covered component repaints itself (they keep their own content buffers while hidden):

```php
use Bootgly\CLI\UI\Base\Frame;

$App = new Frame($Terminal->Output);
// ... geometry + content ...
$App->render();

$Dialog->cover($App);

$Dialog->confirm('Quit?');   // closing repaints $App over the blank
```

Any `Boxing` implementer works — `Frame`, `Tabs`, a `Grid`'s cells or another `Dialog`. Cover everything the box overlaps; covering more only costs diff-blit comparisons.

## Generic hosting

The variants cover the common cases; for anything else, the dialog is a Frame host. `open()` paints and returns control — write into `$Dialog->Frame->Output` (complete `\n`-terminated lines), re-render at will and `close()` when done:

```php
$Dialog->open();

$Dialog->Frame->Output->write("Working...\n");
$Dialog->render();

// ... work ...

$Dialog->close();
```

A variant called between `open()` and `close()` reuses the open box, restores the hosted body afterwards and leaves the box open — composable with a caller-owned lifecycle. In these nested sessions the terminal modes and the cursor stay the caller's responsibility (a caller running its own raw key loop keeps it).

## Standalone sessions

Over free-flowing scrolled output there are no components to cover. Set `screen` and the session wraps the [alternate screen buffer](/manual/CLI/Terminal/overview): the terminal itself preserves and restores the whole main screen:

```php
$Dialog->screen = true;

$Dialog->confirm('Continue?');   // the main screen restores untouched
```

When `screen` is set, covered components are not repainted — the terminal restores the buffer by itself.

## Resizing

`resize()` matches the `Screen::watch` handler signature — it recenters (unless `centered` is disabled) and, while the box is painted, wipes the screen and repaints the covered components and the box. A closed dialog only recenters — the screen belongs to its owner:

```php
$Terminal->Screen->watch($Dialog->resize(...));
```

## Non-interactive output

On pipes and CI no box is painted: `confirm()` and `prompt()` keep the [Question](/manual/CLI/UI/Components/Question/overview) semantics (one stdin line; EOF and empty answers assume the default) and `alert()` writes the message plainly. The same code runs interactively and in scripts.

## Reference

### Properties

```php
public Input $Input
```

The terminal Input owned by the interactive sessions.

```php
public Output $Output
```

The terminal Output the box blits onto.

```php
public int $row
```

Config. Top screen row (1-based). Overwritten while `centered` is set. Default: `1`.

```php
public int $column
```

Config. Left screen column (1-based). Overwritten while `centered` is set. Default: `1`.

```php
public int $width
```

Config. Outer width, in columns. Default: `50`.

```php
public int $height
```

Config. Outer height, in rows. Default: `7`.

```php
public bool $centered
```

Config. Auto-center against the terminal on `open()`/`resize()`. Default: `true`.

```php
public string $color
```

Config. Keys-hint color (Template markup). Default: `'@#Black:'`.

```php
public bool $screen
```

Config. Wrap the session in the alternate screen buffer — the terminal restores the whole main screen on close. Default: `false`.

```php
public float $throttle
```

Config. Seconds per interactive tick — held keys never accelerate the clock. Default: `0.05`.

```php
public private(set) Frame $Frame
```

Data (read-only). The body host — write into its isolated Output; style through its `title`, `Borders` and `color`.

```php
public private(set) array $Covered
```

Data (read-only). The covered components, repainted on `close()` in painter order.

```php
public private(set) bool $opened
```

Metadata (read-only). Whether the box is painted right now.

```php
public private(set) null|bool $confirmed
```

Metadata (read-only). The last `confirm()` answer — `null` while none.

```php
public private(set) string $answer
```

Metadata (read-only). The last `prompt()` answer.

### cover()

```php
public function cover (Boxing ...$Boxes): self
```

Registers the components covered by the modal — each one repaints when the dialog closes, in painter order.

### open()

```php
public function open (): self
```

Opens the dialog: centers against the terminal (unless `centered` is disabled), enters the alternate screen when `screen` asks for it and paints the box. Non-blocking — the caller keeps control.

### close()

```php
public function close (): self
```

Closes the dialog restoring what it covered: leaves the alternate screen or blanks the rectangle and repaints the covered components. Idempotent.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renders the box — pure paint: the internal Frame diff-blit writes only the changed rows. `RETURN_OUTPUT` returns the rectangle instead of writing.

### invalidate()

```php
public function invalidate (): void
```

Invalidates the box — the next render repaints the full rectangle (screen cleared externally, overlapped, ...).

### resize()

```php
public function resize (int $columns, int $lines): void
```

Resizes against a new terminal size: recenters and, while the box is painted, wipes the screen and repaints the covered components and the box (a closed dialog only recenters). The signature matches the `Screen::watch` resize handler.

### confirm()

```php
public function confirm (string $prompt, bool $default = false): bool
```

Asks a modal yes/no confirmation: `y`/`n` answer; Enter, Esc and EOF assume the default. Non-interactive input keeps the Question semantics.

### alert()

```php
public function alert (string $message): void
```

Shows a modal message acknowledged by any key (or EOF). Non-interactive output writes the message and returns immediately.

### prompt()

```php
public function prompt (string $prompt, string $default = ''): string
```

Asks a modal line of text with the Line editor: Enter submits the trimmed value — an empty submit keeps the default; Esc and EOF keep the default. Non-interactive input keeps the Question semantics.
