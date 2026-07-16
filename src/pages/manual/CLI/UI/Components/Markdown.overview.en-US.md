# Markdown

Render **markdown right in the terminal** — like Rich or Glow, with zero third-party dependencies. Headings, wrapped paragraphs, emphasis, inline and fenced code, quotes, nested lists (including tasks), aligned tables, links and rules — all painted with raw SGR styling. On non-interactive output (pipes, CI) the render degrades to plain structured text with **zero escape codes**.

## Render a document

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Markdown;

$Output = CLI->Terminal->Output;

$Markdown = new Markdown($Output);
$Markdown->source = <<<'MARKDOWN'
# Hello

Render **markdown** with *styles*, `code` and [links](https://bootgly.com).

- Wrapped paragraphs
- [x] Task lists

| Feature | Status |
|:--------|-------:|
| Tables  | done   |
MARKDOWN;

$Markdown->render();
```

`render()` parses the source and paints it wrapped to the terminal width. Try demo `54` for a full-featured document.

## Width and decoration

```php
$Markdown->width = 60;         // columns — null resolves the terminal width
$Markdown->decoration = true;  // force SGR styling even on pipes
$Markdown->render();
```

`decoration` is a tri-state: `null` (default) follows the TTY — interactive terminals get styles, pipes get plain text; `false` forces plain; `true` forces styles (useful for deterministic tests and pre-rendered buffers).

## Customize the palette

Every element key in `$styles` maps to a list of SGR codes (the `Formattable` constants work directly):

```php
$Markdown->styles['h1'] = ['1', '35'];    // bold magenta headings
$Markdown->styles['code'] = ['96'];       // bright cyan inline code
```

Keys: `h1`-`h6`, `bold`, `italic`, `strike`, `code`, `fence`, `source`, `link`, `url`, `image`, `quote`, `marker`, `checked`, `unchecked`, `rule`, `header`, `border`.

## Safety

The source is treated as **untrusted text**: raw control bytes (including `ESC`) are stripped, so markdown can never inject cursor movements or stray styling into your terminal — and content never passes through the Template markup engine.

## Notes

- Supported subset: ATX headings, paragraphs (hard breaks with two trailing spaces), fenced code blocks, blockquotes (nested + lazy), tight nested lists + `- [x]` tasks, GFM tables with `:---:` alignments, horizontal rules, emphasis/code/links/images.
- Out of scope (v1): setext headings, indented code blocks, reference links, autolinks, raw HTML (kept as literal text) and loose lists.
- Fenced code renders verbatim and dimmed — syntax highlighting is a planned follow-up.
- The parser is reusable on its own: `Bootgly\ABI\Data\__String\Markdown::parse()` returns a pure AST (`Node` trees) with no styling attached.

## Reference

```php
public function __construct (Output $Output)
```

Creates the renderer bound to an `Output`.

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Parses `$source` and paints it. `WRITE_OUTPUT` writes to the `Output` and returns `null`; `RETURN_OUTPUT` returns the rendered string instead.

```php
public string $source = '';
```

The markdown source to render.

```php
public null|int $width = null;
```

Render width in columns — `null` resolves the terminal width (floor of 20).

```php
public null|bool $decoration = null;
```

SGR decoration — `null` follows the TTY, `false` forces plain structured text, `true` forces styling.

```php
public array $styles = [...];
```

SGR code lists per element key — override any entry to theme the render.
