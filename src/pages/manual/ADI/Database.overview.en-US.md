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
- `Operation` / `Result` - pending work plus rows, columns, affected count and result views.
- `Driver` / `Drivers` - protocol implementations; PostgreSQL is the current native driver.

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

## PostgreSQL driver

The SQL PostgreSQL driver implements Protocol 3.0 with TLS negotiation, cleartext/MD5/SCRAM
authentication, simple and extended query flows, prepared statement cache, CancelRequest,
server metadata messages and scalar type conversion. Numeric precision is preserved as a
string.

## Result views

`Result` exposes direct data plus convenience views:

- `rows` - every decoded row.
- `row` - first row or an empty array.
- `cell` - first cell of the first row or `null`.
- `count` - row count.
- `empty` - whether no rows were returned.
