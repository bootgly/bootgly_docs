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

While editing: Enter breaks the line at the cursor; Backspace at a line start merges it with the previous one; `↑`/`↓` move between lines (the column clamps); `Home`/`End` (or `Ctrl+A`/`Ctrl+E`) jump inside the line; **Ctrl+D finishes**.

## Non-interactive input

On pipes and CI, `ask()` reads stdin lines until EOF and joins them — deterministic:

```bash
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
public private(set) array $lines
```

Data (read-only). The edited lines.

```php
public private(set) int $row
```

Metadata (read-only). The cursor line index.

```php
public private(set) int $column
```

Metadata (read-only). The cursor column, in codepoints.

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

Handles one edit key (raw bytes — arrows arrive as escape sequences). Exposed for programmatic drives and tests.
