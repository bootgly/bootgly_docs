# Line

`Line` is the single-line editor engine behind Bootgly's interactive inputs — a pure key/buffer state machine with a virtual cursor. It performs **no stream I/O**: your code owns the read loop, feeds printable bytes in, forwards control keys, and writes the rendered frame out. That purity is what makes it unit-testable and reusable — the [Question](/manual/CLI/UI/Components/Question/overview) suggestions editor, the [Textarea](/manual/CLI/UI/Components/Textarea/overview) rows and the [Prompt](/manual/CLI/UX/Prompt/overview) input line are all driven by it.

## Editing a line

Put the [Input](/manual/CLI/Terminal/Input/overview) in raw mode and pump keys into the engine — printables go to `feed()`, everything else to `control()`, and each iteration repaints with `render()`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\Terminal\Input\Line;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

$Input->configure(blocking: true, canonical: false, echo: false);

$Line = new Line;
$Line->width = 40;

while (true) {
   $Output->render("\r\e[K> {$Line->render()}");

   $key = $Input->read(16);

   // ? Control keys (arrows, Home/End, kills…) — false means Enter (submit)
   if ($Line->control($key) === false) {
      break;
   }

   // @ Printable input enters the buffer at the virtual cursor
   $Line->feed($key);
}

$Output->write("\nYou typed: {$Line->value}\n");
```

`feed()` is UTF-8 aware — it inserts complete characters at the cursor and silently ignores control bytes, so it is safe to pass it whatever `control()` did not consume. `render()` marks the cursor cell in inverse video and, when the value overflows `width`, keeps the cursor inside a sliding window with a dim `…` on each truncated edge.

The engine understands the usual line-editing vocabulary from [Keystrokes](/manual/CLI/Terminal/Input/Keystrokes/overview):

| Keys | Action |
|---|---|
| `←` / `→`, `Ctrl+B` / `Ctrl+F` | move the cursor by one character |
| `Home` / `End`, `Ctrl+A` / `Ctrl+E` | jump to the start / end |
| `Backspace`, `Delete` | erase around the cursor |
| `Ctrl+U` / `Ctrl+K` | kill to the start / end of the line |
| `Ctrl+W`, `Alt+Backspace` | chop the word before the cursor |
| `Enter` | submit — `control()` returns `false` |

## Masking secret input

Set `mask` to render one substitute character per typed character — the real value stays intact in `value`:

```php
$Line = new Line;
$Line->mask = '•';

$Line->feed('hunter2');

echo $Line->value;    // hunter2
// render() displays: •••••••
```

To start a fresh read with the same configuration, `reset()` clears the buffer and homes the cursor.

## Reference

`Bootgly\CLI\Terminal\Input\Line` exposes three properties: `width` (`null|int` — visible columns; `null` renders the whole value), `mask` (`null|string` — substitute character for secret input) and `value` (`string` — the edited buffer). The virtual cursor position is readable through `cursor` (`int`, in codepoints — read-only).

```php
public function feed (string $input): self
```

Inserts printable input at the virtual cursor, UTF-8 aware. Control characters (C0 and DEL) never enter the value — they are ignored, so the whole key read can be passed through.

```php
public function control (string $key): bool
```

Handles one edit key (raw bytes — arrows arrive as escape sequences) and reports whether editing continues: `false` on `Enter` (submit), `true` otherwise.

```php
public function render (): string
```

Returns the visible value slice with the inverse-video cursor cell. With `width` set, the slice slides to keep the cursor visible and truncated edges render a dim `…`; with `mask` set, each character renders as the mask.

```php
public function reset (): self
```

Clears the buffer and homes the virtual cursor, keeping `width` and `mask`.
