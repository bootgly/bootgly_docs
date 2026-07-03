# Terminal Reporting

Reporting is the part of the Terminal that makes the terminal *talk back*. A reporter asks the terminal emulator to start encoding events — mouse activity, for example — as escape sequences on the input stream, so your PHP code can react to them in real time.

Every reporter follows the same contract: it is built from the Terminal's `Input` and `Output`, and it is switched on and off with `report()`.

## Turning a reporter on and off

The first (and currently only) built-in reporter is the [Mouse](/manual/CLI/Terminal/Reporting/Mouse/overview) reporter, available directly on the Terminal:

```php
use const Bootgly\CLI;

$Mouse = CLI->Terminal->Mouse;

$Mouse->report(true);   // terminal starts reporting mouse events on stdin
// ... read and decode events ...
$Mouse->report(false);  // terminal back to normal
```

Higher-level helpers like `Mouse->reporting()` wrap this cycle for you: they enable reporting, decode each event into a [Mousestrokes](/manual/CLI/Terminal/Input/Mousestrokes/overview) case, invoke your callback and restore the terminal when the callback returns `false`.

## See it live

The [Mouse Reporting showcase](/manual/CLI/Terminal/Reporting/Mouse/showcase) runs the real reporter on PHP 8.4 WebAssembly — move, click and scroll over the terminal and watch each event be decoded by PHP.

## Reference

Reporters implement the `Bootgly\CLI\Terminal\Reporting` interface:

```php
public function __construct (Input &$Input, Output &$Output)
```

A reporter is bound to the Terminal's `Input` (where the terminal writes the encoded events) and `Output` (where the reporter writes the enabling/disabling escape sequences).

```php
public function report (bool $enabled): void
```

Asks the terminal emulator to start (`true`) or stop (`false`) reporting the events this reporter handles. While enabled, the events arrive interleaved with regular keystrokes on the input stream.
