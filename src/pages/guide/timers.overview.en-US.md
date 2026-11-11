# Interval Timers

Bootgly has two interval timers. `Bootgly\ACI\Events\Timer`, covered first, is the
dependency-free timer wheel in whole seconds that works in any process. Inside a server worker,
the event loop also runs [recurring timers](#recurring-timers-on-the-event-loop) in fractions of
a second.

`Timer` callbacks are process-local and cooperative: the event loop dispatches `tick()`, so
blocking application code can delay a due callback.

```php
use Bootgly\ACI\Events\Timer;
use Bootgly\ACI\Events\Timer\Registry;

$id = Timer::add(
   interval: 5,
   handler: static function (): void {
      // periodic work
   },
);

if ($id !== false && Registry::check($id)) {
   Timer::del($id);
}
```

`add()` returns a live integer identifier for every positive interval, or `false` when the
interval is not positive. Persistent timers rearm after each callback; pass
`persistent: false` for a one-shot timer.

Each due timer runs at most once per `tick()`, and a timer added or rearmed during a tick first
runs on a later one. When a callback throws, the wheel keeps going: the failure is reported
through `Throwables::notify()` — every reporter registered in `Throwables::$reporters` receives it
with the context `['origin' => 'timer', 'id' => $id]`, once per Throwable instance (a callback that
throws the same stored instance again is reported only the first time) — a persistent timer keeps
its schedule, and a one-shot timer is released. The values a callback leaves behind (its
captures, its arguments, the failure itself) are released contained too, so a destructor that
throws — even one whose exception's own destructor throws — never escapes into the worker's
signal handler. Only a chain of destructor failures deeper than 64 generations is cut: its
last failure is parked for the rest of the process instead of released — PHP destroys it at
shutdown, where a throwing destructor turns the exit status into 255.

`Timer\Registry::check(int $id): bool` reports whether that identifier is still live. It becomes `false`
after targeted deletion, global deletion, or completion of a one-shot callback. Use it when
an owner must recover after another component intentionally clears the process timer wheel.
`Timer\Registry::snapshot(): array<int>` returns a point-in-time list of all live identifiers without
exposing their callbacks or arguments. The returned identifiers can become stale immediately;
use `check()` again before relying on one.

`del(int $id = 0): bool` removes one identifier. Calling `del()` without an identifier clears
every timer in the process, then notifies registered `Timer\Reset` observers. Framework owners
whose bounded cleanup is still pending may therefore restore an essential supervisor before
`del()` returns; ordinary owners should still validate their timer when they next receive work.
The timer wheel commits deletion before releasing detached callbacks and arguments, and contains
failures raised by their destructors. Deletions share one process-local FIFO release queue: a destructor
that requests another targeted or full deletion only commits and queues that generation instead of
recursing. One outer timer touch releases at most 256 detached generations, then performs the
coalesced reset notification; any bounded remainder advances on a later `add()`, `tick()` or
`del()`. This keeps owner recovery reachable without an attacker-controlled deletion stack.
Deletion is a barrier inside `tick()` as well: a timer that an earlier callback of the same
tick deleted — by identifier, or by clearing the wheel — never runs in that tick.

`Timer\Reset::add(Closure $Observer): int` and `del(int $id): void` manage this process-local
owner notification. `notify()` is the dispatch operation used by the timer wheel; application
code should not call it as a substitute for `Timer::del()`. Each pass traverses a stable,
rotating LIFO snapshot and isolates observer and captured-value release failures. Nested resets are coalesced
into another pass; only the observer that caused a nested reset is omitted from later passes in
that dispatch. Other ordinary observers run again. Registry mutations do not alter the active
snapshot and are visible to a subsequent coalesced pass. One outer notification has a finite
global callback budget, so an observer that continually registers successors cannot keep
`Timer::del()` from returning. The next outer notification resumes after the last observer that
consumed budget, so older observers cannot remain starved by newer registrations.

Bootgly's cleanup supervisors use a separate sealed recovery tier after ordinary dispatch. It
freezes its starting identities, contains failures, suppresses a callback that causes another
full reset, and permits at most eight recovery callback executions. Ordinary `add()` cannot
claim that tier, and public `del(int $id)` cannot remove its internal identities; their owning
component unregisters them when the protected state becomes empty. This lets a required
supervisor recover after the last bounded ordinary or nested reset without making the public
observer API an unbounded priority path. Observer identifiers are positive and are not reused
while the observer is live or represented in the active dispatch snapshot.

## Recurring timers on the event loop

Inside a server worker, the event loop itself can run a callback at a fixed interval — in
fractions of a second, on the monotonic clock, with no signal involved. The loop offers it as
an optional capability, `Bootgly\ACI\Events\Repeating`, so check for it before use:

```php
use Bootgly\ACI\Events\Repeating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;

$Loop = HTTP_Server_CLI::$Event;

if ($Loop instanceof Repeating) {
   $id = $Loop->repeat(0.25, static function (): void {
      // every 250 ms, on this worker's event loop
   });

   // later — stop it
   $Loop->cancel($id);
}
```

The built-in loop (`Bootgly\WPI\Events\Select`) implements `Repeating`. Register from code
that runs in the worker — a route handler, for example — because each worker has its own loop.
The loop object already exists in the master process, where it never runs: a timer registered
there, in boot code, does nothing in the master and is copied into every worker forked
afterwards, where each worker runs its own copy.

**The schedule is a fixed grid.** Run `k` is due at `registration + k × interval`: neither the
time the callback takes nor the latency of the loop adds up as drift. When the loop reaches a
run late — a blocking handler held it for a second — the callback runs **once**, the grid points
that passed meanwhile are skipped, and the next run is the first grid point after it. A late
timer never fires a burst.

**Cancelling.** The identifier comes from the same sequence as the one-shot `defer()` and is
stopped with the same `cancel()`, which answers `true` once. A callback may cancel itself or any
other timer; a recurring callback cancelled earlier in the same pass does not run in that pass,
and one registered inside a callback first runs on a later pass.

**Failures.** A callback that throws does not stop the loop nor its own schedule: the failure is
reported through `Throwables::notify()` with the context `['origin' => 'loop.repeat', 'id' => $id]`,
and the callback runs again on its next period.

**Intervals.** A zero, negative, `NAN` or infinite interval is refused with an
`InvalidArgumentException`, as is one longer than `Select::HORIZON`. An interval shorter than
`Select::RESOLUTION` (one millisecond) is raised to it, so no interval can turn the loop into a
busy loop.

Callbacks run on the loop, between two I/O dispatches: keep them short. They are process-local
— a timer registered in one worker does not exist in another. A pass of the loop costs the
timers that are due, not the ones that are waiting, so thousands of timers with different
deadlines are fine; what they cost is their callbacks.

The same loop also runs the worker's signal handlers — `SIGALRM`, which drives the static
`Timer`, included — between callbacks. To run your own handler when a signal arrives, see
[Select](/manual/WPI/Events/Select/overview/).

### When `Timer` still applies

- **Outside a worker loop** — the master process never runs its loop, and a command or a
  script has none: use `Timer`.
- **On a loop without the capability** — a custom loop that implements only `Scheduler` keeps
  working; `instanceof Repeating` is `false` there, and `Timer` is the fallback.
- **Whole seconds are enough and the code already uses it** — `Timer` keeps its API.

## Reference

### `Repeating`

```php
public function repeat (float $interval, Closure $Callback): int
```

Registers `$Callback` to run every `$interval` seconds on the monotonic clock and returns its
identifier. Throws `InvalidArgumentException` for an interval that is zero, negative, not a
number, infinite or longer than the loop's horizon.

```php
public function cancel (int $ID): bool
```

Inherited from `Bootgly\ACI\Events\Scheduler`: stops a recurring timer (or cancels a one-shot
`defer()` before it fires). Returns `false` for an identifier that is unknown or already stopped.

### `Select`

```php
public const float RESOLUTION = 0.001;
```

Shortest recurring interval, in seconds; `repeat()` raises a shorter one up to it.

```php
public const float HORIZON = 1_000_000_000.0;
```

Longest recurring interval, in seconds (about 31 years); `repeat()` refuses a longer one.

### `Timer`

```php
public static function init (callable $handler): bool
```

Installs the process `SIGALRM` handler.

```php
public static function add (
   int $interval,
   callable $handler,
   array $args = [],
   bool $persistent = true
): int|false
```

Schedules a callback, or returns `false` for a non-positive interval.

```php
public static function tick (): void
```

Dispatches each due callback once — never one an earlier callback of the tick deleted — and
rearms persistent ones. A callback failure is reported through `Throwables::notify()` with
`['origin' => 'timer', 'id' => $id]` (once per Throwable instance), and every value a callback
leaves behind is released contained.

```php
public static function del (int $id = 0): bool
```

Deletes one timer, or all timers when `id` is zero.

### `Timer\Registry`

```php
public static function check (int $id): bool
```

Checks whether an identifier is live.

```php
public static function snapshot (): array
```

Snapshots all live timer identifiers.

### `Timer\Reset`

```php
public static function add (Closure $Observer): int
```

Registers a full-reset observer.

```php
public static function del (int $id): void
```

Removes a public full-reset observer.

```php
public static function notify (): void
```

Dispatches the reset snapshot used internally by `Timer`.
