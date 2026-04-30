# Testing Foundations

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
