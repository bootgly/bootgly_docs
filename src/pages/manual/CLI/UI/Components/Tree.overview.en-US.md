# Tree

Hierarchical view with expand/collapse and lazy children. The same tree renders as **static report output** (Rich-style, pipe-safe) and drives an **interactive picker**: `↑`/`↓` aim, `→` expand, `←` collapse, `Space` toggle, `Enter` selects (or runs a programmable action), `Esc` cancels.

## Render a tree

Build nodes fluently — `add()` returns the new child, so branches chain naturally — and render:

```php
use Bootgly\CLI\UI\Components\Tree;

$Tree = new Tree($Input, $Output);

$Root = $Tree->add('bootgly');
$CLI = $Root->add('Bootgly')->add('CLI');
$CLI->add('Terminal');
$CLI->add('UI');
$Root->add('composer.json');

$Tree->render();
```

```text
▾ bootgly
├─ ▾ Bootgly
│  └─ ▾ CLI
│     ├─ · Terminal
│     └─ · UI
└─ · composer.json
```

Nodes start expanded, so a plain build dumps the whole hierarchy — call `collapse()` on any branch to fold it (its children leave the output). Labels accept Template markup (`@#Cyan:src@;`) and the connector guides render dimmed. Set `guides = false` for plain indentation.

## Pick a node interactively

`navigate()` opens a raw-input session and returns the confirmed `Node` — or `null` when the user cancels with `Esc`:

```php
$Tree->prompt = 'Pick a path';
$Tree->viewport = 12;   // window long trees with ↑/↓ N more markers
$Tree->blink = true;    // blink the => aim marker (cursor visibility aid)

$Selected = $Tree->navigate();

if ($Selected !== null) {
   echo "Picked: {$Selected->value}\n";
}
```

Every node carries a free-form `value` payload — put paths, ids or whole objects there and read them off the returned node. On non-interactive output (pipes, CI) `navigate()` degrades to a single static dump and returns `null`.

## Run actions on Enter

Set a `Closure` on `$Node->action` and `Enter` runs it instead of confirming. Return `false` to confirm and finish; any other return keeps navigating — the action may mutate the tree and the rows re-flatten:

```php
$Branch->action = static fn (Node $Node): Node => $Node->toggle();   // Enter folds/unfolds
```

The `false` return confirms even when `$Node->selectable` is `false` — the explicit runtime decision wins over the static flag. `selectable` alone gates the plain, action-less confirm.

## Load children lazily

Give a node a `resolver` and its children are built on the **first expand** — perfect for directory scans and remote listings:

```php
use Bootgly\CLI\UI\Components\Tree\Node;

$Tree->add('vendor', value: 'vendor', resolver: static function (Node $Node): void {
   foreach (new \DirectoryIterator($Node->value) as $Entry) {
      if ($Entry->isDot()) {
         continue;
      }

      $Child = $Node->add($Entry->getFilename(), value: $Entry->getPathname());
      $Child->glyph = $Entry->isDir() ? '📁' : '📄';
   }
});
```

Unresolved branches render folded (`▸`) — pressing `→` runs the resolver exactly once and unfolds in place. A resolver that throws rolls the latch back, so the expand stays retryable. A resolver that adds nothing converts the node into a leaf.

Combined with `action` and per-node `glyph` overrides (any string — emojis included), this is the complete toolkit for a file explorer: lazy directories, `Enter` opening files, icons per entry type.

## Notes

- **Static output carries no aim marker** — `render()` is report-safe; the `=>` column appears only inside `navigate()`.
- **Width**: rows are not cropped in v1 — very deep trees can exceed narrow widths (same limitation as Menu). Guide compression and crop are planned follow-ups.
- Glyphs `▾ ▸ ·` come from the `glyphs` Config array — swap them globally, or per node via `$Node->glyph`.

## Reference

### Tree

```php
public function __construct (Input $Input, Output $Output)
```

Creates the component bound to the terminal `Input` (interactive session) and `Output`.

```php
public function add (string $label, mixed $value = null, null|Closure $resolver = null): Node
```

Adds a root node and returns it. `label` accepts Template markup; `value` is a free consumer payload; `resolver` makes the node lazy.

```php
public function render (int $mode = self::WRITE_OUTPUT): null|string
```

Renders the visible tree — expanded nodes only. `RETURN_OUTPUT` returns the frame as a string instead of writing it.

```php
public function control (string $key): bool
```

Applies one keystroke to the tree state — a pure state machine (no I/O). Returns `false` when the interaction finishes (`Enter` confirm or `Esc` cancel). Stale aims clamp back into the visible range, so external tree mutations between calls are safe.

```php
public function navigate (): null|Node
```

Opens the interactive session (raw input, hidden cursor, relative repaint) and returns the confirmed node — `null` on `Esc`, `EOF` or non-interactive output. The terminal always restores, even when a resolver or action throws.

Config: `string $prompt` (header line), `bool $guides` (connector guides, default `true`), `bool $blink` (blinking aim marker, default `false`), `null|int $viewport` (max visible rows), `array $glyphs` (`expanded`/`collapsed`/`leaf` markers). Read-only state: `array $Nodes`, `int $aimed`, `null|Node $selected`, `Window $Window`.

### Tree\Node

```php
public function add (string $label, mixed $value = null, null|Closure $resolver = null): Node
```

Adds a child node, wiring its `Parent` and `depth`, and returns it.

```php
public function expand (): self
```

Expands the node. The first expand of a lazy node runs its resolver once; a throwing resolver rolls back and stays retryable.

```php
public function collapse (): self
```

Folds the node — its children leave the visible tree.

```php
public function toggle (): self
```

Toggles between open and folded. An unresolved lazy node counts as folded, so toggling it resolves and opens it.

Config: `string $label`, `mixed $value`, `string $glyph` (marker override — emojis work), `bool $selectable`, `null|Closure $action` (Enter action), `null|Closure $resolver` (lazy children). Read-only state: `array $Nodes`, `bool $expanded`, `null|Node $Parent`, `int $depth`, `bool $resolved`, `bool $leaf`, `bool $open`.
