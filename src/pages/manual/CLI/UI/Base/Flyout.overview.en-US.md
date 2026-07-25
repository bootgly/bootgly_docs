# Flyout

`Flyout` is the anchored option list — the block a host paints against an input when it offers choices (completions, slash-commands, matches). It composes the rows and reports their `height`; **where** they land is the host's business, so the same Flyout serves a list dropping below an input and one rising above it. Living in the `UI/Base` tier, any UI Component may legally mount on it — [Textbox](/manual/CLI/UI/Components/Textbox/overview) is its consumer today.

Options are plain text: markup is **not** resolved in them, so the measured widths stay honest. Frames are composed as plain strings, cursor-free — the host positions, composes or repaints them.

## Instance

The component is instantiated with the `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Base\Flyout;

$Flyout = new Flyout(CLI->Terminal->Output);
```

## Listing options

Assign the options — a plain `array<int,string>`, top to bottom — aim one of them and render. The aimed row carries the `marker` painted in `color`; the others carry the `filler`, which keeps them aligned:

```php
$Flyout->options = ['/help', '/clear', '/model', '/exit'];
$Flyout->aim(1);

$Flyout->render();
```

```text
   /help
=> /clear
   /model
   /exit
```

That render reports a `height` of 4 — one row per option.

## Aiming

`aim()` picks an option by index and `advance()` / `regress()` step through the list. All three clamp — the list never wraps:

```php
$Flyout->advance(); // /model
$Flyout->regress(); // back to /clear

$Flyout->aim(99);   // clamped to the last option — $Flyout->aimed === 3
$Flyout->aim(-1);   // clamped to the first option — $Flyout->aimed === 0
```

`advance()` stops on the last option and `regress()` on the first. `render()` re-clamps the aim before composing, so replacing `options` with a shorter list never leaves a dangling aim behind.

## Windowing long lists

`viewport` caps how many options stay visible. The window slides to keep the aimed option in view, and each clipped edge announces what it hides:

```php
$Flyout->options = ['/help', '/clear', '/model', '/exit'];
$Flyout->viewport = 2;
$Flyout->aim(3);

$Flyout->render();
```

```text
↑ 2 more
   /model
=> /exit
```

Aiming back to the top clips the other edge instead:

```php
$Flyout->aim(0);

$Flyout->render();
```

```text
=> /help
   /clear
↓ 2 more
```

The `↑ N more` / `↓ N more` markers are rows of their own: both renders above report a `height` of 3, not 2. A host that budgets space for the flyout must read `height`, never `viewport`.

**Gotcha —** `viewport` of `0` means "render all", and Flyout implements it by sizing its `Window` to the list total. It cannot simply forward the `0`: a [Window](/manual/CLI/Terminal/Output/Window/overview) with `size` `0` yields an **empty** visible range, not a full one. Any host reusing `Window` directly inherits that rule.

## Cropping wide options

`width` caps the columns an option may occupy. Anything wider crops with an ellipsis — a wrapped row would spill onto a second line and break the host's height bookkeeping, so Flyout never wraps:

```php
$Flyout->viewport = 0;
$Flyout->width = 8;
$Flyout->options = ['a-very-long-option-label'];
$Flyout->aim(0);

$Flyout->render();
```

```text
=> a-very-…
```

The measurement covers the option text only — the 3-column `marker`/`filler` prefix is painted outside it, so a host sizing against the terminal leaves room for it (Textbox passes `Terminal::$width - 4`). With `width` at `null` (default), options render whole.

## Bordered composition

`bordered` wraps the rows in a box and `title` labels it. The box itself is delegated to the [Fieldset](/manual/CLI/UI/Base/Fieldset/overview):

```php
$Flyout->width = null;
$Flyout->bordered = true;
$Flyout->title = 'Commands';
$Flyout->options = ['/help', '/exit'];
$Flyout->aim(0);

$Flyout->render();
```

```text
┌ Commands ──┐
│ => /help   │
│    /exit   │
└────────────┘
```

The two border rows count into `height` — 4 here, for 2 options. Unlike the options, `title` accepts markup.

## Embedding — rows as strings

`RETURN_OUTPUT` returns the raw rows instead of writing them, so the host composes the block into its own frame and decides where it lands:

```php
$frame = (string) $Flyout->render(Flyout::RETURN_OUTPUT);
$rows = $Flyout->height;
```

`height` reports the rows the *last* render produced — that is the only number a host needs to place the block, or to walk the cursor back over it before repainting. Because Flyout reports the height and never moves the cursor itself, the same instance works below an input or above it.

## Closing the flyout

An empty list renders nothing and reports a `height` of 0. That is how a host closes the flyout — there is no separate open/close state to track:

```php
$Flyout->options = [];

$Flyout->render(); // writes nothing — $Flyout->height === 0
```

Under `RETURN_OUTPUT` the empty list returns `''`, so the host can keep appending it to its frame unconditionally.

## Reference

```php
public int $viewport;
```

Config. Max visible options — longer lists window around the aim with `↑ N more` / `↓ N more` markers. `0` (default) renders all of them.

```php
public bool $bordered;
```

Config. Compose the rows inside a bordered `Fieldset` box, whose two border rows count into `height`. Default `false`.

```php
public null|int $width;
```

Config. Columns available to a row — wider options crop with an ellipsis. `null` (default) renders options whole.

```php
public null|string $title;
```

Config. Box title, used when `bordered` is `true` (markup supported). Default `null`.

```php
public string $marker;
```

Config. Painted before the aimed option. Default `'=> '`.

```php
public string $filler;
```

Config. Painted before the other options — align it with the `marker`. Default `'   '` (three spaces).

```php
public string $color;
```

Config. The aimed row paint, as a markup token. Default `'@#Cyan:'`.

```php
public array $options;
```

Data. The options, top to bottom — `array<int,string>`, plain text (markup is not resolved in them). Default `[]`.

```php
public private(set) int $aimed;
```

Metadata (read-only). The aimed option index. Starts at `0` and is always clamped to the list bounds.

```php
public private(set) Window $Window;
```

Metadata (read-only). The visible-slice calculator — `render()` sizes it from `viewport` (or from the list total when `viewport` is `0`) and slides it to the aim.

```php
public private(set) int $height;
```

Metadata (read-only). Rows the last render produced, including the `↑/↓ N more` markers and the two border rows when `bordered` — hosts place the block by it. `0` when the list is empty.

```php
public function aim (int $index): self
```

Aims an option by index, clamped to the list bounds — a negative index aims the first option, an out-of-range one aims the last. Returns the Flyout.

```php
public function advance (): self
```

Aims the next option, clamped — the list never wraps, so it stops on the last option. Returns the Flyout.

```php
public function regress (): self
```

Aims the previous option, clamped — the list never wraps, so it stops on the first option. Returns the Flyout.

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Composes the option rows and updates `height`. `WRITE_OUTPUT` writes them to the `Output`; `RETURN_OUTPUT` returns the raw markup rows instead. An empty list renders nothing and reports a `height` of 0 (`''` under `RETURN_OUTPUT`).
