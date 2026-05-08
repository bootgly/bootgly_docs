# Waiters

Waiters validate execution time and performance of a callable. They use the `->to->call()->to->wait()` chain to measure call duration.

## Basic usage

Check if a function executes within an expected time in microseconds.

```php
yield new Assertion(description: 'Validating wait time')
   ->expect(function () {
      usleep(10000);
   })
   ->to->call()
   ->to->wait(10000)
   ->assert();
```

## Closure with Subassertion

For more complex checks, use a Closure that receives the measured duration and returns sub-assertions.

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

## Best practices

- Use waiters for simple and explicit performance bounds.
- Keep realistic margins to avoid flaky tests.
- Prefer the Closure form when you need to validate ranges or record measured duration.
- Avoid measuring calls that strongly depend on network, disk or external environment without isolation.
