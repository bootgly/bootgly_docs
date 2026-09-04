# Interval Timers

`Bootgly\ACI\Events\Timer` is the dependency-free interval timer wheel used by Bootgly
workers. Timers are process-local and cooperative: the event loop dispatches `tick()`, so
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
Deletion is not a barrier for the due snapshot already executing: a callback detached into
that snapshot may still run once later in the same `tick()`.

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

## Reference

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

Dispatches due callbacks and rearms persistent ones.

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
