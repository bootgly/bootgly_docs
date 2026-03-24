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
