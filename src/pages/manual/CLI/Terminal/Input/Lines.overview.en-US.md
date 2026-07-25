# Lines

`Lines` is the multiline editor engine: one [Line](/manual/CLI/Terminal/Input/Line/overview) per row, plus the index of the row being edited. Like `Line` it is **pure state** — no stream I/O, no windowing, no rendering decisions. You own the read loop, you decide which key submits, and you render the rows.

It is what backs the [Textarea](/manual/CLI/UI/Components/Textarea/overview) and the multiline input of the [Prompt](/manual/CLI/UX/Components/Prompt/overview).

## Editing across rows

Create it, hand it whatever [`listen()`](/manual/CLI/Terminal/Input/overview) returns, and read the value back:

```php
use const Bootgly\CLI;
use Bootgly\CLI\Terminal\Input\Keystrokes;
use Bootgly\CLI\Terminal\Input\Lines;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

$Lines = new Lines;

$Input->configure(blocking: false, canonical: false, echo: false);

while (true) {
   $key = $Input->listen();

   // ? Channel closed, or the submit key — Ctrl+D here, your call
   if ($key === false || $key === Keystrokes::CTRL_D->value) {
      break;
   }
   // ? Drained
   if ($key === '') {
      usleep(20000);

      continue;
   }

   $Lines->control($key);

   // @ Repaint: one row per line, the cursor cell on the active one
   foreach ($Lines->Lines as $index => $Line) {
      $Line->width = 40;

      $Output->render(($index === $Lines->row ? $Line->render() : $Line->value) . "\n");
   }
}

$Input->configure(blocking: true, canonical: true, echo: true);

// $Lines->value === "ab\n cd"
```

Typing `ab`, Enter, ` cd` leaves `value` as `"ab\n cd"`, with `row` at `1` and `column` at `3`.

Only the **active** row renders its cursor cell — the others render their plain `value`. Setting `width` per row is what makes a long line slide instead of wrapping; leave it `null` to render the row whole.

## What it handles, and what it delegates

`Lines` owns only the keys that cross a row boundary. Everything else — including printable input — goes straight to the active `Line`, so you get its whole keymap for free.

| Key | Handled by |
|---|---|
| `↑` / `↓` | `Lines` — moves between rows, clamping the column to the target row's length |
| `←` / `→` | `Lines` at the row edges (wrapping to the previous/next row), otherwise `Line` |
| `Enter` | `Lines` — splits the row at the cursor |
| `Backspace` | `Lines` at the row start (merges into the previous row), otherwise `Line` |
| `Delete` | `Lines` at the row end (pulls the next row up), otherwise `Line` |
| `Home` / `End` / `Ctrl+A` / `Ctrl+E` / `Ctrl+U` / `Ctrl+K` / `Ctrl+W` | `Line`, on the active row |
| printable text | `Line`, inserted at the cursor |

Unhandled escape sequences never enter the value as text, so an unbound `PgUp` is simply a no-op.

## Enter breaks — submitting is yours

`Lines::control()` **always** breaks the line on Enter, and returns nothing. Which key submits is the host's policy, and that is deliberate: the Textarea submits on `Ctrl+D` while the Prompt submits on `Enter` and breaks on `Shift+Enter` — the same buffer serves both, because it never decides.

If your submit key is Enter, intercept it before handing the key over:

```php
if ($key === Keystrokes::ENTER->value) {
   $answer = $Lines->value;

   $Lines->reset();
}
else {
   $Lines->control($key);
}
```

## Loading a value

`load()` splits a value on line breaks and rebuilds the rows, leaving the cursor at the end of the last one — for a multiline default, or for restoring a history entry with its rows intact:

```php
$Lines->load("first\nsecond");

// $Lines->lines === ['first', 'second']
// $Lines->row === 1
// $Lines->column === 6
```

`reset()` returns to a single empty row.

## Reference

`Bootgly\CLI\Terminal\Input\Lines` exposes `Lines` (`array<int,Line>`, read-only — the row buffers, top to bottom, never empty) and `row` (`int`, read-only — the active row index), plus four computed read-only views: `Line` (the active row buffer), `column` (`int` — the active row cursor, in codepoints), `lines` (`array<int,string>` — the row values) and `value` (`string` — the rows joined by `\n`).

```php
public function __construct ()
```

Creates the buffer with a single empty row.

```php
public function feed (string $input): self
```

Inserts printable input at the cursor of the active row, UTF-8 aware. Control bytes are ignored. Line breaks in the input do **not** split rows — use `control()` with Enter, or `load()`.

```php
public function control (string $key): void
```

Handles an edit key. Row-crossing keys are handled here; everything else delegates to the active row, including printable input. Enter always breaks the row — which key submits is the host's policy.

```php
public function load (string $value): self
```

Loads a value into the buffer, splitting it on `\n`. The cursor lands at the end of the last row.

```php
public function reset (): self
```

Resets the buffer to a single empty row.
