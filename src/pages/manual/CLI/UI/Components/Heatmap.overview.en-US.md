# Heatmap

`Heatmap` renders a bordered dashboard card: a rounded frame with a bold title and score percentage in the header, a `■`-run Meter gauge, a dense wrapped grid of state-colored cells and a dim counts footer. Colors are truecolor (with an automatic 256-color fallback), cells map states through a configurable palette, and the render is one-shot and cursor-free — identical on terminals, pipes and CI logs.

It is the component behind `bootgly test --view=heatmap`, where each test suite becomes a card and every assertion becomes a cell. Live demos are available in the [showcase](/manual/CLI/UI/Components/Heatmap/showcase).

## Instance

The component is instantiated with the `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Heatmap;

$Heatmap = new Heatmap(CLI->Terminal->Output);
```

## Building a card

Assign a title and the cells — state keys in execution order — and render. The score derives from the share of `positive` cells (`passed` by default), the Meter gauges it, and the footer counts positives over total:

```php
$Heatmap->title = 'http';
$Heatmap->width = 64;
$Heatmap->cells = [
   'passed', 'passed', 'passed', 'failed', 'passed', 'skipped',
   // ...
];

$Heatmap->render();
```

The grid wraps automatically to the card width — each cell spans two columns (`■` plus a gap). With `width` left `null`, the card follows the terminal width, capped at 100 columns.

## Custom states and colors

The palette maps any state key to a `#RRGGBB` color; unknown states render dim. Point `positive` at the state the score and the Meter should gauge:

```php
$Heatmap->palette = [
   'ok'   => '#7ec699',
   'warn' => '#e5c07b',
   'bad'  => '#e06c75',
];
$Heatmap->positive = 'ok';
$Heatmap->cells = ['ok', 'ok', 'warn', 'ok', 'bad', 'ok'];

$Heatmap->render();
```

## The test dashboard

The test runner wires this component as a results view — one card per suite, one cell per assertion, failures listed under each card:

```bash
php bootgly test --view=heatmap
```

See [Running Tests](/testing/basic/running-tests) for the runner-side behavior.

## Reference

```php
public string $title;
```

Card title, rendered bold at the top-left of the header row. Default `''`.

```php
public null|int $width;
```

Card columns. `null` (default) follows the terminal width, capped at 100. Values below 20 are clamped to 20.

```php
public array $palette;
```

State ⇒ `#RRGGBB` color map used by the cells and the Meter. Defaults to `passed` (pink), `failed` (soft red) and `skipped` (beige).

```php
public string $positive;
```

The state gauged by the Meter and the derived score. Default `'passed'`.

```php
public array $cells;
```

Cells in execution order — each entry is a palette state key. Default `[]`.

```php
public null|float $score;
```

Score percentage shown in the header and gauged by the Meter. `null` (default) derives it from the share of `positive` cells.

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renders the card. `WRITE_OUTPUT` writes the frame to the `Output`; `RETURN_OUTPUT` returns the raw frame string instead.
