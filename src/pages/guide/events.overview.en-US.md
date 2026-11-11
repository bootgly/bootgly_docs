# Events

Bootgly ships a native, dependency-free event bus at `Bootgly\ABI\Events\Emitter`. Every
framework layer emits its domain events through the same canonical instance —
`Emitter::$Instance` — so one `listen()` call is all you need to observe cache hits, SQL
queries, HTTP requests, worker lifecycles and more.

Listeners are strictly opt-in: every built-in emit site is wrapped in a zero-allocation
`check()` guard, so when nothing is listening, an event costs a single array lookup — no
payload, no object, no closure. Benchmarks across the HTTP hot path and the TechEmpower
DBAL load-set show **zero** measurable overhead with no listeners attached.

## Listen to an event

Pick an event enum case and register a `Closure`. The listener receives one `Emission`
object carrying the event and its payload:

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ABI\Resources\Cache\Events;

Emitter::$Instance->listen(Events::Miss, function (Emission $Emission) {
   [$key] = $Emission->payload;

   error_log("cache miss: $key");
});
```

That is all most consumers need: `listen()` once, read `$Emission->payload` (a positional
`array` — see each event's payload table below). The listener stays registered for the
life of the process, unless you register it for a single delivery or remove it — see
[Listen once, or stop listening](#listen-once-or-stop-listening).

## Catch slow queries

A practical recipe: enable the slow-query threshold and alert on every SQL statement that
crosses it. `Operation::$slow` is in seconds and defaults to `0.0` (off — zero overhead,
not even a `microtime()` call):

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ADI\Databases\SQL\Events;
use Bootgly\ADI\Databases\SQL\Operation;

Operation::$slow = 0.5; // flag queries slower than 500ms

Emitter::$Instance->listen(Events::Slow, function (Emission $Emission) {
   [$Operation, $elapsed] = $Emission->payload;

   error_log("slow query ({$elapsed}s): {$Operation->SQL}");
});
```

`Slow` is announced after `Executed`, and only for statements that succeed: one that fails
or times out is announced as `Failed` instead. The elapsed time counts from the moment the
operation was created, so it includes any wait for a free pooled connection.

## Listen once, or stop listening

Pass `once: true` and the listener is delivered to a single time — the first emission
that reaches it — then it is gone:

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ADI\Databases\SQL\Events;

Emitter::$Instance->listen(Events::Connected, function (Emission $Emission) {
   error_log('database reachable: first connection authenticated');
}, once: true);
```

To remove a listener yourself, keep the closure you registered and hand it to `forget()`.
A listener may do it from inside its own handler — here it samples the first 100
statements and then stops listening:

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ADI\Databases\SQL\Events;

$sampled = 0;

$Sampler = function (Emission $Emission) use (&$sampled, &$Sampler) {
   [$Operation] = $Emission->payload;

   error_log("sample: {$Operation->SQL}");

   if (++$sampled === 100) {
      Emitter::$Instance->forget(Events::Executed, $Sampler);
   }
};

Emitter::$Instance->listen(Events::Executed, $Sampler);
```

What to count on:

- `forget()` returns `true` when it removed something and `false` when the listener was
  not registered for that event. It removes **every** registration of the listener for
  the event, one-shot ones included.
- A `Closure` is matched by the object you registered, so keep it in a variable: another
  closure with the same body is another listener. First-class callables are the
  exception — `$Object->handle(...)` creates a new closure each time, and
  `forget($Event, $Object->handle(...))` still removes the one registered earlier for the
  same method of the same object. A `Listener` object is matched by identity.
- Removal takes effect at once, even in the middle of an emission: a listener forgotten
  by an earlier handler is not delivered to by the emission in flight, and every other
  listener still runs exactly once, in priority order. A listener *registered* by a
  handler waits for the next emission.
- A one-shot listener is removed **before** it runs. It runs at most once even when it
  throws or emits its own event again; inside it `check()` no longer counts it, and
  forgetting it from there returns `false` — it is gone already.
- When the last listener of an event is gone, the event is unobserved again: `check()`
  answers `false` and the emit sites are back to their zero-allocation path.

## Built-in events

Each feature owns one `Events` enum (`Feature\Events implements Bootgly\ABI\Event`).
Payloads are positional, in the order listed.

### ABI — Cache

`Bootgly\ABI\Resources\Cache\Events`

| Event | When | Payload |
|---|---|---|
| `Hit` | `fetch()` found the key | `$key`, `$value` |
| `Miss` | `fetch()` found nothing | `$key` |
| `Evict` | `delete()` was called | `$key`, `$deleted` (bool) |

### ACI — Worker processes

`Bootgly\ACI\Process\Events` — emitted by the multi-worker servers (TCP/HTTP Server CLI):

| Event | When | Payload |
|---|---|---|
| `Boot` | a worker process was forked | `$index` (int) |
| `Shutdown` | the server is stopping | `$level` (process level) |
| `Reload` | a worker is reloading (SIGUSR2) | `$index` (int) |

### ACI — Scheduler

`Bootgly\ACI\Schedule\Events` — see the **[Scheduler](/guide/scheduler/overview/)** guide:

| Event | When | Payload |
|---|---|---|
| `Started` | a job is about to run | `$id`, `Job` |
| `Finished` | a job completed | `$id`, `$duration` (float, ms) |
| `Failed` | a job threw | `$id`, `Throwable` |
| `Skipped` | a run was skipped | `$id`, `$reason` (`'overlap'` \| `'catchup-skip'`) |

### ADI — SQL database

`Bootgly\ADI\Databases\SQL\Events`:

| Event | When | Payload |
|---|---|---|
| `Connected` | a connection finished authenticating | `Connection` |
| `Executed` | an operation resolved successfully | `Operation` |
| `Slow` | an operation exceeded `Operation::$slow` | `Operation`, `$elapsed` (float, seconds) |
| `Failed` | an operation failed — a driver error, a framework refusal, or an issuer-reported write that did not land | `Operation` (carries `->SQL`, `->error` and `->code`) |

`Bootgly\ADI\Databases\SQL\Transaction\Events`:

| Event | When | Payload |
|---|---|---|
| `Begin` | `$Transaction->begin()` was called: it re-opens a closed transaction or opens a nested savepoint (`$Database->begin()` emits no `Begin`) | `Transaction` |
| `Commit` | `$Transaction->commit()` was called, at any depth (at a savepoint level it releases the savepoint) | `Transaction` |
| `Rollback` | `$Transaction->rollback()` was called, at any depth — even when the named savepoint is unavailable and the call is refused | `Transaction` |

Each one is emitted after the call's own guards and before it composes its statement. A call
those guards refuse emits nothing: any call made while the previous statement is still in
flight (except the outer `rollback()`, which overtakes that statement), and a `commit()` or
`rollback()` on a transaction that is not active. A listener does see calls whose statement
then fails, and the two refusals that come after the guards: a `rollback('name')` whose
savepoint is not available, and a `begin()` that would open a savepoint in a transaction that
is not active. `save()`, `release()` and `abort()` emit nothing.

Unlike the SQL events above, these events keep the steering contract: a listener that
throws makes `begin()`, `commit()` or `rollback()` throw before any statement is composed,
and an open transaction stays open on its reserved pooled connection — `abort()`, which
emits nothing, still ends it.

`$Database->transact()` and `$Response->Database->transact()` make these calls for you, so the
same events fire: no `Begin` for the transaction itself (it is opened through
`$Database->begin()`), a `Begin` for the savepoint of a nested call, one `Commit` for each
level committed and, when the work throws, one `Rollback` for each level rolled back. A
`Rollback` listener that throws does not keep `$Database->transact()` from ending the
transaction: it falls back to `abort()`, which announces nothing for the levels it ends.

`Bootgly\ADI\Databases\SQL\Schema\Migration\Events`:

| Event | When | Payload |
|---|---|---|
| `Up` | a migration is about to be applied | `Migration`, `$batch` (int) |
| `Down` | a migration is about to be reverted | `Migration`, `$batch` (int — currently always `0`) |

> **Migration events fire before the migration runs.** For now, `Up` and `Down` are emitted
> before the migration's statements run and outside any transaction. A listener is therefore
> also notified for a migration that then fails (and is rolled back, on PostgreSQL and SQLite:
> MySQL runs migrations without a transaction), and a listener that throws stops the run
> before that migration's first statement. `Down` currently carries batch `0`, not the batch
> being reverted.

### API — Project

`Bootgly\API\Projects\Project\Events`:

| Event | When | Payload |
|---|---|---|
| `Boot` | the project booted | `Project` |
| `Shutdown` | the booted project is being destroyed | `Project` |

`Boot` is announced as soon as registration completes — BEFORE the project's boot
closure runs — so it fires even for server projects whose closure never returns.
`Shutdown` is announced at the teardown of every process that serves the project:
the master and each worker on a real stop. A process whose exit merely hands the
project over — the daemonize launcher, a `reload` (which re-executes the master and
re-announces `Boot` in the fresh image), an auxiliary helper child — is marked
`detached` and never announces `Shutdown`. These events keep the steering contract:
a listener that throws on `Boot` aborts the boot, and one that throws on `Shutdown`
escapes the destructor — fail loud, by design.

### WPI — HTTP Server CLI

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Events`:

| Event | When | Payload |
|---|---|---|
| `Received` | a request body is complete, before routing | `Request` |
| `Handled` | the response was produced for the request | `Request`, `Response` |

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Session\Events`:

| Event | When | Payload |
|---|---|---|
| `Start` | a session started | `$id` |
| `Regenerate` | the session id was rotated | `$oldId`, `$newId` |
| `Destroy` | the session was destroyed | `$id` |

> [!NOTE]
> In a multi-worker server, register listeners in code that runs inside each worker (for
> example in your project bootstrap) — each forked process has its own `Emitter` instance.

## Emit your own events

Declare one `Events` enum per feature, implementing the `Bootgly\ABI\Event` marker:

```php
use Bootgly\ABI\Event;

enum Events implements Event
{
   case Imported;
   case Purged;
}
```

Then emit through the canonical instance. On hot paths, use the `check()` guard so that
building the payload is skipped entirely when no one is listening:

```php
use Bootgly\ABI\Events\Emitter;

$Emitter = Emitter::$Instance;
$Emitter->check(Events::Imported) && $Emitter->emit(Events::Imported, $file, $rows);
```

On cold paths a plain `emit()` is fine — it returns `null` without allocating anything
when the event has no listeners.

## Priority and propagation

Listeners run synchronously in **descending priority** order (higher first; default `0`).
A listener can halt the remaining ones for the current dispatch with `Emission->stop()`:

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;

Emitter::$Instance->listen(Events::Imported, function (Emission $Emission) {
   $Emission->stop(); // listeners with lower priority will not run
}, priority: 10);
```

A one-shot listener keeps its priority position. One that an emission never reaches —
propagation was stopped above it — stays registered and waits for the next emission.

What a listener **throw** does depends on the event's declared contract:

- By default an event is **steering**: a listener Throwable propagates to the emitter,
  which may treat it as control flow — the WPI request events work this way (a
  pre-routing listener that throws refuses the request: it is answered `500` and the
  error reported — `503`, unreported, for a worker budget refusal — its uploads deleted
  and its connection closed (on HTTP/2, only its stream is refused), while the worker
  keeps serving its other connections; a post-handling listener that throws is replaced by
  one bounded error response).
- An event marked `Bootgly\ABI\Events\Emitter\Observing` is **observed only**: each
  listener is isolated, so a Throwable never escapes `emit()`, never blinds
  lower-priority listeners and never aborts delivery — it is reported through
  `Throwables::notify()` instead. The ADI SQL database events (`Connected`, `Executed`,
  `Slow`, `Failed`) are Observing: they are emitted from driver read loops and teardown
  paths, where an escaping listener exception would corrupt the connection pool. Do not
  write gates or validators as listeners of an Observing event.

Either way a one-shot listener that throws does not come back: it was removed before it
ran.

## Reference

### `Emitter`

`Bootgly\ABI\Events\Emitter` — the canonical bus lives in `Emitter::$Instance`.

```php
public function listen (Event&UnitEnum $Event, Listener|Closure $Listener, int $priority = 0, bool $once = false): self
```

Registers one listener for an event. Higher `$priority` runs first; registration order
breaks ties. With `$once` the listener is removed right before its first delivery, so it
runs at most once. Returns the emitter for chaining.

```php
public function forget (Event&UnitEnum $Event, Listener|Closure $Listener): bool
```

Removes every registration of a listener for an event and returns whether there was one.
A `Listener` object matches by identity; a `Closure` by identity, or by equality for two
first-class callables of the same method on the same object. The listener is not
delivered to again, not even by an emission in flight. Removing the last listener of an
event makes `check()` answer `false`.

```php
public function check (Event&UnitEnum $Event): bool
```

Returns whether the event has at least one registered listener. Costs one
`spl_object_id()` + `isSet()` — no allocation. Combine with `emit()` on hot paths:
`$Emitter->check($Event) && $Emitter->emit($Event, ...$payload);`.

```php
public function emit (Event&UnitEnum $Event, mixed ...$payload): null|Emission
```

Dispatches the event synchronously to its listeners in priority order. Returns `null`
when the event has no listeners (zero-allocation path), otherwise the `Emission`. The
emission delivers to the listeners registered when it starts, minus the ones removed
since.

### `Listeners`

`Bootgly\ABI\Events\Emitter\Listeners` — the listeners of one event, behind
`$Emitter->Listeners` (keyed by `spl_object_id()` of the enum case; an event has a key
only while it has a listener). Its `$entries` property is readable: each registration by
its id, in dispatch order, as `[priority, listener, one-shot]`. Iterating the collection
yields the listeners as a list, in the same order.

> [!WARNING]
> Register and remove through `Emitter::listen()` and `Emitter::forget()`. The emitter is
> what drops a collection left empty from its map: empty one directly with the methods
> below and its event keeps answering `check()` as observed.

```php
public function add (Listener|Closure $Listener, int $priority = 0, bool $once = false): void
```

Registers one listener after every registration of a higher or equal priority.

```php
public function remove (Listener|Closure $Listener): bool
```

Removes every registration of a listener — matched as in `forget()` — and returns whether
there was one.

```php
public function drop (int $id): bool
```

Removes the one registration with that id — its key in `$entries` — and returns whether
it was still there.

### `Emission`

`Bootgly\ABI\Events\Emission` — one in-flight dispatch. Read-only properties: `$Event`
(the enum case), `$payload` (positional `array`), `$stopped` (bool).

```php
public function stop (): void
```

Stops propagation — no further listeners run for this dispatch.

### `Listener`

`Bootgly\ABI\Events\Emitter\Listener` — optional interface for class-based listeners
(instead of a `Closure`):

```php
public function handle (Emission $Emission): void
```

### Layering

The bus lives in **ABI**, the lowest layer, so every layer (`ABI → ACI → ADI → API → CLI
→ WPI`) may emit through it without violating the one-way dependency rule. Events are enum
**cases** (compared by identity via `spl_object_id`), not strings — typos are impossible
and lookups never hash strings.

## Next references

- **[Scheduler](/guide/scheduler/overview/)** - job lifecycle events (`Started`, `Failed`, ...).
- **[Cache](/guide/cache/overview/)** - the cache facade behind `Hit`/`Miss`/`Evict`.
- **[Database DBAL](/guide/database-dbal/overview/)** - the async operations behind `Executed`/`Slow`.
