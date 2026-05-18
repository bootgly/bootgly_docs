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
> `responseResources` lifecycle.

## Configure the database

Projects load database settings from `configs/database`. The demo project maps environment
variables such as `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_TIMEOUT`,
`DB_STATEMENTS`, `DB_POOL_MIN`, `DB_POOL_MAX`, `DB_ROUTING_STICKY` and
`DB_REPLICA_*` values into `DatabaseConfig`.

When a project boots, `Project::boot()` defines `BOOTGLY_PROJECT` and creates
`BOOTGLY_PROJECT->Configs` from the project `configs/` directory. That loader is
`Bootgly\API\Projects\Configs`, which extends `Environment\Configs`. Calling
`get('database')` lazy-loads `configs/database/database.config.php` plus the local `.env` files,
then returns the `database` config scope.

Define that scope in `configs/database/database.config.php`:

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

Inside a `*.project.php` file, create the `SQL` instance from that config, then register
Bootgly's built-in Database Response Resource while instantiating `HTTP_Server_CLI`. The factory
below is only wiring: it injects the configured `SQL` instance into the built-in
`DatabaseResource`; it does not define a custom resource class.

```php
use const BOOTGLY_PROJECT;
use RuntimeException;

use Bootgly\ADI\Databases\SQL;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\DatabaseConfig;
use Bootgly\API\Projects\Configs;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database as DatabaseResource;

return new Project(
   boot: function (): void {
      $Configs = BOOTGLY_PROJECT->Configs;

      if ($Configs instanceof Configs === false) {
         throw new RuntimeException('Create the project configs/ directory before loading database config.');
      }

      $Configs->allow('database', [
         'DB_CONNECTION',
         'DB_ENABLED',
         'DB_HOST',
         'DB_NAME',
         'DB_PASS',
         'DB_POOL_MAX',
         'DB_POOL_MIN',
         'DB_PORT',
         'DB_REPLICA_1_HOST',
         'DB_REPLICA_1_NAME',
         'DB_REPLICA_1_PASS',
         'DB_REPLICA_1_POOL_MAX',
         'DB_REPLICA_1_POOL_MIN',
         'DB_REPLICA_1_PORT',
         'DB_REPLICA_1_SSLCAFILE',
         'DB_REPLICA_1_SSLMODE',
         'DB_REPLICA_1_SSLPEER',
         'DB_REPLICA_1_SSLVERIFY',
         'DB_REPLICA_1_STATEMENTS',
         'DB_REPLICA_1_TIMEOUT',
         'DB_REPLICA_1_USER',
         'DB_REPLICA_2_HOST',
         'DB_REPLICA_2_NAME',
         'DB_REPLICA_2_PASS',
         'DB_REPLICA_2_POOL_MAX',
         'DB_REPLICA_2_POOL_MIN',
         'DB_REPLICA_2_PORT',
         'DB_REPLICA_2_SSLCAFILE',
         'DB_REPLICA_2_SSLMODE',
         'DB_REPLICA_2_SSLPEER',
         'DB_REPLICA_2_SSLVERIFY',
         'DB_REPLICA_2_STATEMENTS',
         'DB_REPLICA_2_TIMEOUT',
         'DB_REPLICA_2_USER',
         'DB_ROUTING_STICKY',
         'DB_SSLCAFILE',
         'DB_SSLMODE',
         'DB_SSLPEER',
         'DB_SSLVERIFY',
         'DB_STATEMENTS',
         'DB_TIMEOUT',
         'DB_USER',
      ]);
      $Scope = $Configs->get('database');

      if ($Scope instanceof Config === false) {
         throw new RuntimeException('Create configs/database/database.config.php before loading database config.');
      }

      $DatabaseResource = static function () use ($Scope): DatabaseResource {
         static $Database = null;

         if ($Database instanceof SQL === false) {
            $Database = new SQL(new DatabaseConfig($Scope)->configure());
         }

         return new DatabaseResource($Database);
      };

      $HTTP_Server_CLI = new HTTP_Server_CLI(Mode: Modes::Daemon);
      $HTTP_Server_CLI->configure(
         host: '0.0.0.0',
         port: 8082,
         workers: 1,
         responseResources: [
            'Database' => $DatabaseResource,
         ],
      );
      $HTTP_Server_CLI->start();
   }
);
```

Define the `database` scope in `configs/database/database.config.php`; environment values are
bound inside that file. Reuse the same `SQL` instance per worker when possible. The pool lives on
that instance.
`HTTP_Server_CLI` passes the current `Response` context to resource factories; this Database
factory does not need it because the built-in resource only needs the configured `SQL` instance.

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
`$Response->wait()` so route code does not manually call `advance()`.

## Next references

- **[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)** - built-in resources and the DBAL response bridge.
- **[DBAL core](/manual/ADI/Database/overview/)** - low-level config, pool, operation and driver lifecycle.
- **[Database queries](/guide/database-queries/overview/)** - building SQL statements with Query Builder.
- **[Database read replicas](/guide/database-read-replicas/overview/)** - read/write splitting, sticky scopes and replica failover.
