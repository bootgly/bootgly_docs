# Table dataset

`Bootgly\ADI\Table` holds the rows of a table — a header, a body and a footer — and computes over
the cells of one body column with `sum()`, `subtract()`, `multiply()` and `divide()`, or looks a
value up in it with `find()`. It draws nothing: the CLI
**[Table](/manual/CLI/UI/Components/Table/overview/)** component renders one, and its
`$Table->Data` is a `Bootgly\ADI\Table`.

Despite the name, it is not a database table: it runs no SQL and keeps the rows you give it in
memory. Database tables are created with the **[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/)**
and read with the **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)**.

## Build a dataset

```php
use Bootgly\ADI\Table;

$Table = new Table;

$Table->Header->set([
   ['Product', 'Quantity'],
]);
$Table->Body->set([
   ['Keyboard', 120],
   ['Mouse', 85],
   ['Monitor', 42],
]);
$Table->Footer->set([
   ['Total', $Table->sum(column: 1)],
]);

$Table->Footer[0]; // ['Total', 247]
```

- `Header`, `Body` and `Footer` are the three sections. Each one takes a list of rows through
  `set()`, which replaces the rows the section had; a section you never set stays empty.
- A row is a list of cells, and a column is a cell's position in its row: `0` for the first cell,
  `1` for the second. Every operation takes that position as `column`. Rows need not have the same
  number of cells.
- Cells are stored as given — `'25'` stays a string and `25` an integer — with nothing cast,
  trimmed or checked.
- The operations read the body only. The header and the footer are what a renderer prints around
  it, so a total is computed from the body and then written into the footer, as above.

The examples below start from this dataset, unless they build their own `Table`.

Rows keyed by name, such as the rows of a SQL **[Result](/manual/ADI/Database/overview/#result)**,
have no cell at position `1`, so the operations find nothing there. Turn them into lists first:

```php
$Keyed = new Table;

$rows = [
   ['product' => 'Keyboard', 'quantity' => 120],
   ['product' => 'Mouse', 'quantity' => 85],
];

$Keyed->Body->set($rows);
$Keyed->sum(column: 1); // 0

$Keyed->Body->set(array_map(array_values(...), $rows));
$Keyed->sum(column: 1); // 205
```

## Read and change rows

Each section also reads and writes like an array of rows:

```php
$Table->Body[] = ['Webcam', 7];  // appends row 3
$Table->Body[1] = ['Mouse', 90]; // replaces row 1
$Table->Body[1];                 // ['Mouse', 90]
$Table->Body[9];                 // null: there is no row 9
isset($Table->Body[3]);          // true
unset($Table->Body[0]);          // removes row 0

foreach ($Table->Body as $index => $row) {
   echo "{$index}: {$row[0]}\n";
}
```

```text
1: Mouse
2: Monitor
3: Webcam
```

- Reading a row that does not exist gives `null`, with no warning.
- `unset()` leaves a gap: the other rows keep their keys, and `[]` never reuses a removed key — it
  appends one past the highest key the section has used.
- The rows themselves are the public array `$Table->Body->rows`. Count them there: a section is not
  countable, and `count($Table->Body)` throws a `TypeError`.

### One loop at a time

When a loop over the body calls an operation, loop over the rows array — here the dataset's three
rows, set again after the changes above:

```php
$Table->Body->set([
   ['Keyboard', 120],
   ['Mouse', 85],
   ['Monitor', 42],
]);

foreach ($Table->Body->rows as $row) {
   echo $row[0], ': ', round(100 * $row[1] / $Table->sum(column: 1)), "%\n";
}
```

```text
Keyboard: 49%
Mouse: 34%
Monitor: 17%
```

A section walks its rows with the internal pointer of its `rows` array — the one PHP's `current()`
and `next()` move — so every walk over one section shares a single position. A `foreach` nested in
another over the same section stops the outer one after its first row, as it does over any PHP
`Iterator`, an `ArrayIterator` included. A `foreach` over `$Table->Body->rows` does not use that
pointer: PHP gives every loop over an array a position of its own.

For now, the operations walk the body through that pointer too. Written as
`foreach ($Table->Body as $row)`, the loop above prints `Keyboard: 49%` and stops, because `sum()`
leaves the pointer past the last row. A `find()` that matches a row before the last one does worse:
it sends the loop back to the row after the match every time, and the loop never ends.

## Compute over a column

```php
$Table->sum(column: 1);      // 247
$Table->subtract(column: 1); // -247
$Table->multiply(column: 1); // 428400
```

- Each one reads that column in the body only and skips a cell that is not a number — `'n/a'`,
  `''`, `null`, a boolean — with one exception for now, in `sum()`
  ([When the total is false](#when-the-total-is-false)). A numeric string such as `'10'` or `'2.5'`
  counts as its number.
- `sum()` adds the cells. `subtract()` subtracts every cell from `0`, so it returns the sum negated,
  not the first cell minus the others. `multiply()` multiplies them.
- The result is an `int` when every cell counted is an integer or an integer string, and a `float`
  otherwise.
- When no cell of the column is a number — an empty body, a column no row reaches — `subtract()`
  returns `0` and `multiply()` returns `1`. `sum()` returns `0` for the empty body and the column no
  row reaches, and `false` for a column of text. A negative column returns `0` from all three.

### When the total is false

For now, `sum()` skips a cell that is not a number only while its running total is above zero. A
text cell it meets before that — on the first row, or while the rows added so far total zero or
less — makes it return `false` and drop the total, so the same cells give a total or `false`
depending on their order:

```php
$Stock = new Table;

$Stock->Body->set([
   ['Keyboard', 'n/a'],
   ['Mouse', 85],
]);
$Stock->sum(column: 1); // false

$Stock->Body->set([
   ['Mouse', 85],
   ['Keyboard', 'n/a'],
]);
$Stock->sum(column: 1); // 85
```

`subtract()` and `multiply()` skip the text in both orders, and `sum()` over a column of text, such
as the product names above, always gives `false`. Check the result before you write it anywhere —
the CLI renderer prints `false` as an empty cell:

```php
$total = $Table->sum(column: 1);

if ($total === false) {
   // column 1 holds a cell that is not a number
}
```

### Division

For now, `divide()` does not divide. It starts from no value, which PHP's arithmetic reads as `0`,
and `0` divided by anything stays `0`:

```php
$Ratio = new Table;

$Ratio->Body->set([
   ['A', 100],
   ['B', 5],
]);
$Ratio->divide(column: 1); // 0.0, not 20.0
```

It returns `0` (as `0.0` or `-0.0`) for any column with numbers, `false` when one of them is `0` — the division by
zero throws, and the error is turned into `false` — and `null` when the column holds no number.
Compute a quotient from `$Table->Body->rows` until it is fixed.

## Look a value up

```php
$Table->find(column: 0, value: 'Mouse');   // true
$Table->find(column: 1, value: 85);        // true
$Table->find(column: 1, value: '85');      // false: the cell holds the integer 85
$Table->find(column: 0, value: 'Product'); // false: the header is not searched
```

`find()` tells whether a body row holds exactly `value` in that column. It compares with `===`, so
the type has to match as well — `85` is neither `'85'` nor `85.0` — and so does the case of a
string. It returns a boolean, not the row or its key.

## Read every section at once

```php
foreach ($Table->rows as $section => $rows) {
   echo $section, ': ', count($rows), "\n";
}
```

```text
Header: 1
Body: 3
Footer: 1
```

`$Table->rows` puts the rows of the three sections in one array, keyed by the names of the cases of
the `Section` enum — `'Header'`, `'Body'` and `'Footer'` — not by their lowercase values, so
`$Table->rows['body']` is an undefined key. It is read-only: change rows through the sections. The
CLI renderer draws the table from it.

## Render it

The CLI Table component creates its dataset in `$Table->Data`. Fill that one, or build a dataset
elsewhere and hand it over:

```php
use const Bootgly\CLI;
use Bootgly\ADI\Table as DataTable;
use Bootgly\CLI\UI\Components\Table;

$Data = new DataTable;
$Data->Header->set([['Product', 'Quantity']]);
$Data->Body->set([
   ['Keyboard', 120],
   ['Mouse', 85],
]);
$Data->Footer->set([['Total', $Data->sum(column: 1)]]);

$Table = new Table(CLI->Terminal->Output);
$Table->Data = $Data;
$Table->render();
```

```text
╔══════════╤══════════╗
║ Product  │ Quantity ║
╟──────────┼──────────╢
║ Keyboard │ 120      ║
║ Mouse    │ 85       ║
╟──────────┼──────────╢
║ Total    │ 205      ║
╚══════════╧══════════╝
```

Borders, alignment, the `['@---;']` separator row and the rest of the drawing are on the CLI
**[Table](/manual/CLI/UI/Components/Table/overview/)** page. To the dataset, a separator is a row
with one cell.

## Reference

### Table

`Bootgly\ADI\Table`.

```php
__construct ()
```

Creates an empty dataset: the three sections, with no rows.

```php
public Header $Header
```

The header rows, a `Bootgly\ADI\Table\Section\Header`. No operation reads them.

```php
public Body $Body
```

The body rows, a `Bootgly\ADI\Table\Section\Body`: the rows every operation reads.

```php
public Footer $Footer
```

The footer rows, a `Bootgly\ADI\Table\Section\Footer`. No operation reads them.

```php
public array $rows { get; }
```

The rows of the three sections in one array (`array<string,array>`), keyed `'Header'`, `'Body'`
and `'Footer'`. Read-only: assigning it throws `Error` with
`Property Bootgly\ADI\Table::$rows is read-only`.

```php
public null|array $columns
```

Not used for now: the constructor sets it to `null`, and nothing reads it.

```php
sum (int $column): false|int|float
```

Adds the cells of `$column` in the body. Returns `0` when the body is empty, when no row reaches
`$column` and when `$column` is negative. For now it skips a cell that is not a number only while
the running total is above zero: a text cell met before that returns `false`, and a `null` or
boolean cell met there is added as `0`, or `1` for `true` (see
[When the total is false](#when-the-total-is-false)).

```php
subtract (int $column): false|int|float
```

Subtracts every numeric cell of `$column` in the body from `0` — the sum, negated — and skips the
cells that are not numbers. Returns `0` when no cell is a number and when `$column` is negative,
and `false` if the arithmetic throws.

```php
multiply (int $column): int|float
```

Multiplies the numeric cells of `$column` in the body and skips the cells that are not numbers.
Returns `1` when no cell is a number, `0` when `$column` is negative, and `0` rather than `false`
if the arithmetic throws.

```php
divide (int $column): false|null|float
```

Meant to divide the numeric cells of `$column` in body order. For now it returns `0.0` or `-0.0` —
the sign depends on the signs of the cells — for any column with numbers, `false` when one of them
is `0`, `null` when none is a number, and `0.0` when `$column` is negative (see
[Division](#division)).

```php
find (int $column, mixed $value): bool
```

Returns `true` when a body row holds a cell at `$column` identical (`===`) to `$value`, and `false`
otherwise. The header and the footer are not searched.

### Rows

`Bootgly\ADI\Table\Rows`, the base of the three sections. It implements `ArrayAccess` and
`Iterator`, whose methods below back the array syntax and `foreach`.

```php
public array $rows = []
```

The rows of the section, keys included, as `set()` or the array syntax stored them. Public and
writable.

```php
set (array $rows): void
```

Replaces every row of the section with `$rows`, keeping their keys and storing them as given.

```php
offsetExists ($offset): bool
```

Backs `isset($Section[$offset])`: `true` when the row exists and is not `null`.

```php
offsetGet ($offset): mixed
```

Backs `$Section[$offset]`: the row, or `null`, without a warning, when there is none.

```php
offsetSet ($offset, $value): void
```

Backs `$Section[] = $row`, which appends, and `$Section[$offset] = $row`, which writes that key.

```php
offsetUnset ($offset): void
```

Backs `unset($Section[$offset])`. The other rows keep their keys.

```php
current (): mixed
```

The row at the internal pointer of `$rows`, or `false` past the last row.

```php
key (): mixed
```

The key at the internal pointer of `$rows`, or `null` past the last row.

```php
next (): void
```

Moves the internal pointer of `$rows` to the next row.

```php
rewind (): void
```

Moves the internal pointer of `$rows` back to the first row. Every `foreach` over the section and
every operation starts here, which is why two of them cannot walk one section at once (see
[One loop at a time](#one-loop-at-a-time)).

```php
valid (): bool
```

`true` while the internal pointer of `$rows` is on a row.

### Header, Body and Footer

`Bootgly\ADI\Table\Section\Header`, `Bootgly\ADI\Table\Section\Body` and
`Bootgly\ADI\Table\Section\Footer` extend `Rows` and add nothing: they only tell the three sections
apart.

### Section

```php
enum Section: string
{
   case Header = 'header';
   case Body = 'body';
   case Footer = 'footer';
}
```

`Bootgly\ADI\Table\Section`. `$Table->rows` is keyed by its case names; nothing reads the string
values for now.
