# Database DBAL

Bootgly's DBAL is async. In scripts, you can wait through the SQL pool directly. In
`HTTP_Server_CLI` routes, keep the HTTP flow canonical: register the database as a
**[Response Resource](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**, use
`$Response->defer()` for external I/O, then access `$Response->Database` inside the deferred
work.

> [!NOTE]
> DBAL can be used from CLI scripts and from WPI routes. In WPI, use
> `HTTP_Server_CLI` with the built-in Database Response Resource. See
> **[HTTP Server CLI](/manual/WPI/HTTP/HTTP_Server_CLI/overview/)** for the server boot and
> `Response\Configs` resource lifecycle.

## Configure the database

Projects load database settings from `configs/database`. The demo project maps environment
variables such as `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_TIMEOUT`,
`DB_STATEMENTS`, `DB_POOL_MIN`, `DB_POOL_MAX`, `DB_ROUTING_STICKY` and
`DB_REPLICA_*` values into `DatabaseConfig`.

When a project boots, `Project::boot()` defines `BOOTGLY_PROJECT` and creates
`BOOTGLY_PROJECT->Configs` from the project `configs/` directory. That loader is
`Bootgly\API\Projects\Configs`, which extends `Environment\Configs`. Calling
`get('database')` lazy-loads `configs/database/database.Config.php` plus the local `.env` files,
then returns the `database` config scope.

Define that scope in `configs/database/database.Config.php`:

```php
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;

return new Config(scope: 'database')
   ->Enabled->bind(key: 'DB_ENABLED', default: true, cast: Types::Boolean)
   ->Default->bind(key: 'DB_CONNECTION', default: 'pgsql')
   ->Connections
      ->PostgreSQL
         ->Driver->bind(key: '', default: 'pgsql')
         ->Host->bind(key: 'DB_HOST', default: '127.0.0.1')
         ->Port->bind(key: 'DB_PORT', default: 5432, cast: Types::Integer)
         ->Database->bind(key: 'DB_NAME', default: 'bootgly')
         ->Username->bind(key: 'DB_USER', default: 'postgres')
         ->Password->bind(key: 'DB_PASS', default: '')
         ->Timeout->bind(key: 'DB_TIMEOUT', default: 30.0, cast: Types::Float)
         ->Statements->bind(key: 'DB_STATEMENTS', default: 256, cast: Types::Integer)
         ->Secure
            ->Mode->bind(key: 'DB_SSLMODE', default: 'prefer')
            ->Verify->bind(key: 'DB_SSLVERIFY', default: true, cast: Types::Boolean)
            ->Peer->bind(key: 'DB_SSLPEER', default: null)
            ->CAFile->bind(key: 'DB_SSLCAFILE', default: '')
            ->up()
         ->Pool
            ->Min->bind(key: 'DB_POOL_MIN', default: 0, cast: Types::Integer)
            ->Max->bind(key: 'DB_POOL_MAX', default: 8, cast: Types::Integer)
            ->up()
         ->Routing
            ->Sticky->bind(key: 'DB_ROUTING_STICKY', default: 5.0, cast: Types::Float)
            ->up()
         ->Replicas
            ->Replica1
               ->Host->bind(key: 'DB_REPLICA_1_HOST', default: null)
               ->Port->bind(key: 'DB_REPLICA_1_PORT', default: null, cast: Types::Integer);
```

## Choose a driver

`DB_CONNECTION` selects a declared connection block — and with it the native driver, the Query
Builder dialect and the Schema dialect. Driver aliases map to canonical block names:
`pgsql`/`postgres`/`postgresql` select `Connections->PostgreSQL`, `mysql`/`mariadb` select
`Connections->MySQL`, and `sqlite`/`sqlite3` select `Connections->SQLite`.

The selected canonical block must exist. The scope above declares only PostgreSQL, so add the
matching `->Connections->MySQL` or `->Connections->SQLite` block before selecting either driver
(the demo project ships all three). If the block is absent, `DatabaseConfig` throws, for example,
`Database config is missing the selected connection scope: Connections->SQLite.` It never fills
an undeclared connection with ADI localhost or database defaults.

Bootgly ships three drivers:

```bash
DB_CONNECTION=pgsql   # PostgreSQL (default) — async, TLS, SCRAM, RETURNING
DB_CONNECTION=mysql   # MySQL/MariaDB — async, TLS, caching_sha2, Result->inserted
DB_CONNECTION=sqlite  # SQLite (ext-sqlite3) — synchronous, zero-setup, DB_NAME=:memory: or a file path
```

See **[SQL Drivers](/manual/ADI/Databases/SQL/Drivers/overview/)** for the capability matrix.

Inside a `*.Project.php` file, register Bootgly's built-in Database Response Resource while
instantiating `HTTP_Server_CLI`. `DatabaseResource::provide()` is only wiring: it reads the
`database` scope from the project `configs/` directory and injects one pooled `SQL` instance per
worker into the built-in `DatabaseResource`; it does not define a custom resource class.
Configuration validation is propagated by `DatabaseResource::provide()`; an undeclared selected
connection fails before a pooled `SQL` instance is created.

```php
use const Bootgly\CLI;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Configs as ResponseConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database as DatabaseResource;

return new Project(
   exportable: true,
   boot: function (): void {
      $HTTP_Server_CLI = new HTTP_Server_CLI(Mode: Modes::Daemon);
      $HTTP_Server_CLI->configure(
         new ServerConfigs(
            host: '0.0.0.0',
            port: 8082,
            workers: 1
         ),
         new ResponseConfigs(
            Resources: [
               'Database' => DatabaseResource::provide(__DIR__ . '/configs/'),
            ]
         )
      );

      $HTTP_Server_CLI
         // # Routes — the request entry point (router/ folder via Router::load())
         ->on(Events::RequestReceived, HTTP_Server_CLI::$Router->load(__DIR__ . '/router'))
         // # Lifecycle feedback
         ->on(Events::ServerStarted, fn () => CLI->Terminal->Output->render('@#green:✓ HTTP server started@;@.;'))
         ->on(Events::ServerStopped, fn () => CLI->Terminal->Output->render('@#yellow:■ HTTP server stopped@;@.;'));

      $HTTP_Server_CLI->start();
   }
);
```

`on()` wires the three `HTTP_Server_CLI` lifecycle events: `RequestReceived` (the route entry point,
the `router/` folder loaded via `Router::load()`), `ServerStarted` and `ServerStopped` (boot/shutdown
feedback). Without `RequestReceived` the server starts but answers nothing.

Define the `database` scope in `configs/database/database.Config.php`; environment values are bound
inside that file. `provide()` reads that scope, builds one pooled `SQL` instance per worker (the pool
lives on that instance) and creates the resource lazily on the first `$Response->Database`. It throws
when the scope is disabled (`DB_ENABLED=false`) or the context is not a `Response`. Need full control
over construction? Pass your own `Closure(object): DatabaseResource` instead of calling `provide()`.

## Use it in a response

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

`defer()` is the async HTTP boundary. The database resource bridges SQL `Readiness` into
`$Response->wait()` so route code does not manually call `advance()`. Read request data inside the
deferred closure from its second argument — a snapshot taken by `defer()`, also reachable as
`$Response->Request` — not from a `use ($Request)` of the route's live request: that object is emptied
when the synchronous cycle ends and reused by the next request on the connection.

## Next references

- **[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)** - built-in resources and the DBAL response bridge.
- **[DBAL core](/manual/ADI/Database/overview/)** - low-level config, pool, operation and driver lifecycle.
- **[Database ORM](/guide/database-orm/overview/)** - map async SQL results to entities with Data Mapper repositories.
- **[Database queries](/guide/database-queries/overview/)** - building SQL statements with Query Builder.
- **[Database read replicas](/guide/database-read-replicas/overview/)** - read/write splitting, sticky scopes and replica failover.
