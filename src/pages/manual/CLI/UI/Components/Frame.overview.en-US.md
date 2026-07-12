# Frame Component

The `Frame` component is an iframe for your terminal: a rectangular screen region with its own **isolated/individual Output**. Anything written into `$Frame->Output` is buffered, clipped (or wrapped) to the frame interior and painted in place — independent of sibling frames, like the boxes of a btop dashboard. On interactive terminals only the rows that changed since the last render are repainted (diff blit), and erase escapes are never emitted, so adjacent frames stay intact.

A live demo is available in the [showcase](/manual/CLI/UI/Components/Frame/showcase).

## Instance

To use the component, create an instance passing the terminal `Output` — this is the *host* surface the frame paints onto. The frame then creates its own isolated Output:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Frame;

$Terminal = CLI->Terminal;

$Frame = new Frame($Terminal->Output);
$Frame->row = 2;       // top screen row (1-based)
$Frame->column = 4;    // left screen column (1-based)
$Frame->width = 40;    // outer width, border included
$Frame->height = 10;   // outer height, border included
$Frame->title = 'Log';
```

## The isolated Output

`$Frame->Output` is a real `Output` instance — write into it exactly as you would write to the terminal (Template markup supported), then render the frame:

```php
$Frame->Output->render("@#Black:12:00:01@; worker @#green:started@;\n");
$Frame->render();
```

Because it is a real Output, **any component renders inside a frame with zero adaptation** — just construct it over `$Frame->Output`. The inner metrics `$Frame->columns` and `$Frame->lines` size the hosted component:

```php
use Bootgly\CLI\UI\Components\Charts\Sparkline;

$Sparkline = new Sparkline($Frame->Output);
$Sparkline->series = ['a' => 2.0, 'b' => 7.0, 'c' => 4.0];
$Sparkline->render();

$Frame->render();
```

## The tick pattern

btop-style dashboards rewrite each box on every tick. The pattern is always *clear → write content → render*:

```php
while (true) {
   $Frame->clear();                       // empty the previous content
   $Chart->render();                      // hosted component writes into $Frame->Output
   $Frame->render();                      // only changed rows repaint

   usleep(100000);                        // ~10 FPS
}
```

`clear()` empties the buffered content but preserves the isolated stream resource — hosted components keep writing into the same Output. A quiet frame (same content, same geometry) writes **zero bytes**.

## Tail, head, clip and wrap

Content taller than the interior shows its **tail** by default (`$follow = true`, the newest lines win — log semantics). Set `$Frame->follow = false;` to hold the first lines instead.

Content wider than the interior is **clipped** by default (iframe semantics). Set `$Frame->wrap = true;` to wrap long lines into extra interior rows — the active color carries into the wrapped row.

## Border styles

The border glyph set is an enum — `Sharp` (default), `Round`, `Double`, `Heavy` or `None` (the interior spans the full rectangle). The title is embedded in the top border row and truncated to fit:

```php
use Bootgly\CLI\UI\Components\Frame\Borders;

$Frame->Borders = Borders::Round;   // ╭─ Log ──────╮
$Frame->color = '@#Black:';         // border + title color (Template markup)
```

## Content policy

Only text and SGR styling escapes (colors, bold, …) enter the frame buffer. Cursor movement, erase (`EL`/`ED`) and OSC escapes are **stripped** when the stream is drained — a stray `\e[2J` fed into one frame can never wipe the dashboard. Two practical consequences:

- Self-animating components (a `start()`ed Graph, a Spinner) repaint with cursor escapes — inside a frame they degrade to their plain frames. Use the tick pattern instead: rewrite the content every tick and let the frame diff.
- A carriage return (`\r`) overwrites the pending line — progress-style writes degrade to "latest state wins".

Wide glyphs (CJK, emoji) count as one column — the same framework-wide limitation of `Scrollarea`.

## Non-interactive output

On pipes and CI, `render()` writes the rectangle rows plainly (no cursor escapes, no diffing) — deterministic output, testable with `RETURN_OUTPUT`.

## Reference

### Properties

```php
public int $row
```

Config. The top screen row of the outer rectangle (1-based). Default: `1`.

```php
public int $column
```

Config. The left screen column of the outer rectangle (1-based). Default: `1`.

```php
public int $width
```

Config. The outer width, in columns (border included). Default: `20`.

```php
public int $height
```

Config. The outer height, in rows (border included). Default: `5`.

```php
public Borders $Borders
```

Config. The border glyph set — `Borders::None` removes the border. Default: `Borders::Sharp`.

```php
public string $color
```

Config. The border and title color (Template markup). Default: `'@#Black:'`.

```php
public bool $follow
```

Config. Whether the interior follows the newest lines (tail) instead of the first lines (head). Default: `true`.

```php
public bool $wrap
```

Config. Whether long lines wrap into extra interior rows instead of clipping the overflow. Default: `false`.

```php
public int $capacity
```

Config. Max buffered logical lines — older lines are dropped. Default: `1000`.

```php
public null|string $title
```

Data. The frame title (Template markup) — rendered into the top border row, truncated to the inner width.

```php
public private(set) Output $Output
```

Data (read-only). The isolated/individual Output — anything written here renders inside the frame.

```php
public private(set) array $buffer
```

Data (read-only). The buffered logical lines (painted bytes, SGR only).

```php
public int $columns
```

Metadata (read-only). The inner width, in columns (`width` minus the borders).

```php
public int $lines
```

Metadata (read-only). The inner height, in lines (`height` minus the borders).

### clear()

```php
public function clear (): void
```

Empties the frame content — the buffer, the carried tail and the isolated Output stream. The stream resource is preserved, so hosted components keep writing into the same Output.

### invalidate()

```php
public function invalidate (): void
```

Drops the blitted front buffer — the next render repaints the full rectangle. Call it after the screen is cleared externally or the frame is overlapped by another one.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renders the frame rectangle — border, title and the visible interior view. Interactive terminals diff-blit only the changed rows at their absolute positions; pipes write the rows plainly. With `RETURN_OUTPUT`, returns the rectangle as a string instead.

### Borders

```php
enum Borders
```

The border glyph sets: `Sharp` (`┌┐└┘`), `Round` (`╭╮╰╯`), `Double` (`╔╗╚╝`), `Heavy` (`┏┓┗┛`) and `None`.

```php
public function map (): array
```

Maps the border set to its position ⇒ glyph table — empty for `None`.
