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
> composing several Vault keys under `lock()`.

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

The blocking Redis driver above would stall the async HTTP worker. For non-blocking Redis on
the event loop, use the **KV facade** instead — it speaks RESP over the same async DBAL
connection pool the SQL driver uses, reusing the `Bootgly\ABI\Data\RESP` codec:

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'secure' => ['mode' => 'disable'], // a plaintext Redis is declared, never inferred
]);

$KV->await($KV->command('SET', ['user:42', 'value']));
$Get   = $KV->await($KV->command('GET', ['user:42']));
$value = $Get->response;   // RESP reply: string | int | array | null

$Incr  = $KV->await($KV->command('INCRBY', ['hits', 5]));
$count = $Incr->response;  // 5
```

In CLI scripts you can `await()` directly through the pool. In `HTTP_Server_CLI` routes, drive
it from `$Response->defer()` like any other async resource so route code never calls
`advance()` manually.

Since 1.0.0, the default `prefer` never downgrades to plaintext on a peer that stays
silent: an undeclared plaintext Redis — one not configured with `'secure' => ['mode' =>
'disable']` — now costs the handshake budget (1 s, or half the `timeout`) on every new
connection and fails every operation until it is declared, where earlier releases silently
fell back to plaintext. This is a breaking change for deployments that relied on that fallback.

Since 1.0.3, `prefer` and `require` no longer verify the server certificate by default —
before, every mode but `disable` did. A `require` connection that pinned a `cafile` now needs
`verify-ca`/`verify-full` (or `verify => true`) to keep verifying.

> [!NOTE]
> The async driver pipelines commands on each pooled connection. `AUTH`/`SELECT` are sent once
> as its preamble; `SELECT` only fires for a numeric `database` index. Redis uses implicit TLS:
> `prefer` tries TLS first and reconnects in plaintext only when the peer **explicitly** refuses
> it, while `require`, `verify-ca` and `verify-full` never send RESP — including `AUTH` —
> before a successful handshake. `disable` is explicit plaintext — and the only mode that
> reaches a plaintext Redis, which never answers a ClientHello (see the warning below).

Only `verify-ca` and `verify-full` verify the server certificate — the chain, and with
`verify-full` its name too. `prefer` and `require` encrypt without verification, as libpq's and
MySQL's `sslmode` do (`verify => true`, and `name`, opt them in); unverified TLS defeats passive
eavesdropping only, so use a `verify-*` mode on any network you do not trust. With `cafile` absent,
OpenSSL's default trust store applies — the `openssl.cafile`/`openssl.capath` ini settings, or
`SSL_CERT_FILE`/`SSL_CERT_DIR` when set — so pin `cafile` whenever the CA is private. A
`cafile` is only read by a verifying handshake, so one under `prefer`/`require` without
`verify` is refused at config time. A `cafile` that cannot be read fails the
connection before the socket exists, and one that can be read but holds no valid certificate
(or an `openssl.cafile` that does not) fails the handshake before any ClientHello is sent, with
the OpenSSL diagnostic naming the file — whatever `error_reporting()` masks. Neither ever falls
back to the default store, nor to plaintext.

Use a strict mode for a remote deployment. `verify-full` validates both the certificate chain
and peer name; `cafile` selects a private CA bundle and `peer` overrides the expected identity:

```php
$KV = new KV([
   'driver' => 'redis',
   'host' => 'redis.internal',
   'port' => 6380,
   'password' => getenv('KV_PASS') ?: '',
   'database' => '2',
   'secure' => [
      'mode' => 'verify-full',
      'peer' => 'redis.internal',
      'cafile' => '/run/secrets/redis-ca.pem',
   ],
]);
```

> [!WARNING]
> `prefer` guarantees one thing: it downgrades to plaintext only on an **explicit refusal** —
> the peer reset or closed the connection during the TLS handshake (RST or FIN — on the
> ClientHello or after a partial ServerHello alike) or answered it with non-TLS bytes.
> **Silence is not a refusal.** A peer that has not answered within the handshake
> budget (1 s, or half the `timeout`) fails the operation with `Redis TLS handshake timed out:
> the peer did not answer the TLS handshake within 1s — set secure.mode => 'disable' for a
> plaintext Redis`, because a TLS server whose ServerHello is late — one retransmission, a
> loaded TLS terminator — looks exactly like a plaintext Redis, which parks the ClientHello in
> its query buffer and never answers; downgrading there would send the credentials in
> plaintext to a server that speaks TLS, on a connection the pool then reuses. The budget is
> `prefer`'s alone: `require`, `verify-ca` and `verify-full` wait for the ServerHello until
> the operation's `timeout` — silence can never downgrade there, so a silent peer fails them
> with the ordinary `Database operation timed out` error and a TLS server that answers late
> still completes the handshake. So a plaintext Redis is **declared**, with
> `'secure' => ['mode' => 'disable']` (`KV_SSLMODE=disable` for the `KV` resource), never
> discovered: with the default `prefer` it fails at the budget on every new connection instead
> of ever answering. Declared plaintext also costs nothing — no handshake attempt, no budget
> per connection. `prefer` never downgrades on an untrusted
> certificate, a peer-name mismatch, a TLS alert or a local error such as a `cafile` OpenSSL
> cannot load either: those fail the operation. What `prefer` does **not** guarantee is
> encryption — a peer that refuses TLS, or an attacker able to reset the first connection,
> receives the credentials in plaintext on the second one; the Redis driver bound to the
> operation (`$Operation->Protocol`) records the refusal it downgraded on in its `downgrade`
> property — and that record is the only trace: nothing is logged, because the database layer
> has no logger, so a downgrade nobody reads there goes unnoticed. Use `require`, `verify-ca` or
> `verify-full` whenever plaintext is not acceptable.

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
