# Bytes

`Bytes` turns a count of bytes into a size a person can read, and reads such a size back.
Both directions use the same units — binary multiples, so `1 KB` is 1024 bytes: `parse()`
reads every unit `format()` writes, and a formatted size reads back as the rounded value it
shows — unless that value passes `PHP_INT_MAX` or PHP printed it in exponent form (see below).

## Show a size

```php
use Bootgly\ABI\Code\__String\Bytes;

echo Bytes::format(512);           // 512 B
echo Bytes::format(1536);          // 1.5 KB
echo Bytes::format(memory_get_usage()); // e.g. 2.37 MB
```

`format()` picks the largest unit that keeps the value at or above 1, from `B` up to `YB`, and
rounds to two decimals. Pass a precision to change that:

```php
echo Bytes::format(1_610_612_736, 0); // 2 GB
echo Bytes::format(1_610_612_736, 3); // 1.5 GB
```

A count below one byte stays in `B` (`0.5 B`); a negative count is shown as `0 B`.

## Read a size from configuration

Sizes in configuration files and environment variables are written for people — `"512M"`,
`"1.5 GB"`. `parse()` turns them into the integer your code compares against:

```php
use Bootgly\ABI\Code\__String\Bytes;

$limit = Bytes::parse(getenv('UPLOAD_LIMIT') ?: '8M'); // 8388608

if ($size > $limit) {
   // refuse the upload
}
```

It accepts a non-negative number, optional spaces or tabs and a unit, in any letter case:

| Written as | Bytes |
|---|---|
| `512`, `512B`, `512 b` | 512 |
| `2K`, `2KB`, `2 KiB` | 2048 |
| `1.5 GB`, `1.5g` | 1610612736 |
| `7 EB` | 8070450532247928832 |

`K`, `M`, `G`, `T`, `P`, `E`, `Z` and `Y` each have three spellings — `K`, `KB`, `KiB` — and
all of them mean the same binary multiple. A bare number is a count of bytes. The arithmetic is
exact — no floating point — and a fraction is rounded down to whole bytes, so `1.5 B` is `1` and
`1023.9999999999999999 B` is `1023`.

### Invalid sizes fail loudly

`parse()` never falls back to a default. Anything it cannot read exactly throws an
`InvalidArgumentException` that quotes the input — a typo in a limit stops the boot instead of
silently becoming `0` or "unlimited":

```php
Bytes::parse('1,5 MB');  // Invalid byte size '1,5 MB'.
Bytes::parse('10 XB');   // Unknown byte unit 'XB' in '10 XB'.
Bytes::parse('-1');      // Invalid byte size '-1'.
Bytes::parse('8 EB');    // Byte size '8 EB' exceeds PHP_INT_MAX.
```

The result is an `int`, so the largest size is `PHP_INT_MAX` bytes — just under `8 EB`. `ZB`
and `YB` are readable only for values that fit (`0.0000001 ZB`), and `format()` can write
sizes `parse()` cannot read back as an `int` (`Bytes::format(PHP_INT_MAX)` is `8 EB`). A size
longer than `Bytes::LIMIT` (64) bytes is refused before it is read, and a refusal quotes at most
that much of the input, with backslashes, quotes, control and non-ASCII bytes escaped — so a
size read from the environment cannot flood or forge a log line. A tiny count can also print in
exponent form (`Bytes::format(0.00001, 5)` is `1.0E-5 B`), which `parse()` refuses.

> PHP's own `ini_parse_quantity()` reads `php.ini` shorthands, but it knows only `K`, `M` and
> `G`, warns instead of throwing, and accepts trailing garbage. Use it for `ini_get()` values;
> use `Bytes::parse()` for sizes your application defines.

## Reference

```php
public static function format (float|int $bytes, int $precision = 2): string
```

Formats `$bytes` with the largest unit of `Bytes::UNITS` that keeps the value at or above 1,
rounded to `$precision` decimals, as `"<value> <unit>"`. Values past `1024 YB` stay in `YB`,
values below one byte stay in `B`, and negative values are formatted as `0 B`.

```php
public static function parse (string $size): int
```

Parses a size of at most `Bytes::LIMIT` bytes into a count of bytes: a non-negative decimal
number, optional spaces or tabs and an optional unit (`B`, or `K`/`KB`/`KiB` through
`Y`/`YB`/`YiB`, case-insensitive). Units are binary multiples; the arithmetic is exact and a
fractional result is rounded down. Throws `InvalidArgumentException` when the size is longer
than `Bytes::LIMIT`, empty, negative or malformed, names an unknown unit, or exceeds
`PHP_INT_MAX` bytes.

```php
public const array UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
```

The units `format()` writes, one per power of 1024.

```php
public const int LIMIT = 64;
```

The longest size string, in bytes, `parse()` reads.
