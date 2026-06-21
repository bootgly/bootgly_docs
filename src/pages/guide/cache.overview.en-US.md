# Cache

Bootgly ships a native, dependency-free cache layer at `Bootgly\ABI\Resources\Cache`.
One facade, four blocking drivers — **File**, **APCu**, **Shared-memory** and **Redis** —
with TTL, tags, atomic counters and tag invalidation. It is the same cache used internally
by the multi-worker rate limiter.

> [!NOTE]
> The cache lives in the ABI layer, so every driver is **blocking**. Inside the async
> `HTTP_Server_CLI` worker, prefer `shared`/`apcu` (no network) for hot paths, and use the
> non-blocking **[KV Redis driver](#async-redis-on-the-event-loop)** when you need Redis on
> the event loop — a blocking Redis call would stall the loop.

## Store and read

Create a cache, then store and fetch values. Any serializable value round-trips with type
fidelity:

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
| File | `file` (default) | Per-host, on disk | Always available; safe default |
| APCu | `apcu` | Per-process | Single-worker hot data (needs `ext-apcu`) |
| Shared-memory | `shared` | Per-host, **cross-worker** | Multi-worker shared state, rate limiting (needs `ext-sysvshm` + `ext-sysvsem`) |
| Redis | `redis` | Network, multi-host | Distributed cache; native RESP, optional `ext-redis` |

```php
$Cache = new Cache(['driver' => 'shared', 'prefix' => 'app:']);
$Cache = new Cache(['driver' => 'redis', 'host' => '127.0.0.1', 'port' => 6379]);
```

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
| `clock` | `null` | file, shared | `Closure(): int` clock override (testing) |

## Rate limiting (shared backend)

The `RateLimit` HTTP middleware uses this cache as its backend. With the **Shared-memory**
driver (the default), the limit is enforced **globally across all workers** instead of being
multiplied per worker:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RateLimit;

$RateLimit = new RateLimit(limit: 60, window: 60);
// Or inject a specific cache (e.g. Redis for a multi-host fleet):
$RateLimit = new RateLimit(limit: 60, window: 60, Cache: new Cache(['driver' => 'redis']));
```

Each client's window opens on its first request (the counter creation sets the TTL) and rolls
over when that entry expires. The middleware emits the usual `X-RateLimit-Limit`,
`X-RateLimit-Remaining`, `X-RateLimit-Reset` and `Retry-After` headers and returns `429` once
the limit is exceeded.

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
- **Drivers** — `Cache\Drivers\{File, APCu, Shared, Redis}`. File stores one hash-sharded
  file per key (atomic temp + rename, `flock` for counters); Shared uses a System V segment +
  semaphore with a live-key index for `clear`/`purge`; Redis maps the contract to
  `SET`/`GET`/`INCRBY`/`EXPIRE`/`TTL`/`SADD`/`SMEMBERS`/`SCAN`, batching multi-command
  operations into single round-trips (tagged stores pipeline `SET`+`SADD`s; `invalidate`
  and `clear` use chunked variadic `UNLINK`) and accepting a `persistent` config key for
  persistent connections.
- **resolve() semantics** — hit/miss is decided by a single `fetch()`, so a stored `null`
  is treated as a miss and recomputed. Do not cache `null` values.

## Benchmarking

Profile every driver across the full operation set (store, fetch, increment, tags,
resolve, ...) with the `Cache` benchmark case:

```bash
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
