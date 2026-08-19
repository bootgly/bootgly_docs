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

For more specific lookups, use the `In` enum with the `->find()` method. `find()` takes where to look and what to look for; the haystack comes from `expect()`.

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\In;

yield new Assertion(description: 'The result carries a status')
   ->expect(['status' => 200, 'body' => 'OK'])
   ->to->find(In::ArrayKeys, 'status')
   ->assert();

yield new Assertion(description: 'The handler exposes render()')
   ->expect($Handler)
   ->to->find(In::ObjectMethods, 'render')
   ->assert();
```

Negate it with `not` to assert absence.

```php
yield new Assertion(description: 'The result carries no error')
   ->expect(['status' => 200, 'body' => 'OK'])
   ->not->to->find(In::ArrayKeys, 'error')
   ->assert();
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

The last three search what the runtime has declared, not the value you expected. There is no haystack to give them, but `expect()` still needs a value, so pass an empty string.

```php
yield new Assertion(description: 'The driver class is loadable')
   ->expect('')
   ->to->find(In::ClassesDeclared, Logger::class)
   ->assert();
```

## Best practices

- Use `Contains`, `StartsWith` and `EndsWith` when the finder directly expresses the intent.
- Use `In` when the lookup target must be explicit.
- Prefer descriptions that state where the value should be found.
