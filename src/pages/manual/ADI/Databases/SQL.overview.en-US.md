# SQL database

`Bootgly\ADI\Databases\SQL` is the facade an application talks to a SQL database through —
PostgreSQL, MySQL/MariaDB or SQLite. Its `query()` turns raw SQL, a Query Builder or a compiled
query into a pending SQL `Operation` on the facade's connection pool, and sends reads to read
replicas when you configure them; `await()` drives an operation to its end. The facade also opens
the Query Builder (`table()`), the Schema Builder (`structure()`), transactions (`begin()`) and ORM
repositories (`map()`).

The connection keys and their defaults are on
**[Database configuration](/manual/ADI/Database/Config/overview/)**, and what the pool does with an
operation — waits, deadlines, cancellation, withdrawal, replica health — is on
**[Connection pool](/manual/ADI/Database/Pool/overview/)**.

## Open a database

Where the code runs decides how it opens the database:

- **In an `HTTP_Server_CLI` route**, do not build one. Use `$Response->Database`, the response
  resource the project registers with `Database::provide()` (see
  **[Register it for HTTP routes](/guide/database-dbal/overview/#register-it-for-http-routes)**): it
  wraps one `SQL` per worker and awaits through the response instead of blocking the worker — see
  **[Await database work](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#await-database-work)**.
- **In a project** — its boot function, a command, or a script running inside it — build it from
  the project's `database` config scope, as in the first block below.
- **Outside a project**, pass the connection as an array, as in the second.

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\API\Environment\Configs\DatabaseConfig;

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
```

`configure()` returns a ready `SQL\Config`. The line needs that scope: see
**[Use it in a script or command](/guide/database-dbal/overview/#use-it-in-a-script-or-command)**
for what it fails with when the scope is missing, and for loading a configs directory yourself.

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
]);
```

Every key is optional, and a key you leave out takes its default — a local PostgreSQL's, whatever
`driver` says, so a bare `new SQL` dials `127.0.0.1:5432` as `postgres` (see
**[Keys and defaults](/manual/ADI/Database/Config/overview/#keys-and-defaults)**). Building the
facade validates the config and opens nothing: the first operation dials. Each facade owns its
pools — one for the primary, one per read replica — so build one per process and reuse it.

## Config keys

`SQL` reads every key of **[Database configuration](/manual/ADI/Database/Config/overview/#keys-and-defaults)**
plus the five below: `statements`, `routing.sticky`, `migrations` and `parameters`, which
`Bootgly\ADI\Databases\SQL\Config` adds, and `replicas`, which the base `Config` parses but only
`SQL` opens — `SQL\Config` gives each replica its `statements` and `parameters`.

| Key | Default | What it sets |
|---|---|---|
| `statements` | `256` | How many prepared statements each connection caches |
| `routing.sticky` | `5.0` | How many seconds the reads of a scope stay on the primary after it writes |
| `migrations` | `'_bootgly_migrations'` | The table where the migration runner records applied migrations |
| `parameters` | `[]` | The session parameters sent at connection start — PostgreSQL only ([Session parameters](#session-parameters)) |
| `replicas` | `[]` | The read replicas, each opened as a pool of its own |

```php
use Bootgly\ADI\Databases\SQL\Config;

$Config = new Config([
   // ... connection keys
   'statements' => 64,
   'routing' => ['sticky' => 2.0],
   'migrations' => 'schema_history',
   'replicas' => [
      ['host' => '10.0.0.21'],
      ['host' => '10.0.0.22', 'statements' => 16],
   ],
]);

$Config->statements;                // 64
$Config->routing;                   // ['sticky' => 2.0]
$Config->replicas[0]['statements']; // 64
$Config->replicas[1]['statements']; // 16
```

`new SQL($Config)` takes it as it is — an array given to `new SQL()` becomes this same class — and
opens one pool per replica, in `$Database->ReplicaPools`.

- `statements` is cast to an integer and floored at `0`, which turns the cache off: each statement
  is then prepared for its own operation and closed once it completes. Past the cap, the least
  recently used statement is evicted (see Prepared statements on the
  **[PostgreSQL](/manual/ADI/Databases/SQL/Drivers/PostgreSQL/overview/#prepared-statements)** and
  **[MySQL](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/#prepared-statements)** driver pages).
- `routing.sticky` is in seconds, cast to a float and floored at `0.0`, which turns the window off:
  a read then goes to a replica even right after a write. It matters only with `replicas` — see
  [Read-after-write scope](#read-after-write-scope).
- `migrations` is trimmed, and an empty value takes the default. The project config adapter has no
  node for it, so `bootgly project <name> migrate` always records into `_bootgly_migrations` (see
  **[How the scope becomes a connection](/guide/database-dbal/overview/#how-the-scope-becomes-a-connection)**):
  set it in an array config, or give the migration `Runner` a table name (see
  **[Migrations](/manual/ADI/Databases/SQL/Schema/Migrations/overview/)**).
- `replicas` is a list of endpoints, and an entry without a non-empty `host` is dropped. A key an
  entry leaves out comes from the primary — `statements` too, unless the entry sets its own — and
  its TLS flags follow the **[TLS](/manual/ADI/Database/Config/overview/#tls)** rules.
  **[Configure replicas](/guide/database-read-replicas/overview/#configure-replicas)** shows them in
  a project config.

As with the connection keys, a non-numeric string counts as `0` — which turns `statements` and
`routing.sticky` off — and a value that is not a scalar, or a `routing` that is not an array, takes
the default. On the facade, `$Database->SQLConfig` is this `SQL\Config`, and `$Database->Config` is
the same object, typed as the base `Config`.

### Session parameters

`parameters` sets PostgreSQL run-time parameters for every session the pools open. The driver sends
them in the startup message, so they are in force before the first query runs, and a `RESET`
returns to them instead of the server's defaults:

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   // ... connection keys
   'parameters' => [
      'search_path' => 'app, public',
      'statement_timeout' => 5000,
      'application_name' => 'billing',
   ],
]);

$Operation = $Database->await($Database->query('SHOW search_path'));
$Operation->Result->cell; // 'app, public'
```

The map is checked when the config is built, and an entry that fails a check throws
`InvalidArgumentException` naming its key:

- A name is a run-time parameter identifier: letters, digits, `_` and `.`, starting with a letter
  or `_`. Custom names such as `myapp.tenant` qualify. PostgreSQL reads names case-insensitively,
  so two names that differ only in case are refused:
  ``Database parameter `SEARCH_PATH` is given twice (as `search_path`): parameter names are case-insensitive.``
- A value is a string, sent as written (an empty string included), or an integer, sent in decimal:
  `5000` is stored and sent as `'5000'`. Floats and booleans are refused, since they have no single
  text form: write `'0.5'` or `'on'` instead. A NUL byte in a value is refused too.
- `user`, `database`, `options` and `replication` are reserved: the first two come from `username`
  and `database`, and the other two would change what the session is. Names that start with
  `_pq_.` are protocol extensions, not parameters. These checks ignore case.
- The driver pins three settings in every startup message (`PINNED_PARAMETERS`):
  `client_encoding` `UTF8`, `DateStyle` `ISO` and `standard_conforming_strings` `on`, the encoding,
  date text and literal quoting it reads and writes. A startup setting wins over the server's, the
  database's and the role's. `parameters` cannot name them (`FIXED_PARAMETERS`), in any letter case:
  ``Database parameter `DateStyle` cannot be set: the driver fixes DateStyle to ISO, the date and time text its decoder reads.``
- The other formats stay the server's, and `parameters` may set them: `bytea` decodes from either
  `bytea_output` format, `hex` or `escape`; an interval returns as the server's text, in the
  session's `IntervalStyle` (`1 day 02:00:00` by default, `P1DT2H` with `iso_8601`).
- Floats decode from the server's text and read back exact on PostgreSQL 12 and later, unless the
  server, a database or a role lowers `extra_float_digits` to 0 or less, which rounds them. Then
  set `'extra_float_digits' => 3` in `parameters` on a direct connection (a pooler may refuse a
  startup name it does not track), or set it on the role, as in
  `ALTER ROLE app SET extra_float_digits = 3`. `3` also keeps them exact on an older server, whose
  default rounds a `float8` to 15 digits. `parameters` admits `extra_float_digits` only as `1`, `2`
  or `3`, written as a string or an integer, and refuses any other value:
  ``Database parameter `extra_float_digits` must be 1, 2 or 3: floats decode from the server's text, and 0 or less rounds them.``
- Behind a connection pooler, a parameter the pooler does not track can refuse the connection. The
  pinned names are the ones PgBouncer tracks by default, so it accepts the startup message as is;
  a name of your own, such as `search_path`, makes a stock PgBouncer close the connection with
  `unsupported startup parameter`. From PgBouncer 1.20, its `track_extra_parameters` setting keeps a
  value per client, but only for a parameter the server reports to the client (ParameterStatus),
  such as `search_path` on recent servers, not `statement_timeout`. Its `ignore_startup_parameters`
  setting accepts the name and silently drops the value, so a `statement_timeout` meant as a guard
  is not enforced. For a value the server does not report, run `SET` after connecting, or set it on
  the role or the database, as in `ALTER ROLE app SET statement_timeout = 5000`.
- `application_name` is `Bootgly` unless the map names one; it is the name `pg_stat_activity`
  shows for the session.
- Which names and values the server accepts is the server's call: an unknown name fails the first
  operation with the server's error, as in `unrecognized configuration parameter "no_such_setting"`.
- A replica inherits the primary's map name by name: an entry of its own replaces the primary's
  under the same name, in any letter case, and the rest is added. A replica cannot drop an
  inherited name; give it the value the replica needs.
- The whole startup message must fit PostgreSQL's 10000 bytes (`STARTUP_LIMIT`), counted with the
  endpoint's `username` and `database`, the pinned settings and the default `application_name`; a
  longer one is refused naming its size:
  ``Database startup message is 10001 bytes, over PostgreSQL's 10000-byte limit: shorten `parameters`, `username` or `database`.``
- MySQL and SQLite have no startup parameters. A non-empty map on an endpoint whose `driver` is not
  `pgsql`, the primary or a replica (an inherited map included), is refused when the config is built,
  before any connection opens:
  ``Database `parameters` are PostgreSQL only: the mysql driver has no startup session parameters, so set the session after connecting instead.``
  A `driver` that is no built-in driver name at all, such as the alias `postgres` on a replica that
  inherits the primary's map, is named as such:
  ``Database `parameters` need the pgsql driver: `postgres` is not a built-in driver name (pgsql, mysql or sqlite): session parameters reach only the built-in pgsql driver (replica 10.0.0.21).``
  An empty map is the same as none.
- In a project config, set them with `Parameters` nodes: see
  **[How the scope becomes a connection](/guide/database-dbal/overview/#how-the-scope-becomes-a-connection)**.

```php
use Bootgly\ADI\Databases\SQL\Config;

$Config = new Config([
   // ... connection keys
   'parameters' => ['search_path' => 'app'],
   'replicas' => [
      ['host' => '10.0.0.21'],
      ['host' => '10.0.0.22', 'parameters' => ['default_transaction_read_only' => 'on']],
   ],
]);

$Config->replicas[0]['parameters']; // ['search_path' => 'app']
$Config->replicas[1]['parameters']; // ['search_path' => 'app', 'default_transaction_read_only' => 'on']
```

## Run a query

`query()` takes raw SQL with its parameters, a Query Builder, or a compiled `Query`. With a `users`
table holding the rows `(1, 'Ada')` and `(2, 'Grace')`:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Query;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; }

$Raw = $Database->query('SELECT id, name FROM users WHERE id = $1', [1]);

$Built = $Database->query(
   $Database->table(Tables::Users)
      ->select(Columns::Id, Columns::Name)
      ->filter(Columns::Id, Operators::Equal, 1)
);

$Compiled = $Database->query(new Query('SELECT id, name FROM users WHERE id = $1', [1], reading: true));

$Database->await($Raw)->Result->row;      // ['id' => 1, 'name' => 'Ada']
$Database->await($Built)->Result->row;    // ['id' => 1, 'name' => 'Ada']
$Database->await($Compiled)->Result->row; // ['id' => 1, 'name' => 'Ada']
```

Each form returns a SQL `Operation` (`Bootgly\ADI\Databases\SQL\Operation`) at once. It is already
assigned to a pool, but nothing is sent until it is advanced; `await()` advances it to its end and
returns it. SQLite is the exception: an operation that gets the connection runs inside `query()`.
Placeholders follow the driver — `$1` on PostgreSQL, `?` on MySQL, `?1` or `:name` on SQLite (see
**[Parameters](/manual/ADI/Databases/SQL/Drivers/SQLite/overview/#parameters)**) — and a builder
writes the right ones. A builder or a `Query` carries its own parameters, so the second argument is
ignored for them.

The form also decides where an operation may run when replicas are configured. A raw string is
classified by its leading keyword and a builder by what it compiles to (see
**[Routing rules](/guide/database-read-replicas/overview/#routing-rules)**); a compiled `Query`
says it with `reading`, whose default, `false`, keeps it on the primary and counts it as a write.
Without replicas, every operation goes to the primary pool. The third argument, `$Scope`, is covered
in [Read-after-write scope](#read-after-write-scope).

### What throws and what fails

`query()` throws only when it cannot build the statement or find a driver for it, and then returns
nothing:

- an empty or blank statement throws `InvalidArgumentException` with `SQL cannot be empty.`;
- a builder that cannot compile throws its own `InvalidArgumentException` — a `delete()` without a
  `filter()`, for one, throws `SQL update/delete requires at least one filter.`;
- a `driver` that no SQL driver is registered under throws
  `Database driver is not registered: postgres.` (see
  **[Driver names](/manual/ADI/Database/Config/overview/#driver-names)**).

Everything the database, the network or the pool answers fails the operation instead: `query()`
returns it, and the failure lands in its `error`.

## Read the outcome

```php
use RuntimeException;

$Select = $Database->await($Database->query('SELECT id, name FROM users ORDER BY id'));

$Select->SQL;             // SELECT id, name FROM users ORDER BY id
$Select->Result->columns; // ['id', 'name']
$Select->Result->rows;    // [['id' => 1, 'name' => 'Ada'], ['id' => 2, 'name' => 'Grace']]
$Select->Result->cell;    // 1

$Update = $Database->await($Database->query('UPDATE users SET name = $1 WHERE id = $2', ['Grace Hopper', 2]));

$Update->parameters;       // ['Grace Hopper', 2]
$Update->Result->status;   // UPDATE 1
$Update->Result->affected; // 1

$Insert = $Database->query('INSERT INTO users (id, name) VALUES ($1, $2)', [1, 'Ada']);

try {
   $Database->await($Insert);
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // duplicate key value violates unique constraint "users_pkey"
   $Insert->code;            // 23505
   $Insert->Result;          // null
}
```

A resolved operation holds a `Result`: the `rows`, keyed by column name, with the views `row` (the
first row), `cell` (its first value), `count` and `empty`; the `columns`; the command tag in
`status`; the `affected` row count; and `inserted`, the id an `INSERT` generated on MySQL and
SQLite. The drivers fill `status`, `affected` and `inserted` a little differently — see
**[Result](/manual/ADI/Database/overview/#result)**. The operation itself keeps the statement it
ran, in `SQL`, and its `parameters`.

A failed operation has no `Result`. Its `error` holds the message, and its `code` the driver's
failure code — PostgreSQL SQLSTATE, MySQL errno, SQLite extended result code — as a string, or
`null` when the failure carries none, as for a deadline or a refusal by the pool. `await()` throws a
`RuntimeException` whose message is `error`, and the operation keeps both. Branch on `code`, not on
the message:

| Driver | `error` for a duplicate key | `code` |
| --- | --- | --- |
| PostgreSQL | `duplicate key value violates unique constraint "users_pkey"` | `23505` |
| MySQL | `1062: Duplicate entry '1' for key 'users.PRIMARY'` | `1062` |
| SQLite | `Unable to execute statement: UNIQUE constraint failed: users.id` | `1555` for a primary key, `2067` for a `UNIQUE` column |

A SQL operation also carries `rows`, `columns`, `status` and `affected` of its own. They are the
driver's working copies, filled while it reads, so read them only once `error` is `null`: a
PostgreSQL statement that fails part-way leaves there the rows that arrived before the error, while
its `Result` stays `null`. Every field is listed in
**[Operation](/manual/ADI/Database/overview/#operation)**.

## Drive operations

The facade's `await()`, `advance()` and `cancel()` work through the pool that owns the operation
(`$Operation->Pool`): the primary pool, or a replica's, for a read routed to one.

### Wait for an operation

`await()` is `Pool::wait()` on that pool: it advances the operation until it finishes, sleeping on
its socket, and returns it — or throws a `RuntimeException` carrying `$Operation->error` when it
fails (see **[Await synchronously](/manual/ADI/Database/Pool/overview/#await-synchronously)**). It
blocks the process and drives only the operation it is given: an operation on another connection
is not advanced meanwhile. Awaiting several operations one after another therefore runs them one
after another, and an operation parked in `pending` that you await before the ones holding the
connections is refused with `Database pool has no capacity for the operation.` Await operations in
the order you created them.

### Run operations side by side

Two statements that take 0.3 seconds each, on PostgreSQL — on MySQL, write `SLEEP(0.3)` where they
call `pg_sleep(0.3)`:

```php
$Report = $Database->query('SELECT pg_sleep(0.3), 1 AS report');
$Audit = $Database->query('SELECT pg_sleep(0.3), 2 AS audit');

while ($Report->finished === false || $Audit->finished === false) {
   $Database->advance($Report);
   $Database->advance($Audit);
   usleep(1000);
}

$Report->error;               // null
$Audit->Result->row['audit']; // 2
```

`advance()` moves an operation as far as its socket allows — dial, TLS, authentication, write, read
— and returns without waiting. A loop over several operations therefore runs them at once: the two
statements above run on two connections at the same time, and the loop ends after about 0.3
seconds, where `await($Report)` followed by `await($Audit)` takes about 0.6. `advance()` does not
throw for a failed operation, so check each one's `error` when the loop ends; it does fail an
operation whose deadline has passed (see
**[Set a deadline](/manual/ADI/Database/Pool/overview/#set-a-deadline)**). Since it never waits,
pause between passes instead of spinning.

### Cancel or withdraw

`cancel()` asks the server to stop a running statement — PostgreSQL `CancelRequest`, MySQL
`KILL QUERY` — and is advisory: the operation still resolves, fails or expires on its own. The
request goes out only for the statement its session is executing. An operation that has not reached
the server yet — just created, parked in `pending`, waiting behind another caller's to be written, or
still connecting — is failed locally at once instead, and nothing is sent; one already finished
keeps its result. One the server has but is not running yet — pipelined behind another batch on
PostgreSQL, or still being written — is left as it is: `cancelled` stays `false`, and it runs to
completion, so await it like any other. The inherited `withdraw()` gives operations up locally, when
their caller stops waiting, and sends nothing. Both are described in
**[Cancel a running statement](/manual/ADI/Database/Pool/overview/#cancel-a-running-statement)** and
**[Withdrawn operations](/manual/ADI/Database/Pool/overview/#withdrawn-operations)**.

## Entry points

```php
$Builder = $Database->table(Tables::Users);
$Schema = $Database->structure();

$Transaction = $Database->begin();
$Database->await($Transaction->Operation);
$Database->await($Transaction->query('UPDATE users SET name = $1 WHERE id = $2', ['Ada', 1]));
$Database->await($Transaction->commit());
```

- `table()` starts a Query Builder on a table — or on a derived source, a builder or a compiled
  query, with an alias — compiled with the facade's dialect; pass it to `query()`. See
  **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)**.
- `structure()` returns the facade's Schema Builder, created on the first call and reused after —
  see **[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/)**.
- `begin()` starts a transaction on one connection of the primary pool. Its `BEGIN` is assigned at
  once, as `$Transaction->Operation`: await it before the first statement. Commit, rollback,
  savepoints and refusals are in **[Transactions](/manual/ADI/Databases/SQL/Transaction/overview/)**.

### Repositories

```php
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;

#[Table('users')]
class User
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $name = '';
}

$Users = $Database->map(User::class, Awaiting: $Database);

$User = $Users->hydrate($Database->await($Users->find(1)))->entity;
$User->name; // Ada
```

`map()` returns an ORM repository for one entity class. The repository composes operations —
`find()`, `fetch()`, `save()`, `delete()` — that you await and then hand to `hydrate()`, which turns
their rows into entities (see **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)**).
The entity's metadata is compiled once per facade. The two optional arguments are:

- `$Scope` — the read-after-write scope of the repository's operations, as in `query()`;
- `$Awaiting` — the await bridge. `SQL` implements `Awaiting`, so with `Awaiting: $Database`,
  hydration loads the relations a selection names, and the `lazy: true` ones, by awaiting through
  the facade. Without a bridge, a named relation comes back as an operation for you to await, and
  hydrating an entity with a `lazy: true` relation the selection does not load throws
  `ORM lazy loading requires an await bridge.` (see
  **[ORM Repository Relations](/manual/ADI/Databases/SQL/Repository/Relations/overview/)**).

`$Transaction->map()` defaults the bridge to the transaction, and `$Response->Database->map()` to
the resource, with the request's scope.

## Read-after-write scope

With replicas configured, `query()` sends each read to the next healthy replica and each write to
the primary. A replica can lag behind the primary, so after a write, the reads of the same
**scope** stay on the primary for `routing.sticky` seconds (`5.0` by default). Below, a second
database stands in for the replica, so each read reports which pool answered it:

```php
use stdClass;

use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
   'replicas' => [
      ['host' => '127.0.0.1', 'database' => 'app_replica'],
   ],
]);

$Where = 'SELECT current_database()';

$Database->await($Database->query($Where))->Result->cell; // app_replica

$Database->await($Database->query('UPDATE users SET name = $1 WHERE id = $2', ['Ada', 1]));
$Database->await($Database->query($Where))->Result->cell; // app

$Job = new stdClass;
$Database->await($Database->query($Where, [], $Job))->Result->cell; // app_replica

$Database->touch($Job);
$Database->await($Database->query($Where, [], $Job))->Result->cell; // app
```

- The scope is any object. By default it is the current `Fiber` — outside a Fiber, the facade
  itself — so in a script, one write keeps every later read of that facade on the primary for the
  window. Pass your own object as the third argument of `query()` to keep unrelated work apart:
  `$Job` had not written, so its read still went to the replica.
- `touch()` marks a scope as having just written — the default scope when you pass none. Use it for
  a write the facade did not see, such as one made by another process or another `SQL` instance:
  the reads of that scope then stay on the primary for the window.
- A write through `$Transaction->query()` marks its scope too (see
  **[Transactions](/manual/ADI/Databases/SQL/Transaction/overview/)**), and in `HTTP_Server_CLI`
  routes `$Response->Database` gives each request a scope of its own.
- A read that fails on a replica is re-run once on the primary, and a replica that keeps failing to
  connect is skipped for a while — see
  **[Replica health](/manual/ADI/Database/Pool/overview/#replica-health)**.
- `routing.sticky` `0` turns the window off. The window is timing only, not a wait for the replica
  to catch up: **[Read-after-write scope](/guide/database-read-replicas/overview/#read-after-write-scope)**
  covers reads that need strict freshness.

## Events

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ADI\Databases\SQL\Events;

Emitter::$Instance->listen(Events::Failed, function (Emission $Emission): void {
   [$Operation] = $Emission->payload;

   error_log("SQL failed ({$Operation->code}): {$Operation->error} in {$Operation->SQL}");
});
```

`Bootgly\ADI\Databases\SQL\Events` announces what happens to SQL connections and operations:

| Event | When | Payload |
| --- | --- | --- |
| `Connected` | A connection finished authenticating (PostgreSQL, MySQL), or SQLite opened its database | `Connection` |
| `Executed` | An operation resolved — every statement, a transaction's `BEGIN`, `COMMIT` and savepoints included | `Operation` |
| `Slow` | An operation resolved at least `Operation::$slow` seconds after it was created | `Operation`, `$elapsed` (float, seconds) |
| `Failed` | An operation failed — once per attempt: failing it again only replaces its `error` and `code`. A read that fails on a replica is re-run on the primary, which then announces `Executed` or a second `Failed` | `Operation` |

- `Failed` covers every failure: the server's errors, which carry a `code`, and the framework's
  own — a deadline, a pool refusal, a withdrawal, a transaction refusal such as
  `SQL transaction operation is still active.` — whose `code` is `null`. Bootgly's `Users` security
  store also announces it for a password-hash upgrade that did not land: that operation resolved, so
  its `error` is `null`.
- A read that fails on a replica announces `Failed`, and is then re-run once on the primary (see
  [Read-after-write scope](#read-after-write-scope)), which announces again: `Executed` — the
  caller sees a success — or `Failed` a second time for the same operation. A cancelled or
  withdrawn read is not re-run. To count each operation once, skip the `Failed` that precedes a
  re-run; in the listener, that is when
  `$Operation->FallbackPool !== null && $Operation->fallback === false && $Operation->cancelled === false && $Operation->revoked === false`.
- `Slow` is off until you set the static `Operation::$slow` (`Bootgly\ADI\Databases\SQL\Operation`),
  in seconds; at `0.0`, the default, the check costs nothing. Set it at boot, before the first
  `query()`: an operation created while it was `0.0` has no start time, so one that resolves after
  you set it currently announces `Slow` with its elapsed time counted from the Unix epoch. It
  follows `Executed`, only for an operation that resolved, and its elapsed time counts from
  `query()`, so it includes any wait for a free connection — see
  **[Catch slow queries](/guide/events/overview/#catch-slow-queries)**.
- `Connected` fires once per connection, the replicas' included; `$Connection->Config` names the
  endpoint.
- These events implement `Bootgly\ABI\Events\Emitter\Observing`: the event bus isolates each
  listener, so one that throws is reported through `Throwables::notify()` and never reaches the
  operation, the pool or the next listener. Listeners run inside the driver's read loop, so keep
  them short. The transaction events — `Begin`, `Commit`, `Rollback` — keep the steering contract
  instead (see **[ADI — SQL database](/guide/events/overview/#adi--sql-database)**).
- Each worker process has its own `Emitter` and its own `Operation::$slow`: a listener registered,
  or a threshold set, in one process does not reach the others (see
  **[Events](/guide/events/overview/)**).

## Errors

| Message | Thrown by | Cause |
| --- | --- | --- |
| `SQL builder dialect is not registered: mariadb` | `new SQL()` | `driver` is not a SQL driver name or a known dialect alias |
| `SQL cannot be empty.` | `query()` | The statement is empty or blank |
| `SQL update/delete requires at least one filter.` | `query()` | A builder that cannot compile — here, a `delete()` without a `filter()` |
| `Database driver is not registered: postgres.` | `query()`, `begin()` | No SQL driver is registered under `driver` |
| `SQL derived table requires an alias.` | `table()` | A builder or a compiled query given as the source without an `$Alias` |
| `ORM entity requires one Table attribute: Note` | `map()` | The entity class has no `#[Table]` attribute |
| `Class "App\Missing" does not exist` | `map()` | The entity class does not exist — PHP's `ReflectionException` |
| `duplicate key value violates unique constraint "users_pkey"` | `await()` | The server's error, kept in the operation's `error` |
| `Database operation timed out after 30 seconds.` | `await()` | The operation's `timeout` elapsed |
| `Database pool has no capacity for the operation.` | `await()` | The awaited operation is still parked in `pending` |

`new SQL()`, `query()`, `table()`, `begin()` and `map()` throw an `InvalidArgumentException` —
except `map()` for a class that does not exist, which throws a `ReflectionException`; `await()`
throws a `RuntimeException` carrying the failed operation's `error`. The connection keys' own
errors are in **[Database configuration](/manual/ADI/Database/Config/overview/#errors)**, the pool's in
**[Connection pool](/manual/ADI/Database/Pool/overview/#errors)**, and connection failures in
**[Failures](/manual/ADI/Database/overview/#failures)**.

## Reference

### SQL

`Bootgly\ADI\Databases\SQL` extends `Bootgly\ADI\Database` and implements `Awaiting` (`await()`)
and `Querying` (`query()` and `pipelining`), the contracts repositories run on. Its inherited
`Config`, `Pool`, `Pools`, `Connection` and `drivers` are in the
**[DBAL core](/manual/ADI/Database/overview/#database)** Reference.

```php
__construct (array|Config $config = [])
```

Builds the facade from an ADI-native array or a `SQL\Config` — an array becomes a `SQL\Config` —
then the dialect for `driver`, the primary pool and one pool per replica. Throws
`InvalidArgumentException` for a `driver` that has no dialect and for the config's own errors. It
opens no connection.

```php
query (string|Builder|Query $query, array $parameters = [], null|object $Scope = null): Operation
```

Creates a SQL operation from raw SQL and `$parameters`, a Query Builder or a compiled `Query` —
those two carry their own parameters — and assigns it to a pool: the primary, or, for a read when
replicas are configured, the next healthy replica (the primary when none is) unless `$Scope` wrote
within the `routing.sticky` window. A write marks `$Scope`, by default the current Fiber, else the
facade.
Nothing is sent until the operation is advanced, except on SQLite. Throws
`InvalidArgumentException` for an empty statement, a builder that cannot compile, or a driver that
is not registered; any other failure fails the operation.

```php
await (Operation $Operation): Operation
```

Advances the operation through the pool that owns it until it finishes, and returns it. Throws a
`RuntimeException` with `$Operation->error` when it fails, and refuses an operation parked in
`pending`. Blocks the process; see
**[Await synchronously](/manual/ADI/Database/Pool/overview/#await-synchronously)**.

```php
advance (Operation $Operation): Operation
```

Moves the operation through the pool that owns it as far as its socket allows — dial, TLS,
authentication, write, read — and returns it, without waiting. It does not throw for a failed
operation: read its `error`.

```php
cancel (Operation $Operation): Operation
```

Asks the server, through the pool that owns the operation, to stop it, and returns it; the
operation still resolves, fails or expires on its own. The request goes out only for the statement
its session is executing: an operation that has not reached the server yet is failed locally at
once, and one the server has but is not running yet is returned untouched and runs to completion
(see [Cancel or withdraw](#cancel-or-withdraw)). See
**[Cancel a running statement](/manual/ADI/Database/Pool/overview/#cancel-a-running-statement)**.

```php
touch (null|object $Scope = null): void
```

Marks `$Scope` — by default the current Fiber, else the facade — as having written now, so its
reads stay on the primary for `routing.sticky` seconds.

```php
table (BackedEnum|Stringable|Builder|Query $Table, null|BackedEnum|Stringable $Alias = null): Builder
```

Starts a Query Builder with the facade's dialect, on a table or on a derived source — a builder
or a compiled query, which needs an `$Alias`; without one, it throws `InvalidArgumentException`.

```php
structure (): Schema
```

Returns the facade's Schema Builder, created on the first call.

```php
begin (): Transaction
```

Starts a transaction on the primary pool. Its `BEGIN` is assigned at once, in
`$Transaction->Operation`. Throws `InvalidArgumentException` when no SQL driver is registered under
`driver`.

```php
map (string $Entity, null|object $Scope = null, null|Awaiting $Awaiting = null): Repository
```

Creates an ORM repository for the `$Entity` class, running its operations through the facade.
`$Scope` is the read-after-write scope of those operations; `$Awaiting` is the await bridge eager
and lazy relations need, none by default. Throws `InvalidArgumentException` when the class has no
valid mapping, and `ReflectionException` when it does not exist.

```php
withdraw (Operation ...$Operations): void
```

Inherited from `Database`: withdraws operations locally, sending nothing to the server. See the
**[DBAL core](/manual/ADI/Database/overview/#database)** Reference.

```php
public Config $SQLConfig
```

The facade's `SQL\Config` — the same object as `$Config`, typed with the SQL keys. Configure
through the constructor; **[Properties](/manual/ADI/Database/Config/overview/#properties)** says
what a later assignment reaches.

```php
public private(set) Dialect $Dialect
```

The Query Builder dialect for `driver`, shared by `table()`, `structure()`, `map()` and the
facade's transactions.

```php
public private(set) Models $Models
```

The cache of compiled entity metadata, shared by the repositories of the facade and of its
transactions.

```php
public protected(set) bool $pipelining = true
```

`true`: the facade accepts a new operation while others are pending. A `Transaction` reports
`false`, and repositories read it to decide whether a page's total count can go out with the page.

```php
public array $ReplicaPools
```

One `Pool` per entry of `replicas`, in order (`array<int,Pool>`). Read a replica's health through
it — `healthy`, `failures` (see **[Replica health](/manual/ADI/Database/Pool/overview/#replica-health)**)
— but do not write it: the constructor builds it.

### SQL configuration

`Bootgly\ADI\Databases\SQL\Config` extends `Bootgly\ADI\Database\Config` with the SQL keys; what it
inherits is in the **[Database configuration](/manual/ADI/Database/Config/overview/#reference)**
Reference.

```php
__construct (array $config = [])
```

Builds the connection config, then reads `migrations`, `statements`, `routing` and `parameters`,
gives each replica its `statements` and `parameters`, and narrows the pool of a SQLite `:memory:` or
empty-name database — primary or replica — to one connection. Throws `InvalidArgumentException` for
a `parameters` map, on the primary or on a replica, that fails the
[Session parameters](#session-parameters) checks, including a map on a driver other than `pgsql`
and a startup message over `STARTUP_LIMIT`, and for a NUL byte in `username` or `database`, which
every SQL driver frames as a NUL-terminated string.

```php
public const string DEFAULT_MIGRATIONS = '_bootgly_migrations';
```

The default `migrations`.

```php
public const int DEFAULT_STATEMENTS = 256;
```

The default `statements`.

```php
public const float DEFAULT_ROUTING_STICKY = 5.0;
```

The default `routing.sticky`, in seconds.

```php
public const array RESERVED_PARAMETERS = [
   'database',
   'options',
   'replication',
   'user',
];
```

The names `parameters` refuses, in any letter case: the startup message sends `user` and `database`
from the connection config, and `options` and `replication` would change what the session is.

```php
public const array PINNED_PARAMETERS = [
   'client_encoding' => 'UTF8',
   'DateStyle' => 'ISO',
   'standard_conforming_strings' => 'on',
];
```

The settings the PostgreSQL driver sends in every startup message, in this order: the encoding,
date text and literal quoting it reads and writes. Each is a name PgBouncer tracks by default.

```php
public const array FIXED_PARAMETERS = [
   'client_encoding' => 'the encoding every value is read and written in',
   'DateStyle' => 'the date and time text its decoder reads',
   'standard_conforming_strings' => 'the literal quoting its Schema writes',
];
```

The names `parameters` refuses, in any letter case, each with the reason its refusal gives: every
pinned name. `extra_float_digits` is not among them: `parameters` admits it with the value `1`, `2`
or `3` and refuses any other, since 0 or less rounds the float text.

```php
public const int STARTUP_LIMIT = 10000;
```

The largest PostgreSQL startup message, in bytes after its 4-byte length word: the server's
`MAX_STARTUP_PACKET_LENGTH`. The server drops a longer message without an answer, so the config
refuses an endpoint whose message would exceed it.

```php
public string $migrations
```

The table that records applied migrations.

```php
public int $statements
```

The prepared-statement cache size of each connection; `0` turns the cache off.

```php
public array $routing
```

`array{sticky: float}`: the read-after-write window, in seconds; `0.0` turns it off.

```php
public private(set) array $parameters
```

`array<string, string>`: the session parameters sent at connection start, in their given order and
spelling, an integer value already in its decimal form. Read-only: only the constructor sets it, so
every entry has passed the [Session parameters](#session-parameters) checks.
