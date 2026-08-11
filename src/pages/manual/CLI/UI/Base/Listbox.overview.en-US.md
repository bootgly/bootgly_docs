# Listbox

`Listbox` is the windowed, aimed option list — the rows a host offers when it has choices: completions, slash-commands, matches. It composes the rows and reports their `height`; **where** they land is the host's business — spliced into a frame, handed to a [Flyout](/manual/CLI/UI/Base/Flyout/overview) as overlay content, or written directly. Living in the `UI/Base` tier, any UI Component may legally mount on it — [Textbox](/manual/CLI/UI/Components/Textbox/overview) lists its completions with it, and [Prompt](/manual/CLI/UX/Components/Prompt/overview) fills its trigger menus and its bottom sheet with it.

Options are plain text: markup is **not** resolved in them, so the measured widths stay honest. Rows are composed as plain strings, cursor-free — the host positions, composes or repaints them.

## Instance

The component is instantiated with the `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Base\Listbox;

$Listbox = new Listbox(CLI->Terminal->Output);
```

## Listing options

Assign the options — a plain `array<int,string>`, top to bottom — aim one of them and render. The aimed row carries the `marker` painted in `color`; the others carry the `filler`, which keeps them aligned:

```php
$Listbox->options = ['/help', '/clear', '/model', '/exit'];
$Listbox->aim(1);

$Listbox->render();
```

```text
  /help
❯ /clear
  /model
  /exit
```

That render reports a `height` of 4 — one row per option. An empty list renders nothing and reports a `height` of 0: that is how a host closes the list.

## Aiming

`aim()` picks an option by index and `advance()` / `regress()` step through the list. All three clamp by default:

```php
$Listbox->advance(); // /model
$Listbox->regress(); // back to /clear

$Listbox->aim(99);   // clamped to the last option — $Listbox->aimed === 3
$Listbox->aim(-1);   // clamped to the first option — $Listbox->aimed === 0
```

`render()` re-clamps the aim before composing, so replacing `options` with a shorter list never leaves a dangling aim behind.

**Circular navigation** is opt-in: with `circular` on, `advance()` past the last option wraps to the first and `regress()` past the first wraps to the last. An explicit `aim()` stays clamped either way:

```php
$Listbox->circular = true;

$Listbox->aim(0);
$Listbox->regress(); // wraps — $Listbox->aimed === 3
```

## Windowing long lists

`viewport` caps how many options stay visible. The window slides to keep the aimed option in view, and each clipped edge announces what it hides:

```php
$Listbox->options = ['/help', '/clear', '/model', '/exit'];
$Listbox->viewport = 2;
$Listbox->aim(3);

$Listbox->render();
```

```text
↑ 2 more
  /model
❯ /exit
```

The `↑ N more` / `↓ N more` markers are rows of their own: the render above reports a `height` of 3, not 2. A host that budgets space for the list must read `height`, never `viewport`. `viewport` of `0` (default) renders all options.

## Scrollbar

With `scrollbar` on, a right-edge bar replaces the `N more` markers on clipped lists — the window height stays exactly `viewport` rows. The bar is the [Scrollbar Atom](/manual/CLI/UI/Atoms/Scrollbar/overview) (the same one behind the [Scrollarea](/manual/CLI/UI/Components/Scrollarea/overview) band), exposed as `$Listbox->Scrollbar` for restyling, and `width` gives it a column to align on:

```php
$Listbox->options = ['/one', '/two', '/three', '/four', '/five', '/six'];
$Listbox->viewport = 3;
$Listbox->width = 12;
$Listbox->scrollbar = true;
$Listbox->aim(0);

$Listbox->render(); // height === 3 — thumb at the top, no `N more` rows
```

## Cropping wide options

`width` caps the columns an option may occupy. Anything wider crops with an ellipsis — a wrapped row would spill onto a second line and break the host's height bookkeeping, so the Listbox never wraps:

```php
$Listbox->width = 8;
$Listbox->options = ['a-very-long-option-label'];

$Listbox->render();
```

```text
❯ a-very-…
```

The measurement covers the option text only — the `marker`/`filler` prefix is painted outside it, so a host sizing against the terminal leaves room for it. With `width` at `null` (default), options render whole.

## Query accent

`query` lights up the typed search inside each option — its first occurrence, case-insensitive, painted with the `accent` tokens. That is how a menu shows *why* each option matched:

```php
$Listbox->options = ['/help', '/hello'];
$Listbox->query = '/he';
```

```text
❯ /help      ← the `/he` slice rides bold + bright white
  /hello
```

## Tint and details

`details` adds a dim column per option — description, usage — aligned after the widest label. `tint` paints the label column of every row, giving the commands contrast against the dim details:

```php
$Listbox->options = ['/help [cmd]', '/exit'];
$Listbox->details = ['Lists commands', 'Quits'];
$Listbox->tint = '@#Cyan:';

$Listbox->render();
```

```text
❯ /help [cmd]  Lists commands
  /exit        Quits
```

With a `width` set, the details crop to the columns the label column leaves over.

## Aimed-row highlight

`background` paints the aimed row's background across the whole `width` (the row is padded to it), so the highlight sweeps the line instead of just the text — the overlay-panel look. `blink` additionally blinks the aimed row:

```php
$Listbox->width = 40;
$Listbox->background = '@!black:';
$Listbox->blink = true;
```

## Reference

```php
public int $viewport;
```

Config. Max visible options — longer lists window around the aim. `0` (default) renders all of them.

```php
public null|int $width;
```

Config. Columns available to a row — wider options crop with an ellipsis; the aimed-row `background` and the `scrollbar` pad and align on it. `null` (default) renders options whole.

```php
public string $marker;
```

Config. Painted before the aimed option. Default `'❯ '`.

```php
public string $filler;
```

Config. Painted before the other options — align it with the `marker`. Default `'  '` (two spaces).

```php
public string $color;
```

Config. The aimed row paint, as a markup token. Default `'@#Cyan:'`.

```php
public string $tint;
```

Config. Label-column paint (markup token) for every row — contrasts the labels against the dim details. Empty (default) keeps the terminal's foreground.

```php
public string $background;
```

Config. Aimed-row background (markup token, e.g. `'@!black:'`) — pads the row to `width`, so the highlight spans the block. Empty (default) keeps the marker-only aim.

```php
public bool $blink;
```

Config. Blink the aimed row. Default `false`.

```php
public bool $scrollbar;
```

Config. Right-edge scrollbar on clipped lists — replaces the `↑/↓ N more` markers and keeps the window height at `viewport`. Default `false`.

```php
public bool $circular;
```

Config. Circular navigation — `advance()` past the last option wraps to the first and `regress()` past the first wraps to the last. Default `false`.

```php
public string $query;
```

Config. The query highlighted inside each option (first match, case-insensitive). Empty (default) highlights nothing.

```php
public string $accent;
```

Config. The query-match paint, as markup tokens. Default `'@*:@#White:'` (bold + bright white).

```php
public array $options;
```

Data. The options, top to bottom — `array<int,string>`, plain text (markup is not resolved in them). Default `[]`.

```php
public array $details;
```

Data. Dim detail column per option index (description, usage) — aligned after the widest label. Default `[]`.

```php
public private(set) int $aimed;
```

Metadata (read-only). The aimed option index. Starts at `0` and is always clamped to the list bounds.

```php
public private(set) Window $Window;
```

Metadata (read-only). The visible-slice calculator — `render()` sizes it from `viewport` (or from the list total when `viewport` is `0`) and slides it to the aim.

```php
public private(set) Scrollbar $Scrollbar;
```

Metadata (read-only reference). The right-edge [Scrollbar Atom](/manual/CLI/UI/Atoms/Scrollbar/overview) — restyle its glyphs and paints through it.

```php
public private(set) int $height;
```

Metadata (read-only). Rows the last render produced, including the `↑/↓ N more` markers — hosts place the block by it. `0` when the list is empty.

```php
public function aim (int $index): self
```

Aims an option by index, clamped to the list bounds — a negative index aims the first option, an out-of-range one aims the last. Returns the Listbox.

```php
public function advance (): self
```

Aims the next option — clamped at the last, or wrapped to the first when `circular` is on. Returns the Listbox.

```php
public function regress (): self
```

Aims the previous option — clamped at the first, or wrapped to the last when `circular` is on. Returns the Listbox.

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Composes the option rows and updates `height`. `WRITE_OUTPUT` writes them to the `Output`; `RETURN_OUTPUT` returns the raw markup rows instead. An empty list renders nothing and reports a `height` of 0 (`''` under `RETURN_OUTPUT`).
