# Terminal Screen

The `Screen` component controls the terminal screen buffer: it enters and leaves the **alternate screen** (the buffer full-screen TUIs draw on, preserving the user's shell scrollback), clears it, measures the terminal size and watches **resizes** (SIGWINCH).

It is available on the Terminal facade:

```php
use const Bootgly\CLI;

$Screen = CLI->Terminal->Screen;
```

## Entering and leaving the alternate screen

```php
use const Bootgly\CLI;

$Screen = CLI->Terminal->Screen;

$Screen->open();   // switch to the alternate buffer and clear it

// ... draw your full-screen UI ...

$Screen->close();  // restore the user's shell exactly as it was
```

`open()` also registers a shutdown restore: if the process exits with the alternate buffer active — an `exit()`, an uncaught error, a signal handler — the main screen is restored anyway. Both calls are idempotent: opening an open Screen (or closing a closed one) writes nothing.

## Reacting to terminal resizes

```php
use Bootgly\CLI\Terminal;

CLI->Terminal->Screen->watch(static function (int $columns, int $lines): void {
   Terminal::$width = $columns;
   Terminal::$height = $lines;
});
```

Each resize measures the new size and forwards it to the handler — the handler decides what to update. Pass `null` to restore the default signal behavior.

## Measuring the terminal

```php
use Bootgly\CLI\Terminal\Screen;

[$columns, $lines] = Screen::measure();
```

The probe resolves the `COLUMNS` / `LINES` environment variables first (the ncurses convention), then `tput`, then falls back to 80×30. The `Terminal` facade uses this same probe to populate `Terminal::$width` / `Terminal::$height`.

---

## Reference

```php
public static function measure (): array
```

Measures the terminal size and returns it as `[columns, lines]`. Resolution order: `COLUMNS`/`LINES` environment, `tput cols`/`tput lines`, the 80×30 fallback.

```php
public function open (): self
```

Enters the alternate screen buffer and clears it. Registers a shutdown restore once, so the main screen always comes back — including `exit()` and signal paths. Idempotent.

```php
public function close (): self
```

Leaves the alternate screen buffer, restoring the main screen contents. Idempotent.

```php
public function clear (): self
```

Clears the current screen buffer and homes the cursor.

```php
public function watch (null|Closure $handler): bool
```

Watches terminal resizes (SIGWINCH): each resize measures the screen and calls `$handler(int $columns, int $lines)`. A `null` handler restores the default signal behavior. Returns `false` when process control (`pcntl`) is unavailable.
