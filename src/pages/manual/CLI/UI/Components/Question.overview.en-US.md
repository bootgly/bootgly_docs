# Question Component

The `Question` component asks for validated, line-based input in the terminal. It renders a prompt (with an optional default), reads a line and — unlike the raw [Dialog `prompt()`](/manual/CLI/UI/Components/Dialog/overview) — re-asks until the answer is valid, the input ends (EOF) or the attempts are exhausted. Empty answers assume the default, so it also works with piped input and stays deterministic in scripts and CI.

Together with the [Menu](/manual/CLI/UI/Components/Menu/overview) and [Dialog](/manual/CLI/UI/Components/Dialog/overview) components, `Question` powers the interactive `bootgly project create` wizard — they are part of the v0.20.0-beta UX Interactive components.

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
public private(set) string $answer
```

Metadata (read-only). The answer returned by the last `ask()` call.

```php
public private(set) int $attempt
```

Metadata (read-only). The number of attempts consumed by the last `ask()` call.

### ask()

```php
public function ask (): string
```

Renders `prompt [default]: ` and reads a line. Empty answers assume the default; when `required` is `true` and there is no default, empty answers re-ask; when the `Validator` returns an error string, the error is rendered as a Failure Alert and the question is asked again. EOF or exhausted `attempts` return the default. Stores the result in `$answer` and returns it.
