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
use RuntimeException;

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

## Nested payloads

A JSON body is rarely flat. Point a rule at a nested key with dots, and at every entry of a list
with `*`:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\Integer;
use Bootgly\ADI\Validators\Maximum;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\ADI\Validators\Required;

$Order = new Validation(
   source: [
      'customer' => ['email' => 'ada@example.com'],
      'lines' => [
         ['sku' => 'A-1', 'quantity' => '2'],
         ['sku' => '', 'quantity' => '0'],
      ],
   ],
   rules: [
      'customer.email' => [new Required, new Email],
      'lines' => [new Required, new Maximum(100)],
      'lines.*.sku' => [new Required],
      'lines.*.quantity' => [new Required, new Integer, new Minimum(1)],
   ]
);

$Order->errors;
// [
//    'lines.1.sku' => ['lines.1.sku is required.'],
//    'lines.1.quantity' => ['lines.1.quantity must be at least 1.'],
// ]
```

Errors name the exact entry, so a client can mark the right row. Give the list a rule of its own
(`'lines' => [new Required, …]`): `lines.*.sku` alone accepts a missing `lines`. A wildcard visits
at most 1000 entries per rule key by default — pass `limit:` for bigger payloads. A key that holds
a dot is written `'app\.name'`. Paths, containers and the limit are detailed in
**[Nested paths and wildcards](/manual/ADI/Validation/overview/#nested-paths-and-wildcards)**.

## Describing the input as JSON Schema

The rules that validate a payload can also describe it. `Validation\Renderer` turns them into a
JSON Schema 2020-12 document — the `inputSchema` of an MCP tool, for example:

```php
use Bootgly\ADI\Validation\Renderer;

$rules = [
   'customer.email' => [new Required, new Email],
   'lines.*.sku' => [new Required],
   'lines.*.quantity' => [new Required, new Integer, new Minimum(1)],
];

$Renderer = new Renderer($rules);

$tool = [
   'name' => 'create_order',
   'description' => 'Create an order',
   'inputSchema' => $Renderer->document,
];

// Rules JSON Schema cannot express (Confirmed, uploads, your own) are listed here:
$Renderer->omissions; // []
```

Validate the arguments with the same `$rules` when the call arrives: the schema guides the client,
`Validation` decides. What each rule becomes, and where the two differ, is in
**[Export a JSON Schema](/manual/ADI/Validation/overview/#export-a-json-schema)**.

## Optional fields and implicit rules

A field that is missing, `null`, `''` or `[]` is treated as *blank*. Blank fields skip every rule **except implicit ones** — `Required` is implicit, so it still runs and fails. This makes optional fields natural:

```php
rules: [
   'website' => [new URL], // only validated when a non-blank value arrives
   'email'   => [new Required, new Email], // Required rejects the blank case
]
```

The details — what is and is not blank, and how a rule of your own becomes implicit — are in **[Blank values and implicit rules](/manual/ADI/Validation/overview/#blank-values-and-implicit-rules)**.

## Custom messages

Every rule accepts an optional `message` constructor argument that replaces its default:

```php
new Required('Name cannot be empty.');
new Regex('/\A.{8,}\z/su', 'Password must be at least 8 characters.');
new URL(message: 'Give me a real URL.');
```

A message you pass is built like the default one: it keeps the rule's placeholders and goes through the translation catalogs — see **[Messages](/manual/ADI/Validation/overview/#messages)**.

Check the length of a text (a password, a name) with `Length`, which counts characters: `Minimum` and `Maximum` compare numeric strings by value and measure other strings in bytes — see [Numbers, lengths and counts](/manual/ADI/Validators/overview/#numbers-lengths-and-counts).

## Custom rules

Extend `Bootgly\ADI\Validators` (the extension base for application rules), put the default message in `$template` and implement `validate()`:

```php
use Bootgly\ADI\Validators;

$InviteCode = new class extends Validators {
   protected string $template = '{field} must match the demo invite code.';

   /**
    * @param array<string,mixed> $data  Full source array — useful for cross-field rules.
    */
   public function validate (string $field, mixed $value, array $data): bool
   {
      return is_string($value) && $value === 'bootgly';
   }
};
```

The rule then behaves like the built-in ones: `{field}` becomes the field name, and a `message` passed to its constructor replaces the template. How to make it run on blank fields, read the other fields of the source or add placeholders — and why an override of `format()` loses the `message` argument and the translation catalogs — is in **[Write a custom rule](/manual/ADI/Validation/overview/#write-a-custom-rule)**.

## Validating HTTP requests

In WPI routes, plug the same rules into the `Validator` middleware — it reads one Request source and fails closed with a JSON `422` before the handler runs. See [Request Validation](/manual/WPI/HTTP/HTTP_Server_CLI/Request/#request-validation) and [Middlewares → Validator](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/#validator).

## Validating uploads

`MIME` decides by what an uploaded file **is**, not by what the client says it is. It sniffs
the bytes the server received (PHP's `fileinfo` extension) and never reads the record's
`type` — the part's `Content-Type`, which any client can set to anything:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Extension;
use Bootgly\ADI\Validators\MIME;
use Bootgly\ADI\Validators\Size;

$Request->download();

$Validation = new Validation($Request->files, [
   'avatar' => [
      new Size(2 * 1024 * 1024),
      new MIME(['image/jpeg', 'image/png']),
      new Extension(['jpg', 'jpeg', 'png']),
   ],
]);
```

A PHP script sent as `avatar.png` with `Content-Type: image/png` fails `MIME`; a real PNG sent
as `text/plain` passes. Keep an accepted upload with
[`store()`](/manual/WPI/HTTP/HTTP_Server_CLI/Request/#persist-an-upload-store), on a disk the web
server does not execute — never under an executable or web-served path.

What each upload rule reads and how an empty file input and a `photos[]` list behave are on
**[Uploads](/manual/ADI/Validators/overview/#uploads)**, and why a sniff is not a malware scan is
under **[MIME](/manual/ADI/Validators/overview/#mime)**.

## Built-in rules

`Bootgly\ADI\Validators` ships 18 rules: `Boolean`, `Confirmed`, `Date`, `Email`, `Extension`, `In`, `Integer`, `Keys`, `Length`, `Maximum`, `MIME`, `Minimum`, `Regex`, `Required`, `Size`, `Text`, `URL` and `UUID`. Their arguments, the values each one accepts and rejects, their default messages and their caveats are on **[Validators](/manual/ADI/Validators/overview/)**; the engine — `Validation`, the `Condition` base class and how a message is built — has its Reference on **[Validation](/manual/ADI/Validation/overview/#reference)**. Every message is a key of the `validation` translation catalogs: **[Localized validation messages](/guide/i18n/overview/#localized-validation-messages)** shows a complete `pt-BR` catalog.
