# Select Component

The `Select` component is the "choose and confirm" option list: **↑/↓** aim, **Space** toggles, **Enter** confirms. It selects **one** option by default — radio `●`/`○` marks — or **many** with `multiple` on — checkbox `◼`/`◻` marks. Long lists window around the aim, typing filters the options incrementally, and locked rows stay visible but out of reach.

The rows are windowed and painted by the [Listbox](/manual/CLI/UI/Base/Listbox/overview) engine — its viewport, `↑/↓ N more` markers, right-edge scrollbar and query accent all ride along. State is per instance: two Selects never share a selection.

## Instance

To use the component, create an instance passing the `Input` and `Output` instances:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Select;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

$Select = new Select($Input, $Output);
```

## Choose one option

Options are plain string labels. `selecting()` runs the interaction until Enter; the selected option indexes land in `$Select->selected`:

```php
$Select->title = "@#Cyan:Choose a database driver@;\n@#Black:(↑/↓ to move, Enter to confirm)@;";
$Select->options = ['MySQL', 'PostgreSQL', 'SQLite'];

foreach ($Select->selecting() as $ignored);

$driver = $Select->options[$Select->selected[0] ?? 0];
```

Enter with an **empty selection confirms the aimed option** — no Space needed. With an explicit selection (Space), Enter keeps it and ignores the aim. In single mode, Space on another option **swaps** the selection.

## Choose many options

Turn `multiple` on — Space accumulates, Space again deselects, and the marks switch to checkboxes:

```php
$Select->multiple = true;
$Select->options = ['Cache', 'Logs', 'Metrics', 'Tracing'];

foreach ($Select->selecting() as $ignored);

foreach ($Select->selected as $index) {
   // each toggled option, in selection order
}
```

## Aim a default

`aim()` sets the initial aim (the `❯` marker) — pair it with Enter-confirm to make an option the default:

```php
$Select->options = ['Console', 'Web'];
$Select->aim(1); // the aim starts at `Web`
```

## Lock display-only rows

`locked` holds option indexes that render always-marked but never hold the aim, never enter the selection and never leave the filtered view — pinned "already on" rows:

```php
$Select->options = ['Core (always on)', 'Cache', 'Logs'];
$Select->locked = [0];
```

## Viewport (long lists)

Set `viewport` to window long lists to N visible options. The window slides with the aim and dim `↑/↓ N more` indicators count the hidden options:

```php
$Select->viewport = 5; // 5 visible options at a time
```

Prefer a right-edge bar instead of the markers? The Listbox underneath exposes it:

```php
$Select->Listbox->scrollbar = true;
```

## Type-ahead filter

Typing letters filters the options incrementally: the aim jumps to the first match and non-matching options are hidden while the filter is active. A dim `/filter` hint renders under the title. Backspace pops the last character; bare `Esc` clears the filter. Space always selects — it never enters the filter.

A filter matching nothing would leave a silent empty block, so the Select says so — and says how to get out of it:

```
Pick a country
/zzz
(no matches — Backspace erases, Esc clears)
```

While the filter matches nothing, Enter confirms nothing (the selection comes back
empty) and Space selects nothing: the aim points at an option the frame does not
draw, and the Select never commits what the user cannot see.

## Detail column

`details` rides a dim description column per option index, aligned after the widest label — a free Listbox capability:

```php
$Select->options = ['MySQL', 'SQLite'];
$Select->details = ['networked, production default', 'zero-config, file-based'];
```

## Host the frames (streaming)

Hosts that place the frames themselves — a Fieldset, a custom layout — pin the render mode: `selecting()` then never paints and yields each composed frame string instead:

```php
$Select->render = Select::RETURN_OUTPUT;

foreach ($Select->selecting() as $frame) {
   $Fieldset->content = $frame;
   $Fieldset->render();
}
```

## Non-interactive input

On pipes and CI the Select renders once and finishes — `selected` keeps whatever was pre-set (usually empty, so callers fall back to a default index). Deterministic in scripts.

## Restyle

The marks are plain Config, and the Listbox engine is exposed for everything else — marker, colors, query accent, its Scrollbar:

```php
$Select->marks = ['◉', '◯'];          // [selected, unselected]
$Select->Listbox->marker = '→ ';
$Select->Listbox->color = '@#Green:';
```

## See it live

The official Select demos run in the [live showcase](/manual/CLI/UI/Components/Select/showcase) — real framework code on PHP 8.4 WebAssembly, in your browser, straight from this page.

## Reference

### Properties

```php
public string $title = '';
```

Config. The title line above the list (`''` = none; markup supported — embedded `\n` renders a multi-line header).

```php
public bool $multiple = false;
```

Config. Multiple selection (Space accumulates) — `false` keeps single selection: the confirmed set holds at most one index.

```php
public int $viewport = 0;
```

Config. Max visible options (`0` renders all) — clipped edges say `↑/↓ N more`, or the Listbox scrollbar replaces them.

```php
public null|array $marks = null;
```

Config. The mark glyph pair `[selected, unselected]` — `null` derives from the mode: `●`/`○` single, `◼`/`◻` multiple.

```php
public array $locked = [];
```

Config. Display-only option indexes — always marked, always visible, never aimed nor selected.

```php
public array $options = [];
```

Data. The options, top to bottom (plain text labels).

```php
public array $details = [];
```

Data. Dim detail column per option index.

```php
public private(set) Listbox $Listbox;
```

Metadata. The windowed option list engine — the restyle surface (its Scrollbar rides along).

```php
public private(set) array $selected = [];
```

Metadata. The selected option indexes (the result).

```php
public private(set) string $filter = '';
```

Metadata. The incremental type-ahead filter.

```php
public private(set) int $aimed = 0;
```

Metadata. The aimed option index.

### aim()

```php
public function aim (int $index): self
```

Aims an option by index — locked options never hold the aim (the aim nudges forward to the next unlocked one). An out-of-range index keeps the current aim.

### control()

```php
public function control (string $char): bool
```

Controls the selection with one key: arrows aim, Space toggles, printable keys filter, Backspace pops the filter, bare Esc clears it. Returns whether the selection continues — `false` on Enter (both `\n` and `\r`).

### selecting()

```php
public function selecting (): Generator
```

Runs the selection until Enter confirms (or the input ends): renders a frame, waits for a key, controls the state — yielding the live selection after each key. With the `render` pin at `RETURN_OUTPUT` the loop never paints: it yields each composed frame string for the host to place. On non-interactive input it renders once and finishes.

### render()

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renders one frame: the title, the type-ahead hint and the Listbox rows — each option prefixed by its selection mark; locked rows always marked. A filter matching nothing says so instead of leaving a silent empty block.
