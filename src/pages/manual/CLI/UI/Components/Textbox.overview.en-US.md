# Textbox Component

The `Textbox` component is the single-line text input of the Console platform: a prompt, a line editor and — when it has options to offer — a list under the input. The same component covers free text, yes/no answers (`confirm()`), secret input (`mask`), autocompletion (`options`) and search (`source`), so there is exactly one way to ask the user for a line.

On interactive terminals every mode edits inside the same framed input. On non-interactive input (pipes, CI) it reads a plain stdin line, unframed — consumer code stays identical either way.

Transcript-style examples are available in the [showcase](/manual/CLI/UI/Components/Textbox/showcase).

## Instance

To use the component, it is necessary to create an instance passing as parameters the instances of the `Input` and `Output` components:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Textbox;

$Terminal = CLI->Terminal;

$Textbox = new Textbox($Terminal->Input, $Terminal->Output);
```

## Asking a line

Set the `prompt` and the `default`, then call `ask()`:

```php
$Textbox->prompt = 'Server port';
$Textbox->default = '8080';

$port = $Textbox->ask();
```

An empty answer (just Enter) or EOF returns `'8080'`. The interactive editor renders `❯ Server port: ` and simply assumes the default on an empty line; the plain prompt used on pipes (and for masked input) carries it in brackets — `❯ Server port [8080]: `.

## Validating answers

Assign a Closure to `Validator` — it receives the candidate answer and returns `true` to accept it or an error message string to reject it. The error is rendered as a Failure [Alert](/manual/CLI/UI/Components/Alert/overview) and the question is asked again:

```php
$Textbox->prompt = 'Server port';
$Textbox->default = '8080';
$Textbox->Validator = static function (string $answer): true|string {
   if (preg_match('#^\d{1,5}$#', $answer) !== 1) {
      return 'Invalid port: use a number between 1 and 65535.';
   }

   return true;
};

$port = $Textbox->ask();
```

The default goes through the Validator too: an empty answer assumes the default before the validation runs.

## Requiring an answer

When `required` is `true` and there is no default, empty answers render an `An answer is required.` Failure Alert and the question is asked again:

```php
$Textbox->prompt = 'Project path (e.g. `App` or `App/API`)';
$Textbox->required = true;

$path = $Textbox->ask();
```

This is exactly how the `bootgly project create` wizard asks for the project path.

## Limiting attempts

The `attempts` property caps how many rounds the question runs — `0` (the default) means unlimited. When the attempts are exhausted, `ask()` gives up and returns the default, and `attempt` reports how many rounds were consumed:

```php
$Textbox->prompt = 'Project name';
$Textbox->required = true;
$Textbox->default = 'MyApp';
$Textbox->attempts = 3;

$name = $Textbox->ask();

echo $Textbox->attempt; // rounds consumed
```

## Masking secret input

Set `mask` to echo a mask character instead of what is typed — passwords and tokens never appear on screen. On real TTYs the kernel echo is disabled during the read and the component self-echoes the mask, character by character:

```php
$Textbox->prompt = 'Password';
$Textbox->required = true;
$Textbox->mask = '•';

$password = $Textbox->ask(); // typing `hunter2` renders `•••••••`
```

A masked input with a `default` never reveals it — the prompt renders the mask repeated three times (`❯ API token [•••]: `), whatever the real length is, and an empty answer still assumes the real default value.

## Autocompleting with options

Set `options` to list them under the input while editing. Typing filters them (case-insensitively, multibyte-aware, matching anywhere in the label), `↑`/`↓` aim, `Tab` completes the typed text to the aimed label, `Esc` closes the list keeping what was typed, and Enter submits:

```php
$Textbox->prompt = 'Editor';
$Textbox->options = ['vim', 'nano', 'emacs', 'helix'];

$editor = $Textbox->ask(); // free text wins — the options only assist
```

| Keys | Action |
|---|---|
| `↑` / `↓` | aim an option |
| `Tab` | complete the typed text to the aimed label |
| `Esc` | close the option list, keeping the typed text |
| `Enter` | submit |

Every other key edits the buffer through the [Line](/manual/CLI/Terminal/Input/Line/overview) editor (`←`/`→`, `Home`/`End`, `Backspace`/`Delete`, `Ctrl+U`/`Ctrl+K`…), and any edit re-queries the options with the new text — the previous aim means nothing after it, so the list re-aims its first row.

The `viewport` property caps how many option rows are visible (`5` by default); longer lists window around the aim and announce the clipped edges with `↑ N more` / `↓ N more` markers.

## Picking one of the options

`strict` is what separates completing from picking. With it off (the default) Enter submits the typed text and the options are suggestions; with it on only a listed option is accepted, and Enter returns the **value** of the aimed one:

```php
$Textbox->prompt = 'Database';
$Textbox->options = [
   'db.mysql' => 'MySQL',
   'db.sqlite' => 'SQLite',
   'db.postgres' => 'PostgreSQL'
];
$Textbox->strict = true;

$database = $Textbox->ask(); // aiming `SQLite` returns 'db.sqlite'
```

Options are `array<int|string,string>`: a string key is the value returned, while an int key (a plain list) returns the label itself. Answers that match no option render a `Pick one of the options.` Failure Alert and the question is asked again.

## Searching with a dynamic source

When the candidates cannot be listed upfront, assign a Closure to `source`. It receives the current query and returns options in the same shape — it is re-queried on every edit (and once with an empty query when the editor opens), and it filters by itself: the result is listed as-is, with no second filtering on top of it:

```php
$Textbox->prompt = 'Search an extension';
$Textbox->hint = '(type to filter, ↑/↓ aim, Enter confirm)';
$Textbox->source = static function (string $query) use ($extensions): array {
   if ($query === '') {
      return $extensions;
   }

   return array_values(array_filter(
      $extensions,
      static fn (string $extension): bool => stripos($extension, $query) !== false
   ));
};
$Textbox->strict = true;

$extension = $Textbox->ask();
```

Because the source owns the filtering, it can rank, paginate or hit a database — the labels do not even need to contain the query.

## Confirming (yes/no)

`confirm()` asks a yes/no question and returns a `bool` — the prompt renders a ` [Y/n] ` (or ` [y/N] `) suffix reflecting the default. `y`/`yes`/`n`/`no` are accepted case-insensitively; empty answers and EOF assume the default; invalid answers re-ask on interactive terminals and fall back to the default on pipes:

```php
$confirmed = $Textbox->confirm('Create the project?', default: true);

if ($confirmed === false) {
   // aborted…
}
```

This is how the `bootgly project create` wizard asks its final confirmation — and how the [Form](/manual/CLI/UX/Components/Form/overview) `Confirm` control works.

## The interactive frame

On interactive terminals the input is always framed: the `marker` is drawn before the prompt in every mode, and the `border` draws a rule above and below the input. The `hint` rides the bottom rule, interrupting it like a legend, so it reads right under what it explains, and the option list (a [Listbox](/manual/CLI/UI/Base/Listbox/overview)) drops below it:

```php
$Textbox->marker = '@#Cyan:❯@; '; // default
$Textbox->border = '─';           // default
$Textbox->hint = '(type to filter, ↑/↓ aim, Enter confirm)';
```

```text
──────────────────────────────────────────────
❯ Search a component: t
─ (type to filter, ↑/↓ aim, Enter confirm) ───
=> Prompt
   Textbox
   Toasts
   Tree
```

Both are markup-aware and both accept `''` to disable — an empty `marker` drops the `❯`, an empty `border` drops the two rules (the hint then renders as a dim line right below the prompt). Inside a host that already frames its content — a [Wizard](/manual/CLI/UX/Components/Wizard/overview) step, for instance — set `border = ''` so two containers do not nest.

Once the answer is submitted, the option list is cleared and the settled frame keeps only the prompt and the captured value.

## Non-interactive input

On pipes and CI, `ask()` renders the plain prompt and reads one stdin line — no frame, no option list, no raw mode:

```bash
printf '9090\n' | php app.php
```

With `strict`, the typed line is resolved against the options exactly like picking a row would: labels match case-insensitively, values match exactly, and the answer returned is always the option's value — so typing `mysql` answers `db.mysql`. Unlisted lines render the `Pick one of the options.` Alert and the question is asked again; a `source` is queried with the typed line itself to resolve it.

## Reference

### Properties

```php
public string $prompt
```

Config. The question rendered after the `marker`. Default: `''`.

```php
public string $hint
```

Config. Dim helper line rendered with the input while editing — it interrupts the bottom border rule like a legend (or renders as its own line when `border` is empty). Empty hides it. Default: `''`.

```php
public string $default
```

Config. The answer assumed on empty answer, EOF or exhausted attempts. Default: `''`.

```php
public bool $required
```

Config. When `true` and `default` is empty, empty answers re-ask instead of being accepted. Default: `false`.

```php
public int $attempts
```

Config. Maximum number of asking rounds before the default is assumed — `0` means unlimited. Default: `0`.

```php
public null|Closure $Validator
```

Config. Optional validation Closure with the signature `fn (string $answer): true|string`. It receives the candidate answer — already resolved to the option value in `strict` mode. Returning `true` accepts the answer; returning a string rejects it and renders the string as a Failure Alert. Default: `null`.

```php
public null|string $mask
```

Config. When set, each typed character self-echoes this mask instead (secret input) and the prompt never reveals the `default`. Default: `null`.

```php
public array $options
```

Config. The options offered under the input (`array<int|string,string>`) — a string key is the value returned, an int key returns the label itself. Empty offers nothing. Default: `[]`.

```php
public null|Closure $source
```

Config. Dynamic source with the signature `fn (string $query): array<int|string,string>`, re-queried on every edit and returning options in the same shape as `options`. It filters by itself — its result is never filtered again. Default: `null`.

```php
public int $viewport
```

Config. Maximum visible option rows — longer lists window around the aim with `↑ N more` / `↓ N more` markers. Default: `5`.

```php
public string $marker
```

Config. Markup drawn before the prompt in every mode — `''` disables it. Default: `'@#Cyan:❯@; '`.

```php
public string $border
```

Config. The character of the rules drawn above and below the input — `''` disables the frame. Default: `'─'`.

```php
public bool $strict
```

Config. When `true`, the answer must be one of the options and Enter submits the aimed one's value. Default: `false`.

```php
public private(set) string $answer
```

Metadata (read-only). The answer returned by the last `ask()` call.

```php
public private(set) int $attempt
```

Metadata (read-only). The number of rounds consumed by the last `ask()` call.

```php
public private(set) null|bool $confirmed
```

Metadata (read-only). The result of the last `confirm()` call — `null` before the first call.

### ask()

```php
public function ask (): string
```

Asks until a valid answer, EOF or exhausted attempts. Interactive terminals edit inside the framed input (with the option list when there is anything to offer); masked input self-echoes the mask; non-interactive input reads a plain stdin line. Empty answers assume the default; when `required` is `true` and there is no default, empty answers re-ask; in `strict` mode unlisted answers re-ask and listed ones resolve to the option value; when the `Validator` returns an error string, the error is rendered as a Failure Alert and the question is asked again. EOF or exhausted `attempts` return the default. Stores the result in `answer` and returns it.

### confirm()

```php
public function confirm (string $prompt = '', bool $default = false): bool
```

Asks for a yes/no confirmation rendering `prompt [Y/n] ` (or ` [y/N] ` when `$default` is `false`). A non-empty `$prompt` overrides the configured one. Accepts `y`/`yes`/`n`/`no` case-insensitively; empty answers and EOF assume the default; on non-interactive input, invalid answers also fall back to the default. Stores the result in `confirmed` and returns it.
