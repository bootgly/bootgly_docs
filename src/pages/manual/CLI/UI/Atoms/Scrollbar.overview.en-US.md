# Scrollbar Component

The `Scrollbar` component renders the vertical bar strip: a thumb sliding over a track, derived from the three view numbers every scrollable host owns — `total` content rows, `height` visible rows and the `first` visible index. The `Scrollarea` band and the `Listbox` window both mount on this Atom, and any component with a windowed view can too.

It is a **UI Atom** — a primitive with no dependency on other components. A live demo is available in the [showcase](/manual/CLI/UI/Atoms/Scrollbar/showcase).

## Instance

To use the component, create an instance passing the `Output` instance:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Atoms\Scrollbar;

$Scrollbar = new Scrollbar(CLI->Terminal->Output);
```

## Feed the three view numbers

Everything the bar knows derives from `total`, `height` and `first`. The bar only *slides* — shows a thumb — when the content overflows the view; `check()` answers that:

```php
$Scrollbar->total = 100;   // content rows behind the view
$Scrollbar->height = 12;   // visible rows (the strip height)
$Scrollbar->first = 0;     // first visible index

$Scrollbar->check();       // true — 100 rows overflow 12
```

## Place the strip

Placed — `row` and `column` at 1-based screen coordinates — `render()` repaints the strip in place, one glyph per view row:

```php
$Scrollbar->row = 8;
$Scrollbar->column = 40;

$Scrollbar->render();
```

As the view scrolls, update `first` and render again — the thumb follows:

```php
$Scrollbar->first = 42;
$Scrollbar->render();
```

## Compose the rows

Hosts that build their own frame take the rows instead: `RETURN_OUTPUT` returns the glyph rows joined by `\n` (no trailing newline) to splice one per row — this is exactly how the Listbox appends its right-edge bar:

```php
use Bootgly\API\Component;

$bars = explode("\n", (string) $Scrollbar->render(Component::RETURN_OUTPUT));

foreach ($rows as $index => $row) {
   $output .= $row . ($bars[$index] ?? '') . "\n";
}
```

## Wire the mouse

The Scrollbar never arms the mouse — the host does (`Terminal\Reporting\Mouse`) and routes the SGR reports. Movement drives the hover; a left press on the strip aims and drags:

```php
// inside the host's mouse report handler:
$Scrollbar->hover($Scrollbar->hit($column, $line) === 'thumb');

// on a left press over the strip:
$hit = $Scrollbar->hit($column, $line);
if ($hit !== null) {
   $first = $Scrollbar->aim($line);   // the host applies it and repaints
}
```

`hit()` resolves `'thumb'`, `'track'` or `null`; `aim()` maps a screen line back to the `first` index by the thumb center — a track click jumps, a drag follows. Hovering repaints only the strip, and an unchanged hover writes nothing. Demo 62 (`bootgly demo 62`) wires the full loop: wheel, hover, track click and drag.

## Restyle

The glyphs and paints are plain Config — a host exposes its bar for exactly this:

```php
$Scrollbar->thumb = '┃';
$Scrollbar->track = '·';
$Scrollbar->style = ['38;5;240'];   // rest: track + thumb
$Scrollbar->accent = ['38;5;255'];  // hovered thumb
```

`Scrollarea` and `Listbox` expose theirs as `$Scrollarea->Scrollbar` and `$Listbox->Scrollbar`.

## Non-interactive output

On pipes and CI the render keeps the bare glyphs with **zero escape codes**, and `hover()` never paints — there is no pointer without an interactive terminal. `decoration` is a tri-state: `null` (default) follows the TTY, `false` forces plain, `true` forces styled.

## Reference

### Properties

```php
public null|bool $decoration = null;
```

Config. SGR decoration — `null` follows the TTY, `false` forces plain, `true` forces styled.

```php
public string $thumb = '█';
```

Config. The thumb glyph (the draggable handle).

```php
public string $track = '│';
```

Config. The track glyph (the rail behind the thumb).

```php
public array $style = ['90'];
```

Config. SGR codes painting the track and the resting thumb.

```php
public array $accent = ['97'];
```

Config. SGR codes painting the thumb while hovered.

```php
public int $row = 0;
```

Config. Screen row of the strip top (1-based) — `0` keeps the bar unplaced (composed by the host).

```php
public int $column = 0;
```

Config. Screen column of the strip (1-based) — `0` keeps the bar unplaced.

```php
public int $width = 1;
```

Config. Columns the strip occupies — always `1` (a vertical bar is one column wide).

```php
public int $height = 0;
```

Config. Rows the strip occupies — the host view's visible rows.

```php
public int $total = 0;
```

Data. Total content rows/options behind the view.

```php
public int $first = 0;
```

Data. First visible content index (0-based).

```php
public private(set) bool $hovered = false;
```

Metadata. Whether the pointer is over the thumb (accent paint active).

### check()

```php
public function check (): bool
```

Checks whether the bar slides — the content overflows the view, so there is a thumb to show and drag.

### measure()

```php
public function measure (): array
```

Measures the thumb geometry from the view numbers — returns the thumb `[start, size]` in strip rows, or `[0, 0]` when the bar does not slide.

### hit()

```php
public function hit (int $column, int $line): null|string
```

Tests which strip part sits at a screen coordinate — `'thumb'`, `'track'` or `null` outside the strip. A pure predicate: no render, no state. An unplaced or non-sliding bar hits nothing.

### aim()

```php
public function aim (int $line): int
```

Aims the view so the thumb centers on a screen line (drag or track click) — updates `first` and hands it back for the host to apply.

### hover()

```php
public function hover (bool $over): void
```

Hovers (or leaves) the thumb — the accent paint repaints the strip in place when the bar is placed; composed hosts re-render themselves. An unchanged hover writes nothing; plain output never hovers.

### reset()

```php
public function reset (): void
```

Resets the view state and the hover, silently — no repaint; the host's own reset drives the next paint.

### invalidate()

```php
public function invalidate (): void
```

Invalidates the strip (Boxing member) — a no-op: there is no blitted state, every render repaints the whole column.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renders the strip: one glyph row per view row. `WRITE_OUTPUT` paints in place at the strip column when placed, or writes the rows in flow when not; `RETURN_OUTPUT` returns the rows joined by `\n` (no trailing newline) for the host to splice. A non-sliding bar renders nothing.
