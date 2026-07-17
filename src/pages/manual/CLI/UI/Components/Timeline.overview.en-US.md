# Timeline Component

The `Timeline` component renders a multi-step guided flow with per-step state — pending, active, done or failed — as a vertical list connected by `│`. Interactive terminals repaint the frame in place as the flow advances; non-interactive output (pipes, CI) appends one plain line per transition, keeping logs clean. The `bootgly project create` wizard uses it to track its phases.

A live demo is available in the [showcase](/manual/CLI/UI/Components/Timeline/showcase).

## Instance

To use the component, it is necessary to create an instance passing as parameter the instance of the `Output` component:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Timeline;

$Timeline = new Timeline(CLI->Terminal->Output);
```

## Declaring steps and advancing

Add the steps up front, `start()` to activate the first one, then `advance()` after each phase completes (optionally annotating it). Advancing past the last step finishes the flow:

```php
$Timeline->add('Resolve');
$Timeline->add('Download');
$Timeline->add('Deploy');

$Timeline->start();      // ◉ Resolve

resolve();
$Timeline->advance('12 packages'); // ✔ Resolve (12 packages) · ◉ Download

download();
$Timeline->advance();

deploy();
$Timeline->advance('v1.0.0 live'); // flow complete
```

## Failing a step

`fail()` marks the active step as failed and stops the flow — later steps stay pending:

```php
if ($error !== null) {
   $Timeline->fail('permission denied'); // ✖ Download (permission denied)

   return;
}
```

## Flows that write between steps

The in-place repaint assumes nothing else writes to the terminal between transitions. For flows that prompt or print between steps — like the project wizard — set `append` and every transition prints one plain line instead, preserving the surrounding output:

```php
$Timeline->append = true;
```

## Non-interactive output

On pipes and CI the timeline is always append-only: one `✔`/`◉`/`✖` line per transition, no connectors, no repaints — deterministic.

## Reference

### Properties

```php
public array $glyphs
```

Config. The state glyphs, keyed by `pending`, `active`, `done` and `failed`. Default: `○ ◉ ✔ ✖`.

```php
public null|int $from
```

Config. Renders steps only from this index (`null` starts at the first) — for split-frame consumers like the Wizard, which nests a content area inside the timeline. Default: `null`.

```php
public null|int $until
```

Config. Renders steps only up to this index (`null` renders all) — for split-frame consumers like the Wizard, which nests a content area inside the timeline. Default: `null`.

```php
public bool $append
```

Config. Append-only transitions (one plain line each) even on interactive terminals — for flows that write output between steps. Default: `false`.

```php
public Steps $Steps
```

Data. The `Step` collection (`$Steps->Steps` array, `$Steps->count`, `$Steps->current`). Each `Step` exposes `public string $label`, `public private(set) States $State` and `public private(set) string $note`.

```php
public private(set) bool $finished
```

Metadata (read-only). `true` after the flow completed or failed.

### States

```php
enum Bootgly\CLI\UI\Components\Timeline\States
{
   case Pending;
   case Active;
   case Done;
   case Failed;
}
```

The per-step state.

### add()

```php
public function add (string $label): Step
```

Adds a step to the timeline and returns it.

### start()

```php
public function start (): void
```

Activates the first step and paints the frame (or appends its line).

### advance()

```php
public function advance (string $note = ''): void
```

Completes the active step (annotating it with `note`) and activates the next one. Advancing past the last step finishes the flow.

### fail()

```php
public function fail (string $note = ''): void
```

Marks the active step as failed and stops the flow.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renders the timeline frame — composites (like the [Wizard](/manual/CLI/UX/Components/Wizard/overview)) grab the raw markup frame with `RETURN_OUTPUT` and own the presentation.

### Steps->insert()

```php
public function insert (string $label, int $at): Step
```

Inserts a Step at a 0-based position — later Steps shift forward; positions at or before the current Step clamp to right after it (the walked prefix is immutable).
