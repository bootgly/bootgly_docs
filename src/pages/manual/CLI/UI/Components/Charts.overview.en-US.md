# Charts

The Chart family plots values as ANSI text. `Chart` is the abstract base — series, scaling, gradient coloring and the output pipeline — and the concrete types live in `Charts\`: a one-line **Sparkline** (`▁▂▃▄▅▆▇█`), labeled horizontal **Bars**, a percentage **Meter** gauge (`■`) and a btop-inspired multi-row streaming **Graph** whose braille cells pack two values each. Every type colors its cells through a truecolor **Gradient** (with an automatic 256-color fallback).

Sparkline, Bars and Meter render pure strings — no cursor movement, identical on interactive terminals and pipes. Graph additionally streams live: `feed()` slides a value history like a system monitor. The native `bootgly test benchmark` wires Bars to print the opponents' throughput after the marks table.

This family is distinct from the SVG chart used by benchmark reports (`Bootgly\ACI\Tests\Benchmark\Chart`) — these live in the terminal. Live demos are available in the [showcase](/manual/CLI/UI/Components/Charts/showcase).

## Instance

Each chart type is a component instantiated with the `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Charts\Sparkline;

$Sparkline = new Sparkline(CLI->Terminal->Output);
```

## Plotting a sparkline

Assign the series (label ⇒ value) and render — values normalize between the series `min` and `max` over 8 glyph levels, each glyph colored by its level through the gradient:

```php
$Sparkline->series = ['q1' => 12.0, 'q2' => 25.0, 'q3' => 18.0, 'q4' => 40.0];

$Sparkline->render(); // ▁▄▂█
```

## Plotting bars

`Bars` renders one labeled row per entry — the `█`-run scales to the widest value (or the fixed `ceiling`), and each bar samples the gradient at its share of the top:

```php
use Bootgly\CLI\UI\Components\Chart\Gradient;
use Bootgly\CLI\UI\Components\Charts\Bars;

$Bars = new Bars(CLI->Terminal->Output);
$Bars->width = 30;
$Bars->precision = 0;
$Bars->Gradient = new Gradient(['#ff1744', '#ffd600', '#00c853']);
$Bars->series = [
   'bootgly'   => 166700.0,
   'workerman' => 83350.0
];

$Bars->render();
// bootgly   ██████████████████████████████ 166700
// workerman ███████████████ 83350
```

## Gauging with a meter

`Meter` renders a percentage as a `■` run — filled cells sample the gradient at their own position (heat ramps read naturally), empty cells render dim:

```php
use Bootgly\CLI\UI\Components\Charts\Meter;

$Meter = new Meter(CLI->Terminal->Output);
$Meter->width = 30;
$Meter->Gradient = new Gradient(['#00c853', '#ffd600', '#ff1744']);
$Meter->value = 92.0;

$Meter->render(); // ■■■■■■■■■■■■■■■■■■■■■■■■■■■■(dim)■■
```

## Streaming a live graph

`Graph` is the btop-style monitor: a multi-row area graph where each braille cell encodes two consecutive values as a (previous, current) dot pair — double horizontal resolution. `start()` reserves the frame, `feed()` slides the history and repaints (throttled), `finish()` restores the cursor:

```php
use Bootgly\CLI\UI\Components\Charts\Graph;

$Graph = new Graph(CLI->Terminal->Output);
$Graph->width = 60;
$Graph->height = 6;
$Graph->ceiling = 100.0; // fixed 0-100 scale (a CPU-like monitor)
$Graph->Gradient = new Gradient(['#00c853', '#ffd600', '#ff1744']);

$Graph->start();

while ($running) {
   $Graph->feed($load); // your sampled metric

   usleep(50000);
}

$Graph->finish();
```

Each row samples the gradient at its own height — the top of the frame renders the hot end. On non-interactive output (pipes, CI) `start()` is silent, `feed()` only accumulates and `finish()` renders the single final frame — deterministic in scripts.

The cell symbols are configurable: `Symbols::Braille` (default, 2 values per cell), `Symbols::Block` (quadrants) or `Symbols::TTY` (`░▒█` shades for limited terminals). `inverted` flips the graph upside down (down-graphs). Without `start()`/`feed()`, `render()` also plots a static `series` one-shot.

## Coloring with gradients

`Gradient` interpolates 1 to 3 hex stops into 101 color levels. Truecolor terminals (detected via `COLORTERM`) get exact `38;2;R;G;B` escapes; others fall back to the nearest 256-color cube entry. One stop = solid color:

```php
use Bootgly\CLI\UI\Components\Chart\Gradient;

$Heat = new Gradient(['#00c853', '#ffd600', '#ff1744']); // green → yellow → red
$Cyan = new Gradient(['#00ffff']);                        // solid
$Cube = new Gradient(['#00ffff'], extended: true);        // force 256-color
```

## Capturing the output

Every type accepts `RETURN_OUTPUT` to get the final string (ANSI escapes resolved) instead of writing:

```php
$plot = $Bars->render(Bars::RETURN_OUTPUT);
```

## Reference

### Base properties (`Bootgly\CLI\UI\Components\Chart`)

```php
public null|int $width
```

Config. The frame width in columns — `null` derives it from the terminal (Graph) or from the terminal minus the label/value columns (Bars); Meter defaults to `20`. Default: `null`.

```php
public int $precision
```

Config. Decimal places of the formatted values (Bars). Default: `1`.

```php
public null|float $ceiling
```

Config. A fixed scale top — `null` scales to the measured series maximum. Default: `null`.

```php
public Gradient $Gradient
```

Config. The color gradient sampled by the type. Defaults lazily to solid cyan.

```php
public array $series
```

Data. The series to plot — label ⇒ float value.

```php
public private(set) float $max
```

Metadata (read-only). The measured maximum.

```php
public private(set) float $min
```

Metadata (read-only). The measured minimum.

### Gradient

```php
public function __construct (array $stops, null|bool $extended = null)
```

Creates a gradient from 1 to 3 `#RRGGBB` stops. `extended` forces the 256-color cube — `null` auto-detects truecolor via `COLORTERM`.

```php
public function sample (int $percent): string
```

Samples the SGR foreground escape at a percentage (clamped to 0-100). Samples carry no reset — consumers reset at frame end.

### Symbols

```php
enum Bootgly\CLI\UI\Components\Chart\Symbols
{
   case Braille;
   case Block;
   case TTY;
}
```

The Graph cell symbol sets. Also exposes `Symbols::RAMP` (the 8-level sparkline glyphs) and `Symbols::METER` (`■`).

```php
public function map (bool $inverted = false): array
```

Maps the set to its flat 5×5 character table — 25 cells indexed `previous * 5 + current`, levels 0-4. `inverted` fills top-down.

### Sparkline / Bars

```php
public function render (int $mode = self::WRITE_OUTPUT): mixed
```

Plots the series one-shot: writes the frame (`WRITE_OUTPUT`) or returns it as a resolved string (`RETURN_OUTPUT`). An empty series is a no-op (`null`).

### Meter

```php
public float $value
```

Data. The gauged percentage (0-100).

```php
public bool $inverted
```

Config. Samples the gradient from the high end down. Default: `false`.

```php
public function render (int $mode = self::WRITE_OUTPUT): mixed
```

Renders the gauge — filled cells sample the gradient at their position, empty cells render dim.

### Graph

```php
public int $height
```

Config. Frame rows. Default: `4`.

```php
public Symbols $Symbols
```

Config. The cell symbol set. Default: `Symbols::Braille`.

```php
public bool $inverted
```

Config. Fills top-down (down-graph). Default: `false`.

```php
public null|int $capacity
```

Config. The value history capacity — `null` keeps two values per frame column. Default: `null`.

```php
public float $throttle
```

Config. Minimum seconds between live repaints. Default: `0.1`.

```php
public private(set) array $values
```

Data (read-only). The fed value history.

```php
public function start (): void
```

Starts the live graph — reserves the frame rows and hides the cursor. Silent on non-interactive output.

```php
public function feed (float $value): self
```

Feeds a value into the history (sliding it at `capacity`) and repaints live on interactive terminals, throttled. On pipes it only accumulates.

```php
public function finish (): void
```

Finishes the live graph — restores the cursor; non-interactive output renders its single final frame here. Also runs on destruct.

```php
public function render (int $mode = self::WRITE_OUTPUT): mixed
```

Renders the current frame (`height` rows, cursor-free) from the fed history — or from the static `series` when nothing was fed.
