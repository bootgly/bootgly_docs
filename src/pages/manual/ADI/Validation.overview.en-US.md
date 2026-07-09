# Validation

`Bootgly\ADI\Validation` validates any associative array with composable rule objects — the same rules verify an HTTP request body, a CLI command's input, a queue job payload or a seeder row. It lives in the ADI layer, so every higher layer (API, CLI, WPI) can use it.

## Validating data

Build a `Validation` with a `source` array and a map of `rules` per field. Validation runs immediately — read `valid` and `errors` right after:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\Integer;
use Bootgly\ADI\Validators\Maximum;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\ADI\Validators\Required;

$Validation = new Validation(
   source: [
      'email' => 'user@example.com',
      'age'   => '18',
   ],
   rules: [
      'email' => [new Required, new Email],
      'age'   => [new Required, new Integer, new Minimum(18), new Maximum(120)],
   ]
);

$Validation->valid;  // true | false
$Validation->errors; // ['email' => ['email must be a valid email address.'], ...]
```

Errors accumulate as `array<field, array<string>>` — one message per failed rule, so a single field can carry several messages.

## In a CLI command or script

Nothing HTTP-related is required — validate whatever array you have:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Required;
use Bootgly\ADI\Validators\URL;

$Validation = new Validation(
   source: [
      'name'   => $arguments[0] ?? null,
      'mode'   => $options['mode'] ?? null,
      'origin' => $options['origin'] ?? null,
   ],
   rules: [
      'name'   => [new Required],
      'mode'   => [new In(['daemon', 'foreground'])],
      'origin' => [new URL],
   ]
);

if ($Validation->valid === false) {
   foreach ($Validation->errors as $field => $messages) {
      echo "- {$messages[0]}\n";
   }
   exit(1);
}
```

## In a seeder or job

Guard data before it reaches the database or the worker:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Date;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\Required;

foreach ($rows as $index => $row) {
   $Validation = new Validation(
      source: $row,
      rules: [
         'email'      => [new Required, new Email],
         'created_at' => [new Date('Y-m-d H:i:s')],
      ]
   );

   if ($Validation->valid === false) {
      throw new RuntimeException("Seed row #{$index} is invalid.");
   }
}
```

## Optional fields and implicit rules

A field that is missing, `null`, `''` or `[]` is treated as *blank*. Blank fields skip every rule **except implicit ones** — `Required` is implicit, so it still runs and fails. This makes optional fields natural:

```php
rules: [
   'website' => [new URL], // only validated when a non-blank value arrives
   'email'   => [new Required, new Email], // Required rejects the blank case
]
```

## Custom messages

Every rule accepts an optional `message` constructor argument that replaces its default:

```php
new Required('Name cannot be empty.');
new Minimum(8, 'Password must be at least 8 characters.');
new URL(message: 'Give me a real URL.');
```

## Custom rules

Extend `Bootgly\ADI\Validators` (the extension base for application rules) and implement `validate()` and `format()`:

```php
use Bootgly\ADI\Validators;

$InviteCode = new class extends Validators {
   /**
    * @param array<string,mixed> $data  Full source array — useful for cross-field rules.
    */
   public function validate (string $field, mixed $value, array $data): bool
   {
      return is_string($value) && $value === 'bootgly';
   }

   public function format (string $field): string
   {
      return "{$field} must match the demo invite code.";
   }
};
```

Set `$implicit = true` in your subclass when the rule must run even for missing/blank fields (the way `Required` does). `validate()` receives the full `$data` source, so cross-field rules (like `Confirmed`) need no extra wiring.

## Validating HTTP requests

In WPI routes, plug the same rules into the `Validator` middleware — it reads one Request source and fails closed with a JSON `422` before the handler runs. See [Request Validation](/manual/WPI/HTTP/HTTP_Server_CLI/Request/#request-validation) and [Middlewares → Validator](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/#validator).

## Reference

### Validation

```php
public function __construct (array $source, array $rules)
```

Runs the rules against the source immediately. `$rules` maps each field to a `Condition` or a list of `Condition` objects; anything else throws `InvalidArgumentException`.

```php
public private(set) array $errors;
```

Failure messages per field: `array<string, array<int,string>>`. Empty when everything passed.

```php
public bool $valid { get; }
```

`true` when `$errors` is empty.

### Condition

The abstract base of every rule (`Bootgly\ADI\Validation\Condition`). `Bootgly\ADI\Validators` extends it as the application-facing base for custom rules.

```php
abstract public function validate (string $field, mixed $value, array $data): bool
```

Returns `true` when the value is valid. Receives the full `$data` source for cross-field logic.

```php
public function format (string $field): string
```

Returns the error message — the custom `message` passed to the constructor, or the rule's default.

```php
public protected(set) bool $implicit = false;
```

Implicit rules run even when the field is blank/missing (e.g. `Required`).

### Built-in rules

All in `Bootgly\ADI\Validators`. Each accepts an optional `string $message` to override the default.

---

#### Required

```php
new Required;
new Required('Name cannot be empty.');
```

Rejects `null`, empty strings (after `trim`) and empty arrays. Implicit — runs even when the field is missing. Default message: `"{field} is required."`

---

#### Boolean

```php
new Boolean;
```

Accepts `bool`, the integers `0`/`1` and the strings `'0'`, `'1'`, `'true'`, `'false'` — nothing else (`'yes'`/`'on'` are rejected). Default message: `"{field} must be a boolean."`

---

#### Integer

```php
new Integer;
```

Accepts native `int` or strings matching `/\A[-+]?\d+\z/`. Default message: `"{field} must be an integer."`

---

#### Minimum

```php
new Minimum(18);
new Minimum(8, 'Password must be at least 8 characters.');
```

Lower-bound rule. Compares numeric values by value, non-numeric strings by `strlen` and arrays by `count`. Default message: `"{field} must be at least {limit}."`

---

#### Maximum

```php
new Maximum(120);
new Maximum(500, 'Bio cannot exceed 500 characters.');
```

Upper-bound counterpart of `Minimum`, with the same dispatch. Default message: `"{field} must be at most {limit}."`

---

#### In

```php
new In(['active', 'archived']);
new In([1, 2, 3], strict: false);
```

Accepts values inside the allowlist. Strict comparison by default (`'3'` does not match `3`); pass `strict: false` for loose comparison. Default message: `"{field} must be one of the allowed values."`

---

#### Email

```php
new Email;
```

Validates with PHP's `filter_var($value, FILTER_VALIDATE_EMAIL)`. Default message: `"{field} must be a valid email address."`

---

#### URL

```php
new URL;
```

Validates with PHP's `filter_var($value, FILTER_VALIDATE_URL)`. Default message: `"{field} must be a valid URL."`

---

#### Date

```php
new Date;                // any strtotime()-parseable date
new Date('Y-m-d');       // strict format
```

Without a format, accepts any string `strtotime()` can parse. With a format, parses via `DateTimeImmutable::createFromFormat()` and round-trips the result — calendar overflows like `2026-02-30` are rejected. Default message: `"{field} must be a valid date."` / `"{field} must be a valid date in the format {format}."`

---

#### Confirmed

```php
new Confirmed;                    // matches {field}_confirmation
new Confirmed(field: 'PIN_check'); // matches a custom confirming field
```

Cross-field equality: the value must strictly equal the confirming field in the same source (default `{field}_confirmation`). Default message: `"{field} confirmation does not match."`

---

#### Regex

```php
new Regex('/\A[a-z0-9_-]+\z/');
new Regex('/\A[a-z0-9_]{3,}\z/', 'Username must be alphanumeric, 3+ chars.');
```

Matches the value against a PCRE pattern. Throws `InvalidArgumentException` at construction time if the pattern is invalid. Default message: `"{field} has an invalid format."`

---

#### Size

```php
new Size(2 * 1024 * 1024); // 2 MB
```

Validates upload structures (`['name', 'type', 'size', 'error', 'tmp_name']`). Passes when `error === 0` and `size <= $limit` (bytes). Default message: `"{field} must be at most {limit} bytes."`

---

#### MIME

```php
new MIME('application/pdf');
new MIME(['image/jpeg', 'image/png']);
```

Validates upload structures against an allowlist of MIME types (case-sensitive). Default message: `"{field} must have an allowed MIME type."`

---

#### Extension

```php
new Extension('zip');
new Extension(['jpg', 'jpeg', 'png']);
```

Validates upload structures against an allowlist of file extensions (case-insensitive; a leading `.` is accepted and stripped). Default message: `"{field} must have an allowed extension."`
