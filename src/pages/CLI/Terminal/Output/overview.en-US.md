# Output Class

The `Output` class is responsible for handling data output to the Terminal. Through it, we can write colored and formatted texts, position the cursor on a certain line and column, expand or contract lines in the Terminal, among other functionalities.

## Instance

To use the instance correctly, it is necessary to access it through the `CLI` class:

```php
use Bootgly\CLI;

$Output = CLI::$Terminal->Output;
```

## Configuration

Here are the main properties of the `Output` class.

### wait property

Indicates the time to wait after each write with the `write()` method. By default, the value is `-1` (no delay). If you want to add a delay, you can change it to another value in microseconds.

```php
// Sets the wait time between each write with write() to 1000 microseconds
$Output->wait = 1000;
```

### waiting property

Indicates the time to wait between each character written to the Terminal Output when using the `reading()` method. By default, the value is `30000` (30 milliseconds).

## Usage

Here are the main methods of the `Output` class.

### Write to output

```php
write (string $data, int $times = 1) : self
```

This method writes the text provided in the first parameter "$data" to the Terminal. If the second parameter "$times" is defined, it will repeat the writing "n" times.

### Writing to output

```php
writing (string $data) : self
```

This method writes one character at a time from the text provided in the "$data" parameter, adding a wait defined by the "$waiting" property between each written character. It is a way of writing animatedly to the Terminal output.

### Append string to output

```php
append (string $data) : self
```

This method is similar to 'write', but adds a line break at the end of the written string.

### Clear output

```php
clear() : true
```

This method clears the text from the entire Terminal output.

### Escape to output

```php
escape (string $data) : self
```

This method precedes the data passed as an argument with the ANSI escape code `\e[`.

### Metaescape

```php
metaescape (string $data) : self
```

This method uses `escapeshellcmd()` on the text provided in the "$data" parameter.

### Metaencode

```php
metaencode (string $data) : self
```

This method transforms the passed value into an already encoded JSON, sending the JSON string to the Terminal output.

### Render

```php
render (string $data) : self
```

This method executes the static `render()` method of the `Escaped` class and sends the result to the Terminal. It is used with template tokens for escaped codes.

Example:

```php
$Output->render('@#green: This text will be presented by the Terminal in green color.');
```
