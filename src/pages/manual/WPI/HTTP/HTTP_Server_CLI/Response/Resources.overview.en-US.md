# Response Resources

`Response Resources` are the canonical extension point for response helpers in
`HTTP_Server_CLI`. They keep the route flow on the `Response` object while moving body
formatting, view rendering or async bridges into named resources.

Built-in resources are available lazily on every response:

- `$Response->JSON` - sends JSON through the normal response sender.
- `$Response->JSONP` - sends JSONP through the normal response sender.
- `$Response->Pre` - formats debug output for preformatted HTML.
- `$Response->View` - renders project views.

Project resources are registered once in `HTTP_Server_CLI::configure()` and then accessed by
name from the route, for example `$Response->Database` (async SQL) or `$Response->KV`
(async Redis key-value).

## Use built-in resources

```php
return $Response->JSON->send([
   'status' => 'ok',
]);
```

```php
return $Response->View->render('welcome', [
   'title' => 'Welcome Page',
]);
```

> **View names** are restricted to `[A-Za-z0-9_/-]` — a `..` or `.` segment, a leading `/`, or a null byte is rejected with `403`. Use a plain name (optionally with `/` for subdirectories), without the `.template.php` suffix.

## Register project resources

Register custom resources with the `responseResources` option. Each factory is a
`Closure(object): Response\Resource` that receives the current response context and returns a
`Response\Resource` instance — created lazily the first time the route reads the resource by name.

`Database` and `KV` ship a static `provide()` factory that encapsulates this wiring: it reads a
config scope from the project `configs/` directory, builds one pooled connection per worker and
wraps it. Pass the project `configs/` directory and register each resource in a single line:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database as DatabaseResource;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\KV as KVResource;

$HTTP_Server_CLI->configure(
   responseResources: [
      'Database' => DatabaseResource::provide(__DIR__ . '/configs/'),
      'KV' => KVResource::provide(__DIR__ . '/configs/'),
   ],
);
```

`Database::provide()` reads the `database` scope (`configs/database/database.config.php` plus the
local `.env` files), builds one pooled `SQL` connection per worker and wraps it. It throws when the
scope is disabled (`DB_ENABLED=false`) or the context is not a `Response`. The resource is created
lazily the first time the route reads `$Response->Database`.

A factory is just a closure, so when you need full control over construction you can build and wrap
the resource yourself instead of calling `provide()`:

```php
use RuntimeException;

use Bootgly\ADI\Databases\SQL;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database as DatabaseResource;

$HTTP_Server_CLI->configure(
   responseResources: [
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
   ],
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

## Database methods

```php
provide (string $configs): Closure
```

Static factory. Reads the `database` scope from the given project `configs/` directory and returns a
lazy `Closure(object): Database` for `responseResources`. Builds one pooled `SQL` per worker; throws
when the scope is disabled or the context is not a `Response`.

```php
table (BackedEnum|Stringable|Builder|Query $Table, null|BackedEnum|Stringable $Alias = null): Builder
```

Starts a SQL query builder for one table through the wrapped database.

```php
query (string|Builder|Query $query, array $parameters = []): Operation
```

Creates a SQL operation, waits until it finishes and returns the `Operation`. Use it when you
want to inspect `error`, `Result`, pool state or protocol details yourself.

```php
fetch (string|Builder|Query $query, array $parameters = []): Result
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

## Register the KV resource

`KV` adapts the async key-value database (`ADI/Databases/KV`, Redis) to the response
scheduler the same way `Database` adapts SQL. `KV::provide()` reads the `kv` scope and builds one
`KV` database per worker with a single pooled connection so pending commands pipeline on it:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\KV as KVResource;

$HTTP_Server_CLI->configure(
   responseResources: [
      'KV' => KVResource::provide(__DIR__ . '/configs/'),
   ],
);
```

Declare the `kv` scope in `configs/kv/kv.config.php`. Each node binds an env key with a default, so
the connection is configurable through the environment without touching code:

```php
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;

return new Config(scope: 'kv')
   ->Enabled->bind(key: 'KV_ENABLED', default: true, cast: Types::Boolean)
   ->Driver->bind(key: 'KV_DRIVER', default: 'redis')
   ->Host->bind(key: 'KV_HOST', default: '127.0.0.1')
   ->Port->bind(key: 'KV_PORT', default: 6379, cast: Types::Integer)
   ->Timeout->bind(key: 'KV_TIMEOUT', default: 30.0, cast: Types::Float)
   ->Pool
      ->Min->bind(key: 'KV_POOL_MIN', default: 0, cast: Types::Integer)
      ->Max->bind(key: 'KV_POOL_MAX', default: 1, cast: Types::Integer);
```

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
`Closure(object): KV` for `responseResources`. Builds one pipelined connection per worker; throws
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

## Boundary

Resources do not replace `Response`. Keep status codes, headers and body delivery on
`Response`, and use resources only for focused response capabilities.
