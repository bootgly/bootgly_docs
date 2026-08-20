# SQLite driver

`Bootgly\ADI\Databases\SQL\Drivers\SQLite` runs SQL on file or in-memory databases through
the `sqlite3` PHP extension — no server, no credentials, zero setup. It powers quick
prototypes and real end-to-end tests for the Query Builder, Schema and ORM.

> Requires `ext-sqlite3` (`sudo apt install php8.4-sqlite3`). Without the extension,
> operations fail gracefully with a clear message.

## Zero-setup database

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL(['driver' => 'sqlite', 'database' => ':memory:']);

$Database->query('CREATE TABLE fruits (id INTEGER PRIMARY KEY, name TEXT)');
$Database->query("INSERT INTO fruits (name) VALUES ('apple'), ('grape')");

$Select = $Database->query('SELECT id, name FROM fruits ORDER BY id');
$Select->Result->rows;  // [['id' => 1, 'name' => 'apple'], ['id' => 2, 'name' => 'grape']]
```

The driver is synchronous: every operation resolves before `query()` returns — no
`await()` is required (calling it is harmless).

For a persistent database, point `database` at a file path:

```php
$Database = new SQL(['driver' => 'sqlite', 'database' => '/var/data/app.db']);
```

## Parameters

The SQLite dialect emits `?N` positional placeholders. Named parameters bind with or
without the `:` prefix:

```php
$Database->query('SELECT name FROM fruits WHERE id = ?1', [1]);
$Database->query('SELECT id FROM fruits WHERE name = :name', ['name' => 'apple']);
```

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

Types map natively: `int` → INTEGER, `float` → REAL, `null` → NULL, `bool` → INTEGER
`0/1`, `DateTimeInterface` → TEXT (`Y-m-d H:i:s.u`), everything else → TEXT. SQLite has
no boolean column type — booleans come back as `0`/`1` integers.

## Foreign keys

SQLite ships with foreign keys **off** per connection; the driver turns them on
(`PRAGMA foreign_keys = ON`) on every handle it opens, so `REFERENCES` constraints
emitted by the Schema behave like PostgreSQL/MySQL — an orphan child insert fails with
`FOREIGN KEY constraint failed`.

## Generated keys

```php
$Insert = $Database->query("INSERT INTO fruits (name) VALUES ('fig')");
$Insert->Result->inserted; // last generated row id
```

> **RETURNING is blocked** — the `sqlite3` extension executes statements with a
> `RETURNING` clause twice (an internal step + reset runs before the fetch), which
> would silently duplicate the write. The driver fails such statements fast, and
> the SQLite dialect keeps the Builder `output()` capability disabled — the ORM
> backfills generated keys from `Result->inserted` automatically, like on MySQL.

## Transactions and migrations

Transactions, savepoints, migrations and seeders work unchanged — SQLite even runs DDL
transactionally, so each migration is wrapped in `BEGIN`/`COMMIT`:

```php
$Transaction = $Database->begin();
$Transaction->query('INSERT INTO fruits (name) VALUES (?1)', ['plum']);
$Transaction->commit();
```

## Pool sizing

A SQLite pool holds **one connection**, and the configuration enforces it: a `pool.max`
above `1` is reduced to `1`, on `:memory:` and on file databases alike. A pool configured
to open nothing (`pool.max = 0`) is left as configured.

A pooled connection is not a second route to the same database:

- each connection opens its **own** `SQLite3` handle — with `:memory:` that is an
  independent, empty database, so a row written through one handle is invisible to the
  other and nothing ever errors;
- file databases do share the file, but the handles contend for its lock: a write issued
  while another handle holds a transaction waits out the whole `busyTimeout` (your
  configured `timeout`) and then fails with `database is locked`.

Plan for one consequence — while a transaction holds the connection, every other query is
refused with `Database pool has no capacity for the operation.` Run it through the
transaction, or issue it before `begin()` or after the teardown.

To let other processes read a file database while one writes, apply WAL mode once:

```php
$Database->query('PRAGMA journal_mode=WAL');
```

## Reference

```php
query (string $sql, array $parameters = []): Operation
```

Creates and synchronously executes one operation. The `Result` carries `rows`, `columns`,
`affected` (from `SQLite3::changes()`), `inserted` (from `SQLite3::lastInsertRowID()`) and
a PostgreSQL-style status tag (`SELECT 2`, `INSERT 0 1`, ...).

```php
prepare (Operation $Operation): Operation
```

Opens the database handle on first use and executes the operation — parameterized SQL runs
through a per-connection `SQLite3Stmt` cache (capped by the `statements` config key, LRU
eviction). `statements => 0` disables caching: each statement closes right after its
command completes.

A statement the engine rejected — a UNIQUE or FOREIGN KEY violation, a busy database — stays
in the cache and is reused. Only the operation that earned the error fails with it; the next
operation on the same SQL runs normally, whatever its parameters. A rejected row therefore
never costs the row after it.

```php
advance (Operation $Operation): Operation
```

No-op after the synchronous execution; re-runs operations promoted from the pool pending
queue.

Cancellation is not supported (`cancel()` fails): the `sqlite3` extension has no
cross-handle interrupt. The connection Pool contract is satisfied through a placeholder
stream — no wire socket exists.
