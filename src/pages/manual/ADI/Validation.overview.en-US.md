# Validation

`Bootgly\ADI\Validation` checks an associative array against rules and reports, field by field, the
message of each rule that failed. A rule is an object, a `Bootgly\ADI\Validation\Condition`: the 14
built-in ones live in `Bootgly\ADI\Validators\*`, and what each of them accepts is on
**[Validators](/manual/ADI/Validators/overview/)**. An application writes its own by extending
`Bootgly\ADI\Validators` (see [Write a custom rule](#write-a-custom-rule)).

The engine sits in the ADI layer, so every layer above it validates with the same rules. On the
HTTP server, the `Validator` middleware runs it on one Request source before the route handler and,
by default, answers `422` when a rule fails — see
**[Request Validation](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/#request-validation)** and
**[Middlewares → Validator](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/overview/#validator)**.
Anywhere else — a console command, a worker, a job, a seeder, a script — build a `Validation` on the
array you hold. The **[Validation guide](/guide/validation/overview/)** walks through those uses;
this page is the engine's behavior and its Reference. The messages are translated through
`Bootgly\ABI\Data\Language`, whose catalogs, and the list of default messages, are on
**[i18n](/guide/i18n/overview/#localized-validation-messages)**.

## Run a validation

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Required;

$Validation = new Validation(
   source: [
      'name' => 'Ada',
      'email' => 'ada.example.com',
      'plan' => 'gold',
   ],
   rules: [
      'name' => [new Required],
      'email' => [new Required, new Email],
      'plan' => [new Required, new In(['free', 'pro'])],
      'country' => new Required,
   ]
);

$Validation->valid; // false
$Validation->errors;
// [
//    'email' => ['email must be a valid email address.'],
//    'plan' => ['plan must be one of the allowed values.'],
//    'country' => ['country is required.'],
// ]
```

The constructor does the work: it runs the rules against the `source` array on the spot, and
`valid` and `errors` hold the outcome — reading them runs nothing again. A `Validation` checks one
array once, so build a new one for the next request, row or payload.

- `$rules` maps each field to a list of rules, run in the order they are listed. A single rule
  needs no list: `'country' => new Required` is `[new Required]`.
- `errors` (`array<string, array<int,string>>`) lists a field only when at least one of its rules
  failed, with one message per failed rule, in rule order; the fields come in the order of
  `$rules`. A field whose rules all passed is absent — `name` above — and `errors` is `[]` when
  everything passed.
- `valid` is `true` exactly when `errors` is empty.
- Both are read-only: assigning `errors` throws `Error` with
  `Cannot modify private(set) property Bootgly\ADI\Validation::$errors from global scope`, and
  assigning `valid` throws `Property Bootgly\ADI\Validation::$valid is read-only`.

The result carries no values: the engine reports, and the data stays in the array you passed (see
[Values are not converted](#values-are-not-converted)).

## Rules per field

A rule key names one top-level key of the source, matched exactly: case-sensitively, and with no
path syntax. `'user.email'` looks for a key literally named `user.email`, and `'email'` does not
match `'Email'`; nested fields are not supported for now. Request headers are the one exception the
`Validator` middleware makes for you: it matches their names in any case before the engine runs
(see **[Middlewares → Validator](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/overview/#validator)**).

An array value reaches its rules whole, so to check the keys inside it, give that array a
`Validation` of its own:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Required;

$payload = [
   'user' => ['email' => 'ada.example.com', 'role' => 'admin'],
   'plan' => 'pro',
];

$Payload = new Validation($payload, [
   'user' => [new Required],
   'plan' => [new Required, new In(['free', 'pro'])],
]);
$User = new Validation($payload['user'], [
   'email' => [new Required, new Email],
   'role' => [new In(['member', 'owner'])],
]);

$Payload->valid; // true
$User->errors;
// [
//    'email' => ['email must be a valid email address.'],
//    'role' => ['role must be one of the allowed values.'],
// ]
```

The inner messages name the inner keys — `email`, not `user.email`. The source must be an array, so
check that a nested value is one before you pass it: anything else throws `TypeError`.

- Source keys that no rule names are ignored: they cause no error, and nothing removes them. An
  extra `is_admin` key is still in the array after a validation that passed, so pick the keys you
  store yourself.
- A rule object keeps only its settings, so one instance can serve several fields and several
  validations, and each message names its own field: one `$Required` listed under `first_name` and
  `last_name` reports `first_name is required.` and `last_name is required.` The `Validator`
  middleware relies on this: it builds a new `Validation` for every request from the rule objects
  the route declared once.
- An empty list — `'note' => []` — checks nothing.

## Blank values and implicit rules

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\ADI\Validators\Regex;
use Bootgly\ADI\Validators\Required;
use Bootgly\ADI\Validators\URL;

$Validation = new Validation(
   source: [
      'nickname' => '',
      'website' => null,
      'tags' => [],
      'bio' => '   ',
      'phone' => '   ',
   ],
   rules: [
      'nickname' => [new Regex('/\A[a-z]+\z/')],
      'website' => [new URL],
      'tags' => [new Minimum(1)],
      'country' => [new In(['BR', 'US'])],
      'bio' => [new Regex('/\A[a-z]+\z/')],
      'phone' => [new Required],
   ]
);

$Validation->errors;
// [
//    'bio' => ['bio has an invalid format.'],
//    'phone' => ['phone is required.'],
// ]
```

A value is blank when its key is missing or it is `null`, `''` or `[]`. A blank value skips every
rule that is not implicit, which makes each field optional until a rule says otherwise: `nickname`,
`website`, `tags` and the missing `country` pass above, whatever their rules check — `Minimum(1)`
included, so it cannot require a non-empty list: an implicit rule such as `Required` can.

- `Required` is the only implicit built-in rule: it runs on a blank value and fails it. A custom
  rule can be implicit too (see [Implicit and cross-field rules](#implicit-and-cross-field-rules)).
- Nothing else is blank. A string of spaces reaches every rule — `bio` fails its pattern — and
  `Required` fails it because it trims strings first (`phone`). `0`, `'0'` and `false` are not
  blank either: they pass `Required` and reach the other rules.
- A missing key and a `null` value look the same to a rule: both arrive as `null`. A custom rule
  that must tell them apart checks `array_key_exists($field, $data)`.

`Confirmed` is not implicit, so a blank field skips it — even when the confirmation holds something
else:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Confirmed;

$Validation = new Validation(
   source: ['password' => '', 'password_confirmation' => 'something else'],
   rules: ['password' => [new Confirmed]]
);

$Validation->valid; // true
```

List `Required` first when the field must be filled: with `[new Required, new Confirmed]`, the same
source reports `password is required.`

## Every rule runs

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Regex;
use Bootgly\ADI\Validators\Required;

$Validation = new Validation(
   source: ['category' => 'Latest News'],
   rules: [
      'category' => [new Required, new Regex('/\A[a-z-]+\z/'), new In(['news', 'blog'])],
   ]
);

$Validation->errors;
// [
//    'category' => [
//       'category has an invalid format.',
//       'category must be one of the allowed values.',
//    ],
// ]
```

A failed rule does not stop its field: every rule of the list runs, in order, and each failure adds
its message. For now there is no way to stop at the first failure; show
`$Validation->errors[$field][0]` when one message per field is enough.

So a rule also runs on a value an earlier rule rejected: an array where `Integer` wanted digits, an
`int` where `Email` wanted a string. The built-in rules return a verdict for a value of any type — a
type a rule does not handle fails it — except, for now, `Date` with a format, which throws
`ValueError` on a string holding a NUL byte (see [Dates](/manual/ADI/Validators/overview/#dates)).
For now, two more throw on values no request can carry (see
[Errors](/manual/ADI/Validators/overview/#errors)). A custom rule must return a verdict for any type too, because
nothing guards it: a `validate()` that hands an array to `strtoupper()` throws `TypeError` out of
`new Validation()`. Whatever a rule throws escapes the constructor, and no `Validation` is returned.

## Values are not converted

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Integer;
use Bootgly\ADI\Validators\Required;

parse_str('page=2&limit=25', $query);

$Validation = new Validation($query, [
   'page' => [new Required, new Integer, new In([1, 2, 3])],
   'limit' => [new Integer],
]);

$Validation->errors; // ['page' => ['page must be one of the allowed values.']]
```

The engine changes nothing: it does not cast, trim or filter, and it hands back no validated copy.
Each rule sees the value with the type it arrived with. A query string or a form body gives strings,
so `page` is `'2'`: `Integer` accepts its digits, and the strict `In([1, 2, 3])` refuses the string.
A JSON body decoded into an array keeps its JSON types, so `{"page": 2}` passes the same rules.

- Write the values as they arrive — `In(['1', '2', '3'])` — or compare loosely —
  `In([1, 2, 3], strict: false)`. How each rule reads each type is on
  **[Validators](/manual/ADI/Validators/overview/)**.
- Convert after validating: `(int) $query['page']` is `2`.
- Spaces are part of the value: a form that sends `name=+Ada+` gives `' Ada '`, which `In(['Ada'])`
  refuses. Trim before validating when your input may be padded.

## Messages

A failed rule adds `format($field)` to `errors`. That one method builds every message, in three
steps:

1. It takes the `message` the rule was built with, or the rule's template when there is none — `''`
   counts as none. Every built-in rule takes `message` as its last constructor argument.
2. It looks that text up in the `validation` domain of the `Bootgly\ABI\Data\Language` catalogs,
   for the active locale. The English text is the key, and a text no catalog lists comes back as it
   is — every text, while no catalog is registered.
3. It replaces `{field}` with the field name, and the rule's own placeholders, such as `{limit}`,
   with their values. A placeholder the rule does not fill stays as written.

### Override a message

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Maximum;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\ADI\Validators\Required;

$Validation = new Validation(
   source: ['age' => '16', 'tags' => ['a', 'b', 'c', 'd']],
   rules: [
      'age' => [new Minimum(18, 'You must be {limit} or older.')],
      'tags' => [new Maximum(3, message: '{field} accepts up to {limit} items.')],
      'name' => [new Required('Tell us your {label}.')],
   ]
);

$Validation->errors;
// [
//    'age' => ['You must be 18 or older.'],
//    'tags' => ['tags accepts up to 3 items.'],
//    'name' => ['Tell us your {label}.'],
// ]
```

A message given to a rule replaces its template and gets the same placeholders: `{field}`, and the
rule's own — `{limit}` here. The placeholders of each built-in rule are on
**[Validators](/manual/ADI/Validators/overview/)**. `Required` fills no `{label}`, so it stays.

### Translate messages

A catalog of the `validation` domain is a `validation.php` file per locale:

```php
<?php
// catalogs/pt-BR/validation.php

return [
   '{field} is required.' => '{field} é obrigatório.',
   'Choose a plan.' => 'Escolha um plano.',
];
```

```php
use Bootgly\ABI\Data\Language;
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Required;

Language::load(__DIR__ . '/catalogs'); // in a project, catalogs/ is registered at boot: skip this line
Language::$locale = 'pt-BR';

$Validation = new Validation(
   source: ['plan' => 'gold'],
   rules: [
      'email' => [new Required],
      'plan' => [new In(['free', 'pro'], message: 'Choose a plan.')],
      'name' => [new Required('Tell us your name.')],
   ]
);

$Validation->errors;
// [
//    'email' => ['email é obrigatório.'],
//    'plan' => ['Escolha um plano.'],
//    'name' => ['Tell us your name.'],
// ]
```

Default templates and your own messages are keys alike: the catalog above translates the template
of `Required` and the message `Choose a plan.`, and leaves `Tell us your name.`, which it does not
list, as written. Every default template, and how catalogs are found and registered, is on
**[i18n](/guide/i18n/overview/#localized-validation-messages)**.

- `{field}` is the field name exactly as the rule key spells it, in every locale — `email` above.
  For a name your users read, write the message of that rule — `new Required('Tell us your name.')`
  — and translate the message.
- The locale is the one active when the `Validation` runs, because `errors` holds finished strings:
  setting `Language::$locale` afterwards changes none of them. In an HTTP route, that is the locale
  negotiated from the request's `Accept-Language` once catalogs are registered (see
  **[Automatic per-request negotiation](/guide/i18n/overview/#automatic-per-request-negotiation-web)**);
  in a script or a command, set it yourself (see
  **[Console and scripts](/guide/i18n/overview/#console-and-scripts)**).
- Messages are plain text, never escaped: escape them where you print them into HTML.

## Write a custom rule

```php
use Bootgly\ADI\Validators;

class Prefix extends Validators
{
   // * Config
   public private(set) string $prefix;

   // * Metadata
   protected string $template = '{field} must start with {prefix}.';


   public function __construct (string $prefix, string $message = '')
   {
      parent::__construct($message);

      // * Config
      $this->prefix = $prefix;

      // * Metadata
      $this->substitutions = ['prefix' => $prefix];
   }

   public function validate (string $field, mixed $value, array $data): bool
   {
      return is_string($value) && str_starts_with($value, $this->prefix);
   }
}
```

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Required;

$Validation = new Validation(
   source: ['invoice' => '2026-0042', 'order' => 'X-7'],
   rules: [
      'invoice' => [new Required, new Prefix('INV-')],
      'order' => [new Prefix('ORD-', message: 'Order codes start with {prefix}.')],
   ]
);

$Validation->errors;
// [
//    'invoice' => ['invoice must start with INV-.'],
//    'order' => ['Order codes start with ORD-.'],
// ]
```

That is the whole recipe:

- Extend `Bootgly\ADI\Validators`, the base for application rules. It is a `Condition`, the type
  `Validation` requires of every rule.
- Implement `validate()`. It gets the field name, the value — `null` when the key is missing — and
  the whole source, and returns `true` when the value passes. It can receive any type (see
  [Every rule runs](#every-rule-runs)), so check the type first, as `is_string()` does here.
- Declare the default message in `$template`. It works like a built-in one: a `message` given to the
  rule replaces it, and it is a catalog key — with
  `'{field} must start with {prefix}.' => '{field} deve começar com {prefix}.'` in
  `catalogs/pt-BR/validation.php`, the first error above reads `invoice deve começar com INV-.`
  under `pt-BR`. A rule with no `$template` of its own reports `{field} is invalid.`, the template
  of `Condition`.
- Put the rule's own placeholders in `$substitutions`, as strings keyed by name, without braces;
  `{field}` is filled in for you.
- A constructor of your own takes `string $message = ''` and passes it to `parent::__construct()`.
  Skip that call and the rule's `message` is never set: its first failure throws `Error` with
  `Typed property Bootgly\ADI\Validation\Condition::$message must not be accessed before initialization`.
- Keep `validate()` free of state: one rule object serves every field, validation and request it is
  listed for (see [Rules per field](#rules-per-field)).

### Implicit and cross-field rules

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators;

$Company = new class extends Validators {
   public protected(set) bool $implicit = true;
   protected string $template = '{field} is required for business accounts.';

   public function validate (string $field, mixed $value, array $data): bool
   {
      if (($data['type'] ?? null) !== 'business') {
         return true;
      }

      return is_string($value) && trim($value) !== '';
   }
};

$Validation = new Validation(
   source: ['type' => 'business'],
   rules: ['company' => [$Company]]
);

$Validation->errors; // ['company' => ['company is required for business accounts.']]
```

- A rule that is not implicit never sees a blank value, so without `$implicit` this one would let a
  missing `company` pass. Redeclare the property as `public protected(set) bool $implicit = true;`
  in the class body, as here, or set `$this->implicit = true;` in the constructor, after
  `parent::__construct()`, as `Required` does.
- `$data` is the whole source, so a rule can read other fields — `Confirmed` reads
  `<field>_confirmation` the same way. With `'type' => 'personal'`, this rule passes.

### Why not override format()

`format()` is where the `message`, the catalogs and the placeholders are applied, so a rule that
overrides it to return text of its own loses all three. Written with
`public function format (string $field): string { return "{$field} must be even."; }`, a rule
reports `count must be even.` even when it is built with `message: 'Give an even number.'`, and
still in English under `pt-BR` with a catalog that translates `{field} must be even.`: nothing calls
the catalogs any more. The same rule with `protected string $template = '{field} must be even.';`
and no `format()` reports `Give an even number.` when it is given that message, and
`count deve ser par.` under `pt-BR`. Shape the message with `$template` and `$substitutions`, and
leave `format()` to `Condition`.

## Call a rule directly

```php
use Bootgly\ADI\Validators\Integer;

$Rule = new Integer;

$Rule->validate('port', '8080', []); // true
$Rule->validate('port', '80a', []);  // false
$Rule->format('port');               // 'port must be an integer.'
```

A rule works without a `Validation`: `validate()` judges one value, and `format()` renders the
message the same way, catalogs included. The blank skip belongs to `Validation`, so a direct call
judges blank values too — `new Email` answers `false` for `''`. That pair fits the `Validator` of a
CLI Textbox, which returns `true` or the message to show (see
**[Validating answers](/manual/CLI/UI/Components/Textbox/overview/#validating-answers)**):

```php
use Bootgly\ADI\Validators\Integer;

$Port = new Integer;

$Textbox->Validator = static fn (string $answer): true|string =>
   $Port->validate('port', $answer, []) ? true : $Port->format('port');
```

An answer of `80a` is refused with `port must be an integer.`, and the question is asked again.

## Errors

`new Validation()` throws `InvalidArgumentException` when it reaches a field whose rules are not
rule objects. Rules are objects only: there is no string syntax such as `'required|email'`.

```php
use InvalidArgumentException;

use Bootgly\ADI\Validation;

try {
   new Validation(['email' => 'ada@example.com'], ['email' => 'required|email']);
}
catch (InvalidArgumentException $Exception) {
   $Exception->getMessage(); // Validation rules for email must be Condition objects.
}
```

| Message | Cause |
|---|---|
| `Validation rules for email must be Condition objects.` | The field maps to something that is neither a rule nor a list: a string, `null`, a closure, an object that is not a `Condition` |
| `Validation rule for email must be a Condition object.` | An item of the field's list is not a rule: a string, a class name such as `Email::class`, `null`, a nested list |

- The check runs when the engine reaches that field, blank or not, so the fields listed before it
  have already been validated; no `Validation` is returned.
- The `Validator` middleware keeps its rules as given and builds its `Validation` on each request,
  so a malformed list there is accepted when the route is declared and throws on every request that
  reaches it.
- Rule constructors throw their own — `Regex` refuses an invalid pattern with
  `Invalid validation regex pattern.` (see **[Validators](/manual/ADI/Validators/overview/)**).
- A source that is not an array throws `TypeError`, and anything a rule's `validate()` throws
  escapes the constructor (see [Every rule runs](#every-rule-runs)).

## Reference

### Validation

`Bootgly\ADI\Validation` — the engine.

```php
__construct (array $source, array $rules)
```

Validates `$source` (`array<string,mixed>`) against `$rules`
(`array<string, Condition|array<int,Condition>>`) on the spot and stores the outcome in `errors`.
Field by field, in the order of `$rules`, it reads the field's value — `null` when the key is
missing — and runs the field's rules in order, only the implicit ones when the value is blank
(`null`, `''` or `[]`), appending `format()` of each rule that returns `false`. Throws
`InvalidArgumentException` for rules that are not `Condition` objects (see [Errors](#errors)); an
exception thrown by a rule escapes.

```php
public private(set) array $errors = []
```

The messages of the failed rules, `array<string, array<int,string>>`: a field appears only when at
least one of its rules failed, with one message per failure, in rule order. `[]` when every rule
passed.

```php
public bool $valid { get; }
```

`true` when `errors` is empty. Computed on each read; it cannot be assigned.

### Condition

`Bootgly\ADI\Validation\Condition` — the abstract base of every rule. `Validation` accepts any
`Condition`, and the built-in rules extend it directly.

```php
__construct (string $message = '')
```

Stores `$message`, the text that replaces the template; `''` keeps the template. A subclass with a
constructor of its own must call it (see [Write a custom rule](#write-a-custom-rule)).

```php
validate (string $field, mixed $value, array $data): bool
```

Abstract: each rule implements it. Returns `true` when `$value` passes. `$field` is the rule key,
`$value` the source's value for it — `null` when the key is missing — and `$data` the whole source
(`array<string,mixed>`). `Validation` calls it for a blank value only when the rule is implicit;
called directly, it judges any value.

```php
format (string $field): string
```

Returns the message of a failure on `$field`: `message`, or `$template` when `message` is `''`,
translated with `Language::translate()` in the `validation` domain for the active locale, with
`{field}` replaced by `$field` and each `$substitutions` entry by its value (see
[Messages](#messages)). An override replaces all of it (see
[Why not override format()](#why-not-override-format)).

```php
public protected(set) bool $implicit = false
```

`true` makes `Validation` run the rule on a blank value — a missing key, `null`, `''` or `[]` —
instead of skipping it. `Required` is the only built-in rule that sets it.

```php
public protected(set) string $message
```

The text given to the constructor, or `''`. When it is not empty, `format()` uses it instead of
`$template`.

```php
protected string $template = '{field} is invalid.'
```

The default message, which is also its catalog key in the `validation` domain. Every built-in rule
declares its own; a rule that declares none reports `{field} is invalid.`

```php
protected array $substitutions = []
```

The rule's own placeholders, `array<string,string>`: a name without braces mapped to its value,
filled in by `format()` next to `{field}`. The `{limit}` and `{format}` of the built-in rules come
from here.

### Validators

```php
abstract class Validators extends Condition
```

`Bootgly\ADI\Validators` — the base for application rules (see
[Write a custom rule](#write-a-custom-rule)). It declares nothing of its own: its members are those
of `Condition`. The built-in rules extend `Condition` directly, so
`new Required instanceof Validators` is `false`: to tell whether a value is a rule, test
`instanceof Condition`, as `Validation` does.
