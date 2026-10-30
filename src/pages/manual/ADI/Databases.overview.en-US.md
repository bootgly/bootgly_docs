# Databases

A paradigm is a family of databases you talk to the same way: relational databases take SQL
statements, key-value stores take commands. Bootgly gives each paradigm a **facade** under
`Bootgly\ADI\Databases`, the class you open:

- `SQL` (`Bootgly\ADI\Databases\SQL`) — relational databases: PostgreSQL, MySQL/MariaDB and
  SQLite.
- `KV` (`Bootgly\ADI\Databases\KV`) — key-value commands on Redis.

Both extend the same asynchronous core, `Bootgly\ADI\Database`
(**[DBAL core](/manual/ADI/Database/overview/)**). The core gives each facade its connection config
(**[Configuration](/manual/ADI/Database/Config/overview/)**), a connection pool
(**[Connection pool](/manual/ADI/Database/Pool/overview/)**) and the operation life cycle; the
facade adds the verbs of its paradigm. The verb that runs something — `query()` on `SQL`,
`command()` on `KV` — returns a pending operation at once, and four calls drive it whatever the
paradigm: `await()` waits until it finishes and throws a `RuntimeException` carrying its `error`
when it fails
([Await synchronously](/manual/ADI/Database/Pool/overview/#await-synchronously)), `advance()`
moves it one step without waiting, `cancel()` asks the server to stop it where the driver can
([Cancel a running statement](/manual/ADI/Database/Pool/overview/#cancel-a-running-statement)),
and `withdraw()` gives it up locally, sending nothing
([Withdrawn operations](/manual/ADI/Database/Pool/overview/#withdrawn-operations)). The class
named after the namespace, `Bootgly\ADI\Databases`, is a registry that builds a facade from a
paradigm name ([Create a facade by name](#create-a-facade-by-name)).

## Pick a facade

Pick by how you reach the data, not by the server: statements over tables, transactions, the Query
and Schema builders and the ORM are `SQL`; Redis commands are `KV`.

| | `SQL` | `KV` |
|---|---|---|
| Speaks to | PostgreSQL, MySQL/MariaDB, SQLite | Redis |
| `driver` | `pgsql`, `mysql`, `sqlite` | `redis` |
| Verbs | `query()`, `table()`, `begin()`, `map()`, `structure()` | `command()` |
| Drive an operation | `await()`, `advance()`, `cancel()`, `withdraw()` | `await()`, `advance()`, `cancel()`, `withdraw()` |
| Operation | `SQL\Operation`: `Result`, `error`, `code`, `SQL` | `KV\Operation`: `response`, `error`, `command`, `arguments` |
| Cancel a running operation | PostgreSQL `CancelRequest`, MySQL `KILL QUERY` | No: a command already sent fails with `Database driver does not support cancellation.` |
| Config | `SQL\Config`: the shared keys plus `statements`, `migrations` and `routing` | `Database\Config`: the shared keys |
| Read replicas | `replicas`, each with a pool of its own | None: `replicas` is ignored |
| Events | `SQL\Events`: `Connected`, `Executed`, `Slow`, `Failed` | None |
| In routes | `$Response->Database` | `$Response->KV` |
| Project config scope | `database` | `kv` |

The shared keys — `driver`, `host`, `port`, `database`, `username`, `password`, `timeout`, `pool`,
`secure` — and the SQL ones are listed in
**[Keys and defaults](/manual/ADI/Database/Config/overview/#keys-and-defaults)**.

### SQL

```php
use RuntimeException;

use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
]);

try {
   $Operation = $Database->await($Database->query('SELECT $1::int + 1 AS next', [41]));

   $Operation->Result->cell; // 42
}
catch (RuntimeException $Exception) {
   echo "Query failed: {$Exception->getMessage()}\n";
}
```

`query()` takes raw SQL with its parameters, a Query Builder or a compiled `Query`, and returns a
pending `SQL\Operation`; `await()` drives it to the end and returns it. A failed statement keeps
the server's message in `error` and its code in `code` — `relation "users" does not exist` and
`42P01` on PostgreSQL — and `await()` throws that message. The facade, its config keys, read
replicas and events are on the **[SQL facade](/manual/ADI/Databases/SQL/overview/)** page;
**[Transactions](/manual/ADI/Databases/SQL/Transaction/overview/)**,
**[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** and
**[SQL Drivers](/manual/ADI/Databases/SQL/Drivers/overview/)** go deeper.

### KV

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'secure' => ['mode' => 'disable'], // a plaintext Redis is declared, never inferred
]);

$KV->await($KV->command('SET', ['greeting', 'hello']));

$Operation = $KV->await($KV->command('GET', ['greeting']));
$Operation->response; // 'hello'
```

`command()` takes the command name and its arguments and returns a pending `KV\Operation`. The
decoded reply lands in `response`; its `Result` carries only the command name, as `status`. A Redis
error reply fails the operation too, so `await()` throws it — an `INCR` on the key above throws
`ERR value is not an integer or out of range` — and a KV operation has no `code`.

Spell out `driver` and `port`: the defaults are a local PostgreSQL's whatever the facade, so an
array without `driver` makes the first `command()` throw `InvalidArgumentException` with
`Database driver is not registered: pgsql.`, and one without `port` dials `127.0.0.1:5432` — with
nothing listening there, `Redis connection failed: 127.0.0.1:5432 refused the connection (ECONNREFUSED).`
Without `secure`, the mode is `prefer`, and a plaintext Redis never answers the TLS handshake it
starts: each new connection waits for the handshake budget — one second, or half the `timeout`
when that is shorter — and fails with
`Redis TLS handshake timed out: the peer did not answer the TLS handshake within 1s — set secure.mode => 'disable' for a plaintext Redis.`
Redis over TLS, pipelining and the `$Response->KV` resource are covered in
**[Async Redis on the event loop](/guide/cache/overview/#async-redis-on-the-event-loop)**.

`KV` is not the Cache. `Bootgly\ABI\Resources\Cache` is a key-value cache with TTLs and tags whose
drivers block, its Redis driver included; `KV` sends Redis commands over the asynchronous pool
(see **[Cache](/guide/cache/overview/)**).

## Open it where your code runs

Each place has one way to open a facade:

| Your code runs in | `SQL` | `KV` |
|---|---|---|
| An `HTTP_Server_CLI` route | `$Response->Database` | `$Response->KV` |
| The project's boot function, a command or a script inside the project | `new SQL(new DatabaseConfig(...)->configure())` | `new KV(new KVConfig(...)->configure())` |
| Code outside a project | `new SQL([...])` | `new KV([...])` |

### In a route

Register the resources once, in the project's `*.Project.php` where it configures
`HTTP_Server_CLI`: the `provide()` factories of the `Database` and `KV` response resources
(`Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources`) read the `database` and `kv` config scopes
and build one facade per worker
(**[Register project resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#register-project-resources)**,
**[Register the KV resource](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#register-the-kv-resource)**).
The route reads `$Response->Database` and `$Response->KV` and waits through them
(**[Await database work](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#await-database-work)**,
**[Await key-value work](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#await-key-value-work)**).
Do not call a facade's own `await()` in a route: it never suspends the calling Fiber, so each wait
blocks the worker — and every request it serves — until the server answers, inside
`$Response->defer()` too.

### In the project

```php
use Bootgly\ADI\Databases\KV;
use Bootgly\ADI\Databases\SQL;
use Bootgly\API\Environment\Configs\DatabaseConfig;
use Bootgly\API\Environment\Configs\KVConfig;

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
$KV = new KV(new KVConfig(BOOTGLY_PROJECT->Configs->get('kv'))->configure());
```

`DatabaseConfig` and `KVConfig` turn a config scope into the facade's config; they are the
adapters the route resources use too. Each one takes only its own scope — given another, they throw
`Database config adapter expects the database scope.` and `KV config adapter expects the kv scope.`
— and each line needs its scope to exist: see
**[From the project config](/manual/ADI/Database/Config/overview/#from-the-project-config)** for
what fails without one, **[Configure the database](/guide/database-dbal/overview/#configure-the-database)**
for the `database` scope and
**[Register the KV resource](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#register-the-kv-resource)**
for the `kv` one.

Open each database once per process and reuse it: every facade instance owns its pool, so two
`new SQL` with the same config open two pools
([Size the pool](/manual/ADI/Database/Pool/overview/#size-the-pool)). In a server project's boot
function, do not hand the instance to routes
(**[Use it in a script or command](/guide/database-dbal/overview/#use-it-in-a-script-or-command)**).

### Outside a project

Code that runs outside a project — a standalone script, a tool — passes the connection as an
array, as in [Pick a facade](#pick-a-facade). Every key is optional, and a key left out takes the
default of a local PostgreSQL, whatever the facade
(**[Keys and defaults](/manual/ADI/Database/Config/overview/#keys-and-defaults)**). A bare
`new SQL` reads no config at all: its first query dials PostgreSQL at `127.0.0.1:5432` as
`postgres`.

## Create a facade by name

```php
use Bootgly\ADI\Databases;
use Bootgly\ADI\Databases\SQL;

$Databases = new Databases;

$Databases->resolve('sql'); // 'Bootgly\ADI\Databases\SQL'

$Database = $Databases->create('sql', [
   'driver' => 'sqlite',
   'database' => ':memory:',
]);

if ($Database instanceof SQL) {
   $Operation = $Database->await($Database->query('SELECT 6 * 7 AS answer'));
   $Operation->Result->cell; // 42
}
```

`Bootgly\ADI\Databases` maps a paradigm name to its facade class. `resolve()` returns the class,
and `create()` builds it with a config array: `create('sql', $config)` is `new SQL($config)`, and
like it opens no connection. Use it when the paradigm arrives as data, such as a name in a settings
file; when you know which database you open, construct the facade. Nothing in the framework reads
this registry: the route resources build `SQL` and `KV` directly.

- Only `sql` is registered. `create('kv')` and `resolve('kv')` throw `InvalidArgumentException`
  with `Database paradigm is not registered: kv.` Build the key-value facade with `new KV([...])`,
  or register it first ([Add a paradigm](#add-a-paradigm)).
- Names match exactly: `create('SQL')` throws `Database paradigm is not registered: SQL.`
- `create()` takes an array. Given the `Config` that `DatabaseConfig::configure()` returns, it
  throws a `TypeError`: construct the class `resolve()` returns with it instead
  (`new $class($Config)`).
- Errors of the facade's constructor pass through: `create('sql', ['driver' => 'mariadb'])` throws
  `SQL builder dialect is not registered: mariadb`
  ([Driver names](/manual/ADI/Database/Config/overview/#driver-names)).
- `create()` is typed to return the abstract `Database`, which has none of the paradigm's verbs. A
  static analyser such as PHPStan reports `Call to an undefined method Bootgly\ADI\Database::query().`
  until the instance is narrowed, as the `instanceof` above does.

## Add a paradigm

A paradigm is a facade class plus a registry of its drivers. Extend `Bootgly\ADI\Database`, pass
the registry class to its constructor, give the facade its verbs, and register it when it should be
reachable by name:

```php
use Bootgly\ADI\Database;
use Bootgly\ADI\Database\Config;
use Bootgly\ADI\Database\Connection;
use Bootgly\ADI\Database\Drivers;
use Bootgly\ADI\Databases;

class DocumentDrivers extends Drivers
{
   public function __construct (Config $Config, Connection $Connection)
   {
      parent::__construct($Config, $Connection);

      $this->register('memory', new Memory($Config, $Connection));
   }
}

class Document extends Database
{
   public function __construct (array|Config $config = [])
   {
      parent::__construct($config, DocumentDrivers::class);
   }

   public function find (string $collection): DocumentOperation
   {
      $Operation = new DocumentOperation(null, $collection, $this->Pool->Config->timeout);
      $this->Pool->assign($Operation);

      return $Operation;
   }

   public function await (DocumentOperation $Operation): DocumentOperation
   {
      ($Operation->Pool ?? $this->Pool)->wait($Operation);

      return $Operation;
   }
}

$Databases = new Databases;
$Databases->register('document', Document::class);

$Database = $Databases->create('document', ['driver' => 'memory']);

if ($Database instanceof Document) {
   $Operation = $Database->await($Database->find('users'));
}
```

- `parent::__construct($config, DocumentDrivers::class)` builds the `Config` — from an array or a
  `Config` — the first `Connection` and the pool for `Config->driver`. It opens nothing, and the
  facade inherits `withdraw()`.
- The pool builds the registry once for each connection it opens, calling
  `new DocumentDrivers($Config, $Connection)` — keep that constructor signature — and binds the
  connection to the driver registered under `Config->driver`. Every driver the registry registers
  is constructed each time, so keep driver constructors cheap. A name it does not register throws
  `Database driver is not registered: <name>.` from the verb that hands the operation to the pool,
  `find()` here.
- A verb creates the paradigm's operation with the pool's `timeout` and hands it to
  `Pool::assign()`; `await()` waits through the operation's own pool. `SQL` and `KV` do the same.
- `DocumentOperation` extends `Bootgly\ADI\Database\Operation` with the paradigm's fields, and
  `Memory` extends `Bootgly\ADI\Database\Driver`, implementing its two abstract methods.
  `prepare()` composes the command and leaves the operation `Queued`: one left `Pending` reads as
  parked, and `await()` fails it with `Database pool has no capacity for the operation.`
  `advance()` moves it one step and finishes it with `resolve()` or `fail()`; while it is
  unfinished, it records what to wait on next with `$Operation->await()` and a `Readiness`, or the
  facade's `await()` throws `Database operation did not provide readiness.` The rest of `Driver` has
  defaults for a driver that keeps no wire state: `cancel()` fails the operation with
  `Database driver does not support cancellation.`
- `register()` only makes the class reachable through `create()` and `resolve()` on that
  `Databases` instance; `new Document(['driver' => 'memory'])` works without it.

## Reference

### Databases

`Bootgly\ADI\Databases` — the registry and factory of database paradigms.

```php
__construct ()
```

Creates a registry with one paradigm, `sql`, mapped to `Bootgly\ADI\Databases\SQL`. Each instance
keeps its own map: a paradigm registered on one is unknown to the next `new Databases`.

```php
register (string $paradigm, string $class): self
```

Maps `$paradigm` to `$class`, a `class-string<Database>` whose constructor takes the config array,
replacing any class registered under that name, `sql` included. Returns the registry, so calls
chain. Nothing is checked here: a class that does not exist fails at `create()` with
`Class "App\Missing" not found`, and one that is not a `Database` with a `TypeError`
(`Bootgly\ADI\Databases::create(): Return value must be of type Bootgly\ADI\Database, stdClass returned`).

```php
resolve (string $paradigm): string
```

Returns the class registered under `$paradigm` (`class-string<Database>`) without building it. The
name must match exactly. Throws `InvalidArgumentException` with
`Database paradigm is not registered: kv.` for a name nothing registered.

```php
create (string $paradigm, array $config = []): Database
```

Resolves `$paradigm` and returns `new $class($config)`, which opens no connection. `$config` is an
ADI-native array (see **[Configuration](/manual/ADI/Database/Config/overview/)**); left empty, every
key takes its default. A `Config` object is a `TypeError`. Throws the `InvalidArgumentException` of
`resolve()` for an unknown name, and whatever the facade's constructor throws for an invalid
config, such as `SQL builder dialect is not registered: mariadb` or
`Unsupported database TLS mode: verify_full.` The return type is the abstract `Database`: narrow it
(`instanceof SQL`) before calling the paradigm's verbs where a static analyser checks the code.
