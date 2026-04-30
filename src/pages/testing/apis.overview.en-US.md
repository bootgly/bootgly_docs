# Testing APIs

In Bootgly, test case files have two structures, one for the Basic API and another for the advanced testing API.

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
