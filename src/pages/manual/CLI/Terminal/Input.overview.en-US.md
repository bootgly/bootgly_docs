# Terminal Input

The `Input` class is responsible for providing methods to handle data input in the Terminal. It is used internally by the `Terminal` class, which in turn is accessed by the `CLI` class.

## Instance

To use the `Input` class, you need to access it through the `CLI` class, as shown below:

```php
use const Bootgly\CLI;

$Input = CLI->Terminal->Input;
```

## Configuration

```php
configure (bool $blocking = true, bool $canonical = true, bool $echo = true, bool $signals = true) : Input
```

The `Input` class can be configured through the `configure()` method, which receives four boolean parameters to define the terminal input settings:

- `bool $blocking`:
defines whether the input should be blocking or not;
- `bool $canonical`:
defines whether to use the canonical mode of input processing or not. In general, the canonical mode allows input to be read one line at a time. When the user presses Enter, the entire content entered is returned;
- `bool $echo`:
defines whether to display what the user types on the screen or not;
- `bool $signals`:
defines whether the terminal generates signals (`Ctrl+C` = SIGINT, ...) or not. When disabled, those keys arrive as raw bytes (`\x03`, ...) readable by the consumer.

### Blocking mode

The `blocking` mode defines whether the processing flow of the reading loop should wait for user data input before continuing or not. If the reading is blocking, the loop flow is stopped until the user has made some data input in the Terminal.

### Canonical mode

The `canonical` mode allows reading one line at a time, and this is the default configuration for most terminals. With this mode activated, when you press Enter, the entire line entered is placed on the input. However, while the line is not complete, the `read()` function will place each character in a buffer until the user presses Enter.

If the `canonical` mode is deactivated (`false`), the `read()` method will not wait until a line is sent by pressing Enter, and will place each character entered in the terminal data input, that is, it is as if the terminal input reading buffer was turned off.

### Echo mode

The `echo` mode deals with displaying what the user types on the screen. When this mode is activated (`true`), everything the user types is displayed back on the screen as they type. When this mode is turned off (`false`), what the user types is not displayed on the screen, that is, all data input is not reflected back as an `echo`.

### Extended keyboard mode

Some combinations have no legacy encoding at all: a plain terminal sends the same CR byte for `Enter`, `Shift+Enter` and `Ctrl+Enter`, so no amount of parsing can tell them apart. The `extended` property negotiates the extended keyboard protocol — kitty `CSI u` plus xterm `modifyOtherKeys` — and that negotiation is what makes those combinations reportable at all:

```php
$Input->extended = true;

$Input->configure(blocking: false, canonical: false, echo: false);
```

The property is opt-in (default `false`) and must be set **before** entering raw mode: `configure(canonical: false)` is what writes the enable sequences, and the terminal restore net disables them again on shutdown — including on `Ctrl+C`.

Turning it on never changes what existing code compares against: `listen()` normalizes every extended report back to its legacy key, so `Ctrl+A` still arrives as `\x01` and `↑` still arrives as `\e[A`. Only the combinations that have no legacy byte keep the kitty form — `Keystrokes::SHIFT_ENTER` (`\e[13;2u`) and `Keystrokes::CTRL_ENTER` (`\e[13;5u`), from [Keystrokes](/manual/CLI/Terminal/Input/Keystrokes/overview).

It stays opt-in because terminal support varies and the negotiation changes how the terminal encodes keys for the whole session. Terminals implementing one of the two protocols include kitty, ghostty, foot and WezTerm (kitty `CSI u`) and xterm (`modifyOtherKeys`). Terminals that implement neither ignore the negotiation silently — both are private-mode CSI sequences — so no capability query is needed.

## Usage

### Reading data with read()

```php
read (int $length) : string | false
```

The `read()` method is responsible for reading the data entered by the user. It receives an integer as a parameter that represents the maximum number of bytes to be read. The return value can be a string with the data entered or `false` if an error occurs in the operation.

### Reading a line with scan()

```php
public function scan (): string|false
```

The `scan()` method reads a single line from the input stream — bytes are consumed until a line terminator (`\n` or `\r`) or EOF is reached. It returns the line without the terminator, or `false` on immediate EOF. It works on TTYs and pipes, which makes it the line-reading primitive behind interactive components like [Question](/manual/CLI/UI/Components/Question/overview) and the [Form](/manual/CLI/UX/Components/Form/overview).

`scan()` also acts as the line discipline of the stream: erase keys (Backspace / Delete) edit the buffer, and on emulated terminals — where `BOOTGLY_TTY=1` is forced by the environment but the stream is not a real TTY, so no kernel echoes what you type — it self-echoes the input back as typed (whole UTF-8 characters, erase sequences and newlines). Real TTYs keep echoing in the kernel and pipes stay silent; the `Input->echo` property overrides the automatic detection.

### Reading a key with listen()

```php
public function listen (): string|false
```

The `listen()` method reads one key attempt from the stream and is what every interactive CLI component uses to read keys in raw mode. It returns `false` when the channel is closed, an empty string when the stream is drained (nothing typed yet, on non-blocking streams) and the key bytes otherwise:

```php
use const Bootgly\CLI;
use Bootgly\CLI\Terminal\Input\Keystrokes;

$Input = CLI->Terminal->Input;

$Input->configure(blocking: false, canonical: false, echo: false);

while (true) {
   $key = $Input->listen();

   // ? Channel closed
   if ($key === false) {
      break;
   }
   // ? Drained — nothing typed yet
   if ($key === '') {
      usleep(50000);

      continue;
   }
   // ? Ctrl+D finishes
   if ($key === Keystrokes::CTRL_D->value) {
      break;
   }
}

$Input->configure(blocking: true, canonical: true, echo: true);
```

Keys always arrive whole: CSI and SS3 escape sequences are read until their final byte and UTF-8 lead bytes assemble their continuation bytes. That is why sequences longer than three bytes — `Delete` (`\e[3~`), `Page Up` / `Page Down` (`\e[5~` / `\e[6~`), `Ctrl`+arrows (`\e[1;5A`, ...) — and application-mode `Home` / `End` (`\eOH` / `\eOF`) are never split across reads.

The stream should be non-blocking (see [Configuration](#configuration)) — on a blocking stream a bare `Escape` stalls the disambiguation until the next byte arrives. Extended keyboard protocol reports are normalized back to their legacy key before being returned (see [Extended keyboard mode](#extended-keyboard-mode)).

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

When `reading()` is called within a project context (i.e. `BOOTGLY_PROJECT` is defined), the process state is saved using the **project folder name** as the PID file identifier. For example, running `Demo_CLI` creates `storage/pids/Demo_CLI.json`, allowing you to use `bootgly project show Demo_CLI` and `bootgly project stop Demo_CLI` to monitor and stop the process. If no project context is available (standalone usage), it falls back to the class name.
