# Fieldset

`Fieldset` boxes content in a bordered frame, embedding an optional title in the top border. It is the layout block behind Bootgly's CLI help tables, the Form summary and the `bootgly test` heatmap cards — and, living in the `UI/Base` tier, any UI Component may legally mount on it.

Content is markup-aware — each line is resolved (`@#Cyan:`, `@:success:`, …) before boxing and the padding measures visible columns only — and frames are composed as plain strings, cursor-free: identical on interactive terminals, pipes and CI logs.

## Instance

The component is instantiated with the `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Base\Fieldset;

$Fieldset = new Fieldset(CLI->Terminal->Output);
```

## Boxing content

Assign a title and the content — a multi-line string, markup welcome — and render. With `width` left `null`, the box derives its inner width from the widest line:

```php
$Fieldset->title = 'Usage';
$Fieldset->content = "bootgly test @#Black:[suite] [case]@;\nbootgly test --view=heatmap";

$Fieldset->render();
```

```text
┌ Usage ──────────────────────┐
│ bootgly test [suite] [case] │
│ bootgly test --view=heatmap │
└─────────────────────────────┘
```

## Separators

A content line consisting of `@---;` renders as a horizontal separator row:

```php
$Fieldset->content = "First section\n@---;\nSecond section";
```

## Fixed width and custom borders

`width` pins the inner columns (content rows are padded to it), `borders` swaps the glyphs and `color` sets the border markup color:

```php
$Fieldset->width = 60;
$Fieldset->borders = [
   'top-left'     => '╭',
   'top-right'    => '╮',
   'bottom-left'  => '╰',
   'bottom-right' => '╯',
] + Fieldset::DEFAULT_BORDERS;
```

## Embedding — frames as strings

`RETURN_OUTPUT` returns the raw frame instead of writing it, so hosts can position, compose or repaint it. Any component rendered to a string works as content — the test runner repaints a Fieldset live around a Charts `Meter` and a `Heatmap` this way:

```php
$frame = (string) $Fieldset->render(Fieldset::RETURN_OUTPUT);
```

Live demos are available in the [showcase](/manual/CLI/UI/Base/Fieldset/showcase).

## Reference

```php
public null|int $width;
```

Inner content columns. `null` (default) derives from the widest resolved content/title line — the derived value is stored back on render.

```php
public string $color;
```

Border color, as a markup token. Default `'@#Black:'` (bright black).

```php
public array $borders;
```

Border glyph map — `top`, `top-left`, `top-right`, `mid`, `left`, `right`, `bottom`, `bottom-left`, `bottom-right`. Defaults to `Fieldset::DEFAULT_BORDERS` (square corners).

```php
public null|string $title;
```

Title embedded in the top border, wrapped in one space each side. Escaped and resolved on assignment. Default `null`.

```php
public null|string $content;
```

The boxed content — markup lines separated by `\n`; a line of `@---;` renders as a separator row. Default `null`.

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Boxes the content. `WRITE_OUTPUT` writes the frame to the `Output`; `RETURN_OUTPUT` returns the raw frame string instead.
