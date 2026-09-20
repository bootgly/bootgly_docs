# Class `Table`

The `Table` class is used to create and display tables in the terminal. It was developed to be used together with the `CLI` and `Terminal` classes.

## Instance

To create an instance of the `Table` class, the following code should be used:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Table;

$Output = CLI->Terminal->Output;

$Table = new Table($Output);
```

Through the `$Table` object, it is possible to access the methods and properties of this class.

## Configuration

### Borders

It is possible to configure the borders of the table through the `$borders` property.
There are 15 different parts of table borders, and this is the default configuration — the `Table::DEFAULT_STYLE` preset the constructor assigns:

```php
$Table->borders = [
  'top'          => '═',
  'top-left'     => '╔',
  'top-mid'      => '╤',
  'top-right'    => '╗',

  'bottom'       => '═',
  'bottom-left'  => '╚',
  'bottom-mid'   => '╧',
  'bottom-right' => '╝',

  'mid'          => '─',
  'mid-left'     => '╟',
  'mid-mid'      => '┼',
  'mid-right'    => '╢',
  'middle'       => '│ ',

  'left'         => '║',
  'right'        => '║',
];
```

Assign the second preset to drop the frame entirely — every part is an empty string, so the table renders as plain space-padded columns:

```php
$Table->borders = Table::NO_BORDER_STYLE;
```

```text
Products  Quantity
Product 1 280
Product 2 112
```

Each part is a plain string, so a preset is also a starting point — override only the parts you want:

```php
$Table->borders = Table::DEFAULT_STYLE;
$Table->borders['middle'] = '│ ';
```

## Usage

### Data set

Through the `$Data` property, it is possible to set the Table Data.
A table has 3 sections — `Header`, `Body` and `Footer` — and each one receives an **array of rows** through its own `set()` method. Every row is itself an array of cells:

```php
$Table->Data->Header->set([
  ['Products', 'Quantity']
]);

$Table->Data->Body->set([
  ['Product 1', 280],
  ['Product 2', 112],
  ['Product 3', 209],
  ['@---;'],          // This is a row separator
  ['Product 4', 276],
  ['Product 5', 93],
  ['Product 6', 297],
]);

// Besides the set() method, the Data object also computes over the body — sum() here
// totals the values of column 1 and the result goes straight into the table footer
$Table->Data->Footer->set([[
  'Total:', $Table->Data->sum(column: 1)
]]);
```

A section you never set simply does not draw: a table without a footer closes right after the body, with no stray border.

### Cells

The `$Cells` object is used to configure the appearance of the table content cells.

### Setting alignment

It is possible to align the text of the cells to the left (`left`), center (`center`) or right (`right`).

Example:

```php
$Table->Cells->align('left');
```

### Rendering

Nothing is drawn until `render()` is called. It measures every column against the data, then writes the header, the body and the footer — borders included — to the `Output` the constructor received:

```php
$Table->render();
```

```text
╔═══════════╤══════════╗
║ Products  │ Quantity ║
╟───────────┼──────────╢
║ Product 1 │ 280      ║
║ Product 2 │ 112      ║
║ Product 3 │ 209      ║
╟───────────┼──────────╢
║ Product 4 │ 276      ║
║ Product 5 │ 93       ║
║ Product 6 │ 297      ║
╟───────────┼──────────╢
║ Total:    │ 1267     ║
╚═══════════╧══════════╝
```

Each call writes one complete table, so calling `render()` again prints a second table below the first. To redraw in place — the pattern the live demo uses to cycle through the three alignments — move the cursor back up and erase before rendering again:

```php
$alignments = ['left', 'center', 'right'];

foreach ($alignments as $index => $alignment) {
   $Table->Cells->align($alignment);
   $Table->render();

   // ? Erase only between frames: the last table stays on screen
   if ($index < count($alignments) - 1) {
      $Output->Cursor->up(13);   // the 13 lines the table above wrote
      $Output->Text->clear(down: true);
   }
}
```

Column widths are kept by the table and only ever grow between calls: rendering a narrower dataset through the same instance keeps the widest measurement taken so far. Build a new `Table` when the data changes shape.

Because the `Output` is injected, a table can be rendered anywhere a stream goes — a [Frame](/manual/CLI/UI/Base/Frame/overview), a file, `php://memory` for tests — and not only to the terminal:

```php
use Bootgly\CLI\Terminal\Output;

$Table = new Table(new Output('php://memory'));
$Table->render();
```

## See it live

The official Table demo runs in the [live showcase](/manual/CLI/UI/Components/Table/showcase) — real framework code on PHP 8.4 WebAssembly, in your browser, straight from this page.

## Reference

### Properties

```php
public array $borders
```

Config. The 15 border parts. Starts as `Table::DEFAULT_STYLE`; assign a preset, or override single parts.

```php
public DataTable $Data
```

Data. The `Bootgly\ADI\Table` holding the rows — `Header`, `Body` and `Footer`, plus the operations over the body.

```php
public private(set) Output $Output
```

Config (read-only). The `Terminal\Output` every border and every row is written to — the one given to the constructor.

```php
public Cells $Cells
```

Data. Cell appearance for the whole table (alignment).

```php
public Columns $Columns
```

Data. Column measurement: the autowiden strategy and the computed `Width` map.

```php
public Row $Row
```

Data. The single-row renderer `Rows` delegates to — one line of cells between the left and right borders.

```php
public Rows $Rows
```

Data. The section renderer: opens the table, draws each section and closes it.

### Border presets

```php
public const DEFAULT_STYLE
```

The double-line box-drawing frame assigned by the constructor: `═ ╔ ╤ ╗` on top, `═ ╚ ╧ ╝` at the bottom, `─ ╟ ┼ ╢` for the section separators, `│ ` between cells and `║` on both sides.

```php
public const NO_BORDER_STYLE
```

The same 15 keys, all empty strings. The table renders as space-padded columns with no frame and no separator lines — the `@---;` separator rows draw nothing.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): void
```

Renders the whole table: auto-widens the columns against the current data (`Columns->autowiden()`), then draws every non-empty section (`Rows->render()`). Output always goes to `$Table->Output`; the `$mode` parameter exists for the `Component` contract (`RETURN_OUTPUT` / `WRITE_OUTPUT`) and the returned-string mode is not implemented for `Table` yet — the return type is `void`. To capture a table, inject an `Output` over `php://memory` and read the stream.

### border()

```php
public function border (string $position, string $section): void
```

Writes one horizontal border line to the `Output`. `position` is `'top'`, `'mid'` or `'bottom'` (any other value writes nothing at all); `section` names the section the line belongs to and is recorded on `$Columns->section`. The line is built from the widths already measured in `$Columns->Width`, so it only lines up after `Columns->autowiden()` (or a previous `render()`) has run. With `NO_BORDER_STYLE` nothing is written. This is the call `Rows->render()` makes to open, separate and close the table.

### Cells->align()

```php
public function align (string $alignment): int
```

Sets — and returns — the cell alignment used by every rendered row: `'left'` (`1`, the default), `'right'` (`0`) or `'center'` (`2`). Any other value falls back to `'left'`. The stored value is readable at `$Table->Cells->alignment`.

### Columns->autowiden()

```php
public function autowiden (): bool
```

Measures every cell of every section and records the widest one per column in `$Columns->Width`, ignoring ANSI escape sequences and counting multibyte text by characters. `render()` calls it; call it yourself before using `border()` or `Row->render()` directly. Widths are kept with `max()`, so repeated calls only ever grow them. Always returns `true`.

### Columns->Autowiden

```php
public Autowiden $Autowiden
```

Config. The width strategy. `Autowiden::Based_On_Entire_Column` — one width per column across the whole table — is what the constructor assigns and what the renderer draws with.

### Columns->count()

```php
public function count (null|string $section = null): int
```

Returns how many columns were measured. `0` before the first `autowiden()`.

### Columns->Width

```php
public function set (string|int $index, int $width, null|string $section = null): void
```

Stores a width for one column, replacing whatever was measured.

```php
public function get (null|string $section = null): array
```

Returns the `[column index => width]` map the borders and the rows are drawn from.

```php
public function max (string|int $index, int $width, null|string $section = null): void
```

Stores the width only when it is greater than the one already recorded — how `autowiden()` grows a column.

```php
public function count (null|string $section = null): int
```

Returns the number of recorded columns.

### Row->render()

```php
public function render (array $row, string $section): void
```

Writes one row: the left border, each cell padded to its column width with the current alignment, the `middle` separator between cells, then the right border. A row that is exactly `['@---;']` draws a `mid` border instead — the row separator used inside a section. Cells missing from `$row` render empty.

### Rows->render()

```php
public function render (): void
```

Draws the table section by section, skipping empty ones: the first section opens with a `top` border, each following one is preceded by a `mid` border, and the last section closes with a `bottom` border. A table whose sections are all empty writes nothing at all.

### Data->Header / Body / Footer ->set()

```php
public function set (array $rows): void
```

Replaces the section's rows. Each row is an array of cells (`[['Products', 'Quantity']]` is one row of two cells). The sections are `Bootgly\ADI\Table\Rows` collections — they are also iterable and support array access, so `$Table->Data->Body[] = ['Product 7', 42];` appends a row.

### Data->sum()

```php
public function sum (int $column): false|int|float
```

Totals the numeric values of one body column — the footer total in the example above. `Bootgly\ADI\Table` offers `subtract()`, `multiply()` and `divide()` with the same `column` argument, plus `find(int $column, mixed $value): bool` to look a value up in the body.
