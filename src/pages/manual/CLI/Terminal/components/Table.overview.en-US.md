# Class `Table`

The `Table` class is used to create and display tables in the terminal. It was developed to be used together with the `CLI` and `Terminal` classes.

## Instance

To create an instance of the `Table` class, the following code should be used:

```php
use Bootgly\CLI;
use Bootgly\CLI\Terminal\components\Table\Table;

$Output = CLI::$Terminal->Output;

$Table = new Table($Output);
```

Through the `$Table` object, it is possible to access the methods and properties of this class.

## Configuration

### Borders

It is possible to configure the borders of the table through the `$borders` property.
There are 15 different parts of table borders, and this is the default configuration:

```php
$this->borders = [
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

## Usage

### Data set

Through the `$Data` property, it is possible to set the Table Data.
It allows you to add an array of data for the 3 parts of a table `header`, `body` and `footer` which are used as arguments of the `set()` method.

Examples:

```php
$Table->Data->set(header: ['Products', 'Quantity']);

$Table->Data->set(body: [
  ['Product 1', 280],
  ['Product 2', 112],
  ['Product 3', 209],
  ['@---;'],          // This is a row separator
  ['Product 4', 276],
  ['Product 5', 93],
  ['Product 6', 297],
]);

// Besides the set() method, it is also possible to use other methods that work with table data such as sum() which here is used to calculate the sum of the values of column 1 and already show the "Total" in the table footer
$Table->Data->set(footer: [
  'Total:',  $Table->Data->sum(column: 1)
]);
```

### Cells

The `$Cells` object is used to configure the appearance of the table content cells.

### Setting alignment

It is possible to align the text of the cells to the left (`left`), center (`center`) or right (`right`).

Example:

```php
$Table->Cells->align('left');
```
