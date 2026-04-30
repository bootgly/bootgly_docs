# Testing Advanced Features

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
