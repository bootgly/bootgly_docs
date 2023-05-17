# Terminal Output\Text

Output\Text is a class that allows formatting text in the command line standard output (`STDOUT`), using colors, styles and modifying the displayed content. This class is used internally by the Output class to format messages before they are sent to the Terminal.

## Instance

To use the Terminal's Output\Text class, you need to access the instance through the Output class:

```php
use Bootgly\CLI;

$Output = CLI::$Terminal->Output;
$Text = $Output->Text;
```

## Settings

### Color set

A `Text\Colors` object stores which color type will be used and provides `set` and `get` methods to change or access it. You can define the color using the predefined values `DEFAULT_COLORS` or `BRIGHT_COLORS`.

```php
// Configuring settings to use bright colors in Terminal Output
$Text->Colors::Bright->set();

// Configuring settings to use default colors in Terminal Output
$Text->Colors::Default->set();

// Getting the current value of the color set definitions
$colors = $Text->Colors->get();
```

## Usage

### Coloring

```php
colorize ([ int|string $foreground = 'default' [, int|string $background = 'default' ]]) : Output
```

This method sets the color of the next texts to be displayed in the Terminal output.
The following colors are accepted by parameter:
`black`, `red`, `green`, `yellow`, `blue`, `magenta`, `cyan`, `white`, and `default` (reset to user's default Terminal color).
Furthermore, you can define custom colors by passing a number between `0` and `255`.

The numbers from 0 to 255 refer to ANSI color codes, which are used to specify colors in the terminal. These color codes are a standard convention and are supported by many different terminals.

The first 16 color codes are predefined and have specific meanings. For example, color code `0` is black, color code `1` is red, and color code `2` is green. The remaining color codes, from `16` to `255`, are customizable and can be used to create custom colors.

Each color code from `16` to `255` is composed of a combination of three values: red, green, and blue (RGB). Each value can range from `0` to `5`, and the values are combined to form the final color.

Example:

```php
$Text->Colors::Bright->set();

// Setting the color of the text to bright red with light yellow background
$Text->colorize(foreground: 'red', background: 'yellow');
```

### Styling

```php
stylize ([ string ...$styles ]) : Output
```

Applies one or more text styles to the output.
Accepts styles `bold`, `italic`, `underline`, `strike`, `blink` (to make the cursor blink), and `null` (to remove any applied styles) as parameters.

Example:

```php
// Setting the style of the text to bold only
$Text->stylize('bold');

// Setting the style of the text to italic and underline
$Text->stylize('italic', 'underline');
```

### Spacing

```php
space ([ int $n = 1 ]) : Output
```

Insert `<n>` spaces at the current cursor position, shifting any existing text to the right.
Text that goes off the right-hand side of the screen is removed.
Accepts an optional parameter to specify how many spaces to insert.

Example:

```php
// Adding five blank spaces
$Text->space(5);
```

### Deleting

```php
delete ([ ? int $characters [, ? int $lines ]]) : Output
```

Deletes `<n>` characters and/or `<n>` lines at the current cursor position.

Characters: Shifts over any characters to the right by space characters.
Lines: Deletes `<n>` lines from the buffer, starting at the line the cursor is on.

Example:

```php
// Deleting two lines
$Text->delete(lines: 2);
```

### Erasing characters

```php
erase (int $characters = 1) : Output
```

You can use the `erase` method to erase characters from the current cursor position in the terminal. The method accepts a single integer parameter, which represents the number of characters to erase.

Example:

```php
// This erases the next 10 characters to the right of the cursor.
$Text->erase(characters: 10);
```

### Inserting lines and spaces

```php
insert (? int $lines = null, ? int $spaces = null) : Output
```

You can use the `insert` method to insert lines and/or whitespace into the terminal from the current cursor position. The method takes two integer parameters:

- `lines`: the number of lines to insert below the current line.
- `spaces`: the number of blank spaces to insert at the current column.

Example:

```php
// This inserts 3 new lines below the current line and adds 5 blank spaces at the current column.
$Text->insert(lines: 3, spaces: 5);
```

### Clearing the display

```php
clear ([ bool $up = false [, bool $down = false ]]) : Output
```

You can use the `clear` method to clear one or more parts of the terminal:

If `up` is `true`: the lines above the current line will be cleared.
If `down` is `true`: the lines below the current line will be cleared.

```php
// This clears all lines above the current cursor position in the terminal.
$Text->clear(up: true);

// This clears all lines below the current cursor position in the terminal.
$Text->clear(down: true);

// This clears all lines above and below the current cursor position in the terminal.
$Text->clear(up: true, down: true);

// This also clears all lines above and below the current cursor position in the terminal.
$Text->clear();
```

### Removing characters

```php
trim ([ bool $left = false [, bool $right = false ]]) : Output
```

You can use the `trim` method to remove characters from the current line. The method takes two boolean parameters:

If `left` is `true`: all characters to the left of the cursor will be removed.
If `right` is `true`: all characters to the right of the cursor will be removed.

```php
// This removes all characters on the current line in the terminal.
$Text->trim(left: true, right: true);
```
