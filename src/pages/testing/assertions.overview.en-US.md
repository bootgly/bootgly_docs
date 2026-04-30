# Testing Assertions

## Assertions - Basic API

In the Basic API, you can return a boolean directly. If the test passed, it should return `true`, if it failed, it should return `false`:

```php
<?php

use Bootgly\ACI\Tests\Suite\Test\Specification;
use Bootgly\ACI\Tests\Suite\Test\Specification\Separator;

return new Specification(
   // @ configure
   Separator: new Separator(line: 'Basic API'),
   description: 'It should assert returning true',
   // @ test
   test: function (): bool
   {
      return true === true;
   }
);
```

This API focuses on maximum performance in tests or for those learning about the QA area. Tests in Bootgly have a progressive API and thus start from the basics to the most advanced, allowing anyone to implement tests without difficulties.

### Retests

It is possible to retest a test (in case of failure, repetitions, etc.). Use the `retest` parameter in `Specification` to implement a `Closure` with the following Code API:

```php
<?php

use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   // @ configure
   description: 'It should assert returning boolean (retestable)',
   // @ test
   test: function (bool $expected = false): bool
   {
      return true === $expected;
   },
   retest: function (callable $test, bool $passed, mixed ...$arguments): string|bool|null
   {
      // ? If the last test fails, repeat the test by modifying the dataset (input)
      if ($passed === false) {
         return $test(true);
      }

      return null;
   }
);
```

Use the Closure parameters to manipulate the retest as you wish!

### Describing Assertions

In the basic API, it is possible to describe an assertion using the static property `$description` of the `Assertion` class:

```php
<?php

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Suite\Test\Specification;
use Bootgly\ACI\Tests\Suite\Test\Specification\Separator;

return new Specification(
   // @ configure
   Separator: new Separator(line: 'Basic API'),
   description: 'It should assert returning true',
   // @ test
   test: function (): bool
   {
      Assertion::$description = 'Asserting that true is true';
      return true === true;
   }
);
```

### Fallbacks in Assertions

In the basic API, it is possible to return a fallback if an assertion fails...

```php
<?php

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   // @ configure
   description: 'It should assert returning string (fallback)',
   // @ test
   test: function (bool $expected = false): string|bool
   {
      if ($expected === false) {
         Assertion::$description = 'Asserting that true is false';
         return "This is a fallback message (test failed)!";
      }

      Assertion::$description = 'Asserting that true is true';
      return true;
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

### Multiple Assertions

For the same test case, in the Basic API, it is already possible to return multiple assertions using `yield`...

```php
<?php

use Generator;
use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   // @ configure
   description: 'It should assert returning true (with yield)',
   // @ test
   test: function (): Generator
   {
      yield true === true;

      Assertion::$description = 'Asserting that true is not false';
      yield true !== false;

      $framework = 'Bootgly';
      if ($framework !== 'Bootgly') {
         yield "Framework is not Bootgly!";
      }
      else {
         Assertion::$description = 'Asserting that framework is Bootgly';
         yield true;
      }
   }
);
```

## Assertions - Advanced API

The Advanced API uses the `Assertion` class with a chainable fluent interface to compose expressive expectations. It operates within an `Assertions` wrapper that takes a `Generator` (using `yield`).

The Advanced API offers three assertion styles:

### Style 1: expect with operator

Use the `Op` enum for direct comparisons:

```php
<?php

use Generator;

use Bootgly\ACI\Tests\Assertion\Auxiliaries\Op;
use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Assertions;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   description: 'It should use assert API',
   test: new Assertions(Case: function (): Generator
   {
      yield new Assertion(
         description: 'expect (comparing values)',
      )
         ->expect(2, Op::Identical, 2)
         ->assert();
   })
);
```

### Style 2: expect with fluent chain

Use the `->to->be()` chain for readable comparisons:

```php
yield new Assertion(
   description: 'to be [true] (implicit)',
)
   ->expect(true)
   ->to->be(true)
   ->assert();
```

You can also be explicit by passing a comparator directly:

```php
use Bootgly\ACI\Tests\Assertion\Comparators\Identical;

yield new Assertion(
   description: 'to be [true] (explicit)',
)
   ->expect(actual: true)
   ->to->be(expected: new Identical(true))
   ->assert();
```

### Style 3: direct assert

Pass values directly to the `assert()` method:

```php
yield new Assertion(
   description: 'direct assert',
)
   ->assert(
      actual: 'Hello',
      expected: 'Hello',
   );
```

---

## Comparators

The Advanced API provides 8 comparison operators through the `Op` enum:

| Operator | Enum | PHP Meaning |
|----------|------|-------------|
| `==` | `Op::Equal` | Loose equality |
| `!=` | `Op::NotEqual` | Loose inequality |
| `===` | `Op::Identical` | Strict equality (default) |
| `!==` | `Op::NotIdentical` | Strict inequality |
| `>` | `Op::GreaterThan` | Greater than |
| `<` | `Op::LessThan` | Less than |
| `>=` | `Op::GreaterThanOrEqual` | Greater than or equal |
| `<=` | `Op::LessThanOrEqual` | Less than or equal |

### Comparison with Op (operator style)

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Op;

// Equal (==)
yield new Assertion(description: 'Equal [int]')
   ->expect(1, Op::Equal, 1)
   ->assert();

// GreaterThan (>)
yield new Assertion(description: 'Greater than')
   ->expect(2, Op::GreaterThan, 1)
   ->assert();

// LessThanOrEqual (<=)
yield new Assertion(description: 'Less than or equal')
   ->expect(1, Op::LessThanOrEqual, 2)
   ->assert();
```

### Comparison with fluent chain (Identical style)

When you use `->to->be($expected)` without specifying a comparator, the default comparator is `Identical` (`===`):

```php
// boolean
yield new Assertion(description: 'Equal booleans')
   ->expect(true)
   ->to->be(true)
   ->assert();

// string
yield new Assertion(description: 'Equal strings')
   ->expect('Bootgly')
   ->to->be('Bootgly')
   ->assert();

// array
yield new Assertion(description: 'Equal arrays')
   ->expect([1, 2, 3])
   ->to->be([1, 2, 3])
   ->assert();

// object
$object1 = new stdClass();
yield new Assertion(description: 'Equal objects')
   ->expect($object1)
   ->to->be($object1)
   ->assert();
```

Comparators support these types: `bool`, `int`, `float`, `string`, `array` and `object`.

---

## Modifiers

The Advanced API supports modifiers to compose complex expectations:

### NOT (negation)

Use `->not->` to negate an expectation:

```php
yield new Assertion(description: 'NOT to be [true]')
   ->expect(true)
   ->not->to->be(false)
   ->assert();
```

### AND (conjunction)

Use `->and->` to combine multiple expectations with AND logic:

```php
yield new Assertion(description: 'to be [true] AND [true]')
   ->expect(true)
   ->to->be(true)
   ->and
   ->to->be(true)
   ->assert();
```

### OR (disjunction)

Use `->or->` to combine expectations with OR logic (only one needs to pass):

```php
yield new Assertion(description: 'to be [false] OR [true]')
   ->expect(true)
   ->to->be(false)
   ->or
   ->to->be(true)
   ->assert();
```

---

## Behaviors (Types)

Use the `Type` enum with `->to->be()` to validate a value's type:

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Type;
```

### Available Types

| Enum | PHP Validation |
|------|---------------|
| `Type::Array` | `is_array()` |
| `Type::Boolean` | `is_bool()` |
| `Type::Callable` | `is_callable()` |
| `Type::Countable` | `is_countable()` |
| `Type::Float` | `is_float()` |
| `Type::Integer` | `is_int()` |
| `Type::Iterable` | `is_iterable()` |
| `Type::Null` | `is_null()` |
| `Type::Number` | `is_numeric()` (numeric type) |
| `Type::Numeric` | `is_numeric()` |
| `Type::Object` | `is_object()` |
| `Type::Resource` | `is_resource()` |
| `Type::Scalar` | `is_scalar()` |
| `Type::String` | `is_string()` |

### Examples

```php
// array
yield new Assertion(description: 'Validating array')
   ->expect([])
   ->to->be(Type::Array)
   ->assert();

// boolean
yield new Assertion(description: 'Validating boolean')
   ->expect(true)
   ->to->be(Type::Boolean)
   ->assert();

// callable
yield new Assertion(description: 'Validating callable')
   ->expect(function() {})
   ->to->be(Type::Callable)
   ->assert();

// integer
yield new Assertion(description: 'Validating integer')
   ->expect(1)
   ->to->be(Type::Integer)
   ->assert();

// string
yield new Assertion(description: 'Validating string')
   ->expect('Bootgly')
   ->to->be(Type::String)
   ->assert();
```

## Behaviors (Values)

Use the `Value` enum with `->to->be()` to validate value properties:

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Value;
```

### Available Values

| Enum | Description |
|------|-------------|
| `Value::Empty` | Empty value |
| `Value::NaN` | Not a Number |
| `Value::Even` | Even number |
| `Value::Odd` | Odd number |
| `Value::Positive` | Positive number |
| `Value::Negative` | Negative number |
| `Value::Infinite` | Infinite number |
| `Value::Lowercase` | Lowercase string |
| `Value::Uppercase` | Uppercase string |
| `Value::Alphanumeric` | Alphanumeric string |
| `Value::Numeric` | Numeric string |
| `Value::Alpha` | Alphabetic string |
| `Value::Email` | Email format |
| `Value::URL` | URL format |
| `Value::IP` | IP format |
| `Value::UUID` | UUID format |

### Examples

```php
yield new Assertion(description: 'Even number')
   ->expect(4)
   ->to->be(Value::Even)
   ->assert();

yield new Assertion(description: 'Positive number')
   ->expect(42)
   ->to->be(Value::Positive)
   ->assert();

yield new Assertion(description: 'Lowercase string')
   ->expect('bootgly')
   ->to->be(Value::Lowercase)
   ->assert();
```

---

## Delimiters (Intervals)

Use `->to->delimit()` to check if a value is within a range:

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\Interval;
```

### Interval Types

| Enum | Notation | Description |
|------|----------|-------------|
| `Interval::Closed` | `[min, max]` | Includes both bounds (default) |
| `Interval::Open` | `(min, max)` | Excludes both bounds |
| `Interval::LeftOpen` | `(min, max]` | Excludes min, includes max |
| `Interval::RightOpen` | `[min, max)` | Includes min, excludes max |

### Examples

```php
// integer
yield new Assertion(description: 'Between integers')
   ->expect(1)
   ->to->delimit(1, 2)
   ->assert();

// float
yield new Assertion(description: 'Between floats')
   ->expect(1.5)
   ->to->delimit(1.5, 2.5)
   ->assert();

// DateTime
$date = new DateTime('2023-01-01');
yield new Assertion(description: 'Between DateTime objects')
   ->expect($date)
   ->to->delimit($date, new DateTime('2023-01-02'))
   ->assert();
```

---

## Finders

The Advanced API offers finders to check for the presence of values in different structures. Finders can be used in two ways: via direct `assert()` or via `->find()`.

### Contains

Checks if a value contains a given element (works for strings, arrays and objects):

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

### StartsWith

Checks if a string starts with a given prefix:

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Finders\StartsWith;

yield new Assertion(description: 'Starts with string')
   ->assert(
      actual: 'Hello, World!',
      expected: new StartsWith('Hello'),
   );
```

### EndsWith

Checks if a string ends with a given suffix:

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Finders\EndsWith;

yield new Assertion(description: 'Ends with string')
   ->assert(
      actual: 'Hello, World!',
      expected: new EndsWith('World!'),
   );
```

### Find via In enum

For more specific lookups, use the `In` enum with the `->find()` method:

```php
use Bootgly\ACI\Tests\Assertion\Auxiliaries\In;
```

| Enum | Description |
|------|-------------|
| `In::ArrayKeys` | Search in array keys |
| `In::ArrayValues` | Search in array values |
| `In::ObjectProperties` | Search in object properties |
| `In::ObjectMethods` | Search in object methods |
| `In::ClassesDeclared` | Search in declared classes |
| `In::InterfacesDeclared` | Search in declared interfaces |
| `In::TraitsDeclared` | Search in declared traits |

---

## Matchers

Use matchers to verify values with pattern matching.

### Regex

Regular expression matching:

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Matchers\Regex;

yield new Assertion(description: 'Matches string')
   ->assert(
      actual: 'Hello, World!',
      expected: new Regex('/World/'),
   );
```

### VariadicDirPath

Directory path matching with variadic patterns:

```php
use Bootgly\ABI\Data\__String\Path;
use Bootgly\ACI\Tests\Assertion\Expectations\Matchers\VariadicDirPath;

$Path = new Path('/etc/php/');
$Path->match(path: '%', pattern: '8.*');
yield new Assertion(description: 'Valid relative path')
   ->assert(
      actual: (string) $Path,
      expected: new VariadicDirPath('/etc/php/8.*'),
   );
```
