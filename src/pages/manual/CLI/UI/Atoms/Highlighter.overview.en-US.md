# Highlighter Component

The `Highlighter` component paints PHP source with syntax colors in the terminal, using the framework's native tokenizer (`token_get_all`, via the ABI `Tokens\Highlighter`) — zero third-party dependencies. It renders an optional line-number gutter, can mark a line and window the excerpt around it (the exact look of the framework's error output), and degrades to escape-free plain text on non-interactive output.

It is a **UI Atom** — a primitive with no dependency on other components. Markdown's fenced `php` blocks use the same ABI engine underneath. A live demo is available in the [showcase](/manual/CLI/UI/Atoms/Highlighter/showcase).

## Instance

To use the component, create an instance passing the `Output` instance:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Atoms\Highlighter;

$Highlighter = new Highlighter(CLI->Terminal->Output);
```

## Highlight a snippet

Sources without a `<?php` tag are colorized as pure PHP. The line-number gutter renders by default:

```php
$Highlighter->source = <<<'PHP'
$greeting = 'Hello, Bootgly!';
echo "{$greeting}";
PHP;

$Highlighter->render();
```

Set `gutter` to `false` for bare colored lines (snippets, embeds):

```php
$Highlighter->gutter = false;
$Highlighter->render();
```

## Mark a line

`mark` flags one line with a `▶` marker and windows the excerpt around it (`before`/`after` lines, 4 + 4 by default) — the same rendering the framework uses for error excerpts:

```php
$Highlighter->mark = 6;      // line to mark
$Highlighter->before = 2;    // window lines before
$Highlighter->after = 2;     // window lines after

$Highlighter->render();
```

## Non-interactive output

On pipes and CI the render keeps its structure (numbers, divider, marker) with **zero escape codes**. `decoration` is a tri-state: `null` (default) follows the TTY, `false` forces plain, `true` forces colors. Without the tokenizer extension the render degrades to the verbatim source.

## Reference

### Properties

```php
public null|bool $decoration = null;
```

Config. SGR decoration — `null` follows the TTY, `false` forces plain, `true` forces colors.

```php
public bool $gutter = true;
```

Config. Renders the gutter (line numbers, divider, line marker).

```php
public null|int $mark = null;
```

Config. Line to mark — windows the output around it.

```php
public int $before = 4;
```

Config. Window lines before the marked line.

```php
public int $after = 4;
```

Config. Window lines after the marked line.

```php
public string $source = '';
```

Data. The PHP source — sources without an open tag are colorized as pure PHP.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Paints the highlighted source. `WRITE_OUTPUT` writes to the `Output` and returns `null`; `RETURN_OUTPUT` returns the rendered string instead.
