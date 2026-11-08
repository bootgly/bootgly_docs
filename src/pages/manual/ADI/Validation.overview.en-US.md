# Validation

`Bootgly\ADI\Validation` checks an associative array against rules and reports, field by field, the
message of each rule that failed. A rule is an object, a `Bootgly\ADI\Validation\Condition`: the 18
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

A rule key names a key of the source, matched exactly and case-sensitively: `'email'` does not
match `'Email'`. A key with a `.` or a `*` segment is a path into nested arrays — `'user.email'`,
`'items.*.sku'` — see [Nested paths and wildcards](#nested-paths-and-wildcards). Request headers are
the one exception the `Validator` middleware makes for you: it matches their names in any case
before the engine runs (see
**[Middlewares → Validator](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/overview/#validator)**).

- Source keys that no rule names are ignored: they cause no error, and nothing removes them. An
  extra `is_admin` key is still in the array after a validation that passed, so pick the keys you
  store yourself.
- A rule object keeps only its settings, so one instance can serve several fields and several
  validations, and each message names its own field: one `$Required` listed under `first_name` and
  `last_name` reports `first_name is required.` and `last_name is required.` The `Validator`
  middleware relies on this: it builds a new `Validation` for every request from the rule objects
  the route declared once.
- An empty list — `'note' => []` — checks nothing.

## Nested paths and wildcards

A rule key with dots walks into nested arrays, and a `*` segment stands for every entry of the
array at that level:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Integer;
use Bootgly\ADI\Validators\Maximum;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\ADI\Validators\Required;

$payload = [
   'user' => ['email' => 'ada.example.com', 'role' => 'admin'],
   'items' => [
      ['sku' => 'A-1', 'quantity' => 2],
      ['sku' => 'B-2', 'quantity' => 0],
      ['quantity' => 1],
   ],
];

$Validation = new Validation($payload, [
   'user.email' => [new Required, new Email],
   'user.role' => [new In(['member', 'owner'])],
   'items' => [new Required, new Maximum(50)],
   'items.*.sku' => [new Required],
   'items.*.quantity' => [new Required, new Integer, new Minimum(1)],
]);

$Validation->errors;
// [
//    'user.email' => ['user.email must be a valid email address.'],
//    'user.role' => ['user.role must be one of the allowed values.'],
//    'items.2.sku' => ['items.2.sku is required.'],
//    'items.1.quantity' => ['items.1.quantity must be at least 1.'],
// ]
```

- An error is keyed by the concrete path that failed — `items.2.sku`, not `items.*.sku` — and that
  path is the `{field}` of its message. The rule keys run in the order of `$rules`, and a wildcard
  walks its array in order.
- A `*` walks a list and a keyed array alike, so `items[a][sku]=…` form fields work too. Only a
  whole segment is a wildcard: `a*` is a key named `a*`.
- A path whose container is missing, `null` or `''` is missing, like a flat key: `Required` fails at
  the full path (`address.city is required.`) and the other rules skip it. A wildcard over a missing,
  blank or empty container has no entries, so `items.*.sku` never makes `items` required — give
  `items` a rule of its own, as above.
- A container that is present but not an array fails closed: `address` holding `'Rua A, 10'` under
  `address.city` reports `address must be an array.` once, at the container, however many rule keys
  go through it, and the rules below it do not run.
- A rule receives the concrete path as `$field` and the whole source as `$data`. `Confirmed` reads
  `<path>_confirmation` as a path, so `user.password` is confirmed by `user.password_confirmation`.

### Keys with dots

A dot always separates segments: `'app.name'` is the key `name` inside `app`, never a key named
`app.name`. Escape the dot to name such a key: `'app\.name'`. `\*` is a key named `*`, and `\\` a
backslash; any other backslash stays as written. An error path escapes source keys the same way, so
it can be read back as a rule key — a `*` wildcard over `['a.b' => …]` reports `rows.a\.b.n`.

```php
$Validation = new Validation(['app.name' => 'Bootgly'], [
   'app\.name' => [new Required], // the key "app.name": passes
   'app.name' => [new Required],  // "name" inside "app": fails
]);

$Validation->errors; // ['app.name' => ['app.name is required.']]
```

Before 1.2.0 a rule key was always one literal key, so a key with a dot in it matched that key. Escape
those keys when you upgrade. An unescaped one does not always fail loudly: `Required` reports the key
as missing, but an optional rule (`'session.token' => [new Regex(…)]`) now reads a key that is not
there and passes silently — while your code still reads the literal key, unvalidated.

### Wildcard limit

The wildcards of one rule key visit at most `limit` entries, 1000 by default — every entry counts,
nested ones included. A rule key that would visit more is not run: it reports one
`{field} has too many items.` at its first wildcard's container and nothing else.

```php
$Validation = new Validation(['tags' => range(1, 1001)], ['tags.*' => [new Integer]]);
$Validation->errors; // ['tags' => ['tags has too many items.']]

$Validation = new Validation(['tags' => range(1, 1001)], ['tags.*' => [new Integer]], limit: 5000);
$Validation->valid; // true
```

The bound keeps a hostile payload from driving the work: a 1 MB JSON body of `[]` entries is 349 525
entries, and validating `items.*.id` on all of them took 213 MB and wrote 17 MB of messages; with the
limit it stops at entry 1001. Raise `limit` where a payload is meant to be large (a bulk import).
The `Validator` middleware uses the default.

Entries are not the only cost: a client key is copied into the path of every entry below it, so one
200 KB key over `items.*.tags.*` would repeat 200 KB in up to 1000 paths and messages. The concrete
paths a rule key builds (its targets and failed containers) are therefore also bounded to
`limit` × `Validation::BYTES` bytes — 256 KB by default. Past that, the rule key fails the same way,
with `{field} has too many items.`

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

## Export a JSON Schema

`Bootgly\ADI\Validation\Renderer` renders the same rules as a JSON Schema (draft 2020-12)
document — for an MCP tool's `inputSchema`, an OpenAPI description or a client form:

```php
use Bootgly\ADI\Validation\Renderer;
use Bootgly\ADI\Validators\Confirmed;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\Integer;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\ADI\Validators\Required;

$Renderer = new Renderer([
   'email' => [new Required, new Email],
   'age' => [new Integer, new Minimum(18)],
   'items.*.sku' => [new Required],
   'password' => [new Required, new Confirmed],
]);

json_encode($Renderer->document, JSON_UNESCAPED_SLASHES);
$Renderer->omissions; // ['password' => ['Bootgly\ADI\Validators\Confirmed']]
```

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "properties": {
    "email": { "type": "string", "format": "email", "minLength": 1 },
    "age": { "type": "integer", "minimum": 18 },
    "items": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "sku": { "minLength": 1, "minItems": 1, "minProperties": 1, "not": { "type": "null" } }
        },
        "required": ["sku"]
      }
    },
    "password": { "minLength": 1, "minItems": 1, "minProperties": 1, "not": { "type": "null" } }
  },
  "required": ["email", "password"]
}
```

The Renderer describes; it does not validate. `Validation` stays the authority, so a server still
validates what a client built from the schema.

- **Paths** — A named segment is an object property and a `*` an array's `items`. A `*` beside named
  keys (`meta.*` and `meta.count`), or beside a rule that makes the node an object (`Keys`), makes an
  object whose `additionalProperties` is the wildcard's schema. A rule key with an index segment (`items.0.id`, `codes.200`) is left out whole and listed
  in `omissions`: `Validation` reads index `0` of a list and key `"0"` of an object alike, and no one
  schema shape accepts both without rejecting one.
- **Rules** — Each rule that implements `Bootgly\ADI\Validation\Descriptor` contributes keywords;
  the mapping of the built-in rules is in
  **[Validators → JSON Schema](/manual/ADI/Validators/overview/#json-schema)**. Keywords that apply
  to another type than the value's `type` are dropped, and a keyword set twice to different values
  keeps both through `allOf`.
- **Required** — `Required` lists the key in its parent's `required`, and in every named parent up to
  the first wildcard, as `Validation` fails `address.city` when `address` is missing. It also adds the
  non-blank keywords of the value's type (`minLength: 1` for a string), or all of them and
  `not: {type: null}` when the type is unknown.
- **Omissions** — A rule that is not a `Descriptor`, or whose `describe()` returns `null`, is left
  out of the document and listed in `omissions` under its rule key: `Confirmed` (a cross-field
  check), the upload rules, a `Regex` JSON Schema cannot express and your own rules. Check
  `omissions` where a schema must be complete — at boot, before you publish a tool.
- **Where the two differ** — The schema describes the canonical JSON shape; `Validation` is more
  lenient in places: it accepts integer strings for `Integer`, `0`/`1`/`'true'` for `Boolean`, and
  compares numeric strings by value in `Minimum`/`Maximum`; it counts string lengths in bytes where
  JSON Schema counts characters; it skips a blank optional value (`null` included) that a typed
  schema refuses; a non-strict `In` matches more than its `enum`. Coercing rules can also combine into
  a schema nothing satisfies, which is not reported: `[new Integer, new In(['1', '2'])]` renders
  `type: integer` with a string `enum` (write `new In([1, 2])`), and `[new Boolean, new Integer]`
  renders both types. Formats are claimed more widely than checked: see
  **[Validators → JSON Schema](/manual/ADI/Validators/overview/#json-schema)**.
- Empty schemas are `stdClass` objects, so `json_encode()` writes `{}`.

To export a rule of your own, implement `Descriptor` next to `Condition`:

```php
use Bootgly\ADI\Validation\Descriptor;
use Bootgly\ADI\Validators;

class Slug extends Validators implements Descriptor
{
   protected string $template = '{field} must be a slug.';

   public function validate (string $field, mixed $value, array $data): bool
   {
      return is_string($value) && preg_match('/\A[a-z0-9-]+\z/', $value) === 1;
   }

   public function describe (): null|array
   {
      return ['type' => 'string', 'pattern' => '^[a-z0-9-]+$'];
   }
}
```

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
__construct (array $source, array $rules, int $limit = 1000)
```

Validates `$source` (`array<string,mixed>`) against `$rules`
(`array<string, Condition|array<int,Condition>>`) on the spot and stores the outcome in `errors`.
Rule key by rule key, in the order of `$rules`, it resolves the key's path into concrete targets
(see [Nested paths and wildcards](#nested-paths-and-wildcards)) — one for a flat key, its value
`null` when the key is missing — and runs the key's rules on each target in order, only the implicit
ones when the value is blank (`null`, `''` or `[]`), appending `format()` of each rule that returns
`false` under the target's path. `$limit` bounds the entries the wildcards of one rule key visit (see
[Wildcard limit](#wildcard-limit)). Throws `InvalidArgumentException` for rules that are not
`Condition` objects (see [Errors](#errors)) and for a `$limit` below `1`
(`Validation limit must be at least 1.`); an exception thrown by a rule escapes.

```php
public private(set) int $limit
```

The most entries the wildcards of one rule key may visit, as given to the constructor. It also sets
the path budget: `limit` × `Validation::BYTES` bytes of concrete paths per rule key.

```php
public const int BYTES = 256
```

The concrete-path bytes one rule key may build per entry of `limit` (see
[Wildcard limit](#wildcard-limit)).

```php
public private(set) array $errors = []
```

The messages of the failed rules, `array<string, array<int,string>>`, keyed by the concrete path
that failed: a path appears only when at least one of its rules failed, with one message per failure,
in rule order, plus the structural `{field} must be an array.` and `{field} has too many items.`
(each once per path). `[]` when every rule passed.

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

Abstract: each rule implements it. Returns `true` when `$value` passes. `$field` is the concrete path
checked — the rule key itself for a flat key —
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

### Path

`Bootgly\ADI\Validation\Path` — a rule key read as a path. `Validation`, `Renderer` and `Confirmed`
use it; an application rule may use it to read another path of `$data`.

```php
__construct (string $key)
```

Parses `$key`: `.` separates segments, a segment that is exactly `*` is a wildcard, and `\` escapes
a following `.`, `*` or `\`. Parsing never fails — an empty segment is the empty key, and any other
backslash is kept.

```php
public private(set) string $key
```

The rule key as written.

```php
public private(set) array $segments
```

The unescaped segments in order, `array<int, null|string>`; `null` marks a wildcard.
`new Path('items.*.id')->segments` is `['items', null, 'id']`.

```php
public private(set) bool $wildcard
```

`true` when a segment is a wildcard.

```php
public private(set) string $prefix
```

The escaped path before the first wildcard — the container it expands (`items` for `items.*.id`,
`''` for `*.id`); the key itself when there is no wildcard.

```php
static escape (int|string $segment): string
```

Escapes one source key as a segment: `\` → `\\`, `.` → `\.`, and the key `*` → `\*`. Joining
escaped keys with `.` gives a path that parses back to those keys. A key that is not valid UTF-8 (a
form or query field name) has each byte from `0x80` up written as `\xHH`, so an error path is always
JSON-encodable; that segment is for display and does not parse back to the raw key (so `Confirmed`
under such a key fails).

```php
resolve (array $source): array
```

Looks the path up in `$source` and returns `[bool $exists, mixed $value]` — `[false, null]` when a
key is missing, a container on the way is not an array, or a segment is a wildcard.

### Renderer

`Bootgly\ADI\Validation\Renderer` — renders a rule set as a JSON Schema (draft 2020-12) document
(see [Export a JSON Schema](#export-a-json-schema)).

```php
__construct (array $rules)
```

Renders `$rules` — the same `array<string, Condition|array<int,Condition>>` a `Validation` takes —
into `document`, and lists what it left out in `omissions`. Throws `InvalidArgumentException` for
rules that are not `Condition` objects, with the messages of `Validation`.

```php
public private(set) array $rules
```

The rules given to the constructor.

```php
public private(set) array $document
```

The schema, `array<string,mixed>`: `$schema` (the 2020-12 dialect URI), `type: object`, and the
`properties` and `required` of the rule keys. Empty schemas are `stdClass`, so `json_encode()` writes
`{}`.

```php
public private(set) array $omissions = []
```

The rules left out, `array<string, array<int,string>>`: rule key → class names (an anonymous class
reads `<parent>@anonymous`).

```php
const string DIALECT = 'https://json-schema.org/draft/2020-12/schema'
```

The `$schema` URI of every document.

### Descriptor

`Bootgly\ADI\Validation\Descriptor` — the optional contract of a rule that JSON Schema can express.
`Validation` never calls it.

```php
describe (): null|array
```

Returns the keywords the value must satisfy (`array<string,mixed>`), or `null` when the rule cannot
be expressed. The entry `'required' => true` is not a keyword: it marks the value as required and
non-blank, and the Renderer lists it in its parent's `required`. Any other `required` value (a list of
property names) is the JSON Schema keyword and is kept. A list (integer keys) counts as `null`.
