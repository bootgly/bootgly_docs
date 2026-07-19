# Heatmap

`Heatmap` renders a dense wrapped grid of state-colored cells — one `■` per entry, in execution order. Optional corner labels frame the grid: `heading`/`summary` above (left/right), `caption`/`note` below. Colors are truecolor (with an automatic 256-color fallback), cells map states through a configurable palette, and frames are cursor-free strings — identical on terminals, pipes and CI logs. On interactive terminals the grid can also stream live as cells arrive.

It is the assertions grid of `bootgly test --view=heatmap`, where every assertion becomes a cell. Live demos are available in the [showcase](/manual/CLI/UI/Components/Heatmap/showcase).

## Instance

The component is instantiated with the `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Heatmap;

$Heatmap = new Heatmap(CLI->Terminal->Output);
```

## Building a grid

Assign the cells — state keys in execution order — and render. The grid wraps automatically to the width; each cell spans two columns (`■` plus a gap). With `width` left `null`, the grid follows the terminal width, capped at 100 columns:

```php
$Heatmap->width = 64;
$Heatmap->cells = [
   'passed', 'passed', 'passed', 'failed', 'passed', 'skipped',
   // ...
];

$Heatmap->render();
```

## Corner labels

Four optional labels frame the grid — all accept markup and default to `''` (absent). Right labels align flush with the width:

```php
$Heatmap->heading = '@#White:Assertions@;';
$Heatmap->summary = '@:error:2 failed@;';
$Heatmap->caption = '@#Black:9 / 12 assertions@;';
$Heatmap->note = '@#Black:suite 4@;';

$Heatmap->render();
```

The labels are plain properties — hosts update them at any time, including between live repaints.

## Custom states and colors

The palette maps any state key to a `#RRGGBB` color; unknown states render dim:

```php
$Heatmap->palette = [
   'ok'   => '#7ec699',
   'warn' => '#e5c07b',
   'bad'  => '#e06c75',
];
$Heatmap->cells = ['ok', 'ok', 'warn', 'ok', 'bad', 'ok'];

$Heatmap->render();
```

## Live streaming

The grid can paint as results arrive — `start()` puts it on screen, `feed()` appends cells and repaints in place (throttled; the grid grows as it fills), and `finish()` paints the final frame and restores the cursor:

```php
$Heatmap->start();

foreach ($results as $state) {
   $Heatmap->feed($state);
}

$Heatmap->finish();
```

Streaming engages on interactive terminals only — plain output (pipes, CI) stays silent during `feed()` and renders the single final frame on `finish()`. Force either behavior with `decoration`.

## The test dashboard

The test runner composes its heatmap view from three pieces: a [Fieldset](/manual/CLI/UI/Base/Fieldset) boxes a Charts [Meter](/manual/CLI/UI/Components/Charts) (cases progress) and this Heatmap (one cell per assertion), repainting the card live per case:

```bash
php bootgly test --view=heatmap
```

See [Running Tests](/testing/basic/running-tests) for the runner-side behavior.

## Reference

```php
public null|int $width;
```

Grid columns. `null` (default) follows the terminal width, capped at 100.

```php
public array $palette;
```

State ⇒ `#RRGGBB` color map used by the cells. Defaults to `passed` (green), `failed` (soft red) and `skipped` (beige).

```php
public string $heading;
```

Label above the grid, left-aligned. Accepts markup. Default `''`.

```php
public string $summary;
```

Label above the grid, right-aligned. Accepts markup. Default `''`.

```php
public string $caption;
```

Label below the grid, left-aligned. Accepts markup. Default `''`.

```php
public string $note;
```

Label below the grid, right-aligned. Accepts markup. Default `''`.

```php
public null|bool $decoration;
```

Live streaming switch — `null` (default) follows the TTY, `false` forces plain output, `true` forces live repaints.

```php
public float $throttle;
```

Minimum seconds between live repaints. Default `0.1`.

```php
public array $cells;
```

Cells in execution order — each entry is a palette state key. Default `[]`.

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renders the grid. `WRITE_OUTPUT` writes the frame to the `Output`; `RETURN_OUTPUT` returns the raw frame string instead.

```php
public function start (): void
```

Starts the live grid — paints the initial frame and hides the cursor. Plain output starts silently (the final frame renders on `finish()`).

```php
public function feed (string ...$states): self
```

Appends cells and repaints the grid in place on interactive terminals, throttled by `throttle`. Cells are never lost — plain output only skips the paint.

```php
public function finish (): void
```

Finishes the live grid — paints the final frame and restores the cursor. Plain output renders its single frame here.
