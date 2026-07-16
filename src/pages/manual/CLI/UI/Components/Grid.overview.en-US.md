# Grid Component

The `Grid` component is a weighted track layout that places [Frames](/manual/CLI/UI/Base/Frame/overview) on the screen — a btop-like dashboard in a few lines. Rows and columns are arrays of track weights, each placed Frame anchors at a track and can span several of them, and the track sizes always sum exactly to the grid rectangle, whatever the terminal size.

A live demo is available in the [showcase](/manual/CLI/UI/Components/Grid/showcase).

## A btop-like dashboard

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Charts\Graph;
use Bootgly\CLI\UI\Base\Frame;
use Bootgly\CLI\UI\Components\Grid;

$Terminal = CLI->Terminal;
$Output = $Terminal->Output;

// ! Layout — 2 row tracks (2:1) × 2 column tracks (2:1), full terminal
$Grid = new Grid($Output);
$Grid->rows = [2, 1];
$Grid->columns = [2, 1];

$CPU = new Frame($Output);
$CPU->title = 'CPU';
$Log = new Frame($Output);
$Log->title = 'Log';

$Grid
   ->place($CPU, row: 1, column: 1, colspan: 2)
   ->place($Log, row: 2, column: 1, colspan: 2);

// ! A chart bound to the frame's isolated Output
$Graph = new Graph($CPU->Output);
$Graph->width = $CPU->columns;
$Graph->height = $CPU->lines;
$Graph->ceiling = 100.0;

// @@ The tick loop
$Terminal->Screen->open();
$Output->Cursor->hide();

for ($tick = 0; $tick < 100; $tick++) {
   $CPU->clear();
   $Graph->feed(random_int(0, 100));
   $Graph->render();

   $Log->Output->render("tick @#yellow:{$tick}@;\n");

   $Grid->render();

   usleep(100000);
}

$Output->Cursor->show();
$Terminal->Screen->close();
```

## Weighted tracks

`$rows` and `$columns` are arrays of weights — each entry is one track, sized proportionally:

```php
$Grid->rows = [1, 2];        // 1/3 + 2/3 of the height
$Grid->columns = [2, 1, 1];  // 50% + 25% + 25% of the width
```

```text
┌─CPU──────────────────────────┐
│ (1/3 of the height)          │
├─Procs──────────────┬─Log─────┤
│ (2/3 · 50% width)  │ (25%)   │
└────────────────────┴─────────┘
```

Track sizes distribute by largest remainder — they always sum exactly to the rectangle, and odd columns spread evenly instead of accumulating on one track. `null` `width`/`height` (the default) tracks the terminal size.

## Placing frames

`place()` anchors a Frame at a row/column track (1-based) spanning one or more tracks — and assigns the Frame geometry **immediately**, so its inner metrics can be read right after to size hosted components:

```php
$Grid->place($MEM, row: 1, column: 2, rowspan: 2);

$Meter = new Meter($MEM->Output);
$Meter->width = $MEM->columns;   // already sized by the placement
```

Out-of-range placements clamp into the track grid. Overlaps are allowed and paint in placement order (painter's order) — the last placed frame wins, which intentional overlays can exploit.

## Gap

`$gap` leaves blank columns/lines between cells — trimmed only off the sides that face another cell, so outer edges stay flush with the grid rectangle:

```php
$Grid->gap = 1;
```

The default is `0` — adjacent frame borders touch, the btop look.

## Resize

`resize()` matches the `Screen::watch` handler signature — wire it and dispatch signals in the tick loop; the grid clears the screen (wiping shrink artifacts), reflows every placed frame and repaints:

```php
$Terminal->Screen->watch(function (int $columns, int $lines) use ($Grid): void {
   $Grid->resize($columns, $lines);
});

// inside the tick loop:
pcntl_signal_dispatch();
```

Nothing is self-wired: the grid never installs hidden signal handlers.

## Non-interactive output

On pipes and CI, rendering writes each placed frame's rectangle plainly, in placement order — deterministic, testable with `RETURN_OUTPUT`.

## Reference

### Properties

```php
public int $row
```

Config. The grid top screen row (1-based). Default: `1`.

```php
public int $column
```

Config. The grid left screen column (1-based). Default: `1`.

```php
public null|int $width
```

Config. The grid outer width, in columns — `null` tracks the terminal columns. Default: `null`.

```php
public null|int $height
```

Config. The grid outer height, in rows — `null` tracks the terminal lines. Default: `null`.

```php
public array $rows
```

Config. The row track weights. Default: `[1]`.

```php
public array $columns
```

Config. The column track weights. Default: `[1]`.

```php
public int $gap
```

Config. Blank columns/lines between cells. Default: `0`.

```php
public private(set) array $Cells
```

Data (read-only). The placed frames (`Cell` instances), in paint order.

### place()

```php
public function place (Boxing $Box, int $row, int $column, int $rowspan = 1, int $colspan = 1): self
```

Places a box over the grid tracks and assigns its geometry immediately. Any `Boxing` implementer fits — a [Frame](/manual/CLI/UI/Base/Frame/overview), a [Tabs](/manual/CLI/UX/Components/Tabs/overview), ... Chainable; overlaps paint in placement order.

### arrange()

```php
public function arrange (): void
```

Distributes the track sizes over the grid rectangle and assigns each placed Frame its screen geometry — pure geometry, no rendering.

### resize()

```php
public function resize (int $columns, int $lines): void
```

Resizes the grid rectangle — clears the screen, invalidates every placed Frame (content preserved) and repaints. The signature matches the `Screen::watch` resize handler.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Arranges the layout and renders every placed Frame, in placement order. With `RETURN_OUTPUT`, returns the concatenated frame rectangles instead.

### Cell

```php
public Boxing $Box
```

The `Grid\Cell` value object holds one placement: the box (writable — overlay designs can retarget the cell) plus the `row`, `column`, `rowspan` and `colspan` tracks.
