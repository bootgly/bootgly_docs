# Button Component

The `Button` component renders a pressable one-row pill: an icon/emoji, a label, or both — with an optional background, a hover paint that lights the background up as the pointer passes, and a fully generic press trigger (a Closure) that can drive any other component: open a Dialog, feed a Prompt, quit a loop, anything.

It is a **UI Atom** — a primitive with no dependency on other components. A live demo is available in the [showcase](/manual/CLI/UI/Atoms/Button/showcase).

## Instance

To use the component, create an instance passing the `Output` instance:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Atoms\Button;

$Button = new Button(CLI->Terminal->Output);
```

## Compose a button

A label alone renders bare — one breathing space each side, terminal colors. An icon composes before the label, and an icon alone is first-class:

```php
$Button->label = 'Docs';
$Button->render();
```

```text
 Docs 
```

```php
$Button->icon = '💾';
$Button->label = 'Save';
$Button->render();
```

```text
 💾 Save 
```

Measuring is width-aware: emoji count their real (double) column width, so the pill never misaligns.

## Style it as a pill

`style` takes any list of SGR codes and paints the button at rest — assigning a background turns the bare row into a pill:

```php
$Button->style = ['48;5;25', '97'];   // blue background, bright white text
$Button->render();
```

An empty `style` (the default) keeps the button bare — the background then only appears on hover.

## Hover

`hover()` flips the hover paint and repaints in place. The default hover codes paint a soft dark background with bright white text — on a bare button, this is what "creates the background" as the pointer passes; on a styled pill, hovering just swaps paints:

```php
$Button->hover = ['48;5;33', '97'];   // lighter blue while hovered

$Button->hover(true);    // pointer entered — hover paint
$Button->hover(false);   // pointer left — rest paint
```

The Button never arms the mouse — the host does (`Terminal\Reporting\Mouse`) and routes the SGR reports. Movement drives the hover through the `hit()` predicate:

```php
// inside the host's mouse report handler:
$Button->hover($Button->hit($column, $line));
```

An unchanged hover writes nothing, so routing every movement report is free.

## Press

`Action` is the press trigger — a Closure receiving the Button itself; its return value comes back through `press()`:

```php
$Button->Action = function (Button $Button) {
   // open a Dialog, feed a Prompt, quit a loop — anything
   return 'pressed';
};

$result = $Button->press();   // 'pressed'
```

The host maps a left press on a `hit()` (mouse) or Enter/Space on the focused button (keyboard) to `press()`:

```php
// inside the host's mouse report handler, on a left press:
if ($Button->hit($column, $line) === true) {
   $Button->press();
}
```

Demo 61 (`bootgly demo 61`) wires the full loop: movement hovers, a left click presses, Tab cycles the hovered button and Enter presses it.

## Placement

The Button implements the `Boxing` contract. Unplaced (the default), `render()` writes the row in flow with a trailing newline. Placed — `row` and `column` at 1-based screen coordinates — it repaints in place at its rectangle:

```php
$Button->row = 8;
$Button->column = 2;
$Button->render();   // paints at the rectangle, no newline
```

`width` derives from the content on render and is stored back — so a row of buttons chains naturally:

```php
$column = 2;
foreach ($Buttons as $Button) {
   $Button->row = 8;
   $Button->column = $column;
   $Button->render();

   $column += $Button->width + 2;
}
```

An explicit `width` pads shorter content and crops longer content with an ellipsis.

## Non-interactive output

On pipes and CI the render keeps the plain row with **zero escape codes**, and `hover()` never paints — there is no pointer without an interactive terminal. `decoration` is a tri-state: `null` (default) follows the TTY, `false` forces plain, `true` forces styled.

## Reference

### Properties

```php
public null|bool $decoration = null;
```

Config. SGR decoration — `null` follows the TTY, `false` forces plain, `true` forces styled.

```php
public string $icon = '';
```

Config. Icon/emoji painted before the label — `''` means none; labels stand alone.

```php
public string $label = '';
```

Config. The label — `''` means none; icon-only buttons are first-class.

```php
public array $style = [];
```

Config. SGR codes painting the button at rest — empty keeps it bare (no background, terminal colors).

```php
public array $hover = ['48;2;58;58;58', '97'];
```

Config. SGR codes painted while hovered — the default soft background is what lights a bare button up as the pointer passes.

```php
public int $row = 0;
```

Config. Screen row (1-based) — `0` keeps the button unplaced (flow rendering).

```php
public int $column = 0;
```

Config. Screen column (1-based) — `0` keeps the button unplaced.

```php
public int $width = 0;
```

Config. Columns the button occupies — `0` derives from the content on render (stored back); an explicit width pads or crops (ellipsis).

```php
public int $height = 1;
```

Config. Rows the button occupies — always `1` (a button is a one-row pill).

```php
public null|Closure $Action = null;
```

Data. The press trigger — `function (Button $Button): mixed`; its return value comes back through `press()`.

```php
public private(set) bool $hovered = false;
```

Metadata. Whether the pointer is over the button (hover paint active).

### hit()

```php
public function hit (int $column, int $line): bool
```

Checks whether a screen coordinate lands on the button's rectangle — a pure predicate: no render, no state. An unplaced button hits nothing.

### hover()

```php
public function hover (bool $over): void
```

Hovers (or leaves) the button — the hover paint repaints in place. An unchanged hover writes nothing; plain output never hovers.

### press()

```php
public function press (): mixed
```

Presses the button — fires the `Action` with the Button itself and hands its return value back; `null` without an Action.

### invalidate()

```php
public function invalidate (): void
```

Invalidates the button (Boxing member) — a no-op: there is no blitted state, every render repaints the whole row.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renders the button row. `WRITE_OUTPUT` paints in place at the rectangle when placed, or writes the row plus a newline in flow when not; `RETURN_OUTPUT` returns the raw row for the host to splice. Empty content renders nothing.
