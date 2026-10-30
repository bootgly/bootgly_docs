# Database configuration

`Bootgly\ADI\Database\Config` is the connection config every database facade reads: the driver,
the endpoint and credentials, the operation `timeout`, the pool size and TLS (`secure`). You rarely
build it yourself. Pass an array to a facade — `new SQL([...])` turns it into
`Bootgly\ADI\Databases\SQL\Config`, the subclass that adds the SQL-only keys — or build it from your
project's `database` config scope. Every key is optional, and a key you leave out takes its
default. Building the config validates it but opens nothing: the first operation dials the
connection.

## Connect

### PostgreSQL

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
   'timeout' => 10.0,
]);

$Operation = $Database->await($Database->query('SELECT current_database() AS name'));
$Operation->Result->cell; // 'app'
```

`await()` drives the operation to completion and returns it. When the operation fails, it throws a
`RuntimeException` carrying the operation's `error`.

### MySQL

The defaults target PostgreSQL whatever `driver` says, so a MySQL array sets its own `port` and
`username`:

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'mysql',
   'host' => '127.0.0.1',
   'port' => 3306,
   'database' => 'app',
   'username' => 'root',
   'password' => 'secret',
]);

$Operation = $Database->await($Database->query('SELECT DATABASE() AS name'));
$Operation->Result->cell; // 'app'
```

Leave `port` and `username` out and the same array dials `127.0.0.1:5432` as `postgres`. With
nothing listening there, the operation fails with
`MySQL connection failed: 127.0.0.1:5432 refused the connection (ECONNREFUSED).`; with a PostgreSQL
server there, it waits for a MySQL greeting that never comes until `timeout` elapses.

### SQLite

```php
use Bootgly\ADI\Databases\SQL;

$File = new SQL(['driver' => 'sqlite', 'database' => '/var/data/app.db']);
$Memory = new SQL(['driver' => 'sqlite', 'database' => ':memory:']);
```

SQLite reads `driver`, `database`, `timeout` and `pool` (plus the SQL key `statements`) and ignores
`host`, `port`, `username`, `password` and `secure`. The constructor still validates `secure`, so an
invalid block throws here too. Leave `database` out and the driver opens a file named `bootgly` in
the current working directory, creating it if needed. `:memory:` and the empty name are private to
the handle that opens them, so their pool is narrowed to one connection (see
**[Pool sizing](/manual/ADI/Databases/SQL/Drivers/SQLite/overview/#pool-sizing)**).

### From the project config

In a project — its boot function, a command, or a script running inside it — build the config from
the `database` config scope:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\API\Environment\Configs\DatabaseConfig;

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
```

`configure()` reads the connection block that `Default` (bound to `DB_CONNECTION`) selects and
returns a ready `SQL\Config`; **[Configure the database](/guide/database-dbal/overview/#configure-the-database)**
shows how to write the scope. The line needs that scope. In a project without a `configs/`
directory, `BOOTGLY_PROJECT->Configs` is `null` and the call fails with
`Call to a member function get() on null`; without `configs/database/database.Config.php`,
`get('database')` returns `null` and `DatabaseConfig` rejects it with a `TypeError`. In
`HTTP_Server_CLI` routes, do not build `SQL` yourself: use the per-worker `$Response->Database`
**[Response Resource](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**.

The guide's **[How the scope becomes a connection](/guide/database-dbal/overview/#how-the-scope-becomes-a-connection)**
maps every scope node to its config key, including the nodes the adapter does not read for now
(`Secure->Name`, and a replica's `Driver` alias).

## Keys and defaults

| Key | Default | Read by |
|---|---|---|
| `driver` | `'pgsql'` | Every facade: it selects the driver, and for `SQL` the dialect too ([Driver names](#driver-names)) |
| `host` | `'127.0.0.1'` | PostgreSQL, MySQL, Redis |
| `port` | `5432` | PostgreSQL, MySQL, Redis |
| `database` | `'bootgly'` | PostgreSQL and MySQL (database name), SQLite (file path or `:memory:`), Redis (`SELECT` index, only when it is all digits and not `0`) |
| `username` | `'postgres'` | PostgreSQL, MySQL |
| `password` | `''` | PostgreSQL, MySQL, Redis (`AUTH`) |
| `timeout` | `30.0` | PostgreSQL, MySQL, Redis: each operation's deadline; SQLite: the busy timeout; in seconds ([Timeout](#timeout)) |
| `pool.min` | `0` | Stored only ([Pool size](#pool-size)) |
| `pool.max` | `8` | Every pool ([Pool size](#pool-size)) |
| `secure.mode` | `'prefer'` | PostgreSQL, MySQL, Redis ([TLS](#tls)) |
| `secure.verify` | Derived from `mode` | The TLS handshake: check the certificate chain |
| `secure.name` | Follows `verify` | The TLS handshake: check the certificate name against `peer` |
| `secure.peer` | The `host` | The TLS handshake: expected certificate name, sent as SNI |
| `secure.cafile` | `''` | The TLS handshake: CA bundle (`''` = OpenSSL's default trust store) |
| `secure.key` | `''` | MySQL only: the pinned server RSA public key |

> [!WARNING]
> The defaults are a local PostgreSQL's, whatever `driver` says. A MySQL array without `port` and
> `username` dials `127.0.0.1:5432` as `postgres`, a SQLite array without `database` opens a file
> named `bootgly`, and a KV array without `driver` is a `pgsql` config.

Each value is cast to its key's type, so `'3306'` becomes `3306` — and a non-numeric string becomes
`0`, which for `timeout` means no deadline at all (on SQLite, no busy wait). A value that is not a
scalar, such as an array, falls back to the default without an error, and so does `null`; a `pool`
or `secure` that is not an array takes the default block. The exceptions are `secure.verify` and
`secure.name`: a value there that is not a scalar throws (see [TLS](#tls)), and only `null` takes
the default.

`new SQL()` also takes the SQL keys, which `Bootgly\ADI\Databases\SQL\Config` adds; how each one
is read, and what a replica inherits, is in
**[SQL config keys](/manual/ADI/Databases/SQL/overview/#config-keys)**:

| Key | Default | Read by |
|---|---|---|
| `statements` | `256` | Every SQL driver: how many prepared statements each connection caches; `0` turns the cache off |
| `migrations` | `'_bootgly_migrations'` | The migration runner: the table that records applied migrations |
| `routing.sticky` | `5.0` | Read routing: how many seconds the reads of a scope stay on the primary after it writes |
| `replicas` | `[]` | Read routing: the read replicas, each opened as a pool of its own |

The KV facade (Redis) reads this same class, with the same defaults, so a KV array always sets
`driver` to `'redis'` and its `port`; see
**[Async Redis on the event loop](/guide/cache/overview/#async-redis-on-the-event-loop)**.

To see what a config resolved to — after environment overrides, for example — read it back from the
facade:

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL(['driver' => 'mysql', 'port' => 3306, 'username' => 'root']);

$Database->Config->host;     // '127.0.0.1'
$Database->Config->database; // 'bootgly'
$Database->Config->secure;   // ['mode' => 'prefer', 'verify' => false, 'name' => false, 'peer' => '127.0.0.1', 'cafile' => '', 'key' => '']
```

On `SQL`, `$Database->SQLConfig` is the same object, typed `SQL\Config`.

## Driver names

An array config takes the names the facade registers its drivers under: `pgsql`, `mysql` and
`sqlite` for `SQL`, `redis` for `KV`. The aliases `postgres`, `postgresql`, `mariadb` and `sqlite3`
are understood only by the project config adapter, which normalizes them
([From the project config](#from-the-project-config)). In an array they fail, at one of two moments:

- `postgres`, `postgresql`, `mysqli` and `sqlite3` are known to the Query Builder's dialect
  registry, so `new SQL()` succeeds; the first `query()` then throws `InvalidArgumentException`
  with `Database driver is not registered: postgres.`
- Any other name, `mariadb` included, makes `new SQL()` throw `InvalidArgumentException` with
  `SQL builder dialect is not registered: mariadb`

The same registry error reaches a KV array that leaves `driver` out: its first `command()` throws
`Database driver is not registered: pgsql.` A replica's `driver` gets no dialect check at all: any
name `SQL` does not register, `mariadb` included, passes `new SQL()` and makes the first read routed
to that replica throw `Database driver is not registered: mariadb.`

## Timeout

On PostgreSQL, MySQL and Redis, `timeout` is each operation's deadline, in seconds:

```php
use RuntimeException;

use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   // ... connection keys
   'timeout' => 2.5,
]);

try {
   $Database->await($Database->query('SELECT pg_sleep(5)'));
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // 'Database operation timed out after 2.5 seconds.'
}
```

- The deadline is fixed when `query()` creates the operation, so it covers everything the operation
  waits for: a free connection in the pool, the dial, TLS, authentication and the reply. An
  operation created with a `1.0` timeout and awaited two seconds later fails at once.
- `0`, or a negative value, means no deadline.
- An expired operation fails with `Database operation timed out after N seconds.`, where `N` is the
  configured value as PHP prints it (`30`, `2.5`); `await()` rethrows that `error` as a
  `RuntimeException`.
- There is no per-query override: an operation takes the `timeout` of the pool `query()` routes it
  to, so a read routed to a replica takes the replica's.
- A read that fails on a replica is retried once on the primary with a fresh deadline of its own
  `timeout` — the replica's, not the primary's — so it can take up to twice that value in total,
  and a short replica `timeout` meant to fail over fast also caps the retry.
- No cancel request goes to the server: a statement it already received keeps running after its
  operation timed out, so pair `timeout` with a server-side limit such as PostgreSQL's
  `statement_timeout` (see **[Connection pool](/manual/ADI/Database/Pool/overview/)**).
- The same value bounds the blocking connect that `cancel()` opens for its side channel on
  PostgreSQL and MySQL. With `timeout` `0` that connect gets no time at all: it still succeeds
  against a server on the same machine, which completes the handshake at once, but against a
  server across the network `cancel()` fails the operation at once while the statement keeps
  running there. A negative value removes the limit and leaves the operating system's connect
  timeout in charge.
- SQLite is synchronous: an operation that gets the connection runs its statement inside `query()`,
  so `timeout` sets no deadline on it — a slow statement runs to completion, and an operation
  awaited late still succeeds. There `timeout` is only the busy timeout: a statement that finds the
  database file locked waits up to `timeout`, then fails with a `database is locked` error (code
  `5`); `0` or a negative value turns the wait off, so it fails at once. An operation that finds the
  single connection held — by a transaction on a `:memory:` database, for example — parks in
  `pending` like any other, and its deadline runs there.
- Host names are resolved synchronously when a connection opens, so a slow DNS answer blocks the
  worker for as long as it takes; `timeout` does not cut it short.

## Pool size

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   // ... connection keys
   'pool' => ['max' => 2],
]);

$Operations = [];
foreach ([1, 2, 3, 4, 5] as $n) {
   $Operations[] = $Database->query('SELECT $1::int AS n', [$n]);
}
foreach ($Operations as $Operation) {
   $Database->await($Operation);
}

$Database->Pool->created; // 2
```

Five operations shared two connections. Past `pool.max` the pool dials nothing more. An operation
joins a busy connection that is ready — PostgreSQL pipelines it, MySQL queues it behind the
statement running there — and one that finds none ready, or cannot share one, such as a `BEGIN`,
parks in `pending` until a release promotes it. The pool above starts cold: the first two
operations are still dialing when the other three arrive, so those three park, and awaiting in
creation order lets each release promote the next (see
**[Connection pool](/manual/ADI/Database/Pool/overview/)**).

- `pool.max` (default `8`) caps the connections of one pool. Every facade instance owns its pool —
  under `HTTP_Server_CLI`, one per worker — and every read replica has a pool of its own, with the
  primary's `pool.max` unless the replica sets one. A server therefore sees about workers ×
  `pool.max` sessions on the primary, and workers × the replica's `pool.max` on each replica. That
  is not a hard ceiling: a MySQL `cancel()` opens one more, short-lived session for its
  `KILL QUERY`, and a session the pool dropped — after a timeout or a withdrawal — can keep running
  its statement on the server once the pool no longer counts it (see
  **[Lingering slots](/manual/ADI/Database/Pool/overview/#lingering-slots)**).
- A synchronous `await()` cannot wait for a release, since nothing else runs to make one: awaiting
  an operation still parked in `pending` — the fifth one above, awaited first — fails it with
  `Database pool has no capacity for the operation.` With `pool.max` `0`, every operation gets that
  answer.
- `pool.min` (default `0`) is accepted and kept in `Pool->min`, but nothing acts on it for now: no
  connection is opened ahead of time, and each one is dialed by the first operation that needs it.
- SQLite `:memory:` and the empty name narrow `pool.max` to `1` (a larger `pool.min` drops to `1`
  too); a file database keeps the pool you give it.

## TLS

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'mysql',
   'host' => '10.0.0.12',
   'port' => 3306,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
   'secure' => [
      'mode' => 'verify-full',
      'cafile' => '/etc/app/db-ca.pem',
      'peer' => 'db.internal',
   ],
]);
```

`verify-full` checks the certificate chain against `cafile` and the certificate's name against
`peer`. The host here is an IP address the certificate does not name, so `peer` gives the name it
carries; that name is also sent as SNI.

`mode` decides whether the connection is encrypted and sets the two checks: `verify` (the
certificate chain) and `name` (the certificate's name against `peer`):

| `mode` | Encryption | `verify` | `name` |
|---|---|---|---|
| `disable` | Never | Always `false` | Always `false` |
| `prefer` (default) | TLS when the server accepts it, plaintext when it refuses | `false` unless set | Follows `verify` unless set |
| `require` | TLS, or the operation fails | `false` unless set | Follows `verify` unless set |
| `verify-ca` | TLS, or the operation fails | Always `true` | Always `false` |
| `verify-full` | TLS, or the operation fails | Always `true` | Always `true` |

"Always" means the mode overrides what you set. Under `prefer` and `require` you opt in:
`'verify' => true` adds the chain check — and the name check with it, since `name` follows `verify`
— and `'name' => false` then drops the name check again. `prefer` and `require` encrypt without
checking who answers, which defeats passive eavesdropping only: on a network you do not trust, use
`verify-ca`, `verify-full` or `'verify' => true`. What counts as a refusal under `prefer`, and what
each driver does after one, is on the
**[PostgreSQL](/manual/ADI/Databases/SQL/Drivers/PostgreSQL/overview/#authentication-and-tls)** and
**[MySQL](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/#tls)** driver pages and, for Redis, in
**[Async Redis on the event loop](/guide/cache/overview/#async-redis-on-the-event-loop)**.

> [!NOTE]
> Since 1.0.3, `prefer` and `require` no longer verify the certificate by default. Before, every mode
> but `disable` did.

- `mode` takes one of the five names exactly, in lowercase. Any other scalar throws
  `InvalidArgumentException` with `Unsupported database TLS mode: verify_full.`; a value that is not
  a scalar falls back to `prefer`.
- `verify` and `name` take a boolean or a boolean-like scalar: `1`/`0`, `'true'`/`'false'`,
  `'on'`/`'off'` and `'yes'`/`'no'`, in any case, with surrounding spaces trimmed. Anything else —
  an empty or blank string, `'maybe'`, `2`, an array — throws
  ``Database TLS `verify` must be a boolean.`` (``Database TLS `name` must be a boolean.`` for
  `name`), whatever the `mode`.
- `peer` is the name checked against the certificate when `name` is on, and the name sent as SNI.
  Empty, it is the `host`. No SNI is sent when `peer` is an IP address. For now, a bracketed IPv6
  host such as `[::1]` passes into `peer` with its brackets and is sent as SNI, so set
  `'peer' => '::1'` for TLS to an IPv6 literal.
- `cafile` is a PEM bundle of the CAs to trust; empty, OpenSSL's default trust store applies
  (`openssl.cafile`, `SSL_CERT_FILE`/`SSL_CERT_DIR`). Only a verifying handshake reads it, so a
  `cafile` with `verify` resolved to `false` under `prefer` or `require` throws at construction:
  ``Database TLS cafile requires certificate verification: use mode `verify-ca` or `verify-full`, or set `verify` to true.``
  Under `disable` it is accepted and ignored. A `cafile` that is not a readable file fails the
  operation before anything is sent: `Database TLS cafile is not a readable file: /etc/app/db-ca.pem.`
- `key` is read by MySQL only: the server's RSA public key, as inline PEM or a file path, for
  `caching_sha2_password` full authentication over plaintext (see
  **[Authentication](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/#authentication)**).

Each read replica resolves its own `secure` block by the same rules. A replica that sets `mode`
derives `verify` and `name` from it; one that sets neither `mode` nor `verify` inherits the primary's
resolved flags; its `peer` defaults to its own `host`, never to the primary's `peer`. An error in a
replica's block names it, as in
``Database TLS `verify` must be a boolean (replica replica-1.db.local).`` See
**[Database read replicas](/guide/database-read-replicas/overview/#configure-replicas)**.

## Errors

| Message | Raised by | Cause |
|---|---|---|
| `Unsupported database TLS mode: verify_full.` | Construction; `DatabaseConfig::configure()` | `secure.mode` is not one of the five modes |
| ``Database TLS `verify` must be a boolean.`` | Construction | `secure.verify` is not boolean-like |
| ``Database TLS `name` must be a boolean.`` | Construction | `secure.name` is not boolean-like |
| ``Database TLS cafile requires certificate verification: use mode `verify-ca` or `verify-full`, or set `verify` to true.`` | Construction | A `cafile` under `prefer` or `require` without `verify` |
| `SQL builder dialect is not registered: mariadb` | `new SQL()` | `driver` is not a SQL driver name or a known dialect alias |
| `Database driver is not registered: postgres.` | `query()`, or `command()` on KV | `driver` is a dialect alias, a replica's `driver` is not a registered name, or a KV array has no `driver` |
| `Database TLS cafile is not a readable file: /etc/app/db-ca.pem.` | The operation's `error` | The `cafile` path is missing, unreadable or not a file |
| `Database connection failed: php_network_getaddresses: getaddrinfo for db.invalid failed: Name or service not known` | The operation's `error` | The `host` does not resolve |
| `Database operation timed out after 2.5 seconds.` | The operation's `error` | The `timeout` elapsed |
| `Database pool has no capacity for the operation.` | `await()` | The awaited operation is still parked in `pending` |

Construction means `new Config()` and every facade that builds one from an array, such as
`new SQL([...])` or `new KV([...])`; its errors are `InvalidArgumentException`s, and the `verify`,
`name` and `cafile` ones name a replica as `(replica <host>)` before the final period. An
operation's `error` is rethrown by `await()` as a `RuntimeException`. `Database connection failed:`
carries PHP's own stream error, so its text varies; it is also what an IPv6 literal without
brackets (write `[::1]`) or a Unix socket path produces, since connections are TCP only. A dial
that resolves but fails names the endpoint instead, as in
`PostgreSQL connection failed: 127.0.0.1:5432 refused the connection (ECONNREFUSED).` (see
**[DBAL core](/manual/ADI/Database/overview/)**).

`DatabaseConfig` adds its own `InvalidArgumentException`s, listed in the guide's
**[When DatabaseConfig throws](/guide/database-dbal/overview/#when-databaseconfig-throws)**.

## Reference

`Bootgly\ADI\Databases\SQL\Config` extends this class with the SQL keys; its constructor, its
constants `DEFAULT_STATEMENTS`, `DEFAULT_MIGRATIONS` and `DEFAULT_ROUTING_STICKY`, and its
properties are in the **[SQL database](/manual/ADI/Databases/SQL/overview/#sql-configuration)**
Reference.

### Constructor

```php
__construct (array $config = [])
```

Builds the config from an ADI-native array. Each key is read and cast to its type, and a missing or
non-scalar value takes its default — except in `secure.verify` and `secure.name`, where a
non-scalar value throws. The `secure` block is resolved by the [TLS](#tls) rules
and validated, and `replicas` is normalized into complete endpoints. Throws
`InvalidArgumentException` for an unsupported `secure.mode`, a `verify` or `name` that is not
boolean-like, or a `cafile` without verification, on the primary or on a replica. It opens no
connection.

### Constants

The connection defaults are a local PostgreSQL's, whatever the `driver`.

```php
public const string DEFAULT_DRIVER = 'pgsql';
```

The default `driver`.

```php
public const string DEFAULT_HOST = '127.0.0.1';
```

The default `host`.

```php
public const int DEFAULT_PORT = 5432;
```

The default `port`, PostgreSQL's.

```php
public const string DEFAULT_DATABASE = 'bootgly';
```

The default `database`; for SQLite, a file named `bootgly` in the current working directory.

```php
public const string DEFAULT_USERNAME = 'postgres';
```

The default `username`.

```php
public const string DEFAULT_PASSWORD = '';
```

The default `password`: none.

```php
public const float DEFAULT_TIMEOUT = 30.0;
```

The default `timeout`, in seconds.

```php
public const int DEFAULT_POOL_MIN = 0;
```

The default `pool.min`.

```php
public const int DEFAULT_POOL_MAX = 8;
```

The default `pool.max`.

```php
public const string SECURE_DISABLE = 'disable';
```

The `disable` TLS mode: never encrypt.

```php
public const string SECURE_PREFER = 'prefer';
```

The `prefer` TLS mode: TLS when the server accepts it, plaintext when it refuses.

```php
public const string SECURE_REQUIRE = 'require';
```

The `require` TLS mode: TLS, or the operation fails.

```php
public const string SECURE_VERIFY_CA = 'verify-ca';
```

The `verify-ca` TLS mode: TLS, or the operation fails, with the certificate chain checked.

```php
public const string SECURE_VERIFY_FULL = 'verify-full';
```

The `verify-full` TLS mode: TLS, or the operation fails, with the certificate chain and name
checked.

```php
public const array SECURE_MODES = [
   self::SECURE_DISABLE,
   self::SECURE_PREFER,
   self::SECURE_REQUIRE,
   self::SECURE_VERIFY_CA,
   self::SECURE_VERIFY_FULL,
];
```

Every value `secure.mode` accepts.

```php
public const string DEFAULT_SECURE_MODE = self::SECURE_PREFER;
```

The default `secure.mode`.

```php
public const string DEFAULT_SECURE_PEER = '';
```

The default `secure.peer`: empty, which resolves to the `host`.

```php
public const string DEFAULT_SECURE_CAFILE = '';
```

The default `secure.cafile`: empty, which leaves OpenSSL's default trust store in charge.

```php
public const string DEFAULT_SECURE_KEY = '';
```

The default `secure.key`: no pinned server key.

### Properties

The properties are public, but configure through the constructor. Assigning one afterwards skips
its validation, and it reaches only part of the stack: the pool copied `pool` into `Pool->min` and
`Pool->max` when it was built, while each new operation reads `timeout` again.

```php
public string $driver;
```

The registry name of the driver: `pgsql`, `mysql` or `sqlite` for `SQL`, `redis` for `KV`.

```php
public string $host;
```

The server's host name or IP address. Connections are TCP only; write an IPv6 literal in brackets
(`[::1]`).

```php
public int $port;
```

The server's TCP port.

```php
public string $database;
```

The database name; for SQLite, a file path or `:memory:`; for Redis, a numeric `SELECT` index.

```php
public string $username;
```

The user to authenticate as.

```php
public string $password;
```

The password; empty sends none to Redis.

```php
public float $timeout;
```

On PostgreSQL, MySQL and Redis, each operation's deadline in seconds; `0` or less disables it. On
SQLite, only the busy timeout. Also the connect timeout of the PostgreSQL and MySQL cancel side
channels, where `0` gives the connect no time to wait and a negative value no limit (see
[Timeout](#timeout)).

```php
public array $secure;
```

The resolved TLS settings, `array{mode: string, verify: bool, name: bool, peer: string, cafile:
string, key: string}`: `verify` and `name` already reflect the mode, and an empty `peer` has been
replaced by the `host`.

```php
public array $pool;
```

The pool size, `array{min: int, max: int}`. `min` is not acted on for now.

```php
public array $replicas;
```

The read replica endpoints, each a complete array with `driver`, `host`, `port`, `database`,
`username`, `password`, `timeout`, `secure` and `pool`. A key the replica omits comes from the
primary — its `secure` flags only when the replica sets neither `mode` nor `verify`, its `cafile`
only when the replica verifies — except `secure.peer`, which defaults to the replica's own host. An
entry without a `host` is dropped. Only the SQL facade opens them; see
**[Database read replicas](/guide/database-read-replicas/overview/)**.
