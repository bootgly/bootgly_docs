# Database DBAL

`Bootgly\ADI\Database` is the low-level DBAL core. It is transport-agnostic: it owns
configuration, a connection holder, pools and pending operations, while concrete paradigms
such as `Bootgly\ADI\Databases\SQL` add verbs like `query()`, `table()` and `begin()`.

## Layers

- `Database` - shared core for config, connection and pool wiring.
- `Databases` - registry/factory for paradigms such as `sql`.
- `Databases\SQL` - SQL facade that normalizes raw SQL, builders and compiled `Query`
  objects into SQL operations.
- `Config` - host, port, credentials, timeout, TLS and pool settings.
- `Connection` - non-blocking stream and protocol state holder.
- `Pool` / `Pools` - reusable per-driver connection pools with idle, busy and pending
  queues.
- `Operation` / `Result` - pending work plus rows, columns, affected count, last generated
  id (`inserted`) and result views.
- `Driver` / `Drivers` - protocol implementations; PostgreSQL, MySQL/MariaDB and SQLite are
  the native drivers.

## Operation lifecycle

```php
$Operation = $Database->query('SELECT $1::int AS value', [42]);
$Database->Pool->wait($Operation);

$rows = $Operation->Result?->rows ?? [];
```

`query()` creates an `Operation` and assigns it to the pool. The pool chooses or opens a
connection, binds the driver, lets the driver prepare protocol bytes, then advances until the
operation resolves with `Result` or fails with `error`.

In HTTP routes, prefer WPI
**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)** and
`$Response->Database` instead of calling `Pool->wait()` or `advance()` manually.

## Pool behavior

The pool tracks `idle`, `busy`, `pending` and `created` connections. When all connections are
busy and `created >= max`, new operations wait in `pending`. When a connection is released,
the pool promotes pending operations.

Transactions pin one connection with `lock` and release it with `unlock` after commit or
rollback.

## Native drivers

Three native wire drivers execute SQL operations — see
**[SQL Drivers](/manual/ADI/Databases/SQL/Drivers/overview/)** for the capability matrix:

- **PostgreSQL** — Protocol 3.0 with TLS, cleartext/MD5/SCRAM authentication, extended
  query flow, prepared statement cache, pipelining and CancelRequest.
- **MySQL/MariaDB** — handshake v10 with TLS, `mysql_native_password` and
  `caching_sha2_password` (full auth via TLS or pinned RSA key), binary prepared statements and `KILL QUERY`.
- **SQLite** — synchronous driver over `ext-sqlite3` for file and `:memory:` databases.

Numeric/decimal precision is preserved as a string on every driver.

## Result views

`Result` exposes direct data plus convenience views:

- `rows` - every decoded row.
- `row` - first row or an empty array.
- `cell` - first cell of the first row or `null`.
- `count` - row count.
- `empty` - whether no rows were returned.
