# Testing Assertions

Assertions are the core of Bootgly tests. They can be written through the Basic API, returning values directly, or through the Advanced API, using `Assertion` and the fluent interface.

## Assertions - Basic API

In the Basic API, a test case can return a boolean directly. If the test passed, return `true`; if it failed, return `false`.

```php
<?php

use Bootgly\ACI\Tests\Suite\Test\Specification;
use Bootgly\ACI\Tests\Suite\Test\Specification\Separator;

return new Specification(
   Separator: new Separator(line: 'Basic API'),
   description: 'It should assert returning true',
   test: function (): bool
   {
      return true === true;
   }
);
```

This API focuses on maximum performance and also works as an entry point for anyone starting with QA in Bootgly.

### Retests

Use the `retest` parameter in `Specification` to repeat a test when needed.

```php
<?php

use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   description: 'It should assert returning boolean (retestable)',
   test: function (bool $expected = false): bool
   {
      return true === $expected;
   },
   retest: function (callable $test, bool $passed, mixed ...$arguments): string|bool|null
   {
      if ($passed === false) {
         return $test(true);
      }

      return null;
   }
);
```

### Describing assertions

In the Basic API, use the static `Assertion::$description` property to describe the current assertion.

```php
<?php

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Suite\Test\Specification;
use Bootgly\ACI\Tests\Suite\Test\Specification\Separator;

return new Specification(
   Separator: new Separator(line: 'Basic API'),
   description: 'It should assert returning true',
   test: function (): bool
   {
      Assertion::$description = 'Asserting that true is true';

      return true === true;
   }
);
```

### Assertion fallbacks

In the Basic API, a string can be returned as a fallback when the assertion fails.

```php
<?php

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   description: 'It should assert returning string (fallback)',
   test: function (bool $expected = false): string|bool
   {
      if ($expected === false) {
         Assertion::$description = 'Asserting that true is false';

         return 'This is a fallback message (test failed)!';
      }

      Assertion::$description = 'Asserting that true is true';

      return true;
   }
);
```

### Multiple assertions

Use `yield` to return multiple assertions in the same test case.

```php
<?php

use Generator;

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   description: 'It should assert returning true (with yield)',
   test: function (): Generator
   {
      yield true === true;

      Assertion::$description = 'Asserting that true is not false';
      yield true !== false;
   }
);
```

## Assertions - Advanced API

The Advanced API uses the `Assertion` class with a chainable fluent interface. It operates inside an `Assertions` wrapper that receives a `Generator`.

### Style 1: expect with operator

Use the `Op` enum for direct comparisons.

```php
<?php

use Generator;

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Op;
use Bootgly\ACI\Tests\Assertions;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   description: 'It should use assert API',
   test: new Assertions(Case: function (): Generator
   {
      yield new Assertion(description: 'expect (comparing values)')
         ->expect(2, Op::Identical, 2)
         ->assert();
   })
);
```

### Style 2: expect with fluent chain

Use the `->to->be()` chain for readable comparisons.

```php
yield new Assertion(description: 'to be [true] (implicit)')
   ->expect(true)
   ->to->be(true)
   ->assert();
```

You can also pass a comparator explicitly.

```php
use Bootgly\ACI\Tests\Assertion\Comparators\Identical;

yield new Assertion(description: 'to be [true] (explicit)')
   ->expect(actual: true)
   ->to->be(expected: new Identical(true))
   ->assert();
```

### Style 3: direct assert

Pass values directly to `assert()`.

```php
yield new Assertion(description: 'direct assert')
   ->assert(
      actual: 'Hello',
      expected: 'Hello',
   );
```

## Comparators

The Advanced API provides comparison operators through the `Op` enum.

| Operator | Enum | PHP meaning |
| -------- | ---- | ----------- |
| `==` | `Op::Equal` | Loose equality. |
| `!=` | `Op::NotEqual` | Loose inequality. |
| `===` | `Op::Identical` | Strict equality. This is the default. |
| `!==` | `Op::NotIdentical` | Strict inequality. |
| `>` | `Op::GreaterThan` | Greater than. |
| `<` | `Op::LessThan` | Less than. |
| `>=` | `Op::GreaterThanOrEqual` | Greater than or equal. |
| `<=` | `Op::LessThanOrEqual` | Less than or equal. |

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Op;

yield new Assertion(description: 'Equal [int]')
   ->expect(1, Op::Equal, 1)
   ->assert();

yield new Assertion(description: 'Greater than')
   ->expect(2, Op::GreaterThan, 1)
   ->assert();

yield new Assertion(description: 'Less than or equal')
   ->expect(1, Op::LessThanOrEqual, 2)
   ->assert();
```

When `->to->be($expected)` is used without an explicit comparator, the default comparator is `Identical` (`===`).

```php
yield new Assertion(description: 'Equal strings')
   ->expect('Bootgly')
   ->to->be('Bootgly')
   ->assert();
```

Comparators support `bool`, `int`, `float`, `string`, `array` and `object`.

Specific expectation families are documented in the next pages: Modifiers, Behaviors, Delimiters, Finders, Matchers, Throwers and Waiters.
