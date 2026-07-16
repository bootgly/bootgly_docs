# Figlet Component

The `Figlet` component renders text as large block-drawing glyphs — banners, version splashes, scores, clocks. Glyphs come from a **named figlet font**: the builtin `shadow` font ships A-Z and 0-9 (absorbed from the retired `Header` component, which it replaces). Characters without a glyph render as spaces — the art never crashes on user input.

It is a **UI Atom** — a primitive with no dependency on other components. The framework's own `bootgly` CLI banner is this Atom. A live demo is available in the [showcase](/manual/CLI/UI/Atoms/Figlet/showcase).

## Instance

To use the component, create an instance passing the `Output` instance:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Atoms\Figlet;

$Figlet = new Figlet(CLI->Terminal->Output);
```

## Render large text

Assign the text and render. Lowercase maps to the uppercase glyphs; digits share the same font:

```php
$Figlet->text = 'Bootgly';
$Figlet->render();
```

```text
███████╗   ██████╗   ██████╗  ████████╗ ███████╗  ██╗       ██╗   ██╗
██╔═══██╗ ██╔═══██╗ ██╔═══██╗ ╚══██╔══╝ ██╔════╝  ██║       ╚██╗ ██╔╝
███████╔╝ ██║   ██║ ██║   ██║    ██║    ██║  ███╗ ██║        ╚████╔╝
██╔═══██╗ ██║   ██║ ██║   ██║    ██║    ██║   ██║ ██║         ╚██╔╝
███████╔╝ ╚██████╔╝ ╚██████╔╝    ██║    ╚██████╔╝ ████████╗    ██║
╚══════╝   ╚═════╝   ╚═════╝     ╚═╝     ╚═════╝  ╚═══════╝    ╚═╝
```

`gap` sets the columns between glyphs; `stacked` renders one glyph block per character (vertical):

```php
$Figlet->gap = '  ';
$Figlet->stacked = true;   // one block per character
```

## Fonts

The glyph set is a **named figlet font**. Register your own by mapping characters to multiline art — or point to a PHP file returning that map — and select it by name:

```php
Figlet::$Fonts['dots'] = [
   'A' => "•A•\n• •",
   'B' => "•B•\n• •"
];

$Figlet->font = 'dots';
$Figlet->render();
```

Glyphs may have different widths and heights — every glyph pads to its own width and to the font height, so columns always align. Selecting an unregistered name throws a `ValueError`.

## Reference

### Properties

```php
public static array $Fonts = ['shadow' => ...];
```

Config. Named figlet fonts — a glyph map (`char => multiline art`) or a PHP file path returning one. The builtin `shadow` covers A-Z and 0-9.

```php
public string $font = 'shadow';
```

Config. Named figlet font — resolved from the `$Fonts` registry. Unknown names throw a `ValueError` on render.

```php
public bool $stacked = false;
```

Config. Stack one glyph block per character instead of composing side by side.

```php
public string $gap = ' ';
```

Config. Columns between side-by-side glyphs.

```php
public string $text = '';
```

Data. The text to enlarge — lowercase maps to the uppercase glyphs; characters without a glyph render as spaces.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renders the glyph art. `WRITE_OUTPUT` writes to the `Output` and returns `null`; `RETURN_OUTPUT` returns the rendered string instead.
