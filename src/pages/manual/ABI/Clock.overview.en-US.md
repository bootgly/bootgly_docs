# Clock

`Clock` is the one way to inject time into Bootgly's clock seams. It puts the system's wall
clock and its monotonic clock behind one object, so code that needs the time takes a `Clock`
instead of calling `time()`, `microtime()` or `hrtime()` — and a test hands it a clock it moves
by hand. `Stopwatch` measures elapsed time on it.

## Read the time

```php
use Bootgly\ABI\Clock;

$Clock = new Clock;

$Clock->now;  // 1793960035.897368 — wall time, float seconds (microtime(true))
$Clock->time; // 1793960035        — wall time, whole seconds (time())
$Clock->tick; // 310700984429682   — monotonic time, nanoseconds (hrtime(true))
```

Every reading asks the system when it is read; nothing is cached. Pick the reading by what it
measures:

| Reading | Clock | Unit | Use it for |
|---|---|---|---|
| `$now` | wall | float seconds | timestamps with sub-second precision |
| `$time` | wall | int seconds | expirations, dates stored or compared with stored ones |
| `$tick` | monotonic | int nanoseconds | deadlines, timeouts, durations |

The wall clock is the date the system shows: it jumps when someone (or NTP) sets the system
clock. The monotonic clock never goes back and never jumps — but its origin is arbitrary, so only
the difference between two ticks means anything:

```php
$deadline = $Clock->tick + 5 * 1_000_000_000; // 5 s from now, on the monotonic clock

while ($Clock->tick < $deadline) {
   // ...
}
```

## Take a Clock instead of the system

Give the class that needs the time a `Clock`, defaulting to the system one:

```php
use Bootgly\ABI\Clock;

final class Invitation
{
   // * Config
   public private(set) Clock $Clock;

   public function __construct (null|Clock $Clock = null)
   {
      $this->Clock = $Clock ?? new Clock;
   }

   public function expire (int $issued, int $TTL): bool
   {
      return $this->Clock->time >= $issued + $TTL;
   }
}
```

In production it reads the system. In a test, pass the double
`Bootgly\ACI\Tests\Doubles\Fake\Clock` — it **is** a `Clock`, frozen until you move it:

```php
use Bootgly\ACI\Tests\Doubles\Fake\Clock;

$Clock = new Clock(1_000_000);          // wall at 1000000, tick at 0
$Invitation = new Invitation($Clock);

$Invitation->expire(1_000_000, 60);     // false
$Clock->advance(60);                    // wall +60 s, tick +60_000_000_000 ns
$Invitation->expire(1_000_000, 60);     // true
```

`advance()` refuses a move that would carry the tick past the int range of nanoseconds (about
292 years): it throws `OverflowException` and leaves the clock as it was.

See [Doubles](/testing/deep/doubles/overview/) for everything the fake does.

## Measure elapsed time

`Stopwatch` reads the monotonic tick, so changing the system date never stretches or
shrinks a measurement:

```php
use Bootgly\ABI\Stopwatch;

$Stopwatch = new Stopwatch;
$Stopwatch->start();

// ... the work being measured

$Stopwatch->stop();
echo $Stopwatch->elapsed; // 12503311   (nanoseconds)
echo $Stopwatch->seconds; // 0.012503311
```

It works like a hand stopwatch: `start()` after `stop()` resumes from what it measured,
`reset()` zeroes it, and `$elapsed` can be read while it runs (it includes the current run):

```php
$Stopwatch->reset()->start();
foreach ($batches as $batch) {
   import($batch);

   if ($Stopwatch->seconds > 30.0) {
      break; // past the time budget
   }
}
```

Pass a `Clock` to measure on it — with the fake, a duration is exact:

```php
use Bootgly\ABI\Stopwatch;
use Bootgly\ACI\Tests\Doubles\Fake\Clock;

$Clock = new Clock;
$Stopwatch = new Stopwatch($Clock)->start();
$Clock->advance(1.5);
$Stopwatch->elapsed; // 1500000000
```

A stopwatch trusts the tick of the clock it reads. The system tick never goes back, but the
fake's `reset()` puts its tick back to 0: a stopwatch running across that reset reads a negative
`$elapsed`. Reset the stopwatch along with the fake.

## Clocks in the framework

The framework pieces that read the time take a `Clock`:

| Piece | Where the Clock goes | Reading |
|---|---|---|
| `Bootgly\ABI\Resources\Cache` | `'clock'` option | `$time` (TTL seconds) — file, shared and memory drivers; APCu and Redis expire entries on their own server clock, which no Clock moves |
| `Bootgly\ACI\Queues` | `'clock'` option | `$time` (job timestamps) |
| `RateLimit` middleware | `clock:` argument | `$time` (window seconds) |
| `Tokens`, `Users`, `Trust` | `$Clock` property | `$time` (token time; `freeze()` still wins) |
| `JWT\Remote` | `Clock:` argument | `$time` (set freshness), `$tick` (origin floor) |

```php
use Bootgly\ABI\Resources\Cache;
use Bootgly\ACI\Tests\Doubles\Fake\Clock;

$Clock = new Clock(1_000_000);
$Cache = new Cache(['driver' => 'memory', 'clock' => $Clock]);

$Cache->store('key', 'value', 60);
$Clock->advance(60);
$Cache->fetch('key'); // null — expired
```

The injection point is spelled differently per piece: a `'clock'` option (Cache, Queues), a
`clock:` argument (`RateLimit`), a `Clock:` argument (`JWT\Remote`) or a `$Clock` property
(`Tokens`, `Users`, `Trust`). These names stay as they are through 1.x; the direction for 2.0,
when the closure form goes away, is one spelling — a `Clock` named `Clock` (a `Clock:` argument
or option).

`Tokens`, `Users` and `Trust` also keep `freeze()` and `resume()`. `freeze($timestamp)` pins
token time to one Unix second, whatever `$Clock` reads; `resume()` returns to `$Clock->time`.
Move time with a `Fake\Clock` in `$Clock`; freeze when one fixed instant is all a check needs.

> **Deprecated since 1.1.0:** the `clock` option of Cache and Queues and the `clock:` argument
> of `RateLimit` still accept a closure returning a Unix timestamp
> (`fn (): float => $Clock->now`). It is read as `(int) $closure()` — exactly as before —
> through `Clock::adapt()`, and is removed in 2.0.0. Pass the `Clock` itself. The adapted
> clock's `$tick` follows the closure's wall time, so it moves back when the closure's value
> does: do not measure durations on it. On `Queues\Config`, assigning `$Clock` clears the
> deprecated `$clock`.

## Not on a Clock yet

A few readers still call the system clock directly and are left for a later release:
`JWT\Tokens` (its own `freeze()` timestamp seam), `JWT\Usage`, `JWT\Validator`, `JWT\Vault`,
the Queues `Worker` (job durations) and the visibility check of the Queues file driver
(`recover()`). A Clock handed to Cache, Queues or `JWT\Remote` does not move them.

## Reference

```php
public float $now { get; }
```

Wall-clock time in seconds since the Unix epoch, with microseconds — `microtime(true)`, read on
every access.

```php
public int $time { get; }
```

Wall-clock time in whole seconds since the Unix epoch — `time()`, read on every access.

```php
public int $tick { get; }
```

Monotonic time in nanoseconds from an arbitrary origin — `hrtime(true)`, read on every access.
It never decreases.

```php
public static function adapt (Closure $Closure): Clock
```

Deprecated since 1.1.0, removed in 2.0.0. Returns a Clock read from a legacy `clock` closure that returns a Unix timestamp: `$time` is `(int) $Closure()`, `$now` the same value as a float and `$tick` that value in nanoseconds. The `clock` options of Cache, Queues and RateLimit use it for the closures they still accept; pass a `Clock` instead.

```php
public function Stopwatch::__construct (null|Clock $Clock = null)
```

Creates a stopped stopwatch at zero that reads `$Clock` (the system `Clock` when null).

```php
public function Stopwatch::start (): static
```

Starts the stopwatch, or resumes it after `stop()`, from the clock's current `$tick`. Starting a
running stopwatch changes nothing.

```php
public function Stopwatch::stop (): static
```

Stops the stopwatch, adding the current run to what it measured. Stopping a stopped stopwatch
changes nothing.

```php
public function Stopwatch::reset (): static
```

Stops the stopwatch and zeroes what it measured.

```php
public private(set) Clock $Stopwatch->Clock;
```

The clock the stopwatch reads.

```php
public private(set) null|int $Stopwatch->started;
```

The `$tick` the current run started at; `null` while stopped.

```php
public bool $Stopwatch->running { get; }
```

Whether the stopwatch is running.

```php
public int $Stopwatch->elapsed { get; }
```

Elapsed nanoseconds: every stopped run plus, while running, the current one.

```php
public float $Stopwatch->seconds { get; }
```

`$elapsed` in seconds (`$elapsed / 1e9`).
