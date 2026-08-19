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
   ->to->wait(200000)
   ->assert();
```

The budget is enforced: when it runs out, the callable is killed and the assertion fails.

Two things decide the number you write. It is **microseconds**, so `200000` is 200 ms. And it covers the whole measured window, not the callable alone — the waiter runs your callable in a forked process, so process creation and reaping are inside the measurement. That overhead is a few milliseconds on a developer machine and can reach a couple of dozen on a shared CI runner, which is why the example above gives a 10 ms callable a 200 ms budget rather than a 10 ms one.

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
      $this::$description .= " [{$duration} µs]";

      // implicit ->expect($duration)
      return $this
         ->to->delimit(1000, 200000);
      // implicit ->assert()
   })
   ->assert();
```

The Closure form sets no budget at all — nothing is killed, and the verdict comes entirely from the sub-assertions you return. `$duration` arrives in microseconds, the same unit `wait(<number>)` takes.

## Best practices

- Use waiters for simple and explicit performance bounds.
- Keep realistic margins to avoid flaky tests: a budget close to the expected duration will fail on the fork overhead alone.
- Prefer the Closure form when you need to validate ranges or record measured duration.
- Avoid measuring calls that strongly depend on network, disk or external environment without isolation.
