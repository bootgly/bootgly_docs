# Flyout

`Flyout` is the generic anchored overlay — a delimited region a host opens against its own position: a context menu over an input, a completion panel, a bottom sheet. The content is arbitrary markup set by composition — a [Listbox](/manual/CLI/UI/Base/Listbox/overview) renders choices into it, but anything fits. Living in the `UI/Base` tier, any UI Component may legally mount on it — [Prompt](/manual/CLI/UX/Components/Prompt/overview) opens its trigger menus and its bottom sheet through it.

There are two ways to place the block. `RETURN_OUTPUT` composes it as a string for hosts that splice it into their own frame — the placement is the splice point. `WRITE_OUTPUT` paints it **relative to the anchor row** (the cursor row at call time), above or below it, using relative movement only — and `close()` erases it.

## Instance

The component is instantiated with the `Output`:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Base\Flyout;

$Flyout = new Flyout(CLI->Terminal->Output);
```

## Opening content

Assign `content` — markup rows separated by `\n` — and render. `height` reports the rows the block occupies:

```php
$Flyout->content = "@#Cyan:❯ /help@;\n  /exit";

$Flyout->render();

$Flyout->height; // 2
```

Empty content renders nothing and reports a `height` of `0` — that is the closed state; there is no separate open/close flag to track.

## Bordered box

`bordered` wraps the content in a box and `title` labels it — the box itself is delegated to the [Fieldset](/manual/CLI/UI/Base/Fieldset/overview), and the two border rows count into `height`. `width` picks the inner columns: `null` (default) derives from the widest content line (autowide), `0` spans the full terminal width and `N` fixes the columns. `background` fills the box interior (a `@!color:` markup token, forwarded to the Fieldset):

```php
$Flyout->bordered = true;
$Flyout->title = 'Commands';
$Flyout->width = 0;                 // full terminal width
$Flyout->background = '@!black:';
$Flyout->content = "❯ /help\n  /exit";

$Flyout->render();

$Flyout->height; // 4 — 2 content rows + 2 border rows
```

```text
┌ Commands ──────────────────────────────┐
│ ❯ /help                                │
│   /exit                                │
└────────────────────────────────────────┘
```

## Embedding — the block as a string

`RETURN_OUTPUT` returns the block instead of writing it, so the host splices it into its own frame and decides where it lands. That is how the Prompt places its context menu flush over the input frame — the frame repaint machinery does the positioning:

```php
$block = (string) $Flyout->render(Flyout::RETURN_OUTPUT);
$rows = $Flyout->height;
```

`height` reports the rows the *last* render produced — the only number a host needs to budget space for the block. Under `RETURN_OUTPUT` the empty content returns `''`, so the host can append it to its frame unconditionally.

## Anchored painting

Under `WRITE_OUTPUT` the block paints **relative to the cursor row** — the anchor. `placement` picks the side, as a `Placements` case:

```php
use Bootgly\CLI\UI\Base\Flyout\Placements;

$Flyout->placement = Placements::Below;   // the default
$Flyout->render();                        // paints under the anchor row

$Flyout->placement = Placements::Above;
$Flyout->render();                        // paints over the rows above the anchor
```

Both placements end with the cursor back on the anchor row, at column 1, and both use relative movement only — absolute positions would drift when writing at the screen bottom scrolls the terminal. Each painted row is right-trimmed first, so narrower repaints leave no residue.

**The Above contract —** painting above *overwrites* whatever occupied those rows. The host must have made room: a managed region (the Prompt's fitted band, a Wizard Region) that budgets `height` rows for the block. `Below` needs no such deal — writing at the bottom scrolls the screen natively.

A repaint that changes the block height must `close()` first — each paint covers exactly its own rows.

## Closing

`close()` erases the block painted by the last WRITE render, per `placement`, and resets `height` to `0`. It expects the cursor on the anchor row and returns it there. A no-op while closed — frame-splicing hosts never need it:

```php
$Flyout->close();
```

## Reference

```php
public Placements $placement;
```

Config. Where the WRITE-mode paint anchors the block, relative to the cursor row — `Placements::Below` (default) or `Placements::Above`. `RETURN_OUTPUT` ignores it: the splice point is the placement.

```php
public bool $bordered;
```

Config. Compose the block inside a bordered `Fieldset` box — its two border rows count into `height`. Default `false`.

```php
public null|string $title;
```

Config. Box title, used when `bordered` is `true` (markup supported). Default `null`.

```php
public null|int $width;
```

Config. Inner columns, when `bordered`: `null` (default) derives from the widest content line, `0` spans the full terminal width, `N` fixes the columns.

```php
public null|string $background;
```

Config. Inner background fill (a `@!color:` markup token), when `bordered` — forwarded to the Fieldset. Default `null`.

```php
public string $content;
```

Data. The block content — markup rows separated by `\n`. Empty (default) closes the flyout: nothing renders and `height` reports `0`.

```php
public private(set) int $height;
```

Metadata (read-only). Rows the last render composed or painted, border rows included. `0` while closed.

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renders the block and updates `height`. `RETURN_OUTPUT` returns the block markup for the host to splice; `WRITE_OUTPUT` paints it anchored to the current cursor row per `placement` and returns the cursor to the anchor row, column 1. Empty content renders nothing (`''` under `RETURN_OUTPUT`).

```php
public function close (): self
```

Erases the block painted by the last WRITE render — the counterpart of the anchored paint. Expects the cursor on the anchor row and returns it there, at column 1. No-op while closed. Returns the Flyout.

### Placements

```php
enum Placements
{
   case Above;
   case Below;
}
```

The `Bootgly\CLI\UI\Base\Flyout\Placements` enum — where the anchored paint opens the block, relative to the anchor row.
