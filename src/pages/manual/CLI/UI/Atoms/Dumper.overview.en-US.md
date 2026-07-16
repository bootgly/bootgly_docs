# Dumper Component

The `Dumper` component renders any PHP value as colorized, structured terminal output — the Rich Pretty / symfony var-dumper equivalent, with zero third-party dependencies. Scalars render as typed literals, arrays as counted trees, and objects expand through reflection with visibility sigils — safely: property get hooks are never triggered, and true cycles are guarded with a `*RECURSION*` mark.

It is a **UI Atom** — a primitive with no dependency on other components. The same ABI engine powers the framework's `dump()`/`dd()` globals and the assertion-failure output of `bootgly test`. A live demo is available in the [showcase](/manual/CLI/UI/Atoms/Dumper/showcase).

## Instance

To use the component, create an instance passing the `Output` instance:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Atoms\Dumper;

$Dumper = new Dumper(CLI->Terminal->Output);
```

## Dump a value

Assign any value and render. Arrays render as trees with a counted header, one entry per line:

```php
$Dumper->value = [
   'framework' => 'Bootgly',
   'version' => 1.0,
   'stable' => true,
   'ports' => [80, 443]
];

$Dumper->render();
```

```text
array:4 [
   'framework' => 'Bootgly'
   'version' => 1.0
   'stable' => true
   'ports' => array:2 [
      0 => 80
      1 => 443
   ]
]
```

Floats always keep their precision (`1.0`, `0.30000000000000004`, `INF`); strings are single-quoted with control characters escaped visibly (`\n`, `\033`) — injected escape codes can never repaint your terminal.

## Dump an object

Objects expand through reflection. Each property carries a visibility sigil — `+` public, `#` protected, `-` private — plus a `readonly` prefix when applicable:

```php
$Dumper->value = $User;
$Dumper->render();
```

```text
App\User {
   +name: 'Rodrigo'
   readonly +id: 7
   #email: 'r@bootgly.com'
   -hash: 'c4ff33…' (+15)
   +status: App\Status::Active = 'active'
   +manager: App\User *RECURSION*
   #token: uninitialized
}
```

The walk is side-effect free by design: hooked properties show their **raw backing value** (get hooks never run), virtual properties render a `virtual` note, uninitialized typed properties an `uninitialized` note. Private properties of parent classes are included with their declaring class as a note. Enums render inline with their backing value, closures render their `file:line` location, and `__debugInfo()` — when defined — replaces the property walk entirely.

## Caps

Three caps keep huge graphs readable. Deeper containers collapse to `…`, longer containers collapse their tail, longer strings truncate with a remaining-chars note:

```php
$Dumper->depth = 2;      // nesting levels (default 8)
$Dumper->items = 3;      // entries per container (default 100)
$Dumper->strings = 12;   // string chars (default 150)

$Dumper->render();
```

```text
array:3 [
   'hash' => 'f00dfacefeed…' (+13)
   'fibonacci' => array:7 [
      0 => 1
      1 => 1
      2 => 2
      … +4 more
   ]
   'nested' => array:1 [
      'deep' => [ … ]
   ]
]
```

## Themes

The palette is a **named dump theme**. Two builtins ship with the framework: `bootgly` (the default palette) and `plain` (colorless). Register your own by mapping theme groups to SGR color codes and select it by name:

```php
use Bootgly\ABI\Debugging\Data\Vars;

Vars\Dumper::$Themes['dracula'] = [
   Vars\Dumper::TYPE_STRING => '38;2;241;250;140',
   Vars\Dumper::TYPE_INT    => '38;2;189;147;249',
   Vars\Dumper::CLASSNAME   => '38;2;255;121;198',
   Vars\Dumper::PROPERTY    => '38;2;139;233;253',
];

$Dumper->theme = 'dracula';
$Dumper->render();
```

Values accept any SGR code — named colors (`31`), bright variants (`91`) or truecolor (`38;2;R;G;B`). Theme groups without an entry render unstyled. Selecting an unregistered name throws a `ValueError`. The available groups: `TYPE_NULL`, `TYPE_BOOL`, `TYPE_INT`, `TYPE_FLOAT`, `TYPE_STRING`, `CLASSNAME`, `PROPERTY`, `MODIFIER`, `PONTUATION`, `NOTE`.

## Non-interactive output

On pipes and CI the render keeps its structure with **zero escape codes**. `decoration` is a tri-state: `null` (default) follows the TTY, `false` forces plain, `true` forces colors.

## Reference

### Properties

```php
public null|bool $decoration = null;
```

Config. SGR decoration — `null` follows the TTY, `false` forces plain, `true` forces colors.

```php
public int $depth = 8;
```

Config. Max nesting level — deeper containers render as `…`.

```php
public int $strings = 150;
```

Config. Max string chars — longer strings truncate with a `(+N)` note.

```php
public int $items = 100;
```

Config. Max entries per container — extra entries collapse into `… +N more`.

```php
public string $theme = 'bootgly';
```

Config. Named dump theme — resolved from the public `Vars\Dumper::$Themes` registry (theme group → SGR codes; `bootgly` and `plain` builtins). Unknown names throw a `ValueError` on render.

```php
public mixed $value = null;
```

Data. The value to dump — any PHP value, including cyclic object graphs.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renders the structured dump. `WRITE_OUTPUT` writes to the `Output` and returns `null`; `RETURN_OUTPUT` returns the rendered string instead.
