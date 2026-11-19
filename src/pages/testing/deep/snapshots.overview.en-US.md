# Snapshots

Snapshots capture and restore values for regression tests. They help verify that complex structures keep producing the same result across runs.

## When to use

Use snapshots when the expected value is large, structural or hard to declare directly in every assertion.

Common examples:

- response arrays;
- normalized structures;
- serialized payloads;
- rendering results;
- custom comparator regressions.

## Capture and Restore

Capture an assertion's result and restore it later:

```php
use Bootgly\ACI\Tests\Assertion\Snapshots;

// Capture
$string1 = 'value';
yield new Assertion(description: 'Capture strings')
   ->assert(
      actual: $string1,
      expected: $string1,
   )
   ->capture('stringSnapshot');

// Restore
$string2 = 'value';
yield new Assertion(description: 'Restoring strings')
   ->restore('stringSnapshot')
   ->assert(
      actual: $string2,
      expected: $string1,
   );
```

## MemoryDefaultSnapshot

`MemoryDefaultSnapshot` stores snapshots in memory. It is fast, but does not persist across runs.

```php
$array1 = [1, 2, 3];
yield new Assertion(description: 'Capturing and restoring arrays')
   ->assert(
      actual: $array1,
      expected: $array1,
      using: new Snapshots\MemoryDefaultSnapshot
   );
```

## FileStorageSnapshot

`FileStorageSnapshot` stores each snapshot in a `.snap` file under the storage directory
(`tests/snapshots/<name>.snap`), encoded with PHP's `serialize()`, and preserves data across runs.

```php
$totals = ['subtotal' => 1999, 'shipping' => 500];

yield new Assertion(description: 'Cart totals')
   ->assert(
      actual: $totals,
      expected: $totals,
      using: new Snapshots\FileStorageSnapshot('cart-totals')
   );
```

The first run captures the value. Every later run restores the captured value into `actual` and
compares it with `expected` (`===`), so a change fails until you delete the `.snap` file.

Every capture replaces the file whole and atomically — a second capture under the same name
overwrites the first — and a link at the file's place is replaced by a file, never written
through.

### Snapshots of your own objects

A file snapshot restores data (strings, numbers, arrays) and only the classes listed in its
`$classes` property. By default that is `FileStorageSnapshot::CLASSES`: `stdClass`, `DateTime`,
`DateTimeImmutable`, `DateTimeZone` and `DateInterval`. To snapshot a value object of your own,
widen the list:

```php
use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Assertion\Comparators\Equal;
use Bootgly\ACI\Tests\Assertion\Snapshots\FileStorageSnapshot;

$Total = new Money(1999, 'USD'); // your own value object

$Snapshot = new FileStorageSnapshot;
$Snapshot->classes = [...FileStorageSnapshot::CLASSES, Money::class];

// The first run captures the value; every later run compares against it
$expected = null;
if ($Snapshot->restore('shop-total', $expected) === false) {
   $Snapshot->capture('shop-total', $Total);
   $expected = $Total;
}

yield new Assertion(description: 'The order total matches its snapshot')
   ->expect($Total)
   ->to->be(new Equal($expected))
   ->assert();
```

The restored `Money` is a new instance equal to the captured one, so compare it with `Equal`
(`==`), not identity. An enum of your own joins `$classes` the same way.

### When a snapshot does not restore

- **A class outside `$classes`** comes back as `__PHP_Incomplete_Class`, so the comparison
  fails — it never passes in silence. Nothing else is loaded while the file decodes: no
  other class is autoloaded (an enum included) and no magic method of it runs. Add the class to
  `$classes` to restore it whole.
- **A file that does not decode** — garbage, truncated, trailing bytes or empty — is no
  snapshot: `restore()` returns `false` and leaves the value you passed untouched, exactly as for
  a missing file. A captured `false` is still a snapshot and restores as `false`.

### Who can change a snapshot

A snapshot file is trusted to hold the expected value: whoever can write to the storage directory
decides what your tests compare against. Keep that directory writable only by you and your CI,
and review snapshot changes like code.

## Best practices

- Use stable and descriptive snapshot names.
- Prefer snapshots for structural data, not trivial values.
- Use in-memory storage for fast tests without persistence.
- Use file storage when the snapshot must survive across runs.
- Review snapshot changes as test contract changes.

## Reference

```php
Bootgly\ACI\Tests\Assertion\Snapshots\FileStorageSnapshot->classes: array
```

The classes a restored snapshot may instantiate, `FileStorageSnapshot::CLASSES` by default
(`stdClass`, `DateTime`, `DateTimeImmutable`, `DateTimeZone`, `DateInterval`). Any other
object restores as `__PHP_Incomplete_Class`.

```php
Bootgly\ACI\Tests\Assertion\Snapshots\FileStorageSnapshot->capture (string $snapshot, mixed $data): bool
```

Write `$data` to `tests/snapshots/<snapshot>.snap` under the storage directory with
`serialize()`, replacing the file whole and atomically; `true` when the file now holds the value.

```php
Bootgly\ACI\Tests\Assertion\Snapshots\FileStorageSnapshot->restore (string $snapshot, mixed &$data): bool
```

Read the snapshot into `$data`: `true` when it restored, `false` — with `$data` untouched — when
the file is missing or does not decode.
