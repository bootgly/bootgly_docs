# Testing Foundations

Bootgly has two testing APIs, a Basic API and an Advanced API. Before implementing cases, start with file structure, suites, test case APIs and visual separators.

## Structure of test files and directories

Tests implemented in each module should be placed inside a same-level directory named `tests`. In each `tests` directory, there should be a suite bootstrap file named `@.php`. Files that implement test cases live inside the `tests` directory and follow the `*.test.php` pattern.

You can define any test case file name, but following the existing pattern is recommended. A real example is `1.01-request_as_response-address.test.php`.

### Directory + files

```txt
tests
└── @.php  # Bootstrap file for the suite
└── 1.1-some_case-part1.test.php  # Test Case file
└── 1.2-other_case-part2.test.php  # Test Case file
└── 2.1-another_case.test.php  # Test Case file
...
```

### Visual diagram

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

### Overview

```txt
tests
└── @.php  # Bootstrap file for the suite
└── 1.1-some_case.test.php  # Test Case files
    └-- Assertions
       ├-- Assertion
       └-- Assertion
```

## Test suite

Every bootstrap file that defines a test suite follows a standard structure.

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
   tests: [
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

## Test cases

Test case files have two main structures: one for the Basic API and another for the Advanced API.

### Basic API structure

```php
<?php

use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   description: 'Description of the test case here',
   test: function (): string|bool|null
   {
      // implement assertions here
   }
);
```

### Advanced API structure

```php
<?php

use Generator;

use Bootgly\ACI\Tests\Assertion;
use Bootgly\ACI\Tests\Assertions;
use Bootgly\ACI\Tests\Suite\Test\Specification;

return new Specification(
   description: 'Description of the test case here',
   test: new Assertions(Case: function (): Generator
   {
      // implement assertions here
   })
);
```

## Visual Separators

Use the `Separator` class to organize test output with visual separators from the basic `Specification` structure.

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
| -------- | ---- | ----------- |
| `line` | `bool\|string\|null` | Separator line. Use `true` for a simple line or `string` for a label. |
| `left` | `string\|null` | Label displayed on the left. |
| `header` | `string\|null` | Section header. |
