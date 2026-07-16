# Tabs Component

The `Tabs` component is a [Frame](/manual/CLI/UI/Base/Frame/overview) multiplexer: N labeled tab Frames share one screen rectangle and only the active one renders — btop/lazygit feel. The tab bar rides the active frame's top border (the labels strip becomes its title, with the active label highlighted), so it costs zero extra rows. Inactive tabs keep buffering their isolated Outputs — drained and bounded on every render — and reveal their accumulated tail when visited.

A live demo is available in the [showcase](/manual/CLI/UX/Components/Tabs/showcase).

## Instance

Create an instance passing the terminal `Input` and `Output` (the UX composite signature — `Input` is only read inside the interactive lifecycle):

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Components\Tabs;

$Terminal = CLI->Terminal;

$Tabs = new Tabs($Terminal->Input, $Terminal->Output);
$Tabs->width = CLI->Terminal::$columns;
$Tabs->height = CLI->Terminal::$lines;
```

## Adding tabs

`add()` creates the tab Frame for you, bound to the host Output, with the shared geometry already assigned — its inner metrics are readable on the next line, to size hosted components. The first added tab activates:

```php
use Bootgly\CLI\UI\Components\Charts\Graph;

$Log = $Tabs->add('Log');
$CPU = $Tabs->add('CPU');

$Graph = new Graph($CPU->Output);
$Graph->width = $CPU->columns;
$Graph->height = $CPU->lines;
```

Anything written into a tab frame's isolated Output renders inside that tab — any component works by binding to it, exactly as with a standalone Frame.

## Switching and cycling

`switch()` activates by 1-based ordinal or label; `cycle()` moves relatively with wrap-around. Both are pure state — the next `render()` paints:

```php
$Tabs->switch(2);        // by ordinal (digit keys map 1:1)
$Tabs->switch('Log');    // by label
$Tabs->cycle(+1);        // next tab (wraps)
$Tabs->cycle(-1);        // previous tab (wraps)
```

Unknown labels, out-of-range ordinals and the already-active tab are silent no-ops. A real switch invalidates the newly active frame — its rectangle was overdrawn by the previous tab, so the next render repaints it fully.

## The interactive lifecycle

`switching()` is the interactive loop (the `rendering()`/`prompting()` sibling): it renders, yields the active ordinal every tick — feed the tab Outputs in the loop body — and reads one key attempt per tick. `←`/`→` and `Tab`/`Shift+Tab` cycle, `1`-`9` jump, `q`/Ctrl+C ends and restores the terminal:

```php
foreach ($Tabs->switching() as $tab) {
   $Log->Output->render("fed row\n");

   $CPU->clear();
   $Graph->feed($load);
   $Graph->render();
}
```

On non-interactive output (pipes, CI) it renders once and returns. For btop-style dashboards that own their loop (or Tabs placed in a [Grid](/manual/CLI/UI/Components/Grid/overview)), skip the generator: wire the keys yourself and call `render()` per tick.

## The tab bar

The labels strip is composed into the active frame's title: segments padded with one space, the active one painted with `$highlight` (bold + inverse by default), the others with `$color`, joined by a divisor derived from the active frame's border set (`│`, `║`, `┃`, ...):

```text
┌ ▌ Log ▐│ CPU │ Table ────────────────┐
│ 09:12:01 load 63% fed row 41         │
```

Long strips truncate at the inner width (the open style always closes at the cut). Caveat: `Borders::None` on the active frame hides the border — and the bar with it; keep tab frames bordered.

## Inside a Grid

Tabs implements the same `Boxing` contract as Frame, so it drops into a Grid cell natively — the Grid assigns the shared rectangle:

```php
$Grid->place($Tabs, row: 1, column: 2, rowspan: 2);
```

Pair it with a caller-driven key loop (`switch()`/`cycle()`) and `Grid::render()` per tick — the canonical in-Grid mode. `switching()` is for standalone Tabs that own the loop.

## Non-interactive output

On pipes and CI, rendering writes the active rectangle rows plainly (inherited from Frame) and `switching()` yields exactly once — deterministic, testable with `RETURN_OUTPUT`.

## Reference

### Properties

```php
public int $row
```

Config. The shared rectangle top screen row (1-based). Default: `1`.

```php
public int $column
```

Config. The shared rectangle left screen column (1-based). Default: `1`.

```php
public int $width
```

Config. The shared rectangle outer width, in columns. Default: `40`.

```php
public int $height
```

Config. The shared rectangle outer height, in rows. Default: `10`.

```php
public string $color
```

Config. Inactive labels and divisors color (Template markup). Default: `'@#Black:'`.

```php
public string $highlight
```

Config. The active label paint (raw SGR or Template markup). Default: `"\e[7;1m"` (inverse + bold).

```php
public float $throttle
```

Config. Seconds per interactive tick — the `switching()` clock is fixed: held keys drain within the tick and never accelerate the loop. Default: `0.05`.

```php
public private(set) array $Frames
```

Data (read-only). The tab Frames, label ⇒ Frame, in add order.

```php
public private(set) int $tab
```

Data (read-only). The active tab ordinal (1-based; `0` while empty).

```php
public null|Frame $Active
```

Metadata (read-only). The active tab's content Frame — `null` while empty.

### add()

```php
public function add (string $label): Frame
```

Creates a labeled tab: a Frame bound to the host Output with the shared geometry assigned immediately. The first added tab activates; a duplicate label replaces its Frame in place.

### arrange()

```php
public function arrange (): void
```

Assigns the shared rectangle to every tab Frame — pure geometry, no rendering.

### switch()

```php
public function switch (int|string $tab): void
```

Activates a tab by 1-based ordinal or label — pure state. Invalid targets and the already-active tab are silent no-ops; a real switch recomposes the bar and invalidates the new active frame.

### cycle()

```php
public function cycle (int $delta = 1): void
```

Cycles the active tab relatively, wrapping around both ends (`Tab`/`Shift+Tab` semantics).

### invalidate()

```php
public function invalidate (): void
```

Invalidates the active frame — the next render repaints the full rectangle.

### resize()

```php
public function resize (int $columns, int $lines): void
```

Resizes the shared rectangle: clears the screen, invalidates every tab frame (content preserved) and repaints. The signature matches the `Screen::watch` resize handler.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renders the active tab frame; every inactive frame drains first, keeping their streams and buffers bounded while hidden. Empty Tabs render nothing.

### switching()

```php
public function switching (): Generator
```

The interactive lifecycle: renders, yields the active ordinal per tick and reads one key attempt — `←`/`→`, `Tab`/`Shift+Tab`, `1`-`9`, `q`/Ctrl+C. Non-interactive output renders once and returns. Restores the terminal on exit.
