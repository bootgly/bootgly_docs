# Finder

Live search selector — asks the user "which one?" without them arrowing through a long [Menu](/manual/CLI/UI/Components/Menu/overview). Typing filters the options (case-insensitive, multibyte-aware), `↑`/`↓` aim, `Enter` confirms the aimed match and `Esc` cancels. Options come from a static array or from a dynamic source Closure called with the query on every edit. `find()` opens the search and returns the found **value** — `null` on cancel.

## Find a value

```php
use const Bootgly\CLI;
use Bootgly\CLI\UX\Components\Finder;

$Input = CLI->Terminal->Input;
$Output = CLI->Terminal->Output;

$Finder = new Finder($Input, $Output);
$Finder->prompt = '@*:Search a component@;';
$Finder->hint = '(type to filter, ↑/↓ aim, Enter confirm, Esc cancel)';
$Finder->options = [
   'alert' => 'Alert',
   'dialog' => 'Dialog',
   'filepicker' => 'Filepicker',
   'finder' => 'Finder',
   'menu' => 'Menu',
   'progress' => 'Progress',
   'prompt' => 'Prompt',
   'toasts' => 'Toasts',
   'tree' => 'Tree',
   'wizard' => 'Wizard'
];
$Finder->viewport = 6;
$Finder->blink = true;

$found = $Finder->find();

if ($found !== null) {
   echo "You found: {$found}\n";
}
```

```text
Search a component: fi█
(type to filter, ↑/↓ aim, Enter confirm, Esc cancel)
=> Filepicker
   Finder
```

Every keystroke refilters the matches with `mb_stripos` — case-insensitive and multibyte-aware — and resets the aim to the first row. The `hint` is a dim helper line rendered right below the prompt (an empty string hides it), and the prompt accepts Template markup — `@*:...@;` renders it bold. When the interaction ends, the final frame replaces the dropdown with `{prompt}: {label}`.

## Dynamic source

Set `source` to a Closure and the options become dynamic: it receives the query on **every edit** — including the initial empty query, before any typing — and returns options in the same shape. The static filter is bypassed: the source filters by itself:

```php
use function array_filter;
use function array_values;
use function stripos;

$extensions = [
   'bcmath', 'curl', 'dom', 'fileinfo', 'gd', 'iconv', 'intl', 'json',
   'libxml', 'mbstring', 'mysqli', 'opcache', 'openssl', 'pcntl', 'pcre',
   'pdo_mysql', 'pdo_pgsql', 'pdo_sqlite', 'phar', 'posix', 'readline',
   'session', 'sockets', 'sodium', 'xdebug', 'xml', 'zip', 'zlib'
];

$Finder = new Finder($Input, $Output);
$Finder->prompt = '@*:Search an extension@;';
$Finder->hint = '(dynamic source — the lookup runs per keystroke)';
$Finder->source = static function (string $query) use ($extensions): array {
   if ($query === '') {
      return $extensions;
   }

   return array_values(array_filter(
      $extensions,
      static fn (string $extension): bool => stripos($extension, $query) !== false
   ));
};

$found = $Finder->find();
```

The list above is int-keyed, so `find()` returns the label itself (`'mbstring'`, `'sodium'`, ...).

## Keys

| Key | Action |
|-----|--------|
| typing | Filters the options — every edit refilters and resets the aim |
| `↑` / `↓` | Aim a match (clamped — no wrap) |
| `Enter` | Confirms the aimed match — with **no match it is a no-op** (a pure selector never submits raw text) |
| `Esc` | Cancels — `find()` returns `null` |
| `Backspace`, `Ctrl+U`, `←`/`→`, ... | Edit the query (line editor keys) |

## Values vs labels

`options` (and the source return) map **value ⇒ label**: the key is what `find()` returns, the item is what the user sees. Int keys return the label itself:

```php
$Finder->options = [
   'pt-BR' => 'Português (Brasil)', // Enter here returns 'pt-BR'
   'en-US' => 'English (US)'        // Enter here returns 'en-US'
];

$Finder->options = ['Alpha', 'Beta']; // int keys — Enter returns 'Alpha' or 'Beta'
```

## Non-interactive input

On pipes and CI `find()` degrades to a typed line ([Question](/manual/CLI/UI/Components/Question/overview) semantics): the typed line resolves by case-insensitive **exact label match** to its value — an empty or unknown line returns `null`. Scripts stay automatable:

```bash :toolbar="true";
echo "Finder" | php app.php
```

## Notes

- The source Closure runs **synchronously on every keystroke** — there is no debounce, so a slow lookup lags the typing. Keep lookups fast (memory, indexed).
- Labels and prompts wider than the terminal are not cropped yet.
- `viewport` (default 8) windows long match lists with `↑/↓ N more` markers; `blink` makes the aim marker blink.
- The last result also stays exposed on the read-only `$found` property — `null` after a cancel.

## Reference

### Finder

```php
public function __construct (Input $Input, Output $Output)
```

Creates the finder bound to the terminal `Input` and `Output`.

```php
public function find (): mixed
```

Opens the live search and returns the found value — `null` on cancel (`Esc`, `EOF`) or, on non-interactive input, when the typed line matches no label. Interactive flow: typing filters, `↑`/`↓` aim, `Enter` confirms the aimed match (no match ⇒ no-op); the final frame replaces the dropdown with `{prompt}: {label}`.

```php
public function control (string $key): bool
```

Controls the finder with one keystroke — a pure state machine (no I/O) for embedding and testing. Returns `false` when the interaction finishes (`Enter`/`Esc`). `$key` is the assembled key bytes (see `Input::listen`).

### Properties

```php
public string $prompt
```

Config. Header / input prefix line (Template markup supported). Default: `'Search'`.

```php
public string $hint
```

Config. Dim helper line rendered right below the prompt — an empty string hides it. Default: `''`.

```php
public array $options
```

Config. Static options — `array<int|string,string>`: key = returned value, item = shown label (int keys return the label itself). Default: `[]`.

```php
public null|Closure $source
```

Config. Dynamic source — `Closure (string $query): array`, called with the query on every edit (including the initial empty query) and returning options in the same shape. When set, the static filter is bypassed — the source filters by itself. Default: `null`.

```php
public int $viewport
```

Config. Max visible matches — longer lists window with `↑/↓ N more` markers. Default: `8`.

```php
public bool $blink
```

Config. Blink the aim marker. Default: `false`.

```php
public private(set) mixed $found
```

Data (read-only). The last found value — `null` after a cancel.
