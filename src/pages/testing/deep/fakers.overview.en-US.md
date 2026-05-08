# Fakers

Fakers generate fake data for tests without external packages. They live in `Bootgly\ACI\Tests`, use native PHP resources and can be deterministic when they receive a seed.

## Available resources

| Faker | Output |
| ----- | ------ |
| `Email` | Fake email address. |
| `Integer` | Integer within a configurable range. |
| `Name` | Fake full name. |
| `Text` | Text built from an internal lexicon. |
| `UUID` | RFC 4122 version 4 UUID. |

All concrete fakers extend `Bootgly\ACI\Tests\Faker` and implement `generate()`.

## Deterministic seed

Pass `seed:` to repeat the same output across runs.

```php
<?php

use Bootgly\ACI\Tests\Fakers\UUID;

$First = new UUID(seed: 42);
$Second = new UUID(seed: 42);

$First->generate() === $Second->generate(); // true
```

Use seeds when a test needs varied but stable data.

## Email

```php
<?php

use Bootgly\ACI\Tests\Fakers\Email;

$Email = new Email(seed: 7);

$value = $Email->generate();
```

`Email` combines a fake name with a sample domain.

## Integer

`Integer` supports configurable inclusive bounds.

```php
<?php

use Bootgly\ACI\Tests\Fakers\Integer;

$Integer = new Integer(seed: 10);
$Integer->min = 100;
$Integer->max = 999;

$value = $Integer->generate();
```

## Name

```php
<?php

use Bootgly\ACI\Tests\Fakers\Name;

$Name = new Name(seed: 3);

$value = $Name->generate();
```

`Name` uses built-in first-name and last-name lists.

## Text

`Text` generates a word sequence. The `words` property controls the amount.

```php
<?php

use Bootgly\ACI\Tests\Fakers\Text;

$Text = new Text(seed: 5);
$Text->words = 8;

$value = $Text->generate();
```

## UUID

```php
<?php

use Bootgly\ACI\Tests\Fakers\UUID;

$UUID = new UUID(seed: 1);

$value = $UUID->generate();
```

The output follows the UUID v4 layout:

```txt
xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
```

## `Fakers` trait

The `Fakers` trait exposes the `fake($kind, $seed)` shortcut for classes that want to generate data by name.

```php
<?php

use Bootgly\ACI\Tests\Fakers;

$Host = new class {
   use Fakers;
};

$id = $Host->fake('UUID', seed: 9);
$name = $Host->fake('Name', seed: 9);
```

Dispatch accepts canonical aliases for built-in fakers, including `uuid`, `Uuid` and `UUID`.

## Specification example

```php
<?php

use Generator;

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Assertions;
use Bootgly\ACI\Tests\Fakers\Email;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   description: 'Email faker should be deterministic',
   test: new Assertions(Case: function (): Generator {
      $Email = new Email(seed: 33);

      yield (new Assertion(description: 'same seed keeps output stable'))
         ->expect($Email->generate())
         ->to->be((new Email(seed: 33))->generate())
         ->assert();
   })
);
```

## Best practices

- Always use a seed in tests that compare generated output.
- Prefer Bootgly native fakers instead of external dependencies.
- Set public properties like `Integer::$min`, `Integer::$max` and `Text::$words` before calling `generate()`.
- Generate values inside the test when the seed is part of the expectation.
