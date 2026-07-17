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
use Bootgly\CLI\UI\Components\Question;

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
   $Question = new Question($Input, $Region);
   $Question->prompt = 'Project name';
   $Question->default = 'App';

   $answer = $Question->ask();
}
finally {
   Terminal::$width += 3;
}
```

The Question renders nested, guide and all:

```
Host
│
│  Project name [App]: App
│
```

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

## Width inside a region

A region is narrower than the terminal by its `offset`. Components that fit their output to `Terminal::$width` — [Menu](/manual/CLI/UI/Components/Menu/overview), [Textarea](/manual/CLI/UI/Components/Textarea/overview), [Tree](/manual/CLI/UI/Components/Tree/overview) — must see the narrowed width, otherwise their rows wrap. And a wrapped row is fatal to a nested repaint: `Cursor->up()` and `Text->clear(lines: N)` count **logical** lines, so one row spilling into two physical rows drifts everything below it.

Shrink the width around the nested render and always restore it (a `finally`, as above): components read `Terminal::$width` when they are constructed, so build them inside the shrunk window.

## Caveats

Anything the terminal writes on its own bypasses the translation — most notably the kernel echo of typed characters in canonical mode, which the terminal prints at the physical column, not through your stream. Bootgly's UI editors read raw input and paint the echo themselves, so they are unaffected; pre-painting the region rows (as the host does above) covers the rest.

The region shares the host stream rather than buffering: writes reach the terminal immediately, in order, interleaved with anything the host writes.

## Reference

`Bootgly\CLI\Terminal\Output\Region` extends `Bootgly\CLI\Terminal\Output` — every Output member stays available, including `Cursor`, `Text` and `Viewport`.

```php
public function __construct ($stream, string $gutter, int $offset)
```

Creates the region over a host output stream (`$Output->stream` — shared, not copied). `$gutter` is the painted left gutter injected at every region row (SGR allowed — paint markup with `Escaped::render()`). `$offset` is the gutter's **visible** width in columns: count the printable characters only, ignoring the escape codes.

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

The region exposes `gutter` (`string`, read-only — the painted gutter) and `offset` (`int`, read-only — the region column offset).
