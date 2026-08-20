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

`created` is the pool's own count, and every connection it holds — idle, busy or reserved by a
transaction — is one it counts. A connection the pool has dropped stays dropped even if a
driver reconnects the same object on its own: it is not handed out again and it is not a
pipelining target, because work on it would never count against `max`. And an operation the
pool has parked leaves the queue the moment it is finished, so nothing can promote and
re-dispatch work a caller already cancelled.

Cancelling is a decision, not a message. The withdrawal is recorded the moment you ask for it,
before the driver is consulted at all — so it holds whether the driver sends the request,
refuses because the protocol has nothing to send it on, refuses because it does not support
cancellation, or fails outright while trying. Automatic failover to a replica pool will not
revive a withdrawn operation afterwards. That is separate from whether the cancel reached the
server, which is what decides whether the connection still has an answer to reconcile.

That queue belongs to the async path, where something else keeps advancing the operations that
hold the connections. `Pool::wait()` — what `SQL::await()` calls — is the synchronous API:
while it blocks, nothing advances those operations, and only they can free a slot. So a
saturated `await()` refuses the operation with
`Database pool has no capacity for the operation.` and takes it out of `pending`, instead of
waiting for capacity that cannot arrive. Leaving it queued was worse than refusing it: the
caller was told its write had failed and compensated with a rollback, and `promote()` then put
the command on the wire anyway once capacity freed — outside the transaction, in autocommit.

A connection goes back to the pool only once nothing is owed on its socket. While the driver
still has an operation waiting for a reply, the connection stays `busy` — handing it out would
give one caller's rows to another. "Owed" means an operation that has not finished: a failed
or expired one owes its caller nothing, even though the driver keeps its slot in the FIFO a
little longer to absorb the message that terminates it. Backends do not always answer in one
TCP read, so a query refused with a syntax error can leave a finished entry parked there; the
pool no longer reads that as work in flight, which used to cost the slot permanently — and
transactions, which never share a connection, were then refused capacity that existed.

A socket that can no longer deliver is dropped rather than held, whatever the driver still has
queued on it: it owes an answer it can never bring, and everything that frees the slot happens
after that check.

Transactions pin one connection with `lock` and release it with `unlock` after commit or
rollback. The reservation is freed by the operation that carries `unlock`, even when the driver
still has a co-located sibling to finish — the intent lives on that operation, so deferring it
would lose it and park the connection as reserved forever.

An operation pinned to a connection the pool can no longer provide — a server restart, a
load-balancer recycle, a dropped socket — fails immediately instead of waiting in `pending`. No
amount of capacity can satisfy a pin, so queueing it would keep it there for good while every
promotion pass reconsidered it.

When an operation's `timeout` elapses, the pool finishes it and asks its driver to
reconcile the wire (`Driver::abandon()`) before releasing the connection. The server is
usually still answering the command it was given: a driver that has a co-located sibling
left to read the socket drains the abandoned answer and keeps the connection; with nobody
left to read it, the connection is dropped instead. Either way the slot comes back to the
pool, and the timed-out operation is never revived by its own late answer.

A cancellation that never reaches the server takes the same route: `cancel()` is advisory,
so when its side channel cannot be established the operation is finished locally while the
server keeps answering the original command, and the pool reconciles that wire before
taking the connection back.

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
