# Toasts Component

The `Toasts` component shows transient, **non-modal** notifications: each toast is an auto-sized bordered box stacked in a screen corner, alive until its deadline. The stack is tick-driven — `add()` enqueues, the app loop calls `render()` every frame and expired toasts dismiss themselves, blanking their cells and repainting the covered components (a terminal cannot read its own cells back). Unlike a [Dialog](/manual/CLI/UX/Components/Dialog/overview), a toast never traps the keyboard: the app keeps running while notifications come and go.

A live demo is available in the [showcase](/manual/CLI/UX/Components/Toasts/showcase).

## Instance

Create an instance passing the terminal `Output` — toasts never read input, so no `Input` is needed:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Components\Toasts;

$Toasts = new Toasts(CLI->Terminal->Output);
```

## Notifying in a tick loop

`add()` enqueues (never paints); `render()` is the tick — call it every frame of the app loop. An idle tick writes zero bytes (diff-blit), so ticking is cheap:

```php
$Toasts->add('Build started...');

while ($running) {
   // ... app work ...

   $Toasts->render();

   usleep(50_000);
}
```

Each toast lives `TTL` seconds (default `3.0`) — override per toast:

```php
$Toasts->add('Slow query detected', TTL: 6.0);
```

Messages are single-line plain text — control characters (newlines, escapes) are stripped, and the box auto-sizes by character count, so keep them to single-width text (double-width CJK/emoji glyphs may not size exactly, matching the `Frame` width model).

## Blocking one-liner

For linear scripts without a tick loop, `flash()` paints, waits the toast's lifetime and restores the screen in one call:

```php
$Toasts->flash('Deploy complete!');
```

## Severity

The second argument is the [Alert](/manual/CLI/UI/Components/Alert/overview) `Type` — the border color and the leading glyph follow it:

```php
use Bootgly\CLI\UI\Components\Alert\Type;

$Toasts->add('Cache warmed', Type::Success);      // ✔ green
$Toasts->add('Disk almost full', Type::Attention); // ▲ yellow
$Toasts->add('Worker died', Type::Failure);        // ✖ red
$Toasts->add('New version available');             // ● blue (Default)
```

## Choosing the position

`Positions` anchors the stack to any of seven screen positions (default `TopRight`): `TopLeft`, `TopCenter`, `TopRight`, `Center`, `BottomLeft`, `BottomCenter` and `BottomRight`. The oldest visible toast sits flush at the anchor and new ones grow away from it — additions never move the standing boxes:

```php
use Bootgly\CLI\UX\Components\Toasts\Positions;

$Toasts->Positions = Positions::BottomRight;
$Toasts->gap = 1;      // blank rows between boxes
$Toasts->limit = 4;    // max visible — older ones hide until the newest expire
```

Top positions grow downward, bottom positions grow upward and `Center` centers the whole block vertically. Right positions align every box's right edge to the screen edge; center positions center each box horizontally. Short terminals shrink the visible count instead of overlapping.

## Covering components

On dismiss the vacated cells are blanked and the covered components repaint themselves. Register everything the corner overlaps with `cover()` — covering more only costs diff-blit comparisons:

```php
use Bootgly\CLI\UI\Base\Frame;

$App = new Frame(CLI->Terminal->Output);
// ... geometry + content ...
$App->render();

$Toasts->cover($App);
```

Any `Boxing` implementer works — `Frame`, `Tabs`, a `Grid`'s cells or a `Dialog`. Vacated cells not under a covered component stay blank (same contract as Dialog).

## Resizing

`resize()` matches the `Screen::watch` handler signature — it wipes the screen, repaints the covered components and re-anchors the stack to the new size:

```php
CLI->Terminal->Screen->watch($Toasts->resize(...));
```

## Non-interactive output

On pipes and CI no box is ever positioned: `add()` and `flash()` stream one plain classified line — `[SUCCESS] Cache warmed` — and `render()` writes nothing. The same code runs interactively and in scripts.

## Reference

### Properties

```php
public Output $Output
```

The terminal Output the stack blits onto.

```php
public Positions $Positions
```

Config. The screen position anchoring the stack. Default: `Positions::TopRight`.

```php
public float $TTL
```

Config. Default toast lifetime, in seconds. Default: `3.0`.

```php
public int $limit
```

Config. Max visible toasts — older ones hide until the newest expire. Default: `3`.

```php
public null|int $width
```

Config. Outer box width cap, in columns — `null` derives half the terminal width. Boxes auto-size to their message up to this cap. Default: `null`.

```php
public int $gap
```

Config. Blank rows between the stacked boxes. Default: `0`.

```php
public float $throttle
```

Config. Seconds per `flash()` tick. Default: `0.05`.

```php
public private(set) array $Covered
```

Data (read-only). The covered components, repainted on reflow in painter order.

```php
public protected(set) array $queue
```

Data (read-only). The queued toasts, oldest first — each entry holds `message`, `Type`, `until` and its `Frame`.

### cover()

```php
public function cover (Boxing ...$Boxes): self
```

Registers the components covered by the stack anchor — each one repaints when a reflow vacates cells, in painter order.

### add()

```php
public function add (string $message, Type $Type = Type::Default, null|float $TTL = null, null|float $at = null): self
```

Enqueues a toast with its dismiss deadline — painting happens on the next `render()` tick. Non-interactive output streams a plain classified line immediately instead. `$at` injects the clock (microtime) for deterministic tests.

### expire()

```php
public function expire (null|float $at = null): void
```

Expires the toasts whose deadline passed — pure queue mutation, no painting (the next `render()` blanks and restores). Called internally by `render()`.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT, null|float $at = null): null|string
```

The tick: expires dead toasts, blanks the vacated cells, repaints the covered components once per reflow and diff-blits the standing boxes. An idle tick writes zero bytes. `RETURN_OUTPUT` returns the concatenated boxes instead of writing.

### flash()

```php
public function flash (string $message, Type $Type = Type::Default, null|float $TTL = null): void
```

Shows a toast and blocks until it expires — paint, pace, dismiss in one call. Other queued toasts keep expiring on schedule during the wait. Non-interactive output streams the plain line and returns immediately.

### clear()

```php
public function clear (): void
```

Dismisses every toast — empties the queue, blanks the painted cells and repaints the covered components.

### invalidate()

```php
public function invalidate (): void
```

Invalidates every box — the next render repaints the full rectangles (screen cleared externally, overlapped, ...).

### resize()

```php
public function resize (int $columns, int $lines): void
```

Resizes against a new terminal size — wipes the screen, repaints the covered components and re-anchors the stack. The signature matches the `Screen::watch` resize handler.
