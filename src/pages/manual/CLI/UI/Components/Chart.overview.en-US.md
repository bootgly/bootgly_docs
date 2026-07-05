# Chart Component

The `Chart` component plots a labeled series as ANSI text — a one-line **Sparkline** (`▁▂▃▄▅▆▇█`) or labeled horizontal **Bars** scaled to the widest value. The render is a pure string: no cursor movement, identical on interactive terminals and pipes. The native `bootgly test benchmark` wires it to print the opponents' throughput after the marks table.

It is distinct from the SVG chart used by benchmark reports (`Bootgly\ACI\Tests\Benchmark\Chart`) — this one lives in the terminal. A live demo is available in the [showcase](/manual/CLI/UI/Components/Chart/showcase).

## Instance

To use the component, it is necessary to create an instance passing as parameter the instance of the `Output` component:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Chart;

$Chart = new Chart(CLI->Terminal->Output);
```

## Plotting a sparkline

Assign the series (label ⇒ value) and render — values normalize between the series `min` and `max` over 8 glyph levels:

```php
$Chart->series = ['q1' => 12.0, 'q2' => 25.0, 'q3' => 18.0, 'q4' => 40.0];

$Chart->render(); // ▁▄▂█
```

## Plotting bars

Switch `Plots` to `Bars` for one labeled row per entry — the `█`-run scales to the widest value:

```php
use Bootgly\CLI\UI\Components\Chart\Plots;

$Chart->Plots = Plots::Bars;
$Chart->width = 30;
$Chart->precision = 0;
$Chart->series = [
   'bootgly'   => 166700.0,
   'workerman' => 83350.0
];

$Chart->render();
// bootgly   ██████████████████████████████ 166700
// workerman ███████████████ 83350
```

## Capturing the output

Pass `RETURN_OUTPUT` to get the final string (ANSI escapes resolved) instead of writing:

```php
$plot = $Chart->render(Chart::RETURN_OUTPUT);
```

## Reference

### Plots

```php
enum Bootgly\CLI\UI\Components\Chart\Plots
{
   case Sparkline;
   case Bars;
}
```

The plot style.

### Properties

```php
public Plots $Plots
```

Config. The plot style. Default: `Plots::Sparkline`.

```php
public null|int $width
```

Config. The bar area width in columns (Bars) — `null` derives it from the terminal width minus the label and value columns. Default: `null`.

```php
public string $color
```

Config. The plot color (Template markup). Default: `'@#Cyan:'`.

```php
public int $precision
```

Config. Decimal places of the formatted values (Bars). Default: `1`.

```php
public array $series
```

Data. The series to plot — label ⇒ float value.

```php
public private(set) float $max
```

Metadata (read-only). The series maximum, resolved by `render()`.

```php
public private(set) float $min
```

Metadata (read-only). The series minimum, resolved by `render()`.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): mixed
```

Plots the series: writes the frame (`WRITE_OUTPUT`) or returns it as a resolved string (`RETURN_OUTPUT`). An empty series is a no-op (`null`).
