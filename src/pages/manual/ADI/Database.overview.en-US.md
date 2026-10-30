# DBAL core

`Bootgly\ADI\Database` is the low-level core of Bootgly's database layer. It is
transport-agnostic: it owns the connection config, a connection, the pool and the pending
operations, while paradigm facades add the verbs — `Bootgly\ADI\Databases\SQL` adds `query()`,
`table()` and `begin()`, `Bootgly\ADI\Databases\KV` adds `command()`. `query()` and `command()` are
asynchronous: each returns a pending `Operation` at once, and the operation is advanced until it
holds a `Result` or an `error` (on SQLite, an operation that gets the connection runs inside
`query()` — see [Run an operation](#run-an-operation)). `table()` returns a query `Builder`, and
`begin()` a `Transaction` whose `BEGIN` is such an operation (`$Transaction->Operation`).

## Layers

- `Database` — the abstract core every facade extends: it builds the config, the first connection
  and the pools, and withdraws operations nobody waits for (`withdraw()`).
- `Databases` — the paradigm registry and factory. Only `sql` is registered:
  `create('sql', [...])` builds a `SQL`, and `create('kv')` throws
  `Database paradigm is not registered: kv.` — build the key-value facade with `new KV([...])`.
- `Databases\SQL` — the SQL facade: normalizes raw SQL, builders and compiled `Query` objects into
  SQL operations, and routes reads to read replicas.
- `Databases\KV` — the key-value facade: one `command()` verb, served by the Redis driver.
- `Config` — host, port, credentials, timeout, TLS, pool and replica settings — see
  **[Configuration](/manual/ADI/Database/Config/overview/)**.
- `Connection` — the non-blocking stream and its protocol state.
- `Pool` / `Pools` — the per-endpoint connection pool, with `idle` and `busy` connections and a
  `pending` queue, and the registry of a facade's pools — see
  **[Connection pool](/manual/ADI/Database/Pool/overview/)**.
- `Operation` / `Result` — pending work, then its rows, columns, command tag, affected count and
  last generated id (`inserted`) — see [Operation](#operation) and [Result](#result).
- `Driver` / `Drivers` — wire protocol implementations and their registry per paradigm:
  PostgreSQL, MySQL/MariaDB and SQLite for SQL, Redis for KV.

## Run an operation

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

$Operation = $Database->query('SELECT $1::int AS value', [42]);
$Operation->state->value; // operation.queued

try {
   $Database->await($Operation);

   $Operation->Result->cell; // 42
}
catch (RuntimeException $Exception) {
   echo "Query failed: {$Operation->error}\n";
}
```

`query()` creates an `Operation` and assigns it to the pool at once. The pool chooses an idle
connection, opens a new one while it has room, lets the operation share a busy one, or parks it in
`pending`; the driver bound to the connection prepares the protocol bytes, and nothing is sent
yet — the operation is `Queued`. Each `advance()` then moves it forward — dial, TLS,
authentication, write, read — until it resolves with a `Result` or fails with an `error`.
`await()` advances it until it finishes, and throws a `RuntimeException` carrying
`$Operation->error` when it fails: see
[Await synchronously](/manual/ADI/Database/Pool/overview/#await-synchronously) for that contract
and for the cases where the pool refuses to wait. SQLite is synchronous when an operation gets the
connection: the statement runs inside `query()`, which returns the operation already finished. One
that finds no free connection — the single connection of a `:memory:` database held by a
transaction, for instance — parks in `pending` like any other (see
[Pool sizing](/manual/ADI/Databases/SQL/Drivers/SQLite/overview/#pool-sizing)).

Inside a project, open the database from the project's `database` config scope instead of an
array — `new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure())`, see
**[Database DBAL](/guide/database-dbal/overview/)** — and in HTTP routes, prefer WPI
**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)** and
`$Response->Database` instead of calling `Pool->wait()` or `advance()` manually.

### Failures

```php
$Operation = $Database->query('SELECT * FROM missing_table');

try {
   $Database->await($Operation);
}
catch (RuntimeException $Exception) {
   $Operation->state->value; // operation.failed
   $Operation->Result;       // null
   $Operation->code;         // 42P01
}
```

A failed operation is `finished`, its state is `Failed`, its `Result` stays `null` and `error`
holds the message. A SQL operation also carries `code`: the driver's machine-readable failure
identity — PostgreSQL SQLSTATE, MySQL errno or SQLite extended result code — paired with `error`
and cleared on `retry()`. It is `null` when the failure carries none, such as a framework refusal or
a transport loss, and key-value operations have no `code` at all. Each SQL failure is announced once
through `SQL\Events::Failed` — see **[Events](/guide/events/overview/)**.

| Driver | `error` | `code` |
| --- | --- | --- |
| PostgreSQL | `relation "missing_table" does not exist` | `42P01` |
| MySQL | `1146: Table 'app.missing_table' doesn't exist` | `1146` |
| SQLite | `Unable to prepare statement: no such table: missing_table` | `1` |

A connection that cannot be opened fails the operation with an `error` naming the endpoint and the
cause — `MySQL connection failed: 127.0.0.1:3306 refused the connection (ECONNREFUSED).` (the
PostgreSQL and Redis drivers use the same wording). The cause is read from the socket when
`ext-sockets` is loaded; without it the message lists the four usual ones:

| Cause | Text after `<Driver> connection failed: ` |
| --- | --- |
| Refused | `<host>:<port> refused the connection (ECONNREFUSED).` |
| Reset | `<host>:<port> reset the connection (ECONNRESET).` |
| No route to the host | `<host>:<port> is unreachable: no route to host (EHOSTUNREACH).` |
| Network unreachable | `<host>:<port> is unreachable: network is unreachable (ENETUNREACH).` |
| Timed out | `the connection to <host>:<port> timed out (ETIMEDOUT).` |
| Any other errno | `the connection to <host>:<port> failed (errno <n>).` |
| Without `ext-sockets` | `the connection to <host>:<port> failed: refused, unreachable, reset or timed out.` |

A dial that is only slow — its first SYN dropped and retransmitted — is waited on, never reported
as refused: `timeout` bounds the wait, and with no `timeout` the kernel's own limit ends it as
`timed out (ETIMEDOUT)`. A dial that fails before it starts, such as a host name that does not
resolve, carries PHP's own stream error instead, so its text varies by platform — on Linux:
`Database connection failed: php_network_getaddresses: getaddrinfo for db.invalid failed: Name or service not known`.

A MySQL or PostgreSQL server that accepts the TCP connection and hangs up before sending a single
byte is named too:
`MySQL connection failed: 127.0.0.1:3306 closed the connection before sending its greeting; the server may still be starting.`
(PostgreSQL says `during SSL negotiation` or `during startup`). That is what a published Docker
port does while the database inside the container is still initializing: wait until the server
reports ready, then start again. A server that hangs up after it has answered keeps the plain
transport message (`socket closed`, `socket read failed`).

The pool adds its own failures — no capacity, deadlines, cancellation, withdrawal — listed in
[Pool errors](/manual/ADI/Database/Pool/overview/#errors).

## Operation

`Bootgly\ADI\Database\Operation` is the pending work every facade returns.

| Field | Type | Meaning |
| --- | --- | --- |
| `state` | `OperationStates` | Where the operation is — see [Operation states](#operation-states). |
| `finished` | `bool` | `true` once it resolved or failed. Read-only. |
| `Result` | `null\|Result` | Its outcome; `null` until it resolves, and on failure. Read-only. |
| `error` | `null\|string` | The failure message; `null` unless it failed. Read-only. |
| `parameters` | `array` | The bound parameters. |
| `timeout` | `float` | Seconds it was given — the `timeout` of the pool it was created for, kept when a failed replica read is re-run on the primary; `0.0` or less means no deadline. |
| `deadline` | `float` | The `microtime(true)` timestamp at which it expires; `0.0` when it has none. Read-only. |
| `Pool` | `null\|Pool` | The pool that owns it now. |
| `FallbackPool` | `null\|Pool` | Where a failed read is re-run: the primary pool, for a read routed to a replica. |
| `Connection` | `null\|Connection` | The connection it was handed, or pinned to inside a transaction. |
| `cancelled` | `bool` | A cancel request reached the wire (`CancelRequest`, `KILL QUERY`). |
| `revoked` | `bool` | The caller gave it up — `cancel()` or `withdraw()` — even when nothing was sent; no fallback re-runs it. |
| `fallback` | `bool` | It was re-run on its fallback pool. |
| `quarantine` | `bool` | Set by the driver on a connection-level failure, which counts against a replica pool's health — see [Replica health](/manual/ADI/Database/Pool/overview/#replica-health). |

The remaining fields belong to the pool and the drivers: `Protocol` (the driver bound to the
operation), `Readiness` (the socket and direction to wait on next), `lock` / `unlock` (the
transaction reservation of its connection) and `Waker` (a completion hook for a parked awaiter).

A SQL operation (`Bootgly\ADI\Databases\SQL\Operation`) adds `SQL` — the statement text — and
`code`, plus `status`, `rows`, `columns` and `affected`, which the driver fills while it reads and
which match the `Result` once the operation resolves; it has no `inserted`, which only the `Result`
carries. Its static `$slow` sets the slow-query threshold in seconds (`0.0`, the default, disables
the check) — see **[Events](/guide/events/overview/)**. `statement`, `portal`, `prepared`, `write`,
`types` and `parameterTypes` are the driver's protocol state. A key-value operation
(`Bootgly\ADI\Databases\KV\Operation`) carries `command` and `arguments`, and the decoded reply in
`response`.

### Operation states

`Bootgly\ADI\Database\Operation\OperationStates` is a string-backed enum; its values are prefixed
so logs never confuse them with connection states.

| Case | Value | Meaning |
| --- | --- | --- |
| `Pending` | `operation.pending` | Not on a connection: just created, parked in the pool's `pending` queue, or reset by `retry()`. |
| `Queued` | `operation.queued` | Handed a connection; its command is composed but nothing has been written. |
| `Connecting` | `operation.connecting` | Dialing its connection. |
| `Startup` | `operation.startup` | Exchanging the startup handshake — PostgreSQL's startup message, MySQL's greeting. |
| `SSLRequest` | `operation.ssl_request` | Asking the server for TLS. |
| `SSLResponse` | `operation.ssl_response` | Waiting for PostgreSQL's answer to that request. |
| `SSLHandshake` | `operation.ssl_handshake` | Running the TLS handshake. |
| `Authenticating` | `operation.authenticating` | Reading the server's authentication messages. |
| `Password` | `operation.password` | Sending a password or an authentication response. |
| `Querying` | `operation.querying` | Writing its command; a large batch is written in parts. |
| `Reading` | `operation.reading` | Its batch is whole on the wire; reading the answer. |
| `Finished` | `operation.finished` | Resolved with a `Result`. |
| `Failed` | `operation.failed` | Failed with an `error`. |

## Result

```php
$Database->await($Database->query('CREATE TABLE items (id serial PRIMARY KEY, name text)'));

$Insert = $Database->await($Database->query("INSERT INTO items (name) VALUES ('a'), ('b')"));
$Insert->Result->status;   // INSERT 0 2
$Insert->Result->affected; // 2

$Select = $Database->await($Database->query('SELECT id, name FROM items ORDER BY id'));
$Select->Result->columns;  // ['id', 'name']
$Select->Result->count;    // 2
$Select->Result->cell;     // 1
```

`Bootgly\ADI\Database\Operation\Result` holds what the server answered. Its fields are filled by
the driver; four views read the rows for you.

| Field | Type | Meaning |
| --- | --- | --- |
| `status` | `string` | The command tag. |
| `rows` | `array<int,array<string,mixed>>` | Every decoded row, keyed by column name. |
| `columns` | `array<int,string>` | The column names, in result order — even when no row matched; `[]` for a statement that returns no result set, such as DDL or an `INSERT` without `RETURNING`. |
| `affected` | `int` | The rows the statement changed. |
| `inserted` | `int\|string` | The id the server generated for an `INSERT`; `0` when unavailable. |
| `row` | `array<string,mixed>` | View: the first row, or `[]`. |
| `cell` | `mixed` | View: the first cell of the first row, or `null`. |
| `count` | `int` | View: the number of rows. |
| `empty` | `bool` | View: whether no rows were returned. |

The drivers fill the same fields a little differently:

- `status` — PostgreSQL returns the server's own tag (`SELECT 2`, `INSERT 0 2`, `UPDATE 1`,
  `CREATE TABLE`, `SHOW`). MySQL and SQLite build one in that format: `INSERT 0 <affected>`,
  `UPDATE <affected>`, `DELETE <affected>` and `REPLACE <affected>` from the statement's first
  keyword, and the bare keyword for anything else (`CREATE`). MySQL reports `SELECT <rows>` for
  every statement that returns rows (`SHOW TABLES` too); SQLite only for one that starts with
  `SELECT`, so a `WITH` or `PRAGMA` reports its bare keyword even when it returns rows.
- `affected` — PostgreSQL takes it from the tag, so a `SELECT` reports the rows it returned; MySQL
  and SQLite report `0` for a `SELECT`.
- `inserted` — PostgreSQL always reports `0`: read generated keys with `RETURNING`. MySQL reports
  the first id an `INSERT` generated (on a multi-row `INSERT`, the first row's), and SQLite the last
  row id. An id past `PHP_INT_MAX` — a MySQL `BIGINT UNSIGNED` key past 2^63 — arrives as an exact
  decimal string, since no PHP int is wide enough (see
  **[SQL Drivers](/manual/ADI/Databases/SQL/Drivers/overview/#keys-wider-than-a-php-int)**).
- A key-value result carries only `status`, set to the command name; the reply itself is the
  operation's `response`.

## Native drivers

Three native wire drivers execute SQL operations — see
**[SQL Drivers](/manual/ADI/Databases/SQL/Drivers/overview/)** for the capability matrix:

- **PostgreSQL** — Protocol 3.0 with TLS, cleartext/MD5/SCRAM authentication, extended query flow,
  prepared statement cache, pipelining and CancelRequest.
- **MySQL/MariaDB** — handshake v10 with TLS, `mysql_native_password` and `caching_sha2_password`
  (full auth via TLS or pinned RSA key), binary prepared statements and `KILL QUERY`.
- **SQLite** — synchronous driver over `ext-sqlite3` for file and `:memory:` databases.

PostgreSQL `numeric` and MySQL `DECIMAL` values come back as strings, so their precision is
preserved. SQLite has no decimal type: a `DECIMAL` column reads back as a PHP number, rounded to a
float's precision when it does not fit an integer.

The key-value facade runs on the native Redis driver, which speaks RESP over the same
non-blocking pool.

## Reference

### Database

`Bootgly\ADI\Database` — the abstract core of `SQL` and `KV`.

```php
__construct (array|Config $config = [], string $drivers = Drivers::class)
```

Builds the core from an ADI-native config array or a `Config`, then the first `Connection`, the
`Pools` and the primary `Pool` for `Config->driver`. `$drivers` is the paradigm's `Drivers`
registry; each facade passes its own.

```php
withdraw (Operation ...$Operations): void
```

Withdraws operations locally because their caller stopped waiting — nothing is sent to the server
(see [Withdrawn operations](/manual/ADI/Database/Pool/overview/#withdrawn-operations)). Parked
operations go first, then the ones that are not reading yet, then the pipelined readers, each
through its own pool. Every operation is attempted; the first failure is rethrown once all of them
ran. Since 1.0.5.

```php
public Config $Config
```

The connection config.

```php
public Pool $Pool
```

The pool of the configured endpoint; read replicas have their own (`SQL->ReplicaPools`).

```php
public Pools $Pools
```

The pools registered by driver name.

```php
public Connection $Connection
```

The first connection, which the primary pool dials first.

```php
public string $drivers
```

The paradigm's `Drivers` class (`class-string<Drivers>`).

### Operation

`Bootgly\ADI\Database\Operation`. Facades create operations; pools and drivers call the methods
below.

```php
__construct (null|Connection $Connection, array $parameters = [], float $timeout = 0.0)
```

Creates a pending operation. A positive `$timeout` fixes its `deadline` now; `0.0` gives it none.

```php
await (Readiness $Readiness): self
```

Records what the operation waits on next: a socket, a direction and a deadline.

```php
resolve (Result $Result): self
```

Finishes the operation with a `Result` (state `Finished`) and wakes a parked awaiter.

```php
fail (string $error): self
```

Finishes the operation with an `error` (state `Failed`) and wakes a parked awaiter.

```php
retry (null|Connection $Connection = null): self
```

Rearms the operation for another attempt: back to `Pending` on `$Connection` (none by default),
with a fresh deadline from its own `timeout` and with its `Pool`, driver, readiness, `Result`,
`error`, `finished`, `cancelled` and `quarantine` reset. It keeps `revoked` — another attempt does
not undo a withdrawal — and `fallback`. A SQL operation also clears `code` and the protocol state
its driver filled.

```php
expire (): bool
```

Fails the operation with `Database operation timed out after <timeout> seconds.` once its deadline
has passed, and returns `true`; returns `false` when it is finished, has no deadline, or still has
time.

### SQL operations

`Bootgly\ADI\Databases\SQL\Operation` extends `Operation`.

```php
__construct (null|Connection $Connection, string $sql, array $parameters = [], float $timeout = 0.0)
```

Creates a pending SQL operation for `$sql`, stored in `SQL`.

```php
fail (string $error, null|string $code = null): self
```

Fails the operation with an `error` and the driver's `code`, then announces `Events::Failed` —
once, even when a later failure replaces the message.

```php
public static float $slow
```

Slow-query threshold in seconds: an operation that resolves after at least this long emits
`Events::Slow`. `0.0`, the default, disables the check.

### Result

`Bootgly\ADI\Database\Operation\Result`.

```php
__construct (string $status = '', array $rows = [], array $columns = [], int $affected = 0, int|string $inserted = 0)
```

Creates a result. Drivers build it when an operation resolves; every argument maps to the field of
the same name.

```php
public array $row { get; }
```

The first row, or `[]` when there is none.

```php
public mixed $cell { get; }
```

The first cell of the first row, or `null` when there is none.

```php
public int $count { get; }
```

The number of rows.

```php
public bool $empty { get; }
```

`true` when no rows were returned.
