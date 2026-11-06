# Cache

Bootgly ships a native, dependency-free cache layer at `Bootgly\ABI\Resources\Cache`.
One facade, five blocking drivers — **Memory**, **File**, **APCu**, **Shared-memory** and
**Redis** — with TTL, tags, atomic counters and tag invalidation. It is the same cache used
internally by the multi-worker rate limiter.

> [!NOTE]
> The cache lives in the ABI layer, so every driver is **blocking**. Inside the async
> `HTTP_Server_CLI` worker, prefer `memory` (per-worker, pure array — never touches a syscall)
> or `shared`/`apcu` (no network) for hot paths. When a route needs Redis, use the
> **[`$Response->KV` resource](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#await-key-value-work)**
> inside `$Response->defer()`; the resource parks the response Fiber until Redis replies — a
> blocking Redis call would stall the loop, and so would the `await()` of the
> [raw KV facade](#async-redis-on-the-event-loop).

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
counter is first created** — in the same atomic step that creates it — so the window does not
slide on later hits, and a counter created with a `TTL` never exists without its expiry:
exactly the behavior a fixed-window rate limiter needs. A counter that already exists keeps its
expiry, including having none:

```php
$hits = $Cache->increment('hits:home');            // 1, 2, 3, ...
$left = $Cache->increment("quota:$ip", TTL: 60);    // window opens on first call
$owed = $Cache->decrement("credits:$id", TTL: 86400);
$secs = $Cache->remain("quota:$ip");                // seconds left (-1 = no expiry, -2 = missing)
```

`decrement()` takes the same `TTL` and applies it the same way. Leaving `TTL` out applies the
cache's configured default, like every other write does — a counter created on a cache
configured with `TTL: 0` therefore never expires, so pass an explicit `TTL` when the window
must close.

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

The store after the compute is unconditional: a `delete()` or `invalidate()` that lands while
the compute runs is overwritten with what it computed. When an invalidation must win against
a compute in flight — permission lists, for example — bind each value to a generation key read
before the compute instead (`RBAC` does).

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

## Atomic compare-and-mutate contract

`Bootgly\ABI\Resources\Cache\Atomic` marks drivers whose `create()`, `swap()` and
`evict()` operations are atomic across the complete visibility scope of their backend.
**File**, **Memory**, **Shared-memory** and **Redis** implement that contract. **APCu** does
not provide generic compare-and-evict, so it is not an `Atomic` driver; a custom driver opts
in only after implementing all three primitives.

| Operation | Guarantee |
|---|---|
| `create($key, $value, $TTL)` | Writes only when no live value owns the key |
| `swap($key, $expected, $value, $TTL)` | Replaces only the exact expected value |
| `evict($key, $expected)` | Deletes only the exact expected value |

Security components that elect one winner across workers or hosts require this marker. In
particular, a JWT `Vault` backed by a prepared Cache rejects APCu and non-atomic custom
drivers at construction time:

```php
use Bootgly\ABI\Resources\Cache;
use Bootgly\API\Security\JWT\Vault;

$Cache = new Cache([
   'driver' => 'redis',
   'host' => 'redis.internal',
   'prefix' => 'security:',
]);

$Vault = new Vault(
   $Cache,
   secret: getenv('JWT_VAULT_SECRET') ?: '' // same secret (>= 32 bytes) on every host
);
```

`Vault::claim()` and `Vault::take()` use backend-atomic winner election. New Vault envelopes
also carry an authenticated random nonce, so a stale compare-and-evict cannot remove a later
same-value write (ABA). Legacy envelopes remain readable during a rolling update; the full
nonce guarantee starts after legacy writers leave the fleet.

> [!WARNING]
> `Vault::lock()` is a host-local file lock, not a Redis/distributed multi-key transaction.
> It serializes compound work inside one host only. Do not build a cross-host transaction by
> composing several Vault keys under `lock()`. `JWT\Tokens` needs no cross-host lock: on one
> linearizable store with `noeviction` (see the Authentication manual), its rotations stay safe
> across hosts through the order of their writes around the atomic `take()`.

## Configuration

Pass an array (or a prepared `Cache\Config`) to the constructor:

| Key | Default | Applies to | Meaning |
|---|---|---|---|
| `driver` | `file` | all | Active driver |
| `prefix` | `''` | all | Namespace prepended to every key |
| `TTL` | `0` | all | Default TTL (seconds; `0` = forever) |
| `path` | this process's own cache directory — `…/storage/cache`, `…/storage/cache-<uid>` or a private temp directory (see `Config::locate()`) | file | Base directory |
| `segment` | `0` | shared | System V key (`0` derives one) |
| `size` | `16 MiB` | shared | Segment size in bytes |
| `host` / `port` | `127.0.0.1` / `6379` | redis | Server endpoint |
| `password` / `database` | `''` / `0` | redis | AUTH / SELECT |
| `timeout` | `5.0` | redis | Connect/read seconds |
| `secure` | `false` | redis | TLS connection |
| `classes` | `[]` | file, redis, shared, apcu | Classes the cache may reconstruct (see [Security](#security)) |
| `clock` | `null` | file, shared, memory | `Closure(): int` clock override (testing) |

The option names are the names of the properties they fill, and only those names are
accepted: an unknown key — `ttl` for `TTL`, a typo, an option meant for another subsystem —
raises `InvalidArgumentException` instead of silently falling back to the default. A `TTL`
that is not a non-negative number is refused for the same reason (`'1h'` would otherwise
become one second).

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

Bootgly reaches Redis three ways, and the Cache driver above is one of them:

| | Cache `redis` driver | KV facade | Queues `redis` driver |
|---|---|---|---|
| Class | `Bootgly\ABI\Resources\Cache` | `Bootgly\ADI\Databases\KV` | `Bootgly\ACI\Queues` |
| What it does | Stores PHP values with TTLs, tags and atomic counters | Sends the Redis commands you write, pipelined | Runs background jobs, with retries, delays and a dead-letter store |
| How it waits | Blocks the process on every call | Its driver blocks only to resolve a host name, and its `await()` until the reply; in a route, `$Response->KV` parks the request instead | Blocks the worker process |
| Connection keys | Its own: port `6379`, `timeout` `5.0`, `secure` `true` or `false` | The database keys: port `5432`, `timeout` `30.0`, `secure.mode` `'prefer'` by default | Its own: port `6379`, `timeout` `5.0`, `secure` `true` or `false` |

In an `HTTP_Server_CLI` route, reach Redis through the KV facade's response resource:
[register the `KV` resource](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#register-the-kv-resource)
and use `$Response->KV` inside `$Response->defer()` — `fetch()` for one command, `command()` and
`drain()` to pipeline several. It parks the response Fiber on the connection's readiness until Redis
replies (see
[Await key-value work](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#await-key-value-work)).
The facade's own `await()` loops on `stream_select()` and never suspends the calling Fiber — inside
`defer()` too, where it stalls every request on the worker — so call it directly only in CLI
scripts, console commands and queue workers.

The facade itself — opening it, commands and replies, pipelining, deadlines and cancellation, the
`kv` config scope — is documented in **[KV database](/manual/ADI/Databases/KV/overview/)**, and its
driver — authentication, database selection, TLS and when `prefer` falls back to plaintext — in
**[Redis driver](/manual/ADI/Databases/KV/Drivers/Redis/overview/)**. Its connection keys are the
database ones, with a local PostgreSQL's defaults, so a KV array always sets `driver` and `port`,
and declares a plaintext Redis with `'secure' => ['mode' => 'disable']`: the default `prefer` opens
every connection with a TLS handshake that a plaintext Redis never answers.

## Security

The cache store is a **trust boundary**: only your app should be able to write to
`storage/cache/`, the SysV segment, the APCu pool, or the Redis instance — protect them with
filesystem and network permissions. As defense in depth, the `file` and `redis` drivers hand
every stored record to a **fail-closed `allowed_classes` allow-list** before anything is
rebuilt, so a tampered record can never run an object-injection gadget
(`__wakeup`/`__destruct`) while it is being read. Rejecting the value afterwards is not a
defense — by then the gadget has already run. `shared` and `apcu` decode under the same list,
but only *after* the PHP extension has rebuilt the record — see the caveat below.

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

`file` and `redis` apply the list **before** anything is reconstructed: they gate an
`unserialize()` call directly. `shared` and `apcu` keep Bootgly's records as opaque strings and
decode them in PHP under the same allow-list — but `shm_get_var()` and `apcu_fetch()` accept no
options and rebuild whatever the store holds **before** any driver code runs. For those two
drivers the list therefore stops a tampered *record*, not a planted *object*: a process that
can write the SysV segment or the APCu pool can make the reader fire a `__wakeup`/`__destruct`
of its choosing. This is a known limitation of the two extensions, not something the driver
can refuse; the only containment is the boundary itself — the segment's `0600` permissions and
who can execute in the APCu pool — which is why the Session handler defaults to `file`.
`memory` needs no list at all: it keeps live values in the process heap and never serializes.

Because `shared` and `apcu` write opaque strings, Bootgly's *own* writes can never carry an
object graph either. The first process to attach a segment written by an older Bootgly discards
it, so a deploy resets rate-limit counters and drops shared sessions exactly once, and `shared`
reads cost about 9-13 % more.

> [!NOTE]
> Treat the SysV segment and the APCu store like any other shared resource: keep `permissions`
> at `0600`, do not widen the segment to a group, and remember APCu memory is shared by every
> application in the same PHP pool. An app that must not share cache identity with its
> neighbors should still prefer `file` or `redis` — and so should any host where code you do
> not trust runs as the same user, since that user can write both stores.

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
  `SET`/`GET`/`INCRBY`/`EXPIRE`/`TTL`/`SADD`/`SMEMBERS`/`SCAN`. A counter with a `TTL` and
  `swap`/`evict`/`renew` run as one `EVAL` script each, and Redis checks every command inside
  a script against the ACL too: counters need `EVAL` plus `SET`, `INCRBY` and `GET` (for
  example `+eval +set +incrby +get`, or `+@scripting +@string`); a counter without `TTL` is a
  plain `INCRBY`. When Redis refuses an increment — a value that is not a counter, a `TTL`
  it cannot store, a command the ACL denies — the driver raises on both transports instead
  of answering `0`. The driver batches multi-command
  operations into single round-trips (tagged stores pipeline `SET`+`SADD`s; `invalidate`
  and `clear` use chunked variadic `UNLINK`) and accepting a `persistent` config key for
  persistent connections. `persistent` is honoured only for a connection whose session is
  the server default — no `database`, no `password`, no TLS: PHP pools a persistent stream
  by `tcp://host:port` alone, so a connection that needs a session of its own would carry
  that session for every other client on the endpoint, and theirs for it. A config that asks
  for both still works; it simply opens its own socket.
- **resolve() semantics** — hit/miss is decided by a single `fetch()`, so a stored `null`
  is treated as a miss and recomputed. Do not cache `null` values.

```php
Bootgly\ABI\Resources\Cache\Config::locate (null|string $storage = null): string
```

Resolves this process's own cache directory — the default `path` of the File driver and the
directory compiled templates live under. A directory is used only when it is a plain directory
of the current user that nobody else may write, under ancestors only root or that user can
change; a missing one is created owner-only (`0700`) inside a parent of its own. In order:
`storage/cache`, `storage/cache-<uid>` (what a root launch hands to the demoted workers), then a
private `bootgly-<uid>/<app>` (one per storage root) in the system temporary directory, or in
`/tmp` when that one cannot be trusted (a storage tree the process cannot trust: another user's
or group-writable `storage/`, a host-owned bind mount). The storage root is checked as written
before it is resolved: a component on the way that belongs to someone else, or a directory
others may write without the sticky bit, keeps the process out of that tree. `$storage`
defaults to the booted storage root, located once per user: a location in the storage tree is
kept until `forget()` — under a sticky shared directory (`/tmp/app/storage`), only while the
entry just below it is still the same directory of the same owner —, a temporary one is proven
again on every call. A relative `$storage` is taken from the working directory, and `/` keeps its
own `/cache`; a component of it that does not exist — on the written path or where one of its
links leads — also keeps the process out of that tree. The location is per process and kept while
it serves: a process moves only when it finds its cache tree gone or untrusted — a template
compile after its `templates/` directory went away, a File write after the cache directory went
away — and the other workers keep the old tree until then. Restart the workers after changing
the permissions of `storage/`. Throws
`RuntimeException`, naming the directories tried, when not even a temporary directory can be
trusted.

```php
Bootgly\ABI\Resources\Cache\Config::forget (): void
```

Drops the current user's located cache directory, so the next `locate()` resolves it again — for
code that found the directory gone (a cache cleared by hand while serving). The template cache
calls it when its tree went away and cannot be made again, or can now be changed by another
user; the File driver calls it on its next write when the directory is gone (reads miss until
then).

```php
Bootgly\ABI\Resources\Cache\Config->located: bool
```

Whether this `Config`'s `path` is the located default (no `path` given) rather than a given one —
read-only.

```php
Bootgly\ABI\Resources\Cache\Config::trust (string $directory, int $EUID, bool $sticky = false): bool
```

Whether user `$EUID` can trust `$directory` — the rule `locate()` applies to each candidate, and
the template cache to its `templates/` subdirectory: a plain directory (not a link) of that user
that its group and others cannot write, under ancestors only root or that user can change
(group/world-writable ones only with the sticky bit). Every ancestor is checked first; then it
**creates** a missing directory owner-only (`0700`) when its parent is that user's own — or,
with `$sticky` (what `locate()` passes for the system temporary directory), a sticky one of
root's — and creates nothing otherwise.

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
- **[KV database](/manual/ADI/Databases/KV/overview/)** - send Redis commands over the async DBAL pool.
