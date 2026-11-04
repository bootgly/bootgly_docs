# Validators

`Bootgly\ADI\Validators` holds the 14 rules Bootgly ships for `Bootgly\ADI\Validation`. A rule is an
object built with its arguments: list it under a field, and the validation runs it on that field's
value and, when the value fails, adds the rule's message to the field's errors.

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Integer;
use Bootgly\ADI\Validators\Maximum;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\ADI\Validators\Required;

$Validation = new Validation(
   source: ['email' => 'user@example', 'plan' => 'gold', 'seats' => '3'],
   rules: [
      'email' => [new Required, new Email],
      'plan' => [new Required, new In(['free', 'team'])],
      'seats' => [new Required, new Integer, new Minimum(1), new Maximum(50)],
   ]
);

$Validation->valid;  // false
$Validation->errors; // ['email' => ['email must be a valid email address.'],
                     //  'plan' => ['plan must be one of the allowed values.']]
```

How a `Validation` runs its rules — blank values and implicit rules, the shape of `errors`, how a
message is built and translated, how to write a rule of your own — is on
**[Validation](/manual/ADI/Validation/overview/)**. The **[Validation guide](/guide/validation/overview/)**
has the recipes for scripts, jobs and uploads, and the `Validator` middleware runs the same rules on a
request (see **[Request validation](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/#request-validation)**).
This page is about the rules themselves: what each one accepts and rejects, its message and its
caveats.

Every rule extends `Bootgly\ADI\Validation\Condition` directly. None of them extends
`Bootgly\ADI\Validators`, the abstract class that shares the namespace's name, so
`$Rule instanceof Validators` is `false` for all 14: check a rule's type against `Condition`.

## Rules at a glance

| Rule | Arguments | Passes | Implicit | Template |
|---|---|---|---|---|
| [Boolean](#boolean) | — | `true`, `false`, `0`, `1`, `'0'`, `'1'`, `'true'`, `'false'` | No | `{field} must be a boolean.` |
| [Confirmed](#confirmed) | `field`, default `<field>_confirmation` | A value identical to the confirming field's | No | `{field} confirmation does not match.` |
| [Date](#date) | `format`, default none | A date string; with a `format`, one written exactly in it | No | `{field} must be a valid date.`; with a `format`, `{field} must be a valid date in the format {format}.` |
| [Email](#email) | — | An email address | No | `{field} must be a valid email address.` |
| [Extension](#extension) | `extensions` | An upload whose file name ends in one of them | No | `{field} must have an allowed extension.` |
| [In](#in) | `values`, `strict` (default `true`) | One of `values` | No | `{field} must be one of the allowed values.` |
| [Integer](#integer) | — | An `int`, or a string of digits with an optional sign | No | `{field} must be an integer.` |
| [Maximum](#maximum) | `limit` | At most `limit`, by value, byte length or count | No | `{field} must be at most {limit}.` |
| [MIME](#mime) | `types` | An upload whose bytes sniff as one of them | No | `{field} must have an allowed MIME type.` |
| [Minimum](#minimum) | `limit` | At least `limit`, by value, byte length or count | No | `{field} must be at least {limit}.` |
| [Regex](#regex) | `pattern` | A scalar that matches it | No | `{field} has an invalid format.` |
| [Required](#required) | — | Anything but `null`, `[]` and a blank string | Yes | `{field} is required.` |
| [Size](#size) | `limit`, in bytes | An upload of at most `limit` bytes | No | `{field} must be at most {limit} bytes.` |
| [URL](#url) | — | A URL | No | `{field} must be a valid URL.` |

- **`message`** — Every rule takes it as its last argument, `''` by default. A message you pass
  replaces the template and keeps its placeholders:
  `new Size(2 * 1024 * 1024, '{field} must be a file of at most {limit} bytes.')`.
- **Implicit** — Only `Required` runs on a blank value: a missing field, `null`, `''` or `[]`. The
  other 13 skip it, so a field stays optional until you add `Required`. A string of spaces is not
  blank: every rule runs on it, and `Required` fails it. See
  [Blank values and implicit rules](/manual/ADI/Validation/overview/#blank-values-and-implicit-rules).
- **Template** — The English message, and also its key in the `validation` translation catalogs.
  `{field}` becomes the field's key; `{limit}` and `{format}` become the rule's argument as PHP
  converts it to a string — `Minimum(1.5)` says `1.5`, `Size(2 * 1024 * 1024)` says `2097152`. A
  complete `pt-BR` catalog is in
  **[Localized validation messages](/guide/i18n/overview/#localized-validation-messages)**.

## Numbers, lengths and counts

`Minimum` and `Maximum` have no mode: they measure a value by its type, and a string by what it looks
like.

| Value | Measured as | Passes `Minimum(8)` | Fails `Minimum(8)` |
|---|---|---|---|
| An `int` or a `float` | Its value | `8`, `8.5` | `7`, `7.9` |
| A string that looks like a number | Its value | `'8'`, `'1234'`, `'+9'` | `'7'`, `'-5'`, `'.5'` |
| Any other string | Its length in bytes | `'abcdefgh'`, `'éééé'` | `'abcdefg'`, `'ééé'` |
| An array | Its number of items | 8 items | 1 item |
| `true`, `false`, an object | — | Never | Always |

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Maximum;
use Bootgly\ADI\Validators\Minimum;

$Validation = new Validation(
   source: ['age' => '17', 'nickname' => 'éé', 'tags' => ['a', 'b', 'c', 'd']],
   rules: [
      'age' => [new Minimum(18)],
      'nickname' => [new Minimum(3)],
      'tags' => [new Maximum(3)],
   ]
);

$Validation->errors; // ['age' => ['age must be at least 18.'], 'tags' => ['tags must be at most 3.']]
```

`'éé'` has two characters but four bytes, so it passes `Minimum(3)`.

> [!WARNING]
> **Not a text-length rule.** A string that looks like a number is compared by its value, so the
> password `'1234'` passes `Minimum(8)`; any other string is measured in bytes, so a bio of 300 `'é'`
> is 600 bytes and fails `Maximum(500)`. There is no length rule for now: bound a text's length with
> `Regex` and the `su` flags.

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Regex;

$Validation = new Validation(
   source: ['password' => '1234', 'bio' => str_repeat('é', 300)],
   rules: [
      'password' => [new Regex('/\A.{8,}\z/su', '{field} must have at least 8 characters.')],
      'bio' => [new Regex('/\A.{0,500}\z/su', '{field} must have at most 500 characters.')],
   ]
);

$Validation->errors; // ['password' => ['password must have at least 8 characters.']]
```

`u` makes `.` match one Unicode codepoint, the unit `mb_strlen()` counts, and `s` lets it match a line
break too. A codepoint is not always one visible character: an `é` typed as `e` plus a combining
accent counts 2, and an emoji built from several codepoints counts each of them, so a maximum can
reject a text that looks shorter.

For now, the shape test sets two more traps:

- A number with a space around it, or with an exponent (`' 150'`, `'150 '`, `'1e3'`), is measured as
  a length — and form decoding produces such strings. `qty=+150` arrives as `' 150'`, since a `+`
  decodes to a space: 4 bytes, so it passes `Maximum(100)`. `age=18+` arrives as `'18 '` and fails
  `Minimum(18)`. Add `Integer` to the field: it rejects both (`qty must be an integer.`).
- `[new Minimum(4), new Maximum(4)]` does not mean "4 characters" for a string of digits: `'0042'`
  and `'9999'` are compared by value and fail `Maximum(4)`, while `'4'` passes.

An array is counted, and that includes the list of uploads a `photos[]` field sends: `Maximum(5)` caps
how many files arrive (see [Several files](#several-files)).

## Dates

`Date` accepts only a non-empty string — a `DateTimeImmutable` or an integer timestamp fails — and
checks it in one of two ways:

- **Without a format**, any string `strtotime()` understands passes: `'2026-07-09'`, `'12/31/2026'`,
  `'tomorrow'`, `'next friday'`, `'@1700000000'`. For now that includes a single letter — any of `a`
  to `z` but `j`, in either case — which `strtotime()` reads as a military time zone: `'a'`, `'x'`
  and `'Z'` pass. `strtotime()` rolls an impossible date over instead of refusing it, so
  `'2026-02-30'` passes, and it reads slashes as month, day and year, so `'31/12/2026'` fails.
- **With a format**, the value must be written exactly in it. `Date` parses the value with
  `DateTimeImmutable::createFromFormat()` and formats the result back: a calendar overflow
  (`'2026-02-30'`), a leap day outside a leap year (`'2027-02-29'`), a missing leading zero
  (`'2026-7-9'` for `Y-m-d`), `24:00` and any extra text fail. For now, a string holding a NUL
  byte — `?starts=2026-07-09%00` sends one — makes `Date` throw `ValueError` instead of failing: no
  field gets a message, and a route behind the WPI `Validator` answers `500` instead of `422` (see
  [Errors](#errors)).

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Date;

$Validation = new Validation(
   source: ['starts' => '2026-02-30', 'ends' => '2026-02-30'],
   rules: [
      'starts' => [new Date],
      'ends' => [new Date('Y-m-d')],
   ]
);

$Validation->errors; // ['ends' => ['ends must be a valid date in the format Y-m-d.']]
```

> [!WARNING]
> A format takes every field it leaves out from the current date and time. For now, that makes a
> format without the day depend on the calendar: `Date('m/Y')` and `Date('Y-m')` parse the value with
> today's day, which can overflow a shorter month. On the 29th, 30th and 31st, `'02/2027'` fails with
> `expires must be a valid date in the format m/Y.`, and on the 31st `'04/2027'` fails too; on any
> other day both pass. A format without the year takes the current one: `Date('d/m')` rejects
> `'29/02'` in 2026 and accepts it in 2028. The parse modifiers `!` and `|` do not help, since `Date`
> writes them back when it formats the date: `Date('!m/Y')` rejects every value.

Give `Date` a format with the year, the month and the day, or check a month and a year with `Regex`:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Regex;

$Validation = new Validation(
   source: ['expires' => '02/2027'],
   rules: [
      'expires' => [new Regex('#\A(0[1-9]|1[0-2])/\d{4}\z#', '{field} must be a month and year, as in 02/2027.')],
   ]
);

$Validation->valid; // true
```

## Web links

`URL` checks the shape of a URL with PHP's `FILTER_VALIDATE_URL`, and nothing more. It wants a scheme
and a host — `mailto:`, `news:` and `file:` URLs may leave the host out — but takes any scheme:
`ftp://example.com`, `file:///etc/passwd`, `mailto:a@b.c` and `javascript://example.com/%0Aalert(1)`
pass, and so do `localhost` and IP addresses as hosts. Before you store a link a user sent, or render
it, pair `URL` with a `Regex` for the schemes you accept:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Regex;
use Bootgly\ADI\Validators\URL;

$Validation = new Validation(
   source: ['website' => 'javascript://example.com/%0Aalert(1)'],
   rules: [
      'website' => [new URL, new Regex('#\Ahttps?://#i', '{field} must start with http:// or https://.')],
   ]
);

$Validation->errors; // ['website' => ['website must start with http:// or https://.']]
```

`URL` also rejects addresses a browser would open: an internationalized host (`http://例子.com`)
fails, while its punycode form (`http://xn--fsqu00a.com`) passes. A URL without a scheme
(`example.com`, `//example.com`), with a space, or without a host (`tel:+5511999999999`,
`data:text/plain,hi`, `javascript:alert(1)`) fails.

## Uploads

`Size`, `MIME` and `Extension` check one upload record — an item of `$Request->files`, with the keys
`name`, `type`, `size`, `error` and `tmp_name` (see
**[Files](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/#files)**). Each one fails unless `error` is
the integer `UPLOAD_ERR_OK` (`0`), then reads one part of the record:

| Rule | Reads | Passes when |
|---|---|---|
| `Size` | `size` | It is an integer of at most `limit` bytes |
| `MIME` | The file at `tmp_name` | Its bytes sniff as one of the types |
| `Extension` | `name` | Its last extension is one of the extensions |

None of them reads `type`, the `Content-Type` the client declared for the part. The guide's
**[Validating uploads](/guide/validation/overview/#validating-uploads)** puts the three on a route;
on records the server decoded, they decide:

| Upload | `Size(1024)` | `MIME(['image/png', 'image/jpeg'])` | `Extension(['png', 'jpg', 'jpeg'])` |
|---|---|---|---|
| A 70-byte PNG named `photo.png` | Passes | Passes | Passes |
| A PHP script named `photo.png`, sent as `image/png` | Passes | Fails | Passes |
| A PNG named `photo.txt`, sent as `text/plain` | Passes | Passes | Fails |
| No file chosen | Fails | Fails | Fails |
| Two files sent as `photos[]` | Fails | Fails | Fails |

### No file chosen

A form sent with an empty file input still carries its part, and the field arrives as a record with
`error` = `UPLOAD_ERR_NO_FILE` (`4`). That record is not blank, so `Required` passes it and every other
rule runs: `[new Required, new Size(2 * 1024 * 1024), new MIME(['image/png']), new Extension(['png'])]`
reports `avatar must be at most 2097152 bytes.`, `avatar must have an allowed MIME type.` and
`avatar must have an allowed extension.` Write the upload rules' messages for that case too. Only a
field missing from the request fails `Required`, with `avatar is required.`

### Several files

A field named `photos[]` arrives as a list of records. The upload rules check one record, so the list
fails them, while `Minimum` and `Maximum` count its records. Validate each record on its own:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\MIME;
use Bootgly\ADI\Validators\Size;

$errors = [];
foreach ($Request->files['photos'] ?? [] as $index => $record) {
   $Validation = new Validation(["photos.$index" => $record], [
      "photos.$index" => [new Size(2 * 1024 * 1024), new MIME(['image/jpeg', 'image/png'])],
   ]);
   $errors += $Validation->errors;
}

$errors; // ['photos.1' => ['photos.1 must have an allowed MIME type.']]
```

Here the second file was a PHP script sent as `image/png`.

## Errors

Two rules can throw when they are built:

| Exception | Thrown by | Cause |
|---|---|---|
| `InvalidArgumentException` with `Invalid validation regex pattern.` | `new Regex()` | PCRE cannot parse the pattern: a letter, a digit or a backslash as the delimiter (`'abc'`, `'\d+'`), no closing delimiter (`'/abc'`), an unknown modifier (`'[a-z]+'`: `[` and `]` are read as the delimiters, and `+` as a modifier), an unclosed group (`'/(abc/'`), an empty string |
| `RuntimeException` with `The MIME validator requires the fileinfo extension.` | `new MIME()` | PHP's `fileinfo` extension is not loaded |

```php
use InvalidArgumentException;

use Bootgly\ADI\Validators\Regex;

try {
   $Rule = new Regex('[a-z]+');
}
catch (InvalidArgumentException $Exception) {
   $Exception->getMessage(); // 'Invalid validation regex pattern.'
}
```

A pattern that starts with `(`, `[`, `{` or `<` and ends with the matching closing one can build
without an error, because PCRE takes that pair as the delimiters: `'(\d+)'` is read as `\d+`, and `'[0-9]'`
as the literal text `0-9`, which `'7'` fails. Always write the delimiters: `'/[0-9]/'`, or `#` when
the pattern holds a `/`, as in `'#\Ahttps?://#i'`.

Beyond that, PHP checks the argument types: `new In('free')` throws a `TypeError`, while a file
without `strict_types` converts a numeric string first, so `new Minimum('8')` builds `Minimum(8)`. No
rule checks more: an argument of the right type always builds a rule, even one that rejects every
value — `new In([])`, `new Date('')`, or `new MIME('image/jpg')` for a JPEG, which libmagic names
`image/jpeg`.

A rule can also throw while it validates. The exception leaves `new Validation()`, so no field gets
a message (see [Every rule runs](/manual/ADI/Validation/overview/#every-rule-runs)):

- For now, `Date` with a format throws `ValueError` with
  `DateTimeImmutable::createFromFormat(): Argument #2 ($datetime) must not contain any null bytes`
  on a string holding a NUL byte, which a query string, a form or a JSON body can send:
  `?starts=2026-07-09%00` arrives as `"2026-07-09\0"`. Behind the WPI `Validator`, the exception
  leaves the middleware like any error of the route, so the client gets a `500` instead of a `422`.
- For now, two rules throw on a value no request can carry, because Bootgly's error handler turns
  every PHP notice and warning into an `ErrorException`: `In` with `strict: false` on an object it compares with a
  number (`Object of class stdClass could not be converted to int`), and `Regex`, on PHP 8.5, on
  `NAN` (`unexpected NAN value was coerced to string`).

## Reference

Every rule is a class of `Bootgly\ADI\Validators` that extends `Bootgly\ADI\Validation\Condition`,
which declares its `validate()` and gives it `format()` and the `$implicit` and `$message` properties —
see the Reference of **[Validation](/manual/ADI/Validation/overview/#condition)**. The arguments below stay
readable on the rule, and none of them can be changed once it is built.

### Boolean

```php
__construct (string $message = '')
```

Inherited from `Condition`. Passes `true`, `false`, the integers `0` and `1`, and the strings `'0'`,
`'1'`, `'true'` and `'false'`; anything else fails — `'TRUE'`, `'yes'`, `'on'`, `' 1'`, `2`, `1.0`.
An HTML checkbox without a `value` attribute sends `'on'` when checked: give it `value="1"`.
Template: `{field} must be a boolean.`

### Confirmed

```php
__construct (null|string $field = null, string $message = '')
```

Passes when the source holds the confirming field — `$field`, or `<field>_confirmation` when it is
`null` — with a value identical (`===`) to the field's: `'secret'` against `'secret '` fails, and so
does `'1234'` against the integer `1234`. A missing confirming field fails. The rule is not implicit:
when the field itself is blank it does not run, whatever the confirming field holds, so pair it with
`Required`. Template: `{field} confirmation does not match.`

```php
public private(set) null|string $field;
```

The confirming field, as given; `null` stands for `<field>_confirmation`.

### Date

```php
__construct (null|string $format = null, string $message = '')
```

Passes a non-empty string that `strtotime()` understands or, with a `$format`, one written exactly in
that `DateTimeImmutable::createFromFormat()` format; any other type fails. For now, with a
`$format`, a string holding a NUL byte throws `ValueError` instead (see [Errors](#errors)). See
[Dates](#dates) for what each way accepts and why a format needs the day. Template:
`{field} must be a valid date.`; with a `$format`,
`{field} must be a valid date in the format {format}.`, where `{format}` is the format.

```php
public private(set) null|string $format;
```

The format, as given; `null` checks with `strtotime()`.

### Email

```php
__construct (string $message = '')
```

Inherited from `Condition`. Passes a string PHP's `FILTER_VALIDATE_EMAIL` accepts:
`'user@example.com'`, `'user.name+tag@example.co.uk'`, `'user@[127.0.0.1]'`. A domain without a dot
(`'user@localhost'`, `'user@example'`), non-ASCII characters (`'josé@example.com'`,
`'user@exämple.com'` — the punycode `'user@xn--exmple-cua.com'` passes), a space around the address
and any other type fail. Only the shape is checked: no DNS lookup, no mailbox. Template:
`{field} must be a valid email address.`

### Extension

```php
__construct (string|array $extensions, string $message = '')
```

Passes an upload record whose `error` is `0` and whose `name` ends in one of `$extensions`, compared in
lowercase: `PHOTO.PNG` passes `png`. Only the last extension counts, so `archive.tar.gz` is `gz` and
`new Extension('tar.gz')` never passes. `name` is the file name the client sent, only sanitized by the
server, so a PHP script named `photo.png` passes: pair `Extension` with `MIME`. Template:
`{field} must have an allowed extension.`

```php
public private(set) array $extensions;
```

The allowed extensions, normalized: lowercase, leading dots removed — `new Extension(['.PNG', 'Jpg'])`
holds `['png', 'jpg']`.

### In

```php
__construct (array $values, bool $strict = true, string $message = '')
```

Passes a value `in_array()` finds in `$values`. Strict by default, so the type must match too: `'3'`
fails `new In([1, 2, 3])`. With `strict: false` the comparison is PHP's `==`: `'3'` matches `3`,
`'1.0'`, `' 1'` and `'1e0'` match `1`, `'1e1'` matches `'10'`, and `true` matches any truthy value —
a JSON `true` passes `new In(['admin', 'user'], strict: false)`. Template:
`{field} must be one of the allowed values.`

```php
public private(set) array $values;
```

The allowed values, as given.

```php
public private(set) bool $strict;
```

Whether the comparison checks the type too (`===`).

### Integer

```php
__construct (string $message = '')
```

Inherited from `Condition`. Passes an `int`, or a string of digits with an optional leading sign:
`'42'`, `'-7'`, `'+7'`, `'007'`. A `float` (`1.0`), a decimal or an exponent (`'1.0'`, `'1e3'`),
hexadecimal (`'0x1A'`), `'1_000'`, a space or a line break around the digits, and `true` fail. The
range is not checked: `'99999999999999999999'`, past `PHP_INT_MAX`, passes. Template:
`{field} must be an integer.`

### Maximum

```php
__construct (int|float $limit, string $message = '')
```

Passes a value of at most `$limit`: a number by its value, any other string by its length in bytes, an
array by its number of items — see [Numbers, lengths and counts](#numbers-lengths-and-counts).
`true`, `false` and objects fail. Template: `{field} must be at most {limit}.`

```php
public private(set) int|float $limit;
```

The bound, as given.

### MIME

```php
__construct (string|array $types, string $message = '')
```

Passes an upload record whose `error` is `0` and whose file sniffs as one of `$types`. Throws a
`RuntimeException` with `The MIME validator requires the fileinfo extension.` when PHP's `fileinfo`
extension is not loaded. Template: `{field} must have an allowed MIME type.`

- **The bytes decide.** The rule sniffs the file at `tmp_name` with `fileinfo` (libmagic) and never
  reads the record's `type`: a PHP script sent as `image/png` fails, and a PNG sent as `text/plain`
  passes.
- **Only a file the server wrote.** `tmp_name` must be a regular file directly inside
  `BOOTGLY_UPLOADS_DIR`, where the HTTP server writes uploads. A path anywhere else, a symlink, a
  directory or a FIFO fails, so a hand-built record cannot point the rule at `/etc/passwd` — nor can a
  command check a file it got some other way.
- **Name the types as libmagic does**: `image/jpeg` (`image/jpg` rejects every JPEG), `image/png`,
  `application/pdf`, `text/plain`.
- **A sniff is not a malware scan.** It names the format the bytes start with: `GIF89a<?php …` sniffs
  as `image/gif`, and an SVG (`image/svg+xml`) can carry scripts. Never keep uploads under an
  executable or web-served path: persist them with
  **[store()](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/#persist-an-upload-store)** to a disk
  the web server does not execute.

```php
public private(set) array $types;
```

The allowed types, normalized: lowercase, parameters dropped — `new MIME('IMAGE/PNG; charset=binary')`
holds `['image/png']`.

### Minimum

```php
__construct (int|float $limit, string $message = '')
```

Passes a value of at least `$limit`: a number by its value, any other string by its length in bytes, an
array by its number of items — see [Numbers, lengths and counts](#numbers-lengths-and-counts).
`true`, `false` and objects fail. Template: `{field} must be at least {limit}.`

```php
public private(set) int|float $limit;
```

The bound, as given.

### Regex

```php
__construct (string $pattern, string $message = '')
```

Tries `$pattern` when it is built and throws an `InvalidArgumentException` with
`Invalid validation regex pattern.` when PCRE refuses it (see [Errors](#errors)). Passes a scalar
that matches, converted to a string first — `42` is `'42'`, `true` is `'1'`, `false` is `''`, `4.0`
is `'4'` — while arrays and objects fail. A pattern without anchors matches anywhere: `'/[a-z]+/'`
passes `'123abc456'`, so anchor it with `\A` and `\z`. With the `u` flag, a value that is not valid
UTF-8 fails. Template:
`{field} has an invalid format.`

```php
public private(set) string $pattern;
```

The pattern, as given.

### Required

```php
__construct (string $message = '')
```

The one implicit rule: it also runs on blank values. Fails `null` (a missing field included), a
string that is empty after `trim()` (`''`, `'   '`, `"\t\n"`) and `[]`; passes any other value —
`0`, `'0'`, `false` and `0.0` included — and so the record of an empty file input (see
[No file chosen](#no-file-chosen)). Template: `{field} is required.`

### Size

```php
__construct (int $limit, string $message = '')
```

Passes an upload record whose `error` is `0` and whose `size` is an integer of at most `$limit` bytes:
`Size(70)` passes a 70-byte file, `Size(69)` fails it. The request's own limits come first: the
server answers `413` to a multipart body larger than `maxFileSize`, a `Request\Configs` limit of
500 MiB by default, before any route runs (see
[Defaults](/manual/WPI/HTTP/HTTP_Server_CLI/overview/#defaults)), and `BodyParser`, on a route that
runs it, answers `413` to a body over its `maxSize`, 1 MiB by default. `maxSize` counts the whole
request body — every file and field, with the multipart boundaries — so give it one above the
largest request you accept, not the largest file (see
**[BodyParser](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/overview/#bodyparser)**). Template:
`{field} must be at most {limit} bytes.`

```php
public private(set) int $limit;
```

The largest size accepted, in bytes.

### URL

```php
__construct (string $message = '')
```

Inherited from `Condition`. Passes a string PHP's `FILTER_VALIDATE_URL` accepts, whatever its scheme
and host — see [Web links](#web-links). Template: `{field} must be a valid URL.`
