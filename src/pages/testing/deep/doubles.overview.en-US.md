# Doubles

Doubles replace real collaborators during a test. In Bootgly, the feature is native to `Bootgly\ACI\Tests` and covers four main needs:

- `Mock`: replaces an interface or non-final class with controlled responses.
- `Spy`: wraps a real instance, delegates calls and records interactions.
- `Fake`: provides a working, stateful and deterministic implementation of a collaborator.
- `Doubles`: small registry to reset multiple doubles together.

## Fake

Use `Fake` when a test needs realistic behavior with internal state, but does not need call recording or proxy generation. A Fake is useful when the relationship between calls matters, for example: `set('k', 'v')` → `check('k')` → `get('k')`.

Fakes implement `Doubling`, so they can be registered in `Doubles` and reset together with `Mock` and `Spy`.

### Fake\Memory

`Fake\Memory` is an in-memory key-value store for collaborators shaped like sessions, caches or simple storage.

```php
<?php

use Bootgly\ACI\Tests\Doubles\Fake\Memory;

$Session = new Memory();

$Session->set('_csrf_token', 'abc123');

$exists = $Session->check('_csrf_token'); // true
$token = $Session->get('_csrf_token');    // 'abc123'

$Session->delete('_csrf_token');
$Session->flush();
$Session->reset();
```

Public API:

| Method | Behavior |
| ------ | -------- |
| `check(string $name): bool` | Returns `true` when the key exists, even if the value is `null`. |
| `get(string $name, mixed $default = null): mixed` | Returns the value or the default when the key is missing or contains `null`. |
| `set(string $name, mixed $value): void` | Stores one value. |
| `delete(string $name): void` | Removes one key. |
| `list(): array<string,mixed>` | Returns all stored data. |
| `flush(): void` | Removes all data. |
| `reset(): static` | Clears state and returns the Fake itself. |

### Fake\Clock

`Fake\Clock` is a deterministic clock for time-sensitive tests. It extends
[`Bootgly\ABI\Clock`](/manual/ABI/Clock/overview/), so it goes anywhere a `Clock` is expected —
but its readings only move when you move them:

- `now` — wall time in float seconds, starting at the timestamp you give;
- `time` — wall time in whole seconds (`(int) now`);
- `tick` — monotonic time in nanoseconds, starting at `0`.

```php
<?php

use Bootgly\ACI\Tests\Doubles\Fake\Clock;

$Clock = new Clock(100);

$Clock->now;  // 100.0
$Clock->tick; // 0

$Clock->advance(60);
$Clock->now;  // 160.0
$Clock->tick; // 60000000000

$Clock->freeze(42.5);
$Clock->now;  // 42.5
$Clock->time; // 42
$Clock->tick; // 60000000000 — a wall-clock step, the monotonic time stays

$Clock->reset();
$Clock->now;  // 100.0
$Clock->tick; // 0
```

`advance()` moves the wall and monotonic readings together (seconds on one, nanoseconds on the
other, rounded to the nearest nanosecond). A negative `advance()` moves the wall time back and,
like `freeze()`, leaves the monotonic time where it is — monotonic time never goes back. A move
that would carry the tick past the int range of nanoseconds (about 292 years) throws
`OverflowException` and moves nothing.

When the SUT takes a `Clock`, pass the Fake itself:

```php
$RateLimit = new RateLimit(
   limit: 3,
   window: 60,
   clock: $Clock
);

$Cache = new Cache(['driver' => 'memory', 'clock' => $Clock]);
$Tokens->Clock = $Clock;
```

> Before 1.1.0 the Fake was passed through a closure (`clock: fn (): float => $Clock->now`).
> That still works — it reads the same — but is deprecated and removed in 2.0.0.

The Fake extends the `Clock` class, so it implements `Doubling` directly instead of extending
the `Fake` base class: it is registered in `Doubles` and reset like any other double, but
`$Clock instanceof Fake` is `false`.

Public API:

| Member | Behavior |
| ------ | -------- |
| `now: float` | Current wall timestamp of the fake clock, in seconds. |
| `time: int` | Current wall timestamp in whole seconds (`(int) now`). |
| `tick: int` | Current monotonic time, in nanoseconds (starts at `0`). |
| `initial: float` | The timestamp `reset()` restores. |
| `advance(int|float $seconds): void` | Advances the wall time by seconds and the monotonic time by as many nanoseconds (a negative amount moves only the wall time back); throws `OverflowException` past the int range of nanoseconds. |
| `freeze(int|float $at): void` | Sets the wall time to an exact timestamp; the monotonic time does not move. |
| `reset(): static` | Restores the initial timestamp and a zero tick, and returns the Fake itself. |

## Mock

Use `Mock` when a test must control a collaborator response and verify that a method was called.

```php
<?php

use Bootgly\ACI\Tests\Doubles\Mock;

interface Authing
{
   public function check (string $token): bool;
}

$Auth = new Mock(Authing::class);
$Auth->stub('check', true);

$allowed = $Auth->Proxy->check('abc123');
$called = $Auth->verify('check', times: 1);
```

The `Proxy` property is a runtime-generated object that preserves the target contract. It passes `instanceof Authing` and dispatches calls to the `Mock`.

### Stubs

`stub()` creates a return rule for a method.

```php
$Auth->stub('check', true);
```

You can also use a Closure to compute the return value from the arguments:

```php
$Auth->stub('check', function (string $token): bool {
   return $token === 'abc123';
});
```

### Throw

Use `throw()` to simulate collaborator failures.

```php
$Auth->stub('check')->throw(new RuntimeException('invalid token'));
```

Throwing calls are still recorded in `Calls`.

### Argument filter

`filter()` limits when a stub should apply.

```php
$Auth
   ->stub('check', true)
   ->filter(function (string $token): bool {
      return $token === 'admin';
   });
```

## Verifying calls

`verify()` confirms whether a method was called. With `times`, the count must match exactly.

```php
$Auth->Proxy->check('abc123');

$Auth->verify('check');          // true: called at least once
$Auth->verify('check', times: 1); // true: called exactly once
```

Recorded calls are available in `$Auth->Calls`.

```php
$Call = $Auth->Calls->list[0];

$Call->method;    // method name
$Call->arguments; // received arguments
$Call->returned;  // returned value
$Call->Threw;     // Throwable, when any
$Call->at;        // timestamp
```

## Spy

Use `Spy` when the real implementation should run while calls are recorded.

```php
<?php

use Bootgly\ACI\Tests\Doubles\Spy;

class Counter
{
   public int $total = 0;

   public function add (int $value): int
   {
      $this->total += $value;

      return $this->total;
   }
}

$Counter = new Counter();
$Spy = new Spy($Counter);

$result = $Spy->Wrapped->add(3);
$called = $Spy->verify('add', times: 1);
```

The `Wrapped` property is the typed proxy. The `Real` property keeps the real instance.

## Doubles registry

`Doubles` groups objects implementing `Doubling` and can reset or clear all of them.

```php
<?php

use Bootgly\ACI\Tests\Doubles;
use Bootgly\ACI\Tests\Doubles\Fake\Memory;
use Bootgly\ACI\Tests\Doubles\Mock;

$Doubles = new Doubles();

$Auth = $Doubles->add(new Mock(Authing::class));
$Auth->stub('check', true);

$Session = $Doubles->add(new Memory());
$Session->set('_csrf_token', 'abc123');

$Doubles->reset(); // resets Calls/Stubs and clears registered Fake state
$Doubles->clear(); // removes all entries from the registry
```

## Proxy limits

The generated proxy follows PHP language constraints:

| Situation | Behavior |
| --------- | -------- |
| Interface | Supported. |
| Non-final class | Supported. |
| Final class | Rejected. |
| Inherited final method | Not overridden. |
| By-reference return | Rejected with `LogicException`. |
| Constructor/destructor | Not proxied. |

## Best practices

- Use `Mock` to isolate external dependencies and control return values.
- Use `Spy` when the real implementation must run.
- Use `Fake` when the test needs consistent state across calls.
- Use `verify()` for interaction intent; use normal assertions for final state.
- Call `reset()` between scenarios when reusing the same double.
