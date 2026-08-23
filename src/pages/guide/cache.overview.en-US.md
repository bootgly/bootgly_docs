# Cache

Bootgly ships a native, dependency-free cache layer at `Bootgly\ABI\Resources\Cache`.
One facade, five blocking drivers — **Memory**, **File**, **APCu**, **Shared-memory** and
**Redis** — with TTL, tags, atomic counters and tag invalidation. It is the same cache used
internally by the multi-worker rate limiter.

> [!NOTE]
> The cache lives in the ABI layer, so every driver is **blocking**. Inside the async
> `HTTP_Server_CLI` worker, prefer `memory` (per-worker, pure array — never touches a syscall)
> or `shared`/`apcu` (no network) for hot paths, and use the non-blocking
> **[KV Redis driver](#async-redis-on-the-event-loop)** when you need Redis on the event
> loop — a blocking Redis call would stall the loop.

## Store and read

Create a cache, then store and fetch values. Scalars and arrays round-trip with type
fidelity; objects round-trip once their class is declared (see [Security](#security)):

```php
use Bootgly\ABI\Resources\Cache;

$Cache = new Cache(['driver' => 'file']);

$Cache->store('user:42', ['name' => 'Ada'], TTL: 300);
$User = $Cache->fetch('user:42');   // ['name' => 'Ada'], or null on miss/expiry
$Cache->check('user:42');           // true while present and unexpired
$Cache->delete('user:42');
```

`fetch()` returns `null` on a miss or once an entry has expired. Use `check()` when you must
tell a stored `null` apart from a miss.

## Counters and TTL

`increment()` and `decrement()` are atomic. A positive `TTL` is applied **only when the
counter is first created**, so the window does not slide on later hits — exactly the
behavior a fixed-window rate limiter needs (it mirrors Redis `INCR` + a one-time `EXPIRE`):

```php
$hits = $Cache->increment('hits:home');            // 1, 2, 3, ...
$left = $Cache->increment("quota:$ip", TTL: 60);    // window opens on first call
$secs = $Cache->remain("quota:$ip");                // seconds left (-1 = no expiry, -2 = missing)
```

`remain()` reports the remaining time-to-live following Redis semantics: `-2` when the key is
missing or expired, `-1` when it exists without an expiry, otherwise the seconds left.

## Tags and invalidation

Group keys with tags, then drop the whole group in one call:

```php
$Cache->store('post:1', $a, tags: ['posts']);
$Cache->store('post:2', $b, tags: ['posts']);

$Cache->invalidate('posts');   // post:1 and post:2 are gone
$Cache->purge();               // evict expired entries; returns the count removed
$Cache->clear();               // empty this cache's namespace
```

## Get-or-compute

`resolve()` returns the cached value, computing and storing it on a miss:

```php
$Report = $Cache->resolve('report:daily', TTL: 3600, compute: function () {
   return build_expensive_report();
});
```

## Choose a driver

| Driver | `driver` | Scope | Use it for |
|---|---|---|---|
| Memory | `memory` | Per-process, in heap | Fastest; single-process caches, tests, an L1 tier in front of a shared backend (no extension; not shared across workers) |
| File | `file` (default) | Per-host, on disk | Always available; safe default |
| APCu | `apcu` | Per-process | Single-worker hot data (needs `ext-apcu`) |
| Shared-memory | `shared` | Per-host, **cross-worker** | Multi-worker shared state, rate limiting (needs `ext-sysvshm` + `ext-sysvsem`) |
| Redis | `redis` | Network, multi-host | Distributed cache; native RESP, optional `ext-redis` |

```php
$Cache = new Cache(['driver' => 'shared', 'prefix' => 'app:']);
$Cache = new Cache(['driver' => 'redis', 'host' => '127.0.0.1', 'port' => 6379]);
```

The **Memory** driver keeps entries in a plain PHP array inside the driver instance: every
operation is a direct hash lookup with no serialization, no locks and no extension — the
fastest backend. The trade-off is scope: each worker holds its own copy, nothing is shared
across forked workers, and the store dies with the process. Reach for it as a single-process
cache, a test double, or an L1 tier in front of a slower shared backend.

The **Shared-memory** driver is the canonical cross-worker backend: it keeps data in a
System V shared-memory segment guarded by a System V semaphore, so every forked worker on the
host sees the same entries and `increment()` is atomic across processes.

The **Redis** driver is native by default — a blocking socket speaking RESP via the shared
`Bootgly\ABI\Data\RESP` codec, with no Composer dependency. When `ext-redis` is loaded it is
used as a faster C-path transport behind the same interface.

## Configuration

Pass an array (or a prepared `Cache\Config`) to the constructor:

| Key | Default | Applies to | Meaning |
|---|---|---|---|
| `driver` | `file` | all | Active driver |
| `prefix` | `''` | all | Namespace prepended to every key |
| `TTL` | `0` | all | Default TTL (seconds; `0` = forever) |
| `path` | `…/storage/cache` | file | Base directory |
| `segment` | `0` | shared | System V key (`0` derives one) |
| `size` | `16 MiB` | shared | Segment size in bytes |
| `host` / `port` | `127.0.0.1` / `6379` | redis | Server endpoint |
| `password` / `database` | `''` / `0` | redis | AUTH / SELECT |
| `timeout` | `5.0` | redis | Connect/read seconds |
| `secure` | `false` | redis | TLS connection |
| `classes` | `[]` | file, redis, shared, apcu | Classes the cache may reconstruct (see [Security](#security)) |
| `clock` | `null` | file, shared, memory | `Closure(): int` clock override (testing) |

## Rate limiting (shared backend)

The `RateLimit` HTTP middleware uses this cache as its backend. With the **Shared-memory**
driver (the default), the limit is enforced **across all workers attached to the same segment
on that host** instead of being multiplied per worker:

```php
use Bootgly\ABI\Resources\Cache;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RateLimit;

$Cache = new Cache([
   'driver' => 'shared',
   'prefix' => 'ratelimit:',
]);
$RateLimit = new RateLimit(
   limit: 60,
   window: 60,
   scope: 'public-api',
   Cache: $Cache
);
// Or use one common Redis backend for a multi-host fleet:
$Redis = new Cache(['driver' => 'redis', 'prefix' => 'ratelimit:']);
$RateLimit = new RateLimit(
   limit: 60,
   window: 60,
   scope: 'public-api',
   Cache: $Redis
);
```

`scope` names the logical policy, not the client. Reuse the same explicit value for that policy
on every worker that shares the Cache backend, and give unrelated policies distinct values. A
scope does not distribute state by itself: across hosts, use the same scope, Cache prefix, and
genuinely shared backend such as Redis. When it is omitted, `RateLimit` derives a deterministic
scope from the normalized file and line of the `new RateLimit` callsite. That default works across
workers running the same code, but moving the expression changes its identity. Use
an explicit scope in factories and multi-host rolling deployments, where old and new revisions
can overlap. `globalScope` defaults to `scope`; share it explicitly only when distinct,
route-disjoint policies should contribute to one aggregate ceiling.

The default `Sliding` algorithm uses weighted current and previous buckets aligned to clock
epochs; it does **not** open a private TTL window on a client's first request. `Fixed` is the
first-request behavior: creating the counter sets its TTL, and later increments do not extend
that window. Both algorithms emit `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and
`X-RateLimit-Reset`; a rejected request returns `429` with `Retry-After`.

> [!WARNING]
> The v2 policy-namespace migration starts fresh counters on its first deployment, so active v1
> quotas reset once. Old v1 records can coexist with v2 records; after their TTLs expire they stop
> counting, but the fixed-capacity Shared-memory driver retains their segment space until an
> explicit purge. The same reclamation requirement applies as v2 counters expire during normal
> operation. Provision segment headroom, retain the injected Cache instance, and run its
> `purge()` periodically (and after the migration, preferably outside hot traffic) to reclaim
> expired records; otherwise stale storage can exhaust the segment even though those counters no
> longer affect requests.

## Async Redis on the event loop

The blocking Redis driver above would stall the async HTTP worker. For non-blocking Redis on
the event loop, use the **KV facade** instead — it speaks RESP over the same async DBAL
connection pool the SQL driver uses, reusing the `Bootgly\ABI\Data\RESP` codec:

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV(['driver' => 'redis', 'host' => '127.0.0.1', 'port' => 6379]);

$KV->await($KV->command('SET', ['user:42', 'value']));
$Get   = $KV->await($KV->command('GET', ['user:42']));
$value = $Get->response;   // RESP reply: string | int | array | null

$Incr  = $KV->await($KV->command('INCRBY', ['hits', 5]));
$count = $Incr->response;  // 5
```

In CLI scripts you can `await()` directly through the pool. In `HTTP_Server_CLI` routes, drive
it from `$Response->defer()` like any other async resource so route code never calls
`advance()` manually.

> [!NOTE]
> v1 scope of the async KV Redis driver: plain TCP, one command per connection (no
> pipelining). `AUTH`/`SELECT` are sent once as a preamble when a connection is first opened;
> `SELECT` only fires for a numeric `database` index.

## Security

The cache store is a **trust boundary**: only your app should be able to write to
`storage/cache/`, the SysV segment, the APCu pool, or the Redis instance — protect them with
filesystem and network permissions. As defense in depth, every persisting driver decodes
stored records through a **fail-closed `allowed_classes` allow-list**, so a tampered record can
never run an object-injection gadget (`__wakeup`/`__destruct`) while it is being read.
Rejecting the value afterwards is not a defense — by then the gadget has already run.

By default nothing is reconstructed except the File driver's own `Cache\Item` record wrapper.
Caching an object means declaring its class:

```php
$Cache = new Cache([
   'driver' => 'file',
   'classes' => [Product::class, Money::class],
]);
```

> [!WARNING]
> This changed in this release. An object cached **without** being declared reads back as a
> **miss** — `fetch()` returns `null` and `check()` returns `false` — it is never handed back
> half-built. Declare every class you cache, including classes nested inside a cached array.
> Values made only of scalars and arrays need no configuration at all.

Records are decoded with a nesting bound of 256, which leaves room for roughly **250 levels**
of nesting in your own value — far past any real cached structure, and there to cap the
recursion a tampered record can force. A value deeper than that, like a record whose bytes no
longer match its declared property types, reads as a **miss** rather than raising.

Enums are the one exception: PHP restores them outside `allowed_classes`, so a cached enum
comes back without being declared. An enum cannot carry a destructor, so none of them is a
gadget.

All four persisting drivers apply the list **before** anything is reconstructed — `file` and
`redis` gate an `unserialize()` call directly; `shared` and `apcu` keep records as opaque
strings and decode them in PHP under the same allow-list, since `shm_get_var()` and
`apcu_fetch()` accept no options and would otherwise rebuild whatever the store held before any
driver code could refuse it. `memory` needs no list at all: it keeps live values in the process
heap and never serializes.

Because `shared` and `apcu` write opaque strings, Bootgly's *own* writes can never carry an
object graph either. The first process to attach a segment written by an older Bootgly discards
it, so a deploy resets rate-limit counters and drops shared sessions exactly once, and `shared`
reads cost about 9-13 % more.

> [!NOTE]
> Treat the SysV segment and the APCu store like any other shared resource: keep `permissions`
> at `0600`, do not widen the segment to a group, and remember APCu memory is shared by every
> application in the same PHP pool. An app that must not share cache identity with its
> neighbors should still prefer `file` or `redis`.

## Reference

- **Contract** — `Cache\Driver` (abstract): `fetch`, `store`, `delete`, `clear`, `check`,
  `increment`, `decrement`, `remain`, `invalidate`, `purge`. The `Cache` facade applies the
  key `prefix` and adds `resolve()`.
- **Facade vs driver** — `Cache` exposes the active driver (`$Cache->Driver`) and the
  `Drivers` registry (`$Cache->Drivers->register('name', MyDriver::class)`), which builds
  drivers lazily on first use.
- **Layering** — the cache is an ABI component and therefore blocking; it cannot reach the
  event loop. Async Redis is an ADI concern (`Bootgly\ADI\Databases\KV`).
- **RESP codec** — `Bootgly\ABI\Data\RESP` provides a stateless `Encoder` and an incremental
  `Decoder` (RESP2 + RESP3), shared by the blocking Redis driver and the async KV driver.
- **Drivers** — `Cache\Drivers\{Memory, File, APCu, Shared, Redis}`. Memory holds entries in a
  per-process PHP array (no serialization, no locks; fastest, but not shared across workers and
  cleared on process exit); File stores one hash-sharded
  file per key (atomic temp + rename, `flock` for counters); Shared uses a System V segment +
  semaphore with a live-key index for `clear`/`purge`; Redis maps the contract to
  `SET`/`GET`/`INCRBY`/`EXPIRE`/`TTL`/`SADD`/`SMEMBERS`/`SCAN`, batching multi-command
  operations into single round-trips (tagged stores pipeline `SET`+`SADD`s; `invalidate`
  and `clear` use chunked variadic `UNLINK`) and accepting a `persistent` config key for
  persistent connections. `persistent` is honoured only for a connection whose session is
  the server default — no `database`, no `password`, no TLS: PHP pools a persistent stream
  by `tcp://host:port` alone, so a connection that needs a session of its own would carry
  that session for every other client on the endpoint, and theirs for it. A config that asks
  for both still works; it simply opens its own socket.
- **resolve() semantics** — hit/miss is decided by a single `fetch()`, so a stored `null`
  is treated as a miss and recomputed. Do not cache `null` values.

## Benchmarking

Profile every driver across the full operation set (store, fetch, increment, tags,
resolve, ...) with the `Cache` benchmark case:

```bash :toolbar="true";
./bootgly test benchmark Cache
```

It prints a driver×operation matrix (fastest highlighted) and saves `.marks` under
`storage/tests/benchmarks/Cache/`. Drivers whose backend is unavailable (missing
extension / unreachable Redis server) show **N/A**, so the run still succeeds on minimal
installs. Requires the sibling `bootgly_benchmarks` repo checked out next to `bootgly`; see
its `Cache/README.md` for the operation list and tuning flags.

## Next references

- **[Configuration](/guide/configuration/overview/)** - load scoped configs and `.env` values.
- **[Performance](/guide/performance/overview/)** - tune workers, pools and concurrency.
- **[Database DBAL](/guide/database-dbal/overview/)** - the async pool the KV Redis driver runs on.
