# Scrollarea Component

The `Scrollarea` component buffers content into a fixed screen band with its own scrolling — independent from the native terminal scrollback. Fed lines are wrapped into visual rows and kept in a bounded buffer; the band follows the newest rows while stuck to the bottom, holds the position while scrolled up, and renders a scrollbar on its right edge. It is the content engine behind the [Prompt](/manual/CLI/UX/Components/Prompt/overview) REPL band. On non-interactive output (pipes, CI) it degrades to plain writes.

A live demo is available in the [showcase](/manual/CLI/UI/Components/Scrollarea/showcase).

## Instance

To use the component, it is necessary to create an instance passing as parameter the instance of the `Output` component:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Scrollarea;

$Terminal = CLI->Terminal;

$Scrollarea = new Scrollarea($Terminal->Output);
$Scrollarea->row = 1;    // band top screen row
$Scrollarea->rows = 12;  // visible rows
```

## Feeding content

`feed()` accepts Template markup, wraps long lines at the band width (the active color carries into the wrapped row) and repaints the band. While the view is stuck to the bottom, it follows the newest rows:

```php
foreach ($records as $record) {
   $Scrollarea->feed("@#Black:{$record->time}@; {$record->message}");
}
```

## Scrolling

`scroll()` moves the view by a row delta; `stick()` jumps back to the bottom. Scrolling up unsticks the view — new feeds hold the position (the scrollbar tracks it) until the view reaches the last row again:

```php
$Scrollarea->scroll(-11);  // one page up (11 rows)
$Scrollarea->scroll(+11);  // one page down
$Scrollarea->stick();      // follow the newest rows again
```

The component is render-only: wire the keys in your own read loop (the [Prompt](/manual/CLI/UX/Components/Prompt/overview) does this with `PgUp`/`PgDn` and the mouse).

## Scrollbar

When the buffer overflows the band, the right edge column renders a track (`│`) with a thumb (`█`) proportional to the visible slice — the content wraps one column earlier to reserve it. Disable it with `$Scrollarea->scrollbar = false;`.

## Pointer (mouse)

Three primitives make the scrollbar mouse-interactive from any SGR mouse read loop: `hit()` tests which band part sits under a coordinate (`'thumb'`, `'track'`, `'content'` or `null`), `aim()` centers the thumb on a screen line (drag and track-click jumps) and `hover()` highlights the thumb while the pointer is over it:

```php
// inside an SGR mouse read loop (\e[<Cb;Cx;CyM reports):
match ($Scrollarea->hit($column, $line)) {
   'thumb', 'track' => $Scrollarea->aim($line),  // click: jump + grab
   default => null
};

$Scrollarea->hover($Scrollarea->hit($column, $line) === 'thumb');
```

The [Prompt](/manual/CLI/UX/Components/Prompt/overview) wires all of it (wheel, hover, click and drag) out of the box; the showcase demo drives it standalone.

## Non-interactive output

On pipes and CI, `feed()` writes the content plainly and nothing is buffered — deterministic, no escape noise.

## Reference

### Properties

```php
public int $row
```

Config. The band top screen row (1-based). Default: `1`.

```php
public int $rows
```

Config. The visible rows (band height). Default: `10`.

```php
public int $width
```

Config. The band width, in columns. Default: the terminal width.

```php
public int $capacity
```

Config. Max buffered visual rows — older rows are dropped. Default: `1000`.

```php
public bool $scrollbar
```

Config. Whether the right edge column renders the scrollbar. Default: `true`.

```php
public private(set) array $buffer
```

Data (read-only). The buffered visual rows, oldest first (painted bytes).

```php
public private(set) int $first
```

Metadata (read-only). The first visible buffered row.

```php
public private(set) bool $stuck
```

Metadata (read-only). Whether the view is following the newest rows.

```php
public private(set) bool $hovered
```

Metadata (read-only). Whether the pointer is over the thumb (highlighted render).

### feed()

```php
public function feed (string $content): void
```

Buffers content (Template markup supported), wrapping logical lines into visual rows at the band width, and repaints the band. Plain write on non-interactive output.

### scroll()

```php
public function scroll (int $delta): void
```

Scrolls the view by a row delta (negative = up). Reaching the last row sticks the view back to the bottom.

### stick()

```php
public function stick (): void
```

Sticks the view back to the bottom (newest rows) and repaints.

### hit()

```php
public function hit (int $column, int $line): null|string
```

Tests which band part sits at a screen coordinate: `'thumb'`, `'track'`, `'content'` — or `null` outside the band.

### aim()

```php
public function aim (int $line): void
```

Aims the view so the scrollbar thumb centers on a screen line — the drag and track-click primitive. Reaching the last row re-sticks the view.

### hover()

```php
public function hover (bool $over): void
```

Updates the pointer-over-thumb state — the thumb highlights while hovered (repaints only on change).

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Repaints the visible rows into the band in place (plus the scrollbar). With `RETURN_OUTPUT`, returns the frame as a string instead.

### reset()

```php
public function reset (): void
```

Resets the buffer and the view.
