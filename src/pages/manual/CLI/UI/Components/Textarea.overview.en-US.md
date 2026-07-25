# Textarea Component

The `Textarea` component edits multiline text in the terminal: Enter breaks lines, arrows navigate (wrapping at line edges), and **Ctrl+D submits**. The visible rows window slides with the cursor. On non-interactive input (pipes, CI) it reads stdin lines until EOF — heredoc-style, deterministic.

A live demo is available in the [showcase](/manual/CLI/UI/Components/Textarea/showcase).

## Instance

To use the component, it is necessary to create an instance passing as parameters the instances of the `Input` and `Output` components:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Textarea;

$Terminal = CLI->Terminal;

$Textarea = new Textarea($Terminal->Input, $Terminal->Output);
```

## Asking for multiline text

Set the `prompt` and call `ask()` — it returns the lines joined by `\n`:

```php
$Textarea->prompt = 'Commit message';
$Textarea->rows = 5; // visible rows

$message = $Textarea->ask();
```

While editing, the whole line-editing vocabulary works on the active row — the buffer handles the keys that cross a row boundary and delegates every other key to the row itself:

| Keys | Action |
|---|---|
| `←` / `→` | move by one character, wrapping at the row edges |
| `↑` / `↓` | move between rows (the column clamps) |
| `Home` / `End`, `Ctrl+A` / `Ctrl+E` | jump to the start / end of the row |
| `Backspace` | erase before the cursor — at the row start, merges into the previous row |
| `Delete` | erase after the cursor — at the row end, pulls the next row up |
| `Ctrl+U` / `Ctrl+K` | kill to the start / end of the row |
| `Ctrl+W`, `Alt+Backspace` | chop the word before the cursor |
| `Enter` | break the row at the cursor |
| **`Ctrl+D`** | **submit** |

The editing state lives in `Textarea->Lines`, a [Lines](/manual/CLI/Terminal/Input/Lines/overview) buffer holding one [Line](/manual/CLI/Terminal/Input/Line/overview) per row. The `lines`, `row` and `column` properties are read-only views over that buffer, so the edited content can be inspected at any time:

```php
$Textarea->ask();

echo count($Textarea->lines);  // rows
echo $Textarea->row;           // cursor row index
echo $Textarea->column;        // cursor column, in codepoints
```

## Non-interactive input

On pipes and CI, `ask()` reads stdin lines until EOF, loads them into the buffer (so `lines` reflects them too) and joins them — deterministic:

```bash :toolbar="true";
printf 'first line\nsecond line\n' | php app.php
```

## Reference

### Properties

```php
public string $prompt
```

Config. The editor title rendered above the lines. Default: `''`.

```php
public int $rows
```

Config. Visible rows — the window slides with the cursor; a dim `↓ N more` indicator counts the hidden lines. Default: `5`.

```php
public private(set) Lines $Lines
```

Data (read-only). The multiline buffer ([Lines](/manual/CLI/Terminal/Input/Lines/overview)) — one [Line](/manual/CLI/Terminal/Input/Line/overview) per row — holding the whole editing state.

```php
public array $lines { get; }
```

Data (virtual, read-only). The row values, top to bottom — a view over `Lines->lines`.

```php
public int $row { get; }
```

Metadata (virtual, read-only). The cursor row index — a view over `Lines->row`.

```php
public int $column { get; }
```

Metadata (virtual, read-only). The cursor column, in codepoints — a view over `Lines->column`.

```php
public private(set) string $answer
```

Metadata (read-only). The lines joined by `\n`, filled by `ask()`.

### ask()

```php
public function ask (): string
```

Edits interactively until Ctrl+D (or EOF) and returns the lines joined by `\n`. Non-interactive input reads stdin lines until EOF instead.

### control()

```php
public function control (string $key): void
```

Handles one edit key (raw bytes — arrows arrive as escape sequences) by forwarding it to the `Lines` buffer. Exposed for programmatic drives and tests.
