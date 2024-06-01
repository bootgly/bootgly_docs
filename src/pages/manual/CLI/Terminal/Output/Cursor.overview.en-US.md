# Class `Cursor`

The Cursor class is responsible for manipulating and moving the cursor on the terminal screen.

## Instance

To use the Cursor class, it is necessary to obtain an instance through the Output class. To do this, simply access the `$Output` property of the Terminal class:

```php
use const Bootgly\CLI;

$Output = CLI->Terminal->Output;

$Cursor = $Output->Cursor; // Cursor class instance
```

## Settings

The Cursor class has no specific settings beyond those already performed by the Output class.

## Usage

### Basic movements

```php
up (int $lines, ? int $column = null) : self
```

Moves the cursor up the specified number of lines. If an optional column value is passed, the cursor is positioned in that column after moving up the lines.

```php
right (int $columns) : self
```

Moves the cursor to the right the specified number of columns.

```php
down (int $lines, ? int $column = null) : self
```

Moves the cursor down the specified number of lines. If an optional column value is passed, the cursor is positioned in that column after moving down the lines.

```php
left (int $columns) : self
```

Moves the cursor to the left the specified number of columns.

### Absolute movements

```php
moveTo (? int $line = null, ? int $column = null) : self
```

Moves the cursor to an absolute position on the terminal screen. If only the line is informed, the cursor moves only on this line. If only the column is informed, the cursor moves only on this column. If both are informed, the cursor moves to the specified coordinate.

### Memorizing positions

```php
save () : self
```

Saves the current position of the cursor to be retrieved later through the `restore()` method.

```php
restore () : self
```

Restores the previously saved cursor position through the `save()` method.

### Reporting position

```php
report () : self
```

Outputs the current position of the cursor. It is possible to know the current position of the cursor through the `position` property.

### Changing appearance

```php
shape (? string $style = '@user') : self
```

Changes the cursor format. Available styles are: "block" (block), "underline" (underlined) and "bar" (little bar).

### Changing visibility

```php
blink (bool $status) : self
```

Enables or disables the cursor's intermittent movement.

```php
show () : self
```

Makes the cursor visible.

```php
hide () : self
```

Makes the cursor invisible.
