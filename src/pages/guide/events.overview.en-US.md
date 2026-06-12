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

That's the whole API surface for consumers: `listen()` once, read `$Emission->payload`
(a positional `array` — see each event's payload table below).

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

   error_log("slow query ({$elapsed}s): {$Operation->query}");
});
```

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

`Bootgly\ADI\Databases\SQL\Transaction\Events`:

| Event | When | Payload |
|---|---|---|
| `Begin` | a transaction started | `Transaction` |
| `Commit` | a transaction committed | `Transaction` |
| `Rollback` | a transaction rolled back | `Transaction` |

`Bootgly\ADI\Databases\SQL\Schema\Migration\Events`:

| Event | When | Payload |
|---|---|---|
| `Up` | a migration was applied | `Migration`, `$batch` (int) |
| `Down` | a migration was reverted | `Migration`, `$batch` (int) |

### API — Project

`Bootgly\API\Projects\Project\Events`:

| Event | When | Payload |
|---|---|---|
| `Boot` | the project booted | `Project` |
| `Shutdown` | the booted project is being destroyed | `Project` |

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

## Reference

### `Emitter`

`Bootgly\ABI\Events\Emitter` — the canonical bus lives in `Emitter::$Instance`.

```php
public function listen (Event&UnitEnum $Event, Listener|Closure $Listener, int $priority = 0): self
```

Registers one listener for an event. Higher `$priority` runs first; registration order
breaks ties. Returns the emitter for chaining.

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
when the event has no listeners (zero-allocation path), otherwise the `Emission`.

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
