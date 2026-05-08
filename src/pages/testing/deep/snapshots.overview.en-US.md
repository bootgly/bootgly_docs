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

`FileStorageSnapshot` stores snapshots in JSON files and preserves data across runs.

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Delimiters\ClosedInterval;

yield new Assertion(description: 'Between integers')
   ->assert(
      actual: 2,
      expected: new ClosedInterval(1, 3),
      using: new Snapshots\FileStorageSnapshot
   );
```

## Best practices

- Use stable and descriptive snapshot names.
- Prefer snapshots for structural data, not trivial values.
- Use in-memory storage for fast tests without persistence.
- Use file storage when the snapshot must survive across runs.
- Review snapshot changes as test contract changes.
