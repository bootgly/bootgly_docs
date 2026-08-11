# Region

`Region` is an [Output](/manual/CLI/Terminal/Output/overview) that writes **inside** a host area: every row it emits carries a painted left gutter and is shifted right by the gutter width. Components render through it exactly as they always do — a `\n` here, a `Cursor->up()` there, a `Text->clear()` to repaint — and land nested inside the region without a single line of change, never aware they are embedded.

The [Wizard](/manual/CLI/UX/Components/Wizard/overview) is built on it: each step's content renders behind the `│` guide of the timeline, between the active step and the upcoming ones.

## Nesting a component

Three moves. The host paints the area and parks the cursor at the region column, the `Region` wraps the host's stream, and the component is constructed with the `Region` instead of the host `Output`:

```php
use const Bootgly\CLI;
use Bootgly\ABI\Templates\Template\Escaped;
use Bootgly\CLI\Terminal;
use Bootgly\CLI\Terminal\Output\Region;
use Bootgly\CLI\UI\Components\Textbox;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

// ! The gutter: a painted guide plus the breathing space after it
$gutter = Escaped::render('@#Black:│@;') . '  ';

// @ The host paints the area and anchors the cursor at the region column
$Output->write("Host\n");
$Output->write(str_repeat("{$gutter}\n", 4));
$Output->Cursor->up(3, column: 1);
$Output->Cursor->moveTo(column: 4);

// @ The region shares the host stream — 3 columns of gutter
$Region = new Region($Output->stream, $gutter, 3);

Terminal::$width -= 3;

try {
   $Textbox = new Textbox($Input, $Region);
   $Textbox->prompt = 'Project name';
   $Textbox->default = 'App';
   $Textbox->border = '';

   $answer = $Textbox->ask();
}
finally {
   Terminal::$width += 3;
}
```

The [Textbox](/manual/CLI/UI/Components/Textbox/overview) renders nested, guide and all:

```
Host
│
│  ❯ Project name: MyApp
│
```

The framed editor shows only what was typed — the `default` never appears on the
line; it is what `ask()` returns when the answer comes back empty.

The first row is the host's job: the region injects the gutter **after** each line break, never before the first byte. So the host paints the row the component starts on and leaves the cursor at the region column (`moveTo(column: 4)` above) — every row from the first `\n` onwards is the region's.

## What gets translated

`write()`, `render()` and `escape()` all funnel through the same translation. Four sequences are rewritten as they pass:

| The component emits | The region writes |
|---|---|
| `\n`, `\r\n`, `\r` | the break, then the gutter — the row re-enters after the guide |
| `CSI n F` (previous line) | `CSI n A` + `CSI <column> G` — lands on the region column, not on column 1 |
| `CSI n G` (column absolute) | the same move shifted right by `offset` |
| `CSI 2 K` (erase line) | the erase, then the gutter repainted |

Everything else — colors, `CSI n A`/`B`/`C`/`D`, alternate screens — passes through untouched.

## Growing past the reserved rows

A host that paints something **below** the region — the Wizard's upcoming steps, for one — reserves a number of rows for the content between them. Declare how many with the fourth constructor argument, and content taller than that makes the region **grow** instead of overwriting what follows:

```php
// @ The host reserved 3 rows below the region's first one
$Region = new Region($Output->stream, $gutter, 3, 3);
```

The region tracks its current row as the line breaks pass through it. On the break that would step past the last reserved row, it emits `CSI L` (insert line) right after the break: the terminal opens a fresh row there and pushes everything the host painted below one row further down, instead of the region writing over it. The reserve grows by one at the same time, so the next overflowing row repeats the move.

With `rows` left at its `0` default, growth is off — the region never touches what follows it, and content taller than the host's area simply overwrites it.

**The count only sees line breaks.** A row *wider* than the region wraps in the terminal into a second physical row the region never saw: the growth stays one row short and everything below drifts up. Components rendered inside a region must crop their output to the terminal width — the [Alert](/manual/CLI/UI/Components/Alert/overview) crops its message for exactly this reason — and that width must be the narrowed one.

## Width inside a region

A region is narrower than the terminal by its `offset`. Components that fit their output to `Terminal::$width` — [Select](/manual/CLI/UI/Components/Select/overview), [Textarea](/manual/CLI/UI/Components/Textarea/overview), [Tree](/manual/CLI/UI/Components/Tree/overview) — must see the narrowed width, otherwise their rows wrap. And a wrapped row is fatal to a nested repaint: `Cursor->up()` and `Text->clear(lines: N)` count **logical** lines, so one row spilling into two physical rows drifts everything below it.

Shrink the width around the nested render and always restore it (a `finally`, as above): components read `Terminal::$width` when they are constructed, so build them inside the shrunk window.

## Caveats

Anything the terminal writes on its own bypasses the translation — most notably the kernel echo of typed characters in canonical mode, which the terminal prints at the physical column, not through your stream. Bootgly's UI editors read raw input and paint the echo themselves, so they are unaffected; pre-painting the region rows (as the host does above) covers the rest.

The region shares the host stream rather than buffering: writes reach the terminal immediately, in order, interleaved with anything the host writes.

## Reference

`Bootgly\CLI\Terminal\Output\Region` extends `Bootgly\CLI\Terminal\Output` — every Output member stays available, including `Cursor`, `Text` and `Viewport`.

```php
public function __construct ($stream, string $gutter, int $offset, int $rows = 0)
```

Creates the region over a host output stream (`$Output->stream` — shared, not copied). `$gutter` is the painted left gutter injected at every region row (SGR allowed — paint markup with `Escaped::render()`). `$offset` is the gutter's **visible** width in columns: count the printable characters only, ignoring the escape codes. `$rows` is how many rows the host reserved below the region's first one — `0` disables growth.

```php
public function write (string $data, int $times = 1): self
```

Writes raw data through the region translation.

```php
public function render (string $data): self
```

Resolves Template markup and writes the result through the region translation.

```php
public function escape (string $data): self
```

Writes an escape sequence (without the leading `CSI`) through the region translation.

```php
public int $rows
```

The rows the host reserved below the region's first one. Content that outgrows them makes the region grow — the extra row is inserted, pushing whatever the host painted below it further down instead of overwriting it. Each inserted row raises the reserve by one. `0` (the default) disables growth.

The region also exposes `gutter` (`string`, read-only — the painted gutter) and `offset` (`int`, read-only — the region column offset).
