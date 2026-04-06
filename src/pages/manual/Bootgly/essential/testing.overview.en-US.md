# Testing

Bootgly has two APIs for testing, a Basic API and an advanced API! Before implementing the tests themselves, let's start by understanding the standard structure of test files and directories in Bootgly...

## Structure of Test Files and Directories

Test files in Bootgly follow the `resources` directories and files standard. Tests implemented in each module must be placed within a directory at the same level as the module, and this directory must be named "tests". In each "tests" directory, there should be a bootstrap file for the test suite, named as "@.php". The files that implement the test cases are found within the `tests` directory and follow this standard: `*.test.php`.

You have the freedom to define any name you want for the test case files in Bootgly, but it is recommended to follow the already existing pattern. An example of a test case file name implemented in Bootgly is: `1.01-request_as_response-address.test.php`.

### Directory + files

```txt
tests
└── @.php  # Bootstrap file for the suite
└── 1.1-some_case-part1.test.php  # Test Case file
└── 1.2-other_case-part2.test.php  # Test Case file
└── 2.1-another_case.test.php  # Test Case file
...
```

### Visual Diagram

Assuming you already have a basic understanding of tests, the diagram below shows how tests can be structured in Bootgly:

```txt
Test Suite
└── Test Case
    └── Assertions
        ├── Assertion
        └── Assertion
        ...
└── Test Case
    └── Assertions
        ├── Assertion
        └── Assertion
```

The diagram above is a mental model of how tests are designed in Bootgly.

### Overview

```txt
tests
└── @.php  # Bootstrap file for the suite
└── 1.1-some_case.test.php  # Test Case files
    └-- Assertions
       ├-- Assertion
       └-- Assertion
```

## Test Suite

Every bootstrap file that defines the test suite has a standard structure as in the example below:

```php
<?php

# namespace here

use Bootgly\ACI\Tests\Suite;

return new Suite(
   // * Config
   autoBoot: __DIR__,
   autoInstance: true,
   autoReport: true,
   autoSummarize: true,
   exitOnFailure: true,
   // * Data
   suiteName: __NAMESPACE__,
   tests: [ // files that point to the root directory where the "@.php" file is located
      '1.0-name' // the suffix ".test.php" should be omitted
   ]
);
```

Real example of a test suite defined in Bootgly:

```php
<?php # Bootgly/ABI/Data/__String/tests/@.php

namespace Bootgly\ABI\Data\__String;

use Bootgly\ACI\Tests\Suite;

return new Suite(
   // * Config
   autoBoot: __DIR__,
   autoInstance: true,
   autoReport: true,
   autoSummarize: true,
   exitOnFailure: true,
   // * Data
   suiteName: __NAMESPACE__,
   tests: [
      '1.x-dynamic-props-length',
      '1.x-dynamic-props-lowercase',
      '1.x-dynamic-props-pascalcase',
      '2.x-dynamic-methods-pad',
      '2.x-dynamic-methods-search',
   ]
);
```

## Test Cases

In Bootgly, test case files have two structures, one for the Basic API and another for the advanced testing API.

### Basic API Structure

```php
<?php

use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   // @ configure
   description: 'Description of the test case here',
   // @ test
   test: function (): string|bool|null
   {
      // implement assertions here
   }
);
```

### Advanced API Structure

```php
<?php

use Generator;

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Assertions;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   // @ configure
   description: 'Description of the test case here',
   // @ test
   test: new Assertions(Case: function (): Generator
   {
      // implement assertions here
   })
);
```

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

---

## Throwers

Use throwers to verify that code throws expected exceptions, errors or throwables.

### Testing exceptions

Use the `->to->call()->to->throw()` pattern:

```php
$callable = function () {
   throw new Exception('Exception');
};
yield new Assertion(description: 'Validating exception')
   ->expect($callable)
   ->to->call()
   ->to->throw(new Exception('Exception'))
   ->assert();
```

Available throwers:

| Class | Catches |
|-------|---------|
| `ThrowException` | `Exception` |
| `ThrowError` | `Error` |
| `ThrowThrowable` | `Throwable` |

---

## Waiters

Use waiters to test execution time and performance.

### Normal usage

Check if a function executes within an expected time (in microseconds):

```php
yield new Assertion(description: 'Validating wait time')
   ->expect(function () {
      usleep(10000);
   })
   ->to->call()
   ->to->wait(10000)
   ->assert();
```

### Closure with Subassertion

For more complex time checks, use a Closure that receives the measured duration and returns sub-assertions:

```php
$callable = function () {
   usleep(1000); // Simulates a blocking task
};
yield new Assertion(description: 'Validating wait time (Closure)')
   ->expect($callable)
   ->to->call()
   ->to->wait(function (float $duration): Assertion {
      $this::$description .= " [{$duration} ms]";

      // implicit ->expect($duration)
      return $this
         ->to->delimit(1000, 20000);
      // implicit ->assert()
   })
   ->assert();
```

---

## Snapshots

Snapshots allow you to capture and restore value state for regression testing.

### Capture and Restore

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

### MemoryDefaultSnapshot (in-memory)

In-memory snapshot storage (fastest, non-persistent):

```php
$array1 = [1, 2, 3];
yield new Assertion(description: 'Capturing and restoring arrays')
   ->assert(
      actual: $array1,
      expected: $array1,
      using: new Snapshots\MemoryDefaultSnapshot
   );
```

### FileStorageSnapshot (file-based)

File-based JSON snapshot storage (persistent across runs):

```php
use Bootgly\ACI\Tests\Assertion\Expectations\Delimiters\ClosedInterval;

yield new Assertion(description: 'Between integers')
   ->assert(
      actual: 2,
      expected: new ClosedInterval(1, 3),
      using: new Snapshots\FileStorageSnapshot
   );
```

---

## Lifecycle Hooks

The `Assertions` class supports hooks to execute code before/after tests:

```php
use Bootgly\ACI\Tests\Assertions\Hook;
```

### Available Hooks

| Hook | When |
|------|------|
| `Hook::BeforeAll` | Before all assertions |
| `Hook::AfterAll` | After all assertions |
| `Hook::BeforeEach` | Before each assertion |
| `Hook::AfterEach` | After each assertion |

### Example

```php
return new Specification(
   description: 'It should compare equal values',
   test: new Assertions(Case: function (): Generator
   {
      yield new Assertion(description: 'Equal integers')
         ->expect(1)
         ->to->be(1)
         ->assert();
   })
      ->input('test')
      ->on(Hook::BeforeEach, function ($Assertion, $arguments): void
      {
         // execute something before each assertion
      })
);
```

### Input (datasets)

Use `->input()` to pass data to the assertions Closure:

```php
test: new Assertions(Case: function (): Generator
{
   yield new Assertion(description: 'Test with data')
      ->expect(1)
      ->to->be(1)
      ->assert();
})
   ->input('value1', 'value2', 'value3')
```

---

## Skip and Ignore

### Skip

The `skip` parameter in `Specification` allows skipping a test case (with output):

```php
return new Specification(
   description: 'Test to skip',
   skip: true,
   test: function (): bool
   {
      return true;
   }
);
```

### Ignore

The `ignore` parameter allows skipping a test case silently (without output):

```php
return new Specification(
   description: 'Test to ignore',
   ignore: true,
   test: function (): bool
   {
      return true;
   }
);
```

### Skip in the Advanced API

In the Advanced API, use the `->skip()` method on `Assertion`:

```php
yield new Assertion(description: 'Skipped assertion')
   ->skip();
```

---

## Visual Separators

Use the `Separator` class to organize test output with visual separators:

```php
use Bootgly\ACI\Tests\Suite\Test\Specification\Separator;

return new Specification(
   Separator: new Separator(
      line: 'Section Name',    // Separator line with label
      left: 'Category',        // Left-side label
      header: 'Main Section',  // Section header
   ),
   description: 'Test case',
   test: function (): bool
   {
      return true;
   }
);
```

| Property | Type | Description |
|----------|------|-------------|
| `line` | `bool\|string\|null` | Separator line (true for simple line, string for label) |
| `left` | `string\|null` | Label displayed on the left |
| `header` | `string\|null` | Section header |
