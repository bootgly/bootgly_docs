# Finders

Finders verify the presence of values in strings, arrays, objects and runtime structures. They can be used through direct `assert()` or through `->find()`.

## Contains

`Contains` checks whether a value contains a given element.

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Finders\Contains;

// string
yield new Assertion(description: 'Contains string')
   ->assert(
      actual: 'Hello, World!',
      expected: new Contains('World'),
   );

// array
yield new Assertion(description: 'Contains array')
   ->assert(
      actual: ['Hello', 'World!'],
      expected: new Contains('World!'),
   );

// object
$object = new stdClass();
$object->property = 'Hello, World!';
yield new Assertion(description: 'Contains object property')
   ->assert(
      actual: $object,
      expected: new Contains('property'),
   );
```

## StartsWith

`StartsWith` checks whether a string starts with a prefix.

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Finders\StartsWith;

yield new Assertion(description: 'Starts with string')
   ->assert(
      actual: 'Hello, World!',
      expected: new StartsWith('Hello'),
   );
```

## EndsWith

`EndsWith` checks whether a string ends with a suffix.

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Finders\EndsWith;

yield new Assertion(description: 'Ends with string')
   ->assert(
      actual: 'Hello, World!',
      expected: new EndsWith('World!'),
   );
```

## Find through the In enum

For more specific lookups, use the `In` enum with the `->find()` method.

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\In;
```

| Enum | Description |
| ---- | ----------- |
| `In::ArrayKeys` | Search in array keys. |
| `In::ArrayValues` | Search in array values. |
| `In::ObjectProperties` | Search in object properties. |
| `In::ObjectMethods` | Search in object methods. |
| `In::ClassesDeclared` | Search in declared classes. |
| `In::InterfacesDeclared` | Search in declared interfaces. |
| `In::TraitsDeclared` | Search in declared traits. |

## Best practices

- Use `Contains`, `StartsWith` and `EndsWith` when the finder directly expresses the intent.
- Use `In` when the lookup target must be explicit.
- Prefer descriptions that state where the value should be found.
