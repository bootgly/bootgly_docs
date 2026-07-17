# Differ Component

The `Differ` component renders the difference between two texts as colored terminal output — unified hunks by default, or side-by-side columns with line numbers and intra-line word highlight. It is powered by the framework's native diff engine (ABI `Differ`: LCS with automatic time/memory strategy selection), with zero third-party dependencies.

It is a **UI Atom** — a primitive with no dependency on other components. A live demo is available in the [showcase](/manual/CLI/UI/Atoms/Differ/showcase).

## Instance

To use the component, create an instance passing the `Output` instance:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Atoms\Differ;

$Differ = new Differ(CLI->Terminal->Output);
```

## Diff two texts

Assign the original and the new text — strings or lists of lines — and render. The default view is a unified diff with labeled headers and numbered hunks:

```php
$Differ->from = "line one\nline two\nline three\nline four\n";
$Differ->to   = "line one\nline 2\nline three\nline four\nline five\n";

$Differ->render();
```

```text
--- Original
+++ New
@@ -1,4 +1,5 @@
 line one
-line two
+line 2
 line three
 line four
+line five
```

On an interactive terminal, removed lines paint red, added lines green, hunk headers cyan and file headers bold.

## Label the sides

The header labels are configurable — useful when diffing real files or versions:

```php
$Differ->fromFile = 'a/config.php';
$Differ->toFile = 'b/config.php';
```

```text
--- a/config.php
+++ b/config.php
```

## Side-by-side view

Set `split` to render two line-numbered columns — removed lines on the left, added lines on the right, paired on the same row. Changed words inside paired lines are highlighted with a stronger background (intra-line highlight):

```php
$Differ->split = true;

$Differ->render();
```

```text
===========================================================================
 ■■ Original -> New
===========================================================================
  1 │   line one                     ║   1 │   line one
  2 │ - line two                     ║   2 │ + line 2
  3 │   line three                   ║   3 │   line three
  4 │   line four                    ║   4 │   line four
    │ ////////////////////////////// ║   5 │ + line five
```

The view width follows the terminal by default; set `width` to pin it. Lines wider than their column truncate with an ellipsis. `gutter` controls the line-number width and `highlight` toggles the intra-line word highlight.

## Context control

In the unified view, `context` sets how many unchanged lines surround each hunk — tighten it for large files:

```php
$Differ->context = 1;
```

```text
@@ -5,3 +5,3 @@
 function step5 () {}
-function step6 () {}
+function stepSix () {}
 function step7 () {}
```

## Non-interactive output

On pipes and CI the render keeps its structure with **zero escape codes**. `decoration` is a tri-state: `null` (default) follows the TTY, `false` forces plain, `true` forces colors.

## Reference

### Properties

```php
public null|bool $decoration = null;
```

Config. SGR decoration — `null` follows the TTY, `false` forces plain, `true` forces colors.

```php
public bool $split = false;
```

Config. View selector — `false` renders unified hunks, `true` renders side-by-side columns.

```php
public int $context = 3;
```

Config. Unchanged lines around each hunk (unified view).

```php
public null|int $width = null;
```

Config. View width, in columns (split view) — `null` follows the terminal width.

```php
public int $gutter = 4;
```

Config. Line-number gutter width, in digits (split view).

```php
public bool $highlight = true;
```

Config. Intra-line word highlight on paired changed lines (split view). Automatically skipped when the changed words outweigh the unchanged context.

```php
public string $fromFile = 'Original';
```

Config. Label of the original side — feeds the unified header and the split view title.

```php
public string $toFile = 'New';
```

Config. Label of the new side — feeds the unified header and the split view title.

```php
public array|string $from = '';
```

Data. The original text — a string (split on line breaks) or a list of lines.

```php
public array|string $to = '';
```

Data. The new text — a string (split on line breaks) or a list of lines.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renders the diff between the two texts. `WRITE_OUTPUT` writes to the `Output` and returns `null`; `RETURN_OUTPUT` returns the rendered string instead. Equal inputs render the labeled headers with no hunks.
