# Statusbar Component

The `Statusbar` component renders a single-row status bar: left segments separated by a divider, right segments aligned to the terminal edge — the Bubbles `help` footer equivalent, where keybinding hints are just segments. It was promoted from the Bootgly Console platform's App shell, which now consumes this Atom as its fixed status row.

It is a **UI Atom** — a primitive with no dependency on other components. A live demo is available in the [showcase](/manual/CLI/UI/Atoms/Statusbar/showcase).

## Instance

To use the component, create an instance passing the `Output` instance:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Atoms\Statusbar;

$Statusbar = new Statusbar(CLI->Terminal->Output);
```

## Render a bar

Left segments join with the divider; right segments align to the edge. The gap pads automatically to the terminal width:

```php
$Statusbar->left = ['Dashboard', 'main'];
$Statusbar->right = ['^P palette', '? help', 'q quit'];

$Statusbar->render();
```

```text
 Dashboard  ▏ main                    ^P palette  ? help  q quit
```

Segments are plain strings — but they may carry their own SGR colors: measuring is escape-aware, so embedded escapes never misalign the bar.

## Style

The bar paints a 256-color dark gray background with bright white text by default. `style` takes any list of SGR codes:

```php
$Statusbar->style = ['44', '97'];   // blue background, bright white text
$Statusbar->divider = ' • ';

$Statusbar->render();
```

## Positioning

`render()` writes the row (plus a newline) for linear scripts. Hosts that own the frame — a fixed last row, an embedded pane — use `RETURN_OUTPUT` and position the raw row themselves:

```php
use Bootgly\API\Component;

$row = $Statusbar->render(Component::RETURN_OUTPUT);   // no trailing newline
```

This is exactly how the Console platform's App shell composes it on the last frame row.

## Non-interactive output

On pipes and CI the render keeps its alignment with **zero escape codes** — the bar paint is skipped and embedded segment escapes are stripped. `decoration` is a tri-state: `null` (default) follows the TTY, `false` forces plain, `true` forces styled.

## Reference

### Properties

```php
public null|bool $decoration = null;
```

Config. SGR decoration — `null` follows the TTY, `false` forces plain, `true` forces styled.

```php
public array $left = [];
```

Config. Left segments, divider-separated.

```php
public array $right = [];
```

Config. Right segments, aligned to the edge.

```php
public string $divider = '  ▏ ';
```

Config. Divider between the left segments.

```php
public null|int $width = null;
```

Config. Bar width, in columns — `null` follows the terminal width.

```php
public array $style = ['48', '5', '236', '97'];
```

Config. SGR codes painting the bar (background + foreground) — any list of codes.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renders the bar row. `WRITE_OUTPUT` writes the row plus a newline to the `Output` and returns `null`; `RETURN_OUTPUT` returns the raw row (no newline) for the host to position.
