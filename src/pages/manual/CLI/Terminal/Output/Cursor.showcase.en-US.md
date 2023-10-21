# Class `Cursor`

Below are examples of using the Terminal Output `Cursor` class.

## Basic movements

Example with `up()`:

```php
$Cursor->up(lines: 2);             // Moves the cursor two lines up
$Cursor->up(lines: 1, column: 10); // Moves the cursor one line up and to column 10
```

Example with `right()`:

```php
$Cursor->right(columns: 5); // Moves the cursor five columns to the right
```

Example with `down()`:

```php
$Cursor->down(lines: 2);     // Moves the cursor two lines down
$Cursor->down(lines: 1, 10); // Moves the cursor one line down and to column 10
```

Example with `left()`:

```php
$Cursor->left(columns: 5); // Moves the cursor five columns to the left
```

## Absolute movements

Examples:

```php
$Cursor->moveTo(line: 5);             // Moves the cursor to line 5
$Cursor->moveTo(column: 10);          // Moves the cursor to column 10
$Cursor->moveTo(line: 5, column: 10); // Moves the cursor to coordinate (5, 10)
```

## Memorizing positions

Examples:

```php
$Cursor->save();    // Saves the current cursor position
```

```php
$Cursor->restore(); // Restores the last saved cursor position
```

## Reporting position

Example:

```php
$Cursor->report(); // Outputs the current cursor position

$Cursor->position; // Returns the current cursor position. [0 => row, 1 => column]
```

## Changing appearance

Examples:

```php
$Cursor->shape('block');     // Changes the cursor shape to block █
$Cursor->shape('underline'); // Changes the cursor shape to underline _
$Cursor->shape('bar');       // Changes the cursor shape to bar |
$Cursor->shape();            // Changes the cursor shape back to default
```

## Changing visibility

Examples:

```php
$Cursor->blink(true);  // Activates the blinking of the cursor
$Cursor->blink(false); // Deactivates the blinking of the cursor
```

```php
$Cursor->show(); // Makes the cursor visible
```

```php
$Cursor->hide(); // Makes the cursor invisible
```
