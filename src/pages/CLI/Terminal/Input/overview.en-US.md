# Terminal Input

The `Input` class is responsible for providing methods to handle data input in the Terminal. It is used internally by the `Terminal` class, which in turn is accessed by the `CLI` class.

## Instance

To use the `Input` class, you need to access it through the `CLI` class, as shown below:

```php
use Bootgly\CLI;

$Input = CLI::$Terminal->Input;
```

## Settings

```php
configure (bool $blocking = true, bool $canonical = true, bool $echo = true) : Input
```

The `Input` class can be configured through the `configure()` method, which receives three boolean parameters to define the terminal input settings:

- `bool $blocking`:
defines whether the input should be blocking or not;
- `bool $canonical`:
defines whether to use the canonical mode of input processing or not. In general, the canonical mode allows input to be read one line at a time. When the user presses Enter, the entire content entered is returned;
- `bool $echo`:
defines whether to display what the user types on the screen or not.

### Blocking mode

The `blocking` mode defines whether the processing flow of the reading loop should wait for user data input before continuing or not. If the reading is blocking, the loop flow is stopped until the user has made some data input in the Terminal.

### Canonical mode

The `canonical` mode allows reading one line at a time, and this is the default configuration for most terminals. With this mode activated, when you press Enter, the entire line entered is placed on the input. However, while the line is not complete, the `read()` function will place each character in a buffer until the user presses Enter.

If the `canonical` mode is deactivated (`false`), the `read()` method will not wait until a line is sent by pressing Enter, and will place each character entered in the terminal data input, that is, it is as if the terminal input reading buffer was turned off.

### Echo mode

The `echo` mode deals with displaying what the user types on the screen. When this mode is activated (`true`), everything the user types is displayed back on the screen as they type. When this mode is turned off (`false`), what the user types is not displayed on the screen, that is, all data input is not reflected back as an `echo`.

## Usage

### Reading data with read()

```php
read (int $length) : string | false
```

The `read()` method is responsible for reading the data entered by the user. It receives an integer as a parameter that represents the maximum number of bytes to be read. The return value can be a string with the data entered or `false` if an error occurs in the operation.

### Reading data with reading()

```php
reading (\Closure $CAPI, \Closure $SAPI)
```

The `Input` class also has a method called `reading()`, which is used to interact with the user in real time.
In Bootgly if the method name is using the gerund, it means that the method implements a loop within it.

This method receives two callback functions:

- `$CAPI`, which is the input function (Client API);
- `$SAPI`, which is the output function (Server API);

The `CAPI` callback should call the `read()` function as soon as there is input data.
The `SAPI` callback should read what the client sends and process that data by displaying the content on the screen or not.

This method creates a basic local Client <-> Server interface, but it does not implement resource routing, so in Bootgly it is considered an interface only, not a node.

### The $stream data

Represents the PHP stream resource that is used by `Input` to manage user input data.

This property is used in the construction arguments of the Input class, but you don't have to worry about passing the resource in the class constructor because by default the `STDIN` resource is passed, which is the standard input of the terminal in CLI mode.
