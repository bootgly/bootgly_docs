# SQLite driver

`Bootgly\ADI\Databases\SQL\Drivers\SQLite` runs SQL on file or in-memory databases through
the `sqlite3` PHP extension — no server, no credentials, zero setup. It powers quick
prototypes and real end-to-end tests for the Query Builder, Schema and ORM.

> Requires `ext-sqlite3` (`sudo apt install php8.4-sqlite3`). Without the extension, every
> operation fails with `SQLite driver requires the sqlite3 extension.`

## Zero-setup database

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL(['driver' => 'sqlite', 'database' => ':memory:']);

$Database->await($Database->query('CREATE TABLE fruits (id INTEGER PRIMARY KEY, name TEXT)'));
$Database->await($Database->query("INSERT INTO fruits (name) VALUES ('apple'), ('grape')"));

$Select = $Database->await($Database->query('SELECT id, name FROM fruits ORDER BY id'));
$Select->Result->rows;  // [['id' => 1, 'name' => 'apple'], ['id' => 2, 'name' => 'grape']]
```

The driver is synchronous: an operation that gets the connection runs its statement inside
`query()`, so `await()` returns at once. Await it anyway — it throws a `RuntimeException` when the
statement failed (see **[Read the outcome](/manual/ADI/Databases/SQL/overview/#read-the-outcome)**),
and it refuses an operation still parked behind a transaction (see [Pool sizing](#pool-sizing)).

For a persistent database, point `database` at a file path:

```php
$File = new SQL(['driver' => 'sqlite', 'database' => '/var/data/app.db']);
```

Building the facade opens nothing: the first operation opens the file, and creates it when it is
missing. A relative path resolves against the process's current working directory, and so does
the default — leave `database` out and the driver opens a file named `bootgly` in that directory.
A path that cannot be opened fails the operation with
`Unable to open database: unable to open database file`.

Of the connection keys, the driver reads only `driver`, `database`, `timeout`, `pool` and
`statements` (see **[SQLite](/manual/ADI/Database/Config/overview/#sqlite)** in the configuration
page). Its `timeout` is no deadline for a statement that gets the connection — a slow one runs to
completion — but how long that statement waits for a locked database file. The exception is an
operation parked behind a transaction: it keeps its deadline — see
**[Timeout](/manual/ADI/Database/Config/overview/#timeout)** and [Pool sizing](#pool-sizing).

## Parameters

The SQLite dialect emits `?N` positional placeholders. A list binds `?N` — and a bare `?` — by
position, and named parameters bind `:name` placeholders, with or without the `:` prefix:

```php
$Database->await($Database->query('SELECT name FROM fruits WHERE id = ?1', [1]));
$Database->await($Database->query('SELECT id FROM fruits WHERE name = :name', ['name' => 'apple']));
```

`@name` and `$name` placeholders cannot be bound by name: write them as `:name`.

A named parameter must match a placeholder in the statement. One that matches none — a
typo, or a placeholder renamed without updating the caller — fails the operation instead
of being dropped:

```php
$Insert = $Database->query('INSERT INTO fruits (name) VALUES (:name)', ['nmae' => 'apple']);

$Insert->error;
// SQLite cannot bind the parameter "nmae": the statement has no matching placeholder.
```

Nothing is written. Without that check the placeholder would keep its default — `NULL` —
so the row would be stored with the column blanked while the operation reported success.

Values bind by their PHP type: `int` → INTEGER, `float` → REAL, `null` → NULL, `bool` → INTEGER
`0`/`1`, `string` → TEXT. A `DateTimeInterface` binds as TEXT in `Y-m-d H:i:s.u` — its wall-clock
time without the offset, so convert it to the time zone you store first. An array or any other
object — a `BackedEnum`, a `Stringable` — fails the operation with
`SQLite cannot bind the parameter "status".`, naming its key, or its position counted from `0`; pass
the enum's `value` instead. SQLite has no boolean column type — booleans come back as `0`/`1`
integers. What each column type reads back as is on
**[Type mapping](/manual/ADI/Databases/SQL/Drivers/Types/overview/)**.

> [!WARNING]
> Two binding gaps currently report success. A placeholder the parameters leave out is written as
> `NULL`: `INSERT INTO fruits (id, name) VALUES (:id, :name)` with only `id` stores the row without
> its name, and `error` stays `null` — pass a value for every placeholder. And a string that holds a
> NUL byte is stored whole as TEXT but reads back cut at the first one: `"sess\0alice"` and
> `"sess\0bob"` both come back as `sess`. Write binary data through `CAST(?1 AS BLOB)` — a `BLOB`
> reads back whole — and read a value already stored as text with `CAST(column AS BLOB)`.

## Foreign keys

SQLite ships with foreign keys **off** per connection; the driver turns them on
(`PRAGMA foreign_keys = ON`) on every handle it opens, so `REFERENCES` constraints
emitted by the Schema behave like PostgreSQL/MySQL — an orphan child insert fails with
`Unable to execute statement: FOREIGN KEY constraint failed`, code `787`.

## Generated keys

```php
$Insert = $Database->await($Database->query("INSERT INTO fruits (name) VALUES ('fig')"));
$Insert->Result->inserted; // 3, the row id of the new row
```

`inserted` is the row id of the last row the statement inserted: the last one of a multi-row
`INSERT`, and the key itself only in a table keyed by an `INTEGER PRIMARY KEY` — a table keyed by
`TEXT` reports its hidden row id.

> **RETURNING is blocked** — the `sqlite3` extension executes statements with a
> `RETURNING` clause twice (an internal step + reset runs before the fetch), which
> would silently duplicate the write. The driver fails such statements fast with
> `SQLite RETURNING is not supported: the sqlite3 extension executes the statement twice, duplicating the write. Read generated ids from Result->inserted.`,
> and the SQLite dialect keeps the Builder `output()` capability disabled — the ORM
> backfills generated keys from `Result->inserted` automatically, like on MySQL.

## Affected rows and status

`affected` comes from `SQLite3::changes()`: the rows the statement inserted, updated or deleted.
`status` imitates PostgreSQL's command tag — `SELECT 2`, `INSERT 0 1`, `UPDATE 2` — and is the bare
keyword for anything else (`CREATE`, `PRAGMA`, `WITH`). How that compares with PostgreSQL and MySQL
is in **[Result differences](/manual/ADI/Databases/SQL/Drivers/overview/#result-differences)**.

> [!WARNING]
> The driver currently picks what to read from the statement's first word. A write that starts
> with `WITH`, or behind a leading `--` or `/* */` comment, applies its changes and reports
> `affected` `0`, `inserted` `0` and the `status` `WITH` or an empty one; a `WITH` … `SELECT`
> returns its rows with the `status` `WITH`. And an `INSERT` that inserts nothing —
> `INSERT OR IGNORE`, `ON CONFLICT DO NOTHING`, an `INSERT … SELECT` that selects no row — or an
> upsert that updates instead reports in `inserted` the row id of the last row the connection
> inserted, in any table. Start writes with their verb, and fetch the row of an upsert by its unique
> key.

## Transactions and migrations

Transactions, savepoints, migrations and seeders work unchanged — SQLite even runs DDL
transactionally, so each migration is wrapped in `BEGIN`/`COMMIT`:

```php
$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Database->await($Transaction->query('INSERT INTO fruits (name) VALUES (?1)', ['plum']));
$Database->await($Transaction->commit());
```

> [!NOTE]
> A `COMMIT` refused with `database is locked` — another connection holds a read lock, outside
> WAL — or on a `DEFERRABLE INITIALLY DEFERRED` foreign key is **rolled back** by the driver.
> SQLite alone would keep the transaction open for a second `COMMIT`, but the `Transaction` has
> already ended (`rollback()` is refused with `SQL transaction is not active.`), so the driver ends
> it before the connection serves anyone else. The error is the engine's own message, which does
> not say so: treat a failed `commit()` as a rolled-back transaction and retry the whole
> transaction, never just the `COMMIT`. Under WAL, readers never hold up a `COMMIT`.

## Pool sizing

`:memory:` — and the empty database name — hold **one connection**, and the configuration
enforces it: a `pool.max` above `1` is reduced to `1`. A pool configured to open nothing
(`pool.max = 0`) is left as configured. **A file database keeps the pool you gave it.**

The two are not the same kind of database:

- `:memory:` is private to the handle that opens it, and each pooled connection opens its
  **own** `SQLite3` handle — so a second connection is a second, empty database, and a row
  written through one is invisible to the other with nothing ever reporting an error;
- a file is one database whichever handle opens it. The handles do contend for its lock: a
  write issued while another handle holds a write transaction waits up to `timeout` and then
  fails with `Unable to execute statement: database is locked` (code `5`): retry the statement
  — or, for a refused `COMMIT`, the whole transaction. `timeout` `0` fails it at once.

Plan for one consequence of a pool of one — while a transaction holds the connection, every
other `query()` on that facade parks in `pending`, and awaiting it fails with
`Database pool has no capacity for the operation.` Run it through the transaction, or issue
it before `begin()` or after the teardown. One you do not await runs when the transaction ends —
unless its deadline passed first: it then fails with
`Database operation timed out after 30 seconds.` (the default `timeout`) and never runs.

To let other processes read a file database while one writes, apply WAL mode once:

```php
$Database->await($Database->query('PRAGMA journal_mode=WAL'));
```

Under WAL, a transaction reads from a snapshot taken at its first read. If another connection
commits after that, the transaction's first write fails at once — whatever the `timeout` — with the
same `database is locked` message and code `517`: retrying the statement cannot help, so roll back
and retry the whole transaction.

## Cancellation

There is nothing to interrupt. An operation that got the connection has finished when `query()`
returns, so `cancel()` only marks it `revoked` and keeps its result:

```php
$Select = $Database->query('SELECT name FROM fruits WHERE id = ?1', [1]);

$Database->cancel($Select);

$Select->revoked;     // true
$Select->Result->row; // ['name' => 'apple']
```

An operation parked in `pending` behind a transaction is failed with
`Database operation has no protocol to cancel.` The driver's own `cancel()`, which the facade
never reaches for a finished operation, fails with `Database driver does not support cancellation.`
— the `sqlite3` extension has no interrupt. See
**[Cancel a running statement](/manual/ADI/Database/Pool/overview/#cancel-a-running-statement)**.

## Reference

```php
query (string $sql, array $parameters = []): Operation
```

Creates and synchronously executes one operation. The `Result` carries `rows`, `columns`,
`affected` (from `SQLite3::changes()`), `inserted` (from `SQLite3::lastInsertRowID()`) and
a PostgreSQL-style status tag (`SELECT 2`, `INSERT 0 1`, ...) — see
[Affected rows and status](#affected-rows-and-status).

```php
prepare (Operation $Operation): Operation
```

Opens the database handle on first use and executes the operation — parameterized SQL runs
through a per-connection `SQLite3Stmt` cache (capped by the `statements` config key, LRU
eviction). `statements => 0` disables caching: each statement closes right after its
command completes.

A statement the engine rejected — a UNIQUE or FOREIGN KEY violation — stays in the cache and is
reused. Only the operation that earned the error fails with it; the next operation on the same SQL
runs normally, whatever its parameters. A rejected row therefore never costs the row after it. A
statement refused with `database is locked` stays in the cache too, reset and ready to run again:
the refusal ends with the statement, and a retry reads the database as it is now.

```php
advance (Operation $Operation): Operation
```

No-op after the synchronous execution; re-runs operations promoted from the pool pending
queue.

```php
cancel (Operation $Operation): Operation
```

Inherited from `Driver`: fails the operation with
`Database driver does not support cancellation.` The connection Pool contract is satisfied
through a placeholder stream — no wire socket exists.
