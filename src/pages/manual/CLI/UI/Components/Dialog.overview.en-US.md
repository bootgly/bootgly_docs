# Dialog Component

The `Dialog` component handles quick, line-based interactions in the terminal: yes/no confirmations, raw prompts and acknowledgement alerts. It reads whole lines from the Terminal `Input` and renders through the Terminal `Output`, so it behaves the same on interactive terminals (TTY) and on piped input — scripts and CI runs stay deterministic by assuming the defaults.

Together with the [Menu](/manual/CLI/UI/Components/Menu/overview) and [Question](/manual/CLI/UI/Components/Question/overview) components, `Dialog` powers the interactive `bootgly project create` wizard — they are part of the v0.20.0-beta UX Interactive components.

Transcript-style examples are available in the [showcase](/manual/CLI/UI/Components/Dialog/showcase).

## Instance

To use the component, it is necessary to create an instance passing as parameters the instances of the `Input` and `Output` components:

```php
use const Bootgly\CLI;
use Bootgly\CLI\UI\Components\Dialog;

$Terminal = CLI->Terminal;

$Dialog = new Dialog($Terminal->Input, $Terminal->Output);
```

## Confirming an action

The `confirm()` method renders the message followed by a `[y/N]` suffix and returns a boolean:

```php
if ($Dialog->confirm('Delete all logs?') === true) {
   // delete the logs...
}
```

`y`/`yes` and `n`/`no` are accepted case-insensitively. An empty answer (just Enter) or EOF assumes the default — `false`, unless you pass `default: true`, which also flips the suffix to `[Y/n]`:

```php
// Renders `Keep the generated files? [Y/n] `
$keep = $Dialog->confirm('Keep the generated files?', default: true);
```

On interactive terminals, invalid answers re-ask the question; on non-interactive input, they fall back to the default.

## Prompting for a raw value

The `prompt()` method renders the message with an optional `[default]` suffix and returns the trimmed raw answer:

```php
// Renders `Your name [anonymous]: `
$name = $Dialog->prompt('Your name', default: 'anonymous');
```

An empty answer or EOF returns the default. `prompt()` does not validate anything — when the answer must be validated, required or re-asked, use the [Question component](/manual/CLI/UI/Components/Question/overview) instead.

## Alerting and pausing

The `alert()` method renders the message through the [Alert component](/manual/CLI/UI/Components/Alert/overview) (Attention type). On interactive terminals it then prints `Press Enter to continue...` and waits for Enter; on non-interactive terminals it returns immediately:

```php
$Dialog->alert('Disk is almost full!');
```

## Reference

### Properties

```php
public string $message
```

Config. The message rendered by the dialog. Default: `''`. It is set by `alert()`, `confirm()` and `prompt()` from their `$message` argument.

```php
public bool $default
```

Config. The value assumed by `confirm()` on empty answer or EOF. Default: `false`.

```php
public string $suffix
```

Data. The text rendered after the message — set internally by `confirm()` (` [y/N] ` / ` [Y/n] `) and `prompt()` (` [default]: `).

```php
public private(set) null|bool $confirmed
```

Metadata (read-only). The result of the last `confirm()` call — `null` until the first confirmation.

```php
public private(set) string $answer
```

Metadata (read-only). The answer returned by the last `prompt()` call.

### alert()

```php
public function alert (string $message): void
```

Renders `$message` through the Alert component (Attention type). On interactive terminals (TTY) it then prints `Press Enter to continue...` and waits for Enter; on non-interactive terminals it returns immediately.

### confirm()

```php
public function confirm (string $message, bool $default = false): bool
```

Renders `$message` followed by ` [y/N] ` (or ` [Y/n] ` when `$default` is `true`) and reads a line. Accepts `y`/`yes`/`n`/`no` case-insensitively; an empty answer or EOF assumes `$default`. Invalid answers re-ask on interactive terminals and fall back to `$default` on non-interactive input. Stores the result in `$confirmed` and returns it.

### prompt()

```php
public function prompt (string $message, string $default = ''): string
```

Renders `$message` followed by ` [$default]: ` (or just `: ` when `$default` is empty) and reads a line. Returns the trimmed raw answer; an empty answer or EOF returns `$default`. No validation is performed — validated input is the Question component's job. Stores the result in `$answer` and returns it.
