# Question Component

The `Question` component asks for validated, line-based input in the terminal. It renders a prompt (with an optional default), reads a line and re-asks until the answer is valid, the input ends (EOF) or the attempts are exhausted. Empty answers assume the default, so it also works with piped input and stays deterministic in scripts and CI.

Together with the [Menu](/manual/CLI/UI/Components/Menu/overview) component, `Question` powers the interactive `bootgly project create` wizard — it is the one canonical way to ask the user anything: validated lines, secret input, autocomplete and yes/no confirmations.

Transcript-style examples are available in the [showcase](/manual/CLI/UI/Components/Question/showcase).

## Instance

To use the component, it is necessary to create an instance passing as parameters the instances of the `Input` and `Output` components:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Question;

$Terminal = CLI->Terminal;

$Question = new Question($Terminal->Input, $Terminal->Output);
```

## Asking with a default

Set the `prompt` and the `default`, then call `ask()`:

```php
$Question->prompt = 'Server port';
$Question->default = '8080';

$port = $Question->ask(); // renders `Server port [8080]: `
```

An empty answer (just Enter) or EOF returns `'8080'`.

## Validating answers

Assign a Closure to `$Validator` — it receives the candidate answer and returns `true` to accept it or an error message string to reject it. The error is rendered as a Failure [Alert](/manual/CLI/UI/Components/Alert/overview) and the question is asked again:

```php
$Question->prompt = 'Server port';
$Question->default = '8080';
$Question->Validator = static function (string $answer): true|string {
   if (preg_match('#^\d{1,5}$#', $answer) !== 1) {
      return 'Invalid port: use a number between 1 and 65535.';
   }

   return true;
};

$port = $Question->ask();
```

The default goes through the Validator too: an empty answer assumes the default before the validation runs.

## Requiring an answer

When `required` is `true` and there is no default, empty answers render an `An answer is required.` Failure Alert and the question is asked again:

```php
$Question->prompt = 'Project path (e.g. `App` or `App/API`)';
$Question->required = true;

$path = $Question->ask();
```

This is exactly how the `bootgly project create` wizard asks for the project path.

## Limiting attempts

The `attempts` property caps how many times the question is asked — `0` (the default) means unlimited. When the attempts are exhausted, `ask()` gives up and returns the default:

```php
$Question->prompt = 'Access token';
$Question->attempts = 3;
$Question->Validator = static function (string $answer): true|string {
   if (strlen($answer) !== 40) {
      return 'Invalid token: 40 characters expected.';
   }

   return true;
};

$token = $Question->ask(); // returns '' (the default) after 3 invalid answers
```

## Masking secret input

Set `mask` to echo a mask character instead of what is typed — passwords and tokens never appear on screen. On real TTYs the kernel echo is disabled during the read; on pipes nothing is echoed and the value is read verbatim:

```php
$Question->prompt = 'Password';
$Question->required = true;
$Question->mask = '•';

$password = $Question->ask(); // typing `hunter2` renders `•••••••`
```

A masked question with a `default` never reveals it — the prompt renders the mask repeated (`Token [•••]: `) and an empty answer still assumes the real default value.

## Autocompleting with suggestions

Set `suggestions` to get an interactive filtered dropdown on interactive terminals: typing filters (`stripos`), `↑`/`↓` aim, `Tab` completes to the aimed match, `Esc` closes the dropdown keeping the typed text, and Enter submits. With `strict`, the answer must be one of the suggestions (Enter submits the aimed match):

```php
$Question->prompt = 'Platform';
$Question->suggestions = ['Console', 'Web', 'Both'];
$Question->limit = 5;      // visible dropdown rows
$Question->strict = true;  // must pick a listed answer

$platform = $Question->ask();
```

On pipes the question reads a plain line — `strict` re-asks unlisted answers with a Failure Alert, keeping scripts deterministic.

## Confirming (yes/no)

`confirm()` asks a yes/no question and returns a `bool` — the prompt renders a ` [Y/n] ` (or ` [y/N] `) suffix reflecting the default. `y`/`yes`/`n`/`no` are accepted case-insensitively; empty answers and EOF assume the default; invalid answers re-ask on interactive terminals and fall back to the default on pipes:

```php
$confirmed = $Question->confirm('Create the project?', default: true);

if ($confirmed === false) {
   // aborted…
}
```

This is how the `bootgly project create` wizard asks its final confirmation — and how the [Form](/manual/CLI/UX/Components/Form/overview) `Confirm` control works.

## Reference

### Properties

```php
public string $prompt
```

Config. The question rendered before the ` [default]: ` suffix. Default: `''`.

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

Config. Maximum number of times the question is asked — `0` means unlimited. Default: `0`.

```php
public null|Closure $Validator
```

Config. Optional validation Closure with the signature `fn (string $answer): true|string`. Returning `true` accepts the answer; returning a string rejects it and renders the string as a Failure Alert. Default: `null`.

```php
public null|string $mask
```

Config. When set, each typed character self-echoes this mask instead (secret input) and the prompt never reveals the `default`. Default: `null`.

```php
public array $suggestions
```

Config. Autocomplete suggestions (`array<string>`) — interactive terminals get a filtered dropdown; empty disables. Default: `[]`.

```php
public int $limit
```

Config. Visible dropdown rows for `suggestions`. Default: `5`.

```php
public bool $strict
```

Config. When `true`, the answer must be one of the `suggestions`. Default: `false`.

```php
public private(set) string $answer
```

Metadata (read-only). The answer returned by the last `ask()` call.

```php
public private(set) int $attempt
```

Metadata (read-only). The number of attempts consumed by the last `ask()` call.

```php
public private(set) null|bool $confirmed
```

Metadata (read-only). The result of the last `confirm()` call — `null` before the first call.

### ask()

```php
public function ask (): string
```

Renders `prompt [default]: ` and reads a line. Empty answers assume the default; when `required` is `true` and there is no default, empty answers re-ask; when the `Validator` returns an error string, the error is rendered as a Failure Alert and the question is asked again. EOF or exhausted `attempts` return the default. Stores the result in `$answer` and returns it.

### confirm()

```php
public function confirm (string $prompt = '', bool $default = false): bool
```

Asks for a yes/no confirmation rendering `prompt [Y/n] ` (or ` [y/N] ` when `$default` is `false`). A non-empty `$prompt` overrides the configured one. Accepts `y`/`yes`/`n`/`no` case-insensitively; empty answers and EOF assume the default; on non-interactive input, invalid answers also fall back to the default. Stores the result in `$confirmed` and returns it.
