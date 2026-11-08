# Casters

`Bootgly\ADI\Casters` converts one value into a target type — `int`, `float`, `bool`, `string` or
`DateTimeImmutable` — and you choose how strict the conversion is. It is the casting vocabulary
Bootgly converges on to turn `'8080'` into `8080` or `'yes'` into `true`: env config, ORM
hydration, the database TLS flags and the account store already cast through it.

```php
use Bootgly\ADI\Casters;
use Bootgly\ADI\Casters\Modes;

Casters::Integer->cast('8080', Modes::Strict);    // 8080
Casters::Boolean->cast(' Yes ', Modes::Strict);   // true
Casters::Float->cast('1.5e3', Modes::Strict);     // 1500.0
Casters::DateTime->cast('2026-11-08', Modes::Strict); // DateTimeImmutable 2026-11-08 00:00:00

Casters::Integer->cast(' 1', Modes::Strict);      // InvalidArgumentException: Cannot cast the value to integer.
Casters::Integer->cast(' 1', Modes::Loose);       // 1
```

`Casters` is an enum: each case is a target type, and `cast()` takes the value and a `Modes` case.
The mode is required — there is no default, so every caller says which conversion it means.

**[Validators](/manual/ADI/Validators/overview/)** answer "is this value acceptable?" and leave it
as it is; Casters perform the conversion. Run a `Validation` to report every bad field to a user,
and cast the values you then use.

## Pick a mode

| Mode | For | Converts |
|---|---|---|
| `Modes::Strict` | Input a person wrote: env vars, `.env` files, config arrays, form fields | Only exact, unambiguous forms: `'42'`, `'-1.5e-3'`, `'yes'`, `'2026-11-08'`. Anything else is refused |
| `Modes::Loose` | Values a typed source already produced: database drivers | The way PHP's `(int)`, `(float)`, `(bool)` and `(string)` do — except a number the `int` range cannot hold, which is refused |

Strict is the safe choice when a human may mistype: `' 1'`, `'0x1A'`, `'12abc'` and `'1.0'` are not
integers, and `'maybe'` is not a boolean. Loose suits a driver that hands back `'42'` for an
`INTEGER` column: it accepts whatever PHP accepts, so `'abc'` becomes `0` — use it only where the
source already guarantees the type.

## What each type accepts

### Integer

```php
Casters::Integer->cast('-7', Modes::Strict);                    // -7
Casters::Integer->cast('9223372036854775808', Modes::Strict);   // refused: beyond PHP_INT_MAX
Casters::Integer->cast('1.9', Modes::Loose);                    // 1
Casters::Integer->cast('9223372036854775808', Modes::Loose);    // refused: beyond the int range
Casters::Integer->cast(1e30, Modes::Loose);                     // refused: beyond the int range
```

- **Strict** — an `int`, or a string of digits with an optional `+`/`-` sign, without leading zeros
  (`'007'` is refused), whitespace, exponent or fraction, inside the `int` range. A `float` or a `bool`
  is refused.
- **Loose** — PHP's `(int)` of any scalar: `'1.9'` is `1`, `'12abc'` is `12`, `'abc'` is `0`, `true` is
  `1`. A number beyond the `int` range — a numeric string (`is_numeric()`) such as a string of
  digits past `PHP_INT_MAX` or below `PHP_INT_MIN`, or `'1e30'`; a float out of range, `INF`,
  `NAN` — is refused with `Cannot cast the value to integer: it is beyond the int range.`, where
  PHP's cast would saturate it to `PHP_INT_MAX` or wrap it into another number. A decimal with a
  zero fraction (`'5.0'`, `'9223372036854775807.0'`) converts exactly. Any other string converts as
  PHP converts it, its leading digits unchecked: `'99999999999999999999abc'` is `PHP_INT_MAX`.

### Float

- **Strict** — an `int` (as a `float`), a finite `float`, or a decimal string: `'10.25'`, `'.5'`,
  `'5.'`, `'1e3'`, `'-1.5e-3'`, `'007'`. Whitespace, `'INF'`, `'1,5'`, a string that overflows to
  infinity (`'1e999'`), `INF`, `NAN` and a `bool` are refused.
- **Loose** — PHP's `(float)` of any scalar: `'abc'` is `0.0`, `true` is `1.0`, `INF` stays `INF`.

### Boolean

- **Strict** — a `bool`; the ints `1` and `0`; the strings `'1'`, `'true'`, `'yes'`, `'on'` and `'0'`,
  `'false'`, `'no'`, `'off'`, in any case and with surrounding whitespace ignored. Anything else —
  `2`, `1.0`, `''`, `'y'`, `'null'` — is refused.
- **Loose** — PHP's `(bool)` of any scalar: `'false'` is `true` (a non-empty string), `'0'` and `''`
  are `false`.

### String

- **Strict** and **Loose** — PHP's `(string)` of any scalar: `42` is `'42'`, `1.5` is `'1.5'`, `true`
  is `'1'` and `false` is `''`. The string itself is kept as it is — no trimming.

### DateTime

```php
Casters::DateTime->cast('2026-11-08 10:30:00', Modes::Strict);          // default timezone
Casters::DateTime->cast('2026-11-08T10:30:00.5-03:00', Modes::Strict);  // offset -03:00
Casters::DateTime->cast('2026-02-30', Modes::Strict);                   // refused: no such day
Casters::DateTime->cast(1762598400, Modes::Loose);                      // 2025-11-08 10:40:00 UTC
Casters::DateTime->cast('next monday', Modes::Loose);                   // relative to now
```

- **Both modes** — a `DateTimeInterface` becomes a `DateTimeImmutable` of the same instant and
  timezone.
- **Strict** — three string forms, nothing else:
  - `YYYY-MM-DD` — midnight, in PHP's default timezone;
  - `YYYY-MM-DD hh:mm:ss`, with an optional `.ffffff` fraction — PHP's default timezone;
  - RFC 3339: `YYYY-MM-DDThh:mm:ss`, optional fraction, then `Z` or `±hh:mm` (`-23:59` to
    `+23:59`) — that offset.

  A date, time or offset that does not exist (`2026-02-30`, `25:00:00`, `+24:00`) is refused rather
  than rolled over, and so is a `YYYY-MM-DD hh:mm:ss` wall time the default timezone skips when its
  clocks spring forward. Timestamps, `'now'`, `'tomorrow'` and a `T` form without an offset are
  refused too.
- **Loose** — also a Unix timestamp (`int` or `float`, in UTC) and any string
  `new DateTimeImmutable()` parses, relative ones included. PHP rolls an impossible date over
  (`'2026-02-30'` is March 2). A blank string, which PHP reads as "now", is refused.

## Handle a refusal

A value the mode cannot convert throws `InvalidArgumentException`. The message names the type,
never the value, so you can log it or show it without leaking a password or a token:

```php
use InvalidArgumentException;

try {
   $port = Casters::Integer->cast($input, Modes::Strict);
}
catch (InvalidArgumentException $Exception) {
   $Exception->getMessage(); // Cannot cast the value to integer.
}
```

`null`, an array and an object are refused by every case in both modes — the one exception is a
`DateTimeInterface`, which `DateTime` accepts. Check for `null` yourself when a value is optional.

## Where Bootgly casts

| Caller | Mode | What it adds |
|---|---|---|
| Env config: `Config->bind(cast: Types::…)` | `Strict` | Its own message: `Invalid integer config value.` |
| ORM hydration into `bool`, `int`, `float`, `string` properties | `Loose` | An out-of-range int names the property: see **[Rows into properties](/manual/ADI/Databases/SQL/Repository/Hydration/overview/#rows-into-properties)** |
| Database TLS flags `secure.verify` / `secure.name` | `Strict` (`Boolean`) | ``Database TLS `verify` must be a boolean.`` — see **[Database config](/manual/ADI/Database/Config/overview/)** |
| Account store (`API\Security\Users`) primary key | `Strict` (`String`) | The driver's `int` or `string` key becomes the string id |

## Reference

### Casters

```php
public function cast (mixed $value, Modes $Mode): bool|DateTimeImmutable|float|int|string
```

Converts `$value` to the case's type in the given mode: `Boolean` returns a `bool`, `DateTime` a
`DateTimeImmutable`, `Float` a `float`, `Integer` an `int` and `String` a `string`. Throws
`InvalidArgumentException` with `Cannot cast the value to <type>.` — `<type>` is `boolean`,
`date-time`, `float`, `integer` or `string` — when the mode cannot convert the value, and with
`Cannot cast the value to integer: it is beyond the int range.` for a number past the `int` range
in loose mode. The message never contains the value.

```php
case Boolean;
case DateTime;
case Float;
case Integer;
case String;
```

The target types. What each one accepts in each mode is in
[What each type accepts](#what-each-type-accepts).

### Modes

```php
case Strict;
```

Exact textual forms only, for input a person wrote. A value is converted only when its form is
unambiguous; everything else is refused.

```php
case Loose;
```

PHP's native scalar casts, for values a typed source already produced. Refuses what is not a
scalar, a number the `int` range cannot hold for `Integer`, and for `DateTime` anything PHP cannot
parse as a date-time (a `bool`, a blank string, an out-of-range timestamp).
