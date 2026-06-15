# Queues

Bootgly ships a native, dependency-free job queue at `Bootgly\ACI\Queues`. Push slow work —
emails, PDFs, image resizing, third-party API calls — out of the request and run it later in a
separate worker process. Two drivers (File and Redis), retry with backoff, a dead-letter store
and lifecycle events come built in. The File driver needs zero setup; the Redis driver speaks
the protocol through Bootgly's own RESP codec (no Composer dependency, optional `ext-redis`
fast-path).

> [!NOTE]
> This is the **on-demand job queue** (run work as soon as a worker is free), distinct from the
> **[Scheduler](/guide/scheduler/overview/)** (wall-clock cron jobs). Reach for a queue to email
> a receipt after checkout; reach for the scheduler to prune a cache every five minutes.

## Write a handler

A job is a serializable message: a **handler class-string** plus a **payload array**. The
handler is any class implementing `Queues\Handler`:

```php
use Bootgly\ACI\Queues\Handler;
use Bootgly\ACI\Queues\Job;

final class SendEmail implements Handler
{
   public function handle (Job $Job): void
   {
      $to = $Job->payload['to'];
      // ... send the email ...
   }
}
```

> [!IMPORTANT]
> A job crosses process boundaries, so it carries **only serializable data** — a handler
> class-string and a scalar/array payload, never a Closure or live object. (Unlike a scheduled
> `Schedule\Job`, which may hold a Closure in memory.)

## Enqueue from a request handler

On the Web platform, enqueue with one call through the `Bootgly\WPI\Queues` facade:

```php
use Bootgly\WPI\Queues;

Queues::dispatch(SendEmail::class, ['to' => 'user@example.com']);   // default queue
Queues::dispatch(SendEmail::class, $payload, 'emails');             // a named queue
```

`dispatch()` builds the `Job`, enqueues it and returns it — a quick local write (File) or one
Redis round-trip. It never blocks the HTTP event loop: the slow part runs later in the worker
process.

Already hold a `Job`? Push it directly:

```php
use Bootgly\ACI\Queues\Job;

Queues::push(new Job(SendEmail::class, ['to' => '...']), 'emails');
```

Outside the Web platform (a CLI script, a test), use the `ACI\Queues` manager directly:

```php
use Bootgly\ACI\Queues;

$Queues = new Queues(['driver' => 'file']);
$Queues->fetch('emails')->enqueue(new Job(SendEmail::class, ['to' => '...']));
```

## Run the worker

```bash
bootgly queue run            # drain the 'default' queue until SIGTERM/SIGINT
bootgly queue run emails     # drain a named queue
bootgly queue list           # print known queues and their ready counts
```

`queue run` reserves the next due job, runs its handler, and acknowledges it on success. A
failure is retried with backoff and, once attempts are exhausted, moved to a dead-letter store —
one bad job never kills the worker. It installs `SIGTERM`/`SIGINT` handlers for a graceful
shutdown, and on boot recovers stale claims left by a previous crash.

Run several workers (even across hosts on Redis) for more throughput — the drivers claim each
job atomically, so a job is never processed twice.

## Configure retries, backoff and drivers

An optional `queues.php` at your project root returns a config array (the worker reads it;
without it, sensible defaults run):

```php
// queues.php
use Bootgly\ACI\Queues\Backoffs;

return [
   'driver'     => 'file',                 // 'file' (default) or 'redis'
   'attempts'   => 3,                      // tries before a job is dead-lettered
   'backoff'    => Backoffs::Exponential,  // Fixed | Linear | Exponential
   'base'       => 10,                     // backoff base, in seconds
   'visibility' => 60,                     // a reserved job returns to ready after N s if its worker died

   // Redis driver:
   'host' => '127.0.0.1', 'port' => 6379,
];
```

Backoff delay for retry number *n* (with `base` = 10s):

| Policy | Delay | Example (n = 1, 2, 3) |
|---|---|---|
| `Fixed` | `base` | 10, 10, 10 |
| `Linear` | `base × n` | 10, 20, 30 |
| `Exponential` | `base × 2^(n-1)` | 10, 20, 40 |

## Delay a job

Set a future availability before enqueuing — the job stays invisible until then:

```php
$Job = new Job(SendEmail::class, ['to' => '...']);
$Job->postpone(time() + 300);   // becomes due in 5 minutes
Queues::push($Job, 'emails');
```

## Drivers

| Driver | Setup | Scope | Best for |
|---|---|---|---|
| **File** (default) | none | one host | zero-config, single host; atomic-rename claim under `workdata/queues/<name>/` |
| **Redis** | a Redis server | cross-host | many workers / hosts; `ZADD`/`ZREM` claim, `O(log N)` per op, one round-trip |

The File driver scans the ready directory per reserve (`O(N·log N)`), which is fine for modest
backlogs; prefer **Redis** when a single queue holds a large backlog or workers span hosts.

## Lifecycle events

The queue emits domain events through the ABI event bus (`Bootgly\ABI\Events\Emitter`).
Listeners are opt-in and cost nothing when none are attached (zero-allocation `check()` guard):

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ACI\Queues\Events;

Emitter::$Instance->listen(Events::Dispatch,  function (Emission $E) {
   [$queue, $Job] = $E->payload;
});
Emitter::$Instance->listen(Events::Processed, function (Emission $E) {
   [$Job, $durationMs] = $E->payload;
});
Emitter::$Instance->listen(Events::Failed,    function (Emission $E) {
   [$Job, $Throwable, $willRetry] = $E->payload;
});
```

| Event | When | Payload |
|---|---|---|
| `Dispatch` | a job was enqueued | `$queue`, `Job` |
| `Processed` | a job ran successfully | `Job`, `$durationMs` (float) |
| `Failed` | a job threw | `Job`, `Throwable`, `$willRetry` (bool) |

See the **[Events](/guide/events/overview/)** guide for the full bus API.

## Security

The job store is a **trust boundary**: only your app should be able to write to
`workdata/queues/` or the Redis instance — protect them with filesystem and network
permissions. As defense in depth, the drivers deserialize stored jobs with `allowed_classes`
restricted to `Job` (so a tampered payload can never trigger an object-injection gadget), and the
worker refuses to instantiate a handler that is not a declared `Queues\Handler`.

## Reference

- **Manager** — `Bootgly\ACI\Queues`: `fetch(string $name = 'default'): Queue`. Holds the
  `Config` and the `Drivers` registry.
- **Queue** — `Queues\Queue`: `enqueue(Job)`, `reserve(): null|Job`, `complete(Job)`,
  `release(Job, int $delay = 0)`, `bury(Job)`, `recover(): int`, `count(): int`, `clear()`.
- **Job** — `Queues\Job(class-string $Handler, array $payload = [])`: read-only `$Handler`,
  `$payload`, `$attempts`, `$available`, `$id`; `attempt()`, `postpone(int $timestamp)`.
- **Handler** — `Queues\Handler`: `handle(Job $Job): void`.
- **Worker** — `Queues\Worker(Queue, Config)`: `tick(): bool` (process one job). Driven by the
  `QueueCommand` (`bootgly queue run|list`).
- **Drivers** — `Queues\Drivers` registry (`'file'`, `'redis'`); `register(name, class)` plugs in
  a custom driver. Both implement `Queues\Driver`.
- **Enums** — `Queues\Backoffs` (`Fixed`, `Linear`, `Exponential`) and `Queues\Events`
  (`Dispatch`, `Processed`, `Failed`).
- **WPI adapter** — the `Bootgly\WPI\Queues` facade (`dispatch()`, `push()`, `boot()`) over
  `WPI\Queues\Messenger`.
- **Layering** — `ACI\Queues` depends only on the ABI (`IO/FS`, `Data/RESP`, events); the CLI
  worker and the `WPI\Queues` adapter consume it — no `ACI → WPI` back-dependency.

## Next references

- **[Scheduler](/guide/scheduler/overview/)** - run wall-clock cron jobs with a worker command.
- **[Events](/guide/events/overview/)** - the full event bus API (`Emission`, priorities).
- **[Cache](/guide/cache/overview/)** - File/APCu/Shared/Redis caching over the same RESP codec.
