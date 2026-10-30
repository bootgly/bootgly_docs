# Database DBAL

Bootgly's DBAL is async. In scripts and commands, build `SQL` from the project's `database`
config scope and wait through its pool directly (see
**[Use it in a script or command](#use-it-in-a-script-or-command)**). In
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
`BOOTGLY_PROJECT->Configs` from the project `configs/` directory, when it exists. That loader
is `Bootgly\API\Projects\Configs`, which extends `Environment\Configs`. Calling
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
            ->Verify->bind(key: 'DB_SSLVERIFY', default: null, cast: Types::Boolean)
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

### How the scope becomes a connection

`DatabaseConfig` reads nodes, not environment keys. `Default` selects one block under
`Connections`, and the nodes of that block become the `SQL` config:

| Scope node | Demo env key | `SQL` config key | Default when the node is absent or `null` |
| --- | --- | --- | --- |
| `Default` | `DB_CONNECTION` | selects the block (and is the `driver` when `Driver` is unset) | `pgsql` |
| `Driver` | — | `driver` | the `Default` value |
| `Host` | `DB_HOST` | `host` | `127.0.0.1` |
| `Port` | `DB_PORT` | `port` | `5432` |
| `Database` | `DB_NAME` | `database` | `bootgly` |
| `Username` | `DB_USER` | `username` | `postgres` |
| `Password` | `DB_PASS` | `password` | empty |
| `Timeout` | `DB_TIMEOUT` | `timeout` | `30.0` |
| `Statements` | `DB_STATEMENTS` | `statements` | `256` |
| `Secure->Mode` | `DB_SSLMODE` | `secure.mode` | `prefer` |
| `Secure->Verify` | `DB_SSLVERIFY` | `secure.verify` | follows the mode |
| `Secure->Peer` | `DB_SSLPEER` | `secure.peer` | the `host` |
| `Secure->CAFile` | `DB_SSLCAFILE` | `secure.cafile` | empty |
| `Secure->Key` | `DB_SERVER_PUBLIC_KEY` | `secure.key` | empty |
| `Pool->Min` | `DB_POOL_MIN` | `pool.min` | `0` |
| `Pool->Max` | `DB_POOL_MAX` | `pool.max` | `8` |
| `Routing->Sticky` | `DB_ROUTING_STICKY` | `routing.sticky` | `5.0` |
| `Replicas-><Name>` | `DB_REPLICA_<n>_*` | one entry of `replicas` | — |

Every node below `Default` belongs to the selected block (`Connections->PostgreSQL->Host`,
`Connections->MySQL->Port`, …). The env key is whatever that node's `bind()` names; the column
shows the keys the demo project binds. A node that resolves to `null` is left out, and the
built-in default takes its place. Those defaults are PostgreSQL's whatever the driver: a
`MySQL` block without `Port` and `Username` dials port `5432` as `postgres`, so bind both, as
the demo does (`3306`, `root`). The demo binds `Secure->Key` in its `MySQL` block only: it is
the pinned server key of the **[MySQL driver](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/)**.

Each child of `Replicas` with a non-empty `Host` becomes one replica and reads the same nodes,
from `Driver` to `Pool->Max` (not `Routing`); a child without a `Host` is skipped. A replica's
`Driver` is passed on as written, without the alias mapping of
**[Choose a driver](#choose-a-driver)**: when you set one, use the canonical `pgsql`, `mysql` or
`sqlite`, since an alias such as `postgres` passes `configure()` and then fails the first read
routed to that replica with `Database driver is not registered: postgres.` What a
replica leaves unset comes from the primary, except `secure.peer`, which defaults to the
replica's own host, and the TLS flags, which follow the replica's own `Secure->Mode` when it
sets one. See **[Database read replicas](/guide/database-read-replicas/overview/)**.

`DatabaseConfig` reads no other node. `Enabled` is read only by `DatabaseResource::provide()` (see
**[When `provide()` throws](#when-provide-throws)**), while `Charset`, `Migrations` and any node
of your own are ignored, so the migration history table keeps its default name,
`_bootgly_migrations`. Currently, `Secure->Name` is not read either: `secure.name` follows
`secure.verify`, except that `verify-ca` turns it off and `verify-full` turns it on. To check the
certificate chain but not its name, set `DB_SSLMODE=verify-ca`; the full rules are in the
**[TLS](/manual/ADI/Database/Config/overview/#tls)** table.

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

## Use it in a script or command

Outside an HTTP route — a Console project's boot function, a command or a script that runs inside
the project, a `schedule.php` job — build `SQL` from the same `database` scope and wait through its
pool:

```php
use RuntimeException;

use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\API\Environment\Configs\DatabaseConfig;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; case Active = 'active'; }

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());

$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true);

$Operation = $Database->query($Query);

try {
   $Database->Pool->wait($Operation);
}
catch (RuntimeException $Exception) {
   echo "Query failed: {$Exception->getMessage()}\n";
   exit(1);
}

foreach ($Operation->rows as $row) {
   echo "{$row['id']}: {$row['name']}\n";
}
```

`BOOTGLY_PROJECT->Configs` is the project's config loader: `Project::boot()` creates it, and so
does `Project::mount()`, which `bootgly project <Name> schedule` uses. `get('database')` loads
`configs/database/database.Config.php` with its `.env` files, `DatabaseConfig` turns the scope
into the `SQL` config (see
**[How the scope becomes a connection](#how-the-scope-becomes-a-connection)**), and `new SQL`
builds the pool without connecting: the first query dials. Build it once per process and reuse
it, since every `new SQL` is a pool of its own. In a server project's boot function, use it only
before `start()` and never hand it to routes: `start()` forks the workers, and every worker
inherits the sessions the instance has already opened.

`Pool->wait()` drives the operation to its end and throws a `RuntimeException` when it fails;
the message is `$Operation->error`, for example
`PostgreSQL connection failed: 127.0.0.1:5432 refused the connection (ECONNREFUSED).` or the
server's own error (`relation "users" does not exist`). `SQL::await()` does the same. Do not
use this recipe in an `HTTP_Server_CLI` route: `Pool->wait()` blocks the worker until the
answer arrives. Routes use `$Response->Database`
(**[Register it for HTTP routes](#register-it-for-http-routes)**).

### When there is no project scope

The one-liner above assumes the scope exists. `BOOTGLY_PROJECT->Configs` is `null` when the
project has no `configs/` directory, so the line fails with
`Call to a member function get() on null`. `get('database')` returns `null` when the scope does
not load — no `database.Config.php`, a file that declares another scope, or a `.env` line the
loader rejects (see **[Local `.env` policy](/guide/configuration/overview/#local-env-policy)**)
— and `DatabaseConfig` refuses that `null` with a `TypeError`. Outside a project there is no
`BOOTGLY_PROJECT` at all.

To handle those cases, or to read a configs directory of your choice, load it yourself and
check the scope, as `bootgly project <Name> migrate` and `seed` do with the project's
`configs/`:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\API\Environment\Configs;
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\DatabaseConfig;

$Scope = new Configs(__DIR__ . '/configs/')->get('database');

if ($Scope instanceof Config === false) {
   throw new RuntimeException('The database config scope did not load.');
}

$Database = new SQL(new DatabaseConfig($Scope)->configure());
```

### When DatabaseConfig throws

`DatabaseConfig` validates the scope before any connection exists. Each failure is an
`InvalidArgumentException`:

| Message | Cause |
| --- | --- |
| `Database config adapter expects the database scope.` | `new DatabaseConfig()` received a scope other than `database`. |
| `Database config adapter can merge only database scopes.` | `merge()` received a scope other than `database`. |
| `Database driver config value must be scalar.` | `Default` or the block's `Driver` holds an array or an object. |
| `Unsupported database driver: <name>.` | `Default` or the block's `Driver` is not one of the names in **[Choose a driver](#choose-a-driver)**. |
| `Database config is missing the selected connection scope: Connections-><Block>.` | The block that `Default` selects is not declared. |
| `Database TLS mode config value must be scalar.` | A `Secure->Mode` (primary or replica) holds an array or an object. |
| `Unsupported database TLS mode: <mode>.` | A `Secure->Mode` is not `disable`, `prefer`, `require`, `verify-ca` or `verify-full`. |

`configure()` then hands the values to the `SQL` config, which applies its own TLS checks, for
example
``Database TLS cafile requires certificate verification: use mode `verify-ca` or `verify-full`, or set `verify` to true.``
for a `Secure->CAFile` under `prefer` or `require` unless `Secure->Verify` is `true`. The scope itself
can throw earlier, while it loads: a value a `cast:` cannot parse (`DB_PORT=abc` throws
`Invalid integer config value.`) or a missing `required: true` key
(`Required config value is missing: DB_PASS`).

## Register it for HTTP routes

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
         // # Lifecycle feedback — the launch banner belongs on ServerAdvertised,
         //   the hook that fires on the process owning the terminal
         ->on(Events::ServerAdvertised, fn () => CLI->Terminal->Output->render('@#green:✓ HTTP server started@;@.;'))
         ->on(Events::ServerStopped, fn () => CLI->Terminal->Output->render('@#yellow:■ HTTP server stopped@;@.;'));

      $HTTP_Server_CLI->start();
   }
);
```

`on()` wires the three `HTTP_Server_CLI` lifecycle events: `RequestReceived` (the route entry point,
the `router/` folder loaded via `Router::load()`), `ServerAdvertised` and `ServerStopped` (boot/shutdown
feedback). Without `RequestReceived` the server starts but answers nothing.

Define the `database` scope in `configs/database/database.Config.php`; environment values are bound
inside that file. `provide()` reads that scope, builds one pooled `SQL` instance per worker (the pool
lives on that instance) and creates the resource lazily on the first `$Response->Database`. It throws
when the scope cannot be used (see **[When `provide()` throws](#when-provide-throws)**). Need full
control over construction? Pass your own `Closure(object): DatabaseResource` instead of calling
`provide()`.

### Keys a .env file may set

`provide()` loads the scope through a loader of its own, which accepts only these keys in
`configs/database/.env` and `configs/database/.env.<BOOTGLY_ENV>`:

| Group | Keys |
| --- | --- |
| Connection | `DB_CONNECTION`, `DB_ENABLED`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASS`, `DB_TIMEOUT`, `DB_STATEMENTS`, `DB_SSLMODE`, `DB_SSLVERIFY`, `DB_SSLPEER`, `DB_SSLCAFILE`, `DB_POOL_MIN`, `DB_POOL_MAX` |
| Routing | `DB_ROUTING_STICKY` |
| Replicas 1 and 2 | `DB_REPLICA_1_` and `DB_REPLICA_2_`, each followed by `HOST`, `PORT`, `NAME`, `USER`, `PASS`, `TIMEOUT`, `STATEMENTS`, `SSLMODE`, `SSLVERIFY`, `SSLPEER`, `SSLCAFILE`, `POOL_MIN` or `POOL_MAX` |

Any other key in those files — a third replica (`DB_REPLICA_3_HOST`), a key of your own, or
`DB_SERVER_PUBLIC_KEY`, which the demo's `MySQL` block binds — makes the scope fail to load,
and `provide()` then throws the `DB_ENABLED` error below. The list covers `.env` files only:
`bind()` reads the process environment first, so a real environment variable is never
filtered. For now, HTTP routes therefore take the pinned key from `DB_SERVER_PUBLIC_KEY` in the
process environment, from a literal `default:` of `Secure->Key` in `database.Config.php`, or from
a `Closure(object): DatabaseResource` factory of your own, which builds the `SQL` without this
list (see **[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#register-project-resources)**).
Scripts, commands and `bootgly project … migrate` / `seed` also read `DB_SERVER_PUBLIC_KEY` from
`.env`, because their loader has no such list. `provide()` sets the list with `Configs::allow()`,
described in
**[Local `.env` policy](/guide/configuration/overview/#local-env-policy)**.

### When provide() throws

Nothing is checked when you register the resource: the factory runs the first time a route on a
worker reads `$Response->Database`, and its errors surface there, in that request. A context
that is not a `Response` throws `Database response resource expects a Response context.`
Otherwise the factory builds the `SQL` only when the scope loaded and its `Enabled` node holds
the boolean `true`. Anything else throws this `RuntimeException`:

```text
Enable DB_ENABLED=true in the database config scope and set DB_HOST, DB_PORT, DB_NAME, DB_USER and DB_PASS as needed.
```

Despite its wording, the message covers several causes, including these:

- `DB_ENABLED` is `false` (or `0`, `no`, `off`);
- the scope has no `Enabled` node;
- `Enabled` is bound without `cast: Types::Boolean` and its value comes from the environment:
  `DB_ENABLED=true` then stays the string `'true'`. Keep the cast, as in the scope above;
- the scope did not load: there is no `configs/database/database.Config.php`, the file returns
  something other than a `Config` or declares another scope, or a `.env` file holds a key outside
  the list above, a key not named `[A-Z_][A-Z0-9_]*`, or an array line such as `DB_HOST[]=x`.

A failed factory builds nothing, so the next read of `$Response->Database` runs it again and
fails the same way. Other failures keep their own exception: a value a `cast:` cannot parse, a
missing `required: true` key, and the errors listed in
**[When `DatabaseConfig` throws](#when-databaseconfig-throws)**.

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

## Reference

`Bootgly\API\Environment\Configs\DatabaseConfig` adapts a `database` config scope to the `SQL`
config. Below, `Config` is the scope node class, `Bootgly\API\Environment\Configs\Config`.

```php
public function __construct (Config $Config)
```

Wraps one scope. Throws `InvalidArgumentException` with
`Database config adapter expects the database scope.` when `$Config->scope` is not `database`.
Pass the scope root, as `Configs::get('database')` returns it: every node of the tree carries
the scope name, so a child node passes this check and then fails in `configure()`.

```php
public Config $Config
```

The wrapped scope. `merge()` fills it in place.

```php
public function merge (Config $Base): self
```

Fills the wrapped scope from another `database` scope, for example
`new DatabaseConfig($Scope)->merge($Shared)->configure()`: a node the wrapped scope already
holds keeps its value, and a missing or `null` one takes the value from `$Base`, which is not
modified. Returns the same adapter. Throws `InvalidArgumentException` with
`Database config adapter can merge only database scopes.` for any other scope.

```php
public function configure (): Bootgly\ADI\Databases\SQL\Config
```

Builds the `SQL` config value from the wrapped scope, following the table in
**[How the scope becomes a connection](#how-the-scope-becomes-a-connection)**; pass it to
`new SQL(...)`. Throws the `InvalidArgumentException`s listed in
**[When `DatabaseConfig` throws](#when-databaseconfig-throws)**.

## Next references

- **[Configuration](/guide/configuration/overview/)** - config scopes, `.env` resolution and allowlists.
- **[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)** - built-in resources and the DBAL response bridge.
- **[DBAL core](/manual/ADI/Database/overview/)** - low-level config, pool, operation and driver lifecycle.
- **[Database ORM](/guide/database-orm/overview/)** - map async SQL results to entities with Data Mapper repositories.
- **[Database queries](/guide/database-queries/overview/)** - building SQL statements with Query Builder.
- **[Database read replicas](/guide/database-read-replicas/overview/)** - read/write splitting, sticky scopes and replica failover.
