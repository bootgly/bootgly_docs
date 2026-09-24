# Response Resources

`Response Resources` are the canonical extension point for response helpers in
`HTTP_Server_CLI`. They keep the route flow on the `Response` object while moving body
formatting, view rendering or async bridges into named resources.

Built-in resources are available lazily on every response:

- `$Response->JSON` - sends JSON through the normal response sender.
- `$Response->JSONP` - sends JSONP through the normal response sender.
- `$Response->Plaintext` - sends plain text and sets the `text/plain` media type.
- `$Response->Pre` - formats debug output for preformatted HTML.
- `$Response->View` - renders project views.

Project resources are registered once — through a `Response\Configs` handed to
`HTTP_Server_CLI->configure()` — and then accessed by name from the route, for example `$Response->Database` (async SQL), `$Response->KV`
(async Redis key-value) or `$Response->Upstream` (an outbound HTTP call through the native
client embedded on the worker reactor).

## Use built-in resources

```php
return $Response->JSON->send([
   'status' => 'ok',
]);
```

```php
return $Response->Plaintext->send('Hello, World!');
```

```php
return $Response->View->render('welcome', [
   'title' => 'Welcome Page',
]);
```

> **Plaintext** sets the response media type through `Response->Header->type` (the default
> Content-Type) instead of writing a `Content-Type` header field. The response keeps `build()`'s
> empty-fields fast path and the raw wire-cache, so a constant plain-text route serializes its
> headers once and reuses them — no per-request header array, no validation regex. An explicit
> `Content-Type` set via `Header->set()` still wins when present.

> **View names** are restricted to `[A-Za-z0-9_/-]` — a `..` or `.` segment, a leading `/`, or a null byte is rejected with `403`. Use a plain name (optionally with `/` for subdirectories), without the `.template.php` suffix.

## Register project resources

Register custom resources through the `Resources` field of `Response\Configs`. Each factory is a
`Closure(object): Response\Resource` that receives the current response context and returns a
`Response\Resource` instance — created lazily the first time the route reads the resource by name.

A resource name may not collide with a publicly readable property of the response (`Request`, `Header`, `Body`, `Resources`, `code`, …): the property would win every read, so `define()`, `load()` and `mount()` refuse such a name with an `InvalidArgumentException` at registration time. Names of private or protected properties, and of the response's static settings, stay free.

`Database` and `KV` ship a static `provide()` factory that encapsulates this wiring: it reads a
config scope from the project `configs/` directory, builds one pooled connection per worker and
wraps it. Pass the project `configs/` directory and register each resource in a single line:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Configs as ResponseConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database as DatabaseResource;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\KV as KVResource;

$HTTP_Server_CLI->configure(
   new ServerConfigs(host: '0.0.0.0', port: 8080, workers: 4),
   new ResponseConfigs(
      Resources: [
         'Database' => DatabaseResource::provide(__DIR__ . '/configs/'),
         'KV' => KVResource::provide(__DIR__ . '/configs/'),
      ]
   )
);
```

`Database::provide()` reads the `database` scope (`configs/database/database.Config.php` plus the
local `.env` files), builds one pooled `SQL` connection per worker and wraps it. It throws when the
scope is disabled (`DB_ENABLED=false`) or the context is not a `Response`. The resource is created
lazily the first time the route reads `$Response->Database`.

The factory propagates `DatabaseConfig` validation. The driver selected by `DB_CONNECTION` must
have its canonical block (`Connections->PostgreSQL`, `Connections->MySQL` or
`Connections->SQLite`) in the scope. If it is absent, first access throws an
`InvalidArgumentException`, such as
`Database config is missing the selected connection scope: Connections->SQLite.` No ADI-default
endpoint or pooled `SQL` instance is created.

A factory is just a closure, so when you need full control over construction you can build and wrap
the resource yourself instead of calling `provide()`:

```php
use RuntimeException;

use Bootgly\ADI\Databases\SQL;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Configs as ResponseConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database as DatabaseResource;

$HTTP_Server_CLI->configure(
   new ServerConfigs(host: '0.0.0.0', port: 8080, workers: 4),
   new ResponseConfigs(
      Resources: [
         'Database' => static function (object $Context): DatabaseResource {
            if ($Context instanceof Response === false) {
               throw new RuntimeException('Database response resource expects a Response context.');
            }

            static $Database = null;

            if ($Database instanceof SQL === false) {
               $Database = new SQL(['driver' => 'pgsql', 'host' => '127.0.0.1']);
            }

            return new DatabaseResource($Database);
         },
      ]
   )
);
```

## Await database work

`Database` is an async response resource. It adapts DBAL `Readiness` to
`$Response->wait()` so routes can await SQL work from inside `defer()`. Prefer Query Builder
for application queries; use raw SQL only when the builder is not the right fit.

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; case Active = 'active'; }

return $Response->defer(function (Response $Response): void {
   $Database = $Response->Database;
   $Query = $Database
      ->table(Tables::Users)
      ->select(Columns::Id, Columns::Name)
      ->filter(Columns::Active, Operators::Equal, true);

   $Result = $Database->fetch($Query);

   $Response->JSON->send([
      'status' => 'ok',
      'rows' => $Result->rows,
   ]);
});
```

A wait that does not come back does not strand its connection. When the selector refuses it
(`Fiber I/O resource failed selector admission.` — see `headroom` in
[Connection limits](/manual/WPI/HTTP/HTTP_Server_CLI/#connection-limits)), a `defer()` timeout
interrupts it, or the client disconnects and the request Fiber is destroyed, the operations it
was waiting for are withdrawn locally — see `withdraw()` in
[Database DBAL](/manual/ADI/Database/overview/) — and the pool takes their slot back instead of
leaving the connection busy forever; a statement the server already received may keep that slot
counted until its own deadline. The refusal or the `Timeout` still reaches your handler —
unless the withdrawal itself fails: its exception then propagates instead, with the original
chained at the end of its `getPrevious()` chain.

## Database methods

```php
provide (string $configs): Closure
```

Static factory. Reads the `database` scope from the given project `configs/` directory and returns a
lazy `Closure(object): Database` for `Response\Configs(Resources:)`. Builds one pooled `SQL` per worker; throws
when the scope is disabled or the context is not a `Response`.

```php
table (BackedEnum|Stringable|Builder|Query $Table, null|BackedEnum|Stringable $Alias = null): Builder
```

Starts a SQL query builder for one table through the wrapped database.

```php
query (string|Builder|Query $query, array $parameters = [], null|object $Scope = null): Operation
```

Creates a SQL operation, waits until it finishes and returns the `Operation`. Use it when you
want to inspect `error`, `Result`, pool state or protocol details yourself.

```php
fetch (string|Builder|Query $query, array $parameters = [], null|object $Scope = null): Result
```

Creates a SQL operation, waits until it finishes and returns `Result`. If the operation fails,
it throws `RuntimeException`.

```php
await (Operation $Operation): Operation
drain (array $Operations): array
```

Await one operation or a group of operations created elsewhere, for example by the wrapped
`SQL` instance.

```php
transact (callable $work): mixed
```

Begins a SQL transaction, waits for `BEGIN`, runs the callback, commits on success and rolls
back when the callback throws.

It ends the transaction, not one level of it. A callback is free to nest with
`$Transaction->begin()` and leave the nested level open; `transact()` then keeps committing —
or rolling back — until nothing is left open, so the outer transaction is always finished and
its pinned connection always returned. A single teardown would only have released the
innermost savepoint, leaving the transaction open on a connection nothing hands back.

The callback receives `($Transaction, $Database)`, and **that second argument is this resource
speaking for the transaction**: while the callback runs, `query()`, `fetch()`, `map()` and
`paginate()` all run inside the transaction, on the connection it pinned.

```php
$Response->Database->transact(function ($Transaction, $Database) {
   $Database->query('INSERT INTO orders (total) VALUES ($1)', [99]);

   // Reads the row above: same transaction, same connection.
   return $Database->fetch('SELECT sum(total) AS due FROM orders')->rows;
});
```

That routing is what makes the unit of work whole. Dispatching to the pool instead would ask
for a *different* connection: with capacity to spare the query would run outside the
transaction — seeing none of its writes and covered by none of its rollback — and with a
single-connection pool it would wait for the connection the caller is itself holding.

A `transact()` inside another `transact()` is a nested level of the same transaction, opened as
a savepoint. It is released when the inner callback returns, so its writes are still the outer
transaction's to commit or roll back — an inner unit that returned successfully is still
discarded if the outer one fails.

A transaction is a **serial** surface: it carries one operation at a time. Issue the next query
after awaiting the previous one, and keep `drain()` for groups created on the pool.

If the request Fiber is destroyed mid-transaction — the client left — no callback returns and
nothing throws, so the outermost `transact()` rolls the whole transaction back locally with
`Transaction::abort()`: its `ROLLBACK` is withdrawn before it reaches the wire, the session is
severed, the server rolls back and the connection reservation is released.

The final `COMMIT` is the exception. When the wait for it does not come back — a `defer()`
timeout, a selector refusal, or the Fiber destroyed while it waits — that `COMMIT` is withdrawn
and its session severed like any other teardown. A `COMMIT` that never reached the server ends in
a server-side rollback, but one that already reached it may have committed. `transact()` only
reports that it failed (the `Timeout` or the refusal reaches your handler), so do not retry the
unit of work blindly: check whether its writes landed, or make it idempotent.

## Register the KV resource

`KV` adapts the async key-value database (`ADI/Databases/KV`, Redis) to the response
scheduler the same way `Database` adapts SQL. `KV::provide()` reads the `kv` scope and builds one
`KV` database per worker with a single pooled connection so pending commands pipeline on it:

With one connection per worker there is no spare capacity to absorb a lost transport, so the
driver drops the session rather than keeping it. A peer close — a `redis.conf timeout`, a
restart, a failover, a proxy drop — fails the command in flight and every command pipelined
behind it, marks them for pool health, and takes the connection out of the pool. The next
command opens a fresh one. The failure is therefore transient: the commands in flight when the
transport died are lost and must be retried by the caller, but the worker's KV keeps working.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Configs as ResponseConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\KV as KVResource;

$HTTP_Server_CLI->configure(
   new ServerConfigs(host: '0.0.0.0', port: 8080, workers: 4),
   new ResponseConfigs(
      Resources: [
         'KV' => KVResource::provide(__DIR__ . '/configs/'),
      ]
   )
);
```

Declare the `kv` scope in `configs/kv/kv.Config.php`. Each node binds an env key with a default, so
the connection is configurable through the environment without touching code:

```php
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;
use Bootgly\ADI\Database\Config as ADIConfig;

return new Config(scope: 'kv')
   ->Enabled->bind(key: 'KV_ENABLED', default: true, cast: Types::Boolean)
   ->Driver->bind(key: 'KV_DRIVER', default: 'redis')
   ->Host->bind(key: 'KV_HOST', default: '127.0.0.1')
   ->Port->bind(key: 'KV_PORT', default: 6379, cast: Types::Integer)
   ->Database->bind(key: 'KV_DATABASE', default: '0')
   ->Password->bind(key: 'KV_PASS', default: '')
   ->Timeout->bind(key: 'KV_TIMEOUT', default: 30.0, cast: Types::Float)
   ->Secure
      ->Mode->bind(key: 'KV_SSLMODE', default: ADIConfig::SECURE_DISABLE)
      ->Verify->bind(key: 'KV_SSLVERIFY', default: null, cast: Types::Boolean)
      ->Peer->bind(key: 'KV_SSLPEER', default: null)
      ->CAFile->bind(key: 'KV_SSLCAFILE', default: null)
      ->up()
   ->Pool
      ->Min->bind(key: 'KV_POOL_MIN', default: 0, cast: Types::Integer)
      ->Max->bind(key: 'KV_POOL_MAX', default: 1, cast: Types::Integer);
```

`KV::provide()` allow-lists all keys shown above. For a remote Redis deployment, set
`KV_SSLMODE=verify-full` — it verifies the certificate chain and the peer name by itself;
`KV_SSLVERIFY=true` is how `prefer`/`require` opt into verification — and provide
`KV_SSLPEER`/`KV_SSLCAFILE` when using an internal CA (a `KV_SSLCAFILE` under an unverified
mode is refused at config time). Strict modes (`require`, `verify-ca`, `verify-full`) complete
TLS before `AUTH`, `SELECT` or an application command is created on the wire. `prefer` attempts
TLS first and reconnects in plaintext only when the peer **explicitly** refuses it (resets or
closes the connection during the TLS handshake, or answers non-TLS bytes) — never on a
certificate failure when verification is on, and never on silence: a peer that has not answered within the handshake
budget (1 s, or half `KV_TIMEOUT`) fails the command naming `disable`, because a plaintext Redis
never answers a ClientHello and cannot be told from a TLS server that is merely late. The
budget is `prefer`'s alone — the strict modes wait for the ServerHello until `KV_TIMEOUT`. A
plaintext Redis is therefore declared with `KV_SSLMODE=disable` — the default of this config —
rather than discovered, and pays no handshake budget at all. With `KV_SSLCAFILE` unset,
OpenSSL's default trust store applies (`openssl.cafile`, `SSL_CERT_FILE`/`SSL_CERT_DIR`), so set
it whenever the CA is private. Keep `KV_PASS` in the process environment or a runtime secret,
never in a committed `.env`.

`KV::provide()` throws when the scope is disabled (`KV_ENABLED=false`) or the context is not a
`Response`. The resource is created lazily the first time the route reads `$Response->KV`.

## Await key-value work

`KV` parks the response Fiber on the Redis connection readiness instead of blocking the
worker loop. The simplest path is `fetch()`, which issues one command, awaits it and returns
the reply (throwing `RuntimeException` on a Redis error):

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

return $Response->defer(function (Response $Response): void {
   $KV = $Response->KV;

   $KV->fetch('SET', ['bootgly:demo', 'async-kv']);

   $Response->JSON->send([
      'status' => 'ok',
      'value' => $KV->fetch('GET', ['bootgly:demo']),
   ]);
});
```

Each `fetch()` is a full round-trip. To overlap several commands, issue them with `command()`
— which flushes the write immediately so the next command pipelines on the same connection —
and `drain()` the group in one pass:

```php
return $Response->defer(function (Response $Response): void {
   $KV = $Response->KV;
   $Operations = [];

   for ($i = 0; $i < 8; $i++) {
      $Operations[] = $KV->command('GET', ['bootgly:demo']);
   }

   $values = [];
   foreach ($KV->drain($Operations) as $Operation) {
      $values[] = $Operation->error ?? $Operation->response;
   }

   $Response->JSON->send([
      'status' => 'ok',
      'values' => $values,
   ]);
});
```

Pipelining 8 reads through `drain()` is ~2.4× faster than 8 sequential `fetch()` calls,
because their round-trips overlap on the one connection instead of running one at a time.

## KV methods

```php
provide (string $configs): Closure
```

Static factory. Reads the `kv` scope from the given project `configs/` directory and returns a lazy
`Closure(object): KV` for `Response\Configs(Resources:)`. Builds one pipelined connection per worker; throws
when the scope is disabled or the context is not a `Response`.

```php
fetch (string $command, array $arguments = []): mixed
```

Creates one command, awaits it and returns the reply. Throws `RuntimeException` when Redis
reports an error.

```php
command (string $command, array $arguments = []): Operation
```

Creates and advances one command — the write is flushed immediately — but does **not** await
it. Issue several, then pass them to `drain()` to overlap their round-trips.

```php
await (Operation $Operation): Operation
drain (array $Operations): array
```

Await one operation, or a group of operations, on the connection readiness. `drain()`
re-scans the group after each advance pass so pipelined FIFO replies resolve correctly.

A wait that does not come back — refused by the selector, interrupted by a `defer()` timeout, or
ended by the client disconnecting — withdraws what it was waiting for. On an exception only the
awaited commands go, and the exception still reaches your handler, which can catch it and keep
using the others (if the withdrawal itself fails, its exception propagates instead, with the
original at the end of its `getPrevious()` chain). When the request Fiber is destroyed while
parked in one of these waits, every unfinished command it issued through this resource is
withdrawn too.

Before withdrawing, the resource gives each command already waiting for its reply one
non-blocking read: one whose reply has already arrived is finished by it, with that reply, and its
connection stays up. The rest fail with `Database operation was withdrawn: its caller stopped waiting.` and free their
pool slot. A withdrawn command already on the wire closes its session unless a command that is not
being withdrawn still reads on that connection, and one still being written or dialed always
closes it: the connection is not handed back open, and the next command dials it again (plus TLS,
`AUTH` and `SELECT` when configured). A command withdrawn while still waiting for a connection was
never sent and never runs; one already sent may have run on the server although it fails as
withdrawn.

Commands nobody awaits are covered as well. When a deferred job ends, the response cleans the
job's own resources and keeps them mounted — `Resources::release()` calls `clean()` on every
instance the job built from a registered definition, this one included — so a stream the job
opened, such as SSE, stays reachable through the response. This resource's `clean()` treats every
unfinished command issued through it the same way: one you never awaited, one left behind by an
uncaught exception, one issued by a Fiber destroyed while parked on another wait (a database
query, for example), or one issued outside any Fiber. Await every command whose effect you rely on.

Await a command through the resource that issued it. Handing the `Operation` to another deferred
job — a nested `defer()`, for example — and awaiting it there is unsupported: when the issuing job
ends, its resource withdraws the command even while that other job is still waiting for it, and
unless its reply has already arrived the command fails as withdrawn instead of delivering it.

The same goes for the synchronous handler and its `defer()`. `$Response->KV` in the handler and
`$Response->KV` inside `defer()` are different instances: the deferral runs on a clone of the
response, which builds its own. The handler's instance stays on the worker's response until the
worker's next request resets it, and that reset withdraws a command issued before `defer()` that
has no reply yet, even while the deferral waits for it. The next request can come from any client,
so this fails under load while it passes with a single client in development. Issue the command
inside the deferral:

```php
// ❌ issued by the handler's instance, awaited by the deferral's
$Operation = $Response->KV->command('SET', ['bootgly:demo', 'async-kv']);

return $Response->defer(function (Response $Response) use ($Operation): void {
   $Response->KV->await($Operation);
});
```

```php
// ✅ issued and awaited inside the deferral
return $Response->defer(function (Response $Response): void {
   $Response->KV->fetch('SET', ['bootgly:demo', 'async-kv']);
});
```

Only definition-backed instances, such as the one `KV::provide()` registers, are cleaned per job.
An instance you mount yourself — `$Response->mount()`, which calls `Resources::set()`, with no
definition registered — is carried into every response clone and shared across contexts, so it is
not cleaned when a job ends: its unfinished commands are withdrawn only by a wait that does not
come back, or when the instance itself is destroyed.

## Register the HTTP resource

`HTTP` is the outbound leg of the same idea. It wraps one native `HTTP_Client_CLI` embedded on
the worker reactor, so a route can call another service from inside `defer()` while the worker
keeps serving its other connections. Register it once, by name:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Configs as ResponseConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\HTTP;

$HTTP_Server_CLI->configure(
   new ServerConfigs(host: '0.0.0.0', port: 8080, workers: 4),
   new ResponseConfigs(
      Resources: [
         'Upstream' => static fn (object $Context): HTTP => new HTTP(
            host: 'api.example.com',
            secure: [],
         ),
      ]
   )
);
```

`secure: []` enables TLS with the defaults: `peer_name` is filled from `host` for hostname
verification, and `h2,http/1.1` is offered through ALPN. The port follows the scheme — `null`
means `80`, or `443` when `secure` is set — so pass it only when the upstream listens elsewhere:

```php
'Upstream' => static fn (object $Context): HTTP => new HTTP(
   host: '127.0.0.1',
   port: 8080,
),
```

`secure` is a stream context option array, so verifying the upstream certificate against a
specific CA bundle is one key:

```php
'Secure' => static fn (object $Context): HTTP => new HTTP(
   host: 'internal.example.com',
   secure: ['cafile' => __DIR__ . '/certificates/ca.pem'],
),
```

`pool` bounds how many connections one deferral may hold at the same time. The default is
`['min' => 0, 'max' => 1]` — a single connection — so raise `max` when one deferral fires
concurrent legs over HTTP/1.1:

```php
'Mirror' => static fn (object $Context): HTTP => new HTTP(
   host: '127.0.0.1',
   port: 8080,
   pool: ['min' => 0, 'max' => 2],
),
```

Every upstream response is capped at 16 MiB by default — a single answer from the upstream (or from
any redirect target it sends you to) cannot grow past it. An answer past the cap reaches your handler as
`code` `0` with `status` `'Response Too Large'`. Set `maxResponseBytes` to size it for the upstream
you trust:

```php
'Reports' => static fn (object $Context): HTTP => new HTTP(
   host: 'reports.example.com',
   secure: [],
   maxResponseBytes: 64 * 1024 * 1024,
),
```

The factory runs lazily in the worker, the first time a deferral reads the name — and it runs
again for the next deferral. Each one therefore gets its own `HTTP` instance with its own fresh
embedded client, adopted onto the worker reactor; never a shared prototype whose pool, connection
registry and hooks would leak across deferrals. Constructing an `HTTP` outside the server reactor
throws `RuntimeException`:
`HTTP response resource requires the HTTP server reactor — construct it from a Response\Configs(Resources:) factory.`

## Call an upstream over HTTP

Inside `defer()` the call is one line. `request()` parks the deferred Fiber until the upstream
answers, then returns the client's `Request\Response` — `code`, `status`, `headers` and `body`:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

return $Response->defer(function (Response $Response): void {
   $Upstream = $Response->Upstream->request(method: 'GET', URI: '/users/1');

   $Response->JSON->send([
      'code' => $Upstream->code,
      'body' => $Upstream->body,
   ]);
});
```

To overlap several legs, open a batch first. In batch mode `request()` queues and returns
immediately, and the `Response` objects it handed back are filled later, by `drain()`:

```php
return $Response->defer(function (Response $Response): void {
   $Upstream = $Response->Upstream;

   $Upstream->batch();
   $Profile = $Upstream->request(method: 'GET', URI: '/profile');
   $Orders = $Upstream->request(method: 'GET', URI: '/orders');
   $Upstream->drain();

   $Response->JSON->send([
      'profile' => $Profile->body,
      'orders' => $Orders->body,
   ]);
});
```

Two resources are two embedded clients on the one adopted reactor, so their batches interleave:
each `drain()` settles only the legs its own client issued, in whatever order you drain them.

```php
return $Response->defer(function (Response $Response): void {
   $Upstream = $Response->Upstream;
   $Mirror = $Response->Mirror;

   $Upstream->batch();
   $A = $Upstream->request(method: 'GET', URI: '/delay');
   $B = $Upstream->request(method: 'GET', URI: '/fast');
   $Mirror->batch();
   $C = $Mirror->request(method: 'GET', URI: '/fast');

   $Mirror->drain();
   $Upstream->drain();

   $Response->JSON->send([
      'codes' => [$A->code, $B->code, $C->code],
   ]);
});
```

Failures do not throw — they arrive as a completed `Response` with `code` `0` and a named
`status`: `Timeout`, `Connection Failed`, `Connection Lost`, `Connection Closed`,
`Truncated Response`, `Response Too Large`, `Response Header Fields Too Large`,
`Invalid Response`, `Redirect Failed`, `Redirect Refused`, `Too Many Redirects`, `Insecure Redirect` or `Invalid Chunked Encoding`. A route that reads `code` alone already treats every one of them as
"no answer"; read `status` when the reason matters.

Redirects stay on the upstream. The resource's client comes pinned to the scheme, host and port
you constructed it with: a same-origin redirect is followed, and a hop anywhere else fails the leg
with `code` `0` and status `Redirect Refused` before anything is sent there — an upstream cannot
bounce the worker's requests, with their API keys and bodies, to a service the worker can reach.
When an upstream legitimately redirects elsewhere — a CDN, a file host — replace the policy in the
factory:

```php
'Upstream' => static function (object $Context): HTTP {
   $HTTP = new HTTP(host: 'api.example.com', secure: []);
   // ! One more trusted destination, over TLS only
   $HTTP->Client->Redirection = static fn (string $host, int $port, bool $secure): bool =>
      $secure && ($host === 'api.example.com' || $host === 'files.example.com');

   return $HTTP;
},
```

`$HTTP->Client->Redirection = null` follows any http(s) target. Either way, a hop to another
origin carries only the client's `crossOriginHeaders` — never `Authorization`, cookies or API keys
(see [Redirect Handling](/manual/WPI/HTTP/HTTP_Client_CLI/#redirect-handling)). Inside `batch()`
the pin refuses the same hops; a same-origin hop that needs another connection comes back as the
final 3xx, since a batch never re-dials.

Every leg of the exchange parks the deferred Fiber instead of pumping a private event loop: the
wait for the response, the dial that opens the connection, and the TLS handshake. The worker
keeps serving its other connections throughout, and an unreachable upstream costs it nothing but
the dialing socket. The two deadlines split accordingly: `connectTimeout` alone bounds the dial
**and** the handshake, while `timeout` arms only the response window, after the connection is up.
`connectTimeout: 0` means no connect deadline at all — a peer that accepts TCP but never
negotiates keeps the Fiber and its socket parked until the deferral's own generation is cancelled.

## HTTP ownership and lifecycle

The first `request()`, `batch()` or `drain()` claims the running deferred context — the Fiber
`$Response->defer()` created — and the resource is that context's until the deferral settles.
Every other case is refused with `LogicException`, before the client is touched: no dial, no
queue, no timer.

- Outside `defer()`, or in a Fiber that is not a live deferred context — no generation token, or
  one that already settled, such as after handing off to SSE or into a nested `defer()`:
  `HTTP response resource must be used inside a live deferred context — call it from defer(), before handing off to SSE or a nested defer().`
- While another deferred context owns it:
  `HTTP response resource is owned by another deferred context.`
- When the resource's attach was refused because a context still owned it — a carried instance
  pulled across contexts:
  `HTTP response resource was attached to another response while owned — a carried instance cannot serve interleaved deferred contexts; register it as a Response\Configs(Resources:) factory instead.`

Release runs when the deferral's generation settles, and both ways of settling run it: normal
completion, and the peer leaving mid-wait (cancellation, whose Fiber is never resumed). The
resource then releases the client — `abort()` abandons every queued, in-flight and retrying
request and closes every connection, pooled keep-alive ones included, and `unpark()` retires a
parked drain episode whose Fiber will never resume. The consequence is deliberate: **no upstream
connection is reused across deferrals**. Every deferral dials afresh, and pays one parked dial
for it.

`Client` is the knob surface, not a request path. Every knob the constructor does not cover is
set on it, before the first call:

```php
return $Response->defer(function (Response $Response): void {
   $Upstream = $Response->Upstream;
   $Upstream->Client->retryOn = [429, 503];

   $Reply = $Upstream->request(method: 'GET', URI: '/quota');

   $Response->JSON->send(['code' => $Reply->code]);
});
```

Never send through `Client`: only `request()`, `batch()` and `drain()` claim the deferred
context, and only that claim releases the client when the deferral settles.

An instance can also be carried by hand — `$Response->mount(new HTTP(host: 'api.example.com', secure: []))`,
with no definition registered. That works sequentially, but the same object is then re-attached by
every `Response` clone (`defer()` forks the resources of the clone it works on), and a wait bridge
is only accepted while no context owns the resource — so a second, interleaved context is refused
at its first claim. Prefer the factory: a definition-backed resource is rebuilt per deferral and
never crosses contexts.

## HTTP methods

```php
__construct (string $host, null|int $port = null, null|array $secure = null, null|array $pool = null, int|float $timeout = 30, int|float $connectTimeout = 30, int $maxRedirects = 10, int $maxRetries = 0, null|bool $enableHTTP2 = null, null|int $maxResponseBytes = null)
```

Builds the resource and the fresh `HTTP_Client_CLI` it embeds on the worker reactor. `$host` is
the upstream host; `$port` defaults to `80`, or `443` when `secure` is set; `$secure` carries TLS
stream context options (`[]` enables TLS with the defaults); `$pool` bounds the connection pool
inside one deferral (`['min' => N, 'max' => N]`); `$timeout` is the response timeout in seconds
(`0` = no timeout); `$connectTimeout` is the connection timeout per dial attempt and alone bounds
the dial **and** the TLS handshake (`0` = no timeout); `$maxRedirects` caps redirect following,
which stays within the upstream origin (`0` = disabled); `$maxRetries` caps retries on connection/timeout failure (`0` = disabled); and
`$enableHTTP2` selects HTTP/2 negotiation (`null` = ALPN when secure; `true` = also h2c;
`false` = never); `$maxResponseBytes` caps the raw bytes of each upstream response (`null` = the
client's default, 16 MiB; `0` = unbounded). Throws `RuntimeException` when constructed outside the HTTP server reactor.

```php
request (string $method = 'GET', string $URI = '/', array $headers = [], mixed $body = null): Response
```

Sends one HTTP request through the embedded client and returns the upstream response (the
client's `Request\Response`). Outside `batch()` the deferred Fiber parks until the response
completes; inside it, the returned `Response` is filled later, by `drain()`. Throws
`LogicException` when called outside a live deferred context, or while another one owns this
resource.

```php
batch (): static
```

Enters batch mode: subsequent `request()` calls are dispatched concurrently and settled together
by `drain()`. Throws `LogicException` when called outside a live deferred context, or while
another one owns this resource.

```php
drain (): static
```

Parks the deferred Fiber until every batched request completes. Throws `LogicException` when
called outside a live deferred context, or while another one owns this resource.

```php
schedule (Closure $Wait): static
```

Binds the response wait bridge. The framework calls it when the resource is attached to a
response; a carried instance is re-attached by every `Response` clone, so a bridge is only
accepted while no deferred context owns the resource — the refused context is told so at its
first claim instead.

```php
public private(set) HTTP_Client_CLI $Client
```

The embedded client — knob surface only. Every knob the constructor does not cover is set here:
`retryOn`, `retryDelay`, `retryMaxDelay`, `retryTimeout`, `retryJitter`,
`allowInsecureRedirect`, `Redirection` (pinned to the upstream origin by default),
`crossOriginHeaders`, `enableHTTP2`, and the `timeout` family. Never send through it.

## Boundary

Resources do not replace `Response`. Keep status codes, headers and body delivery on
`Response`, and use resources only for focused response capabilities.

`Database`, `KV` and `HTTP` are the async bridges of that set: they park the deferred Fiber on
readiness instead of blocking the worker, so they belong inside `defer()` — never on the
synchronous route path.
