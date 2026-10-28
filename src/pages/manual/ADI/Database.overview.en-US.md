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

A failed `Operation->code` carries the driver's machine-readable failure identity — PostgreSQL
SQLSTATE, MySQL errno or SQLite extended result code — paired with `error` and cleared on
`retry()`. It is `null` when the failure carries none, such as a framework refusal or a
transport loss. Each failure is announced once through `SQL\Events::Failed` — see
**[Events](/guide/events/overview/)**.

A connection that cannot be opened fails the operation with an `error` naming the endpoint and
the cause — `MySQL connection failed: 127.0.0.1:3306 refused the connection (ECONNREFUSED).`
(the PostgreSQL and Redis drivers use the same wording). The cause is read from the socket when
`ext-sockets` is loaded — refused, unreachable, reset or timed out; without it the message lists
those four. A dial that is only slow — its first SYN dropped and retransmitted — is waited on,
never reported as refused: `timeout` bounds the wait, and with no `timeout` the kernel's own
limit ends it as `timed out (ETIMEDOUT)`.

A MySQL or PostgreSQL server that accepts the TCP connection and hangs up before sending a single
byte is named too: `MySQL connection failed: 127.0.0.1:3306 closed the connection before sending
its greeting; the server may still be starting.` (PostgreSQL says `during SSL negotiation` or
`during startup`). That is what a published Docker port does while the database inside the
container is still initializing: wait until the server reports ready, then start again. A server
that hangs up after it has answered keeps the plain transport message (`socket closed`,
`socket read failed`).

In HTTP routes, prefer WPI
**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)** and
`$Response->Database` instead of calling `Pool->wait()` or `advance()` manually.

## Pool behavior

The pool tracks `idle`, `busy`, `pending` and `created` connections. It is exhausted when no idle
connection is available and `created` plus the slots still held for withdrawn SQL statements
whose session had to be dropped (each until its deadline — see
[Withdrawn operations](#withdrawn-operations)) reaches `max`. Past that point a new operation
joins a ready busy connection that no transaction holds and that owes no session reset (see
[Withdrawn operations](#withdrawn-operations)); a `BEGIN`, or an operation with no such connection
to join, waits in `pending`. When a connection is released, the pool promotes pending operations.

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

Whether anything is *sent* depends on where the operation actually is. A cancel request names a
backend, not a statement, so one sent for work that is not running would reach whatever else
that backend is doing. An operation that already finished, and one still composed but never
written, are therefore withdrawn locally and nothing goes on the wire. The two differ in what
the caller is left holding: a finished operation keeps its state and its result, while one that
never reached the server is failed, since its work did not happen. Only an operation genuinely
in flight produces a request.

If the local socket has been closed while that request goes out, the operation is failed
straight away rather than waiting for an answer that can no longer arrive, so its slot returns
to the pool. A peer that goes away without the local socket noticing is not detectable here —
that connection is discovered by the next operation to use it.

That queue belongs to the async path, where something else keeps advancing the operations that
hold the connections. `Pool::wait()` — what `SQL::await()` calls — is the synchronous API:
while it blocks, nothing advances those operations, and only they can free a slot. So a
saturated `await()` refuses the operation with
`Database pool has no capacity for the operation.` and takes it out of `pending`, instead of
waiting for capacity that cannot arrive. Leaving it queued was worse than refusing it: the
caller was told its write had failed and compensated with a rollback, and `promote()` then put
the command on the wire anyway once capacity freed — outside the transaction, in autocommit.

A no-restart signal can interrupt the `stream_select()` used by synchronous `wait()`. EINTR
does not change the operation or its readiness, so the pool recognizes the syscall's errno
even when the operating-system message is localized and retries with the same operation.
Other select failures still propagate, and the operation's configured timeout can still
expire it normally; an interrupted wait is not converted into a database result.

A connection goes back to the pool only once nothing is owed on its socket. While the driver
still has an operation waiting for a reply, the connection stays `busy` — handing it out would
give one caller's rows to another. "Owed" means an operation that has not finished: a failed
or expired one owes its caller nothing, even though the driver keeps its slot in the FIFO a
little longer to absorb the message that terminates it. Backends do not always answer in one
TCP read, so a query refused with a syntax error can leave a finished entry parked there; the
pool no longer reads that as work in flight, which used to cost the slot permanently — and
transactions, which never share a connection, were then refused capacity that existed.

A connection goes back to `idle` as soon as the driver owes no live work. The pool also keeps, per
connection, the operations it handed to it that have not settled yet — one still composed, or parked
behind another caller's write, is invisible to the driver — but weighs that claim only when an
exclusive operation acquires. A `BEGIN` is never handed an idle connection that an unflushed
co-located operation still claims: that statement would run inside its transaction. It takes another
idle connection, dials a new one while capacity allows, or waits in `pending`. The claim never holds
a connection out of `idle`, and it counts only while its operation is unfinished, so an operation its
caller dropped never pins a connection. A detached stand-in (see
[Withdrawn operations](#withdrawn-operations)) is not live work either: nobody waits for it, so a
connection whose only pending work is a stand-in goes back to `idle`.

A socket that can no longer deliver is dropped rather than held, whatever the driver still has
queued on it: it owes an answer it can never bring, and everything that frees the slot happens
after that check.

Transactions pin one connection with `lock` and release it with `unlock` after commit or
rollback. The reservation is freed by the operation that carries `unlock`, even when the driver
still has a co-located sibling to finish — the intent lives on that operation, so deferring it
would lose it and park the connection as reserved forever.

One case takes the connection with it: a commit or rollback the pool retires *before it reaches
the server*, whether you cancelled it or its own deadline elapsed. That statement ended nothing,
and by then nobody can — the transaction gave up its depth and its connection the moment the
statement was composed. Handing that connection on would run the next caller's work inside an
open transaction it never asked for, and keeping it reserved would lose the slot for good while
the session stayed open anyway. So the connection is dropped: the server rolls the transaction
back, which is what a commit that never ran means, and the slot returns to the pool.

Ending a session also retires the driver that owned it. A statement composed on that session but
never written is in neither the driver's queue nor its write buffer, so the teardown cannot see it
and it outlives the session holding a driver whose socket is gone. Advancing one afterwards fails
it — `PostgreSQL connection was torn down before the query was sent.`, or the MySQL wording — and
its buffered command is discarded, rather than being written to whatever connection the pool has
rebuilt in the meantime. A reservation left over from that session is inert for the same reason.

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

### Withdrawn operations

When the caller simply stops waiting — a deferred response whose wait was refused or
interrupted, or whose Fiber was destroyed — the local counterpart of `cancel()` is
`withdraw()`, and nothing is sent to the server. `Pool::withdraw()` fails one unfinished
operation with `Database operation was withdrawn: its caller stopped waiting.`, marks it
`revoked` so no fallback pool re-dispatches it, lets the driver reconcile the wire
(`Driver::detach()`) and takes the slot back; a connection still connecting or authenticating is
discarded. An operation that already finished keeps its result, is marked `revoked` and is only
forgotten. It is synchronous and never suspends, so it is safe in the `finally` of a Fiber being
destroyed. `Database::withdraw()` — on the SQL and KV facades — takes several operations in a safe
order (parked ones first, then those not reading yet, then the pipelined readers), attempts every
one and rethrows the first failure.

A withdrawal does not stop a statement the server already received, and it no longer costs the
session. When the operation's batch is whole on the wire (state `Reading`), the driver keeps the
session and **detaches** the operation (`Driver::detach()`): the remaining answer is absorbed by a
stand-in nobody waits for, the connection goes back to `idle` at once — unless other callers still
read there — and the next operation the pool hands it queues behind the stand-in and drains that
answer before its own. An idle connection that still owes such answers serves only when no clean
idle connection is available, but before a new one is dialled: it already holds its slot, and
draining it is what returns it to service. The slot is held by the live session for the
statement's real runtime, not until its deadline — so a burst of client disconnects no longer
stalls the pool for the operations' `timeout` (`30 s` by default), which it used to.

The pool holds a slot past the session — counted against `max` until the withdrawn operation's own
deadline — only when a session with work on the server has to be dropped. This applies to SQL
drivers (`Driver::LINGERING`): a SQL server usually finishes — or rolls back — what it was asked
before it notices the client left. Four cases end with the session dropped:

- a batch the driver was in the middle of writing (state `Querying`): its remaining bytes can never
  be attributed. One that never wrote a byte — a plaintext PostgreSQL batch, a MySQL command queued
  behind the head — is just taken back: the session is kept and nothing is held;
- a withdrawal on a connection reserved by a transaction: nobody would hand that connection to a
  next caller to drain a stand-in, so the pool reconciles it with `Driver::abandon()`, which drops a
  session with nobody left to read it. The statement a top-level `rollback()` or `abort()` overtakes
  is withdrawn this way too (see
  [Transactions](/manual/ADI/Databases/SQL/Transaction/overview/)). A `BEGIN` withdrawn after it
  reached the server drops its session even when the driver could drain it: the `BEGIN` may have
  opened a transaction nobody will end;
- a session severed later, before it drained the stand-ins it kept — the operation queued behind
  them expired with nobody left to read, an I/O error, a transaction teardown. The pool then counts
  the slot until the withdrawn statement's own deadline, as if the session had been dropped at the
  withdrawal;
- a session reset that cannot be written whole when the session returns to `idle` (see below): the
  session is severed like one that could not be kept — no caller shares it any more.

The HTTP response resource never reaches the second case when a request Fiber is destroyed inside
`transact()` — it adopts the transaction instead (see below) — but a wait refused or interrupted
there still does.

The trade-off is that a dropped session's slot stays unavailable until that deadline passes. A
statement that is still running holds its kept session until it ends: the next operation handed that
connection waits behind it, up to its own deadline. That operation fails at its deadline, but what it
sent may still run: PostgreSQL pipelines, so a batch queued behind a stand-in is typically already
on the wire when it times out, and the server runs it once it reaches it. A timed-out operation's
outcome is unknown — check whether its writes landed, or make the unit of work idempotent, before
retrying it. (MySQL writes a queued command only once it reaches the head, so one that never got
there ran nowhere.) When a session is kept, the connection itself counts and nothing extra is held.
A key-value server such as Redis drops a disconnected client's work at once
(`Driver::LINGERING` is `false`), so a withdrawn KV command never holds its slot past its dropped
session.

That accounting keeps a burst of client disconnects from flooding the database with abandoned
queries: a kept session is one session, and it runs its statements one after another. For a dropped
session the `pool.max` cap on statements running on the server holds only while those statements
finish within their own deadline, and only when the operation has a deadline. An operation with
`timeout` `0` has none, so a withdrawal that drops its session holds no slot. A statement still
running once its deadline passes — withdrawn or timed out — is no longer counted, so the server can
then run more than `pool.max` statements at once. Pair the pool's `timeout` with a server-side
statement timeout at or below it (PostgreSQL's `statement_timeout`, for example) so the server stops
what the pool no longer counts.

Keeping the session has a consequence: a statement can still take session-scoped state after its
caller left — a lock it was granted late, a subscription — and a kept session would carry it to the
next caller. So a withdrawal whose statement reached the server **taints** the session it kept
(`Pool::taint()`), and the release that next returns that session to `idle` writes a **reset**
first, once: PostgreSQL `SELECT pg_advisory_unlock_all(); UNLISTEN *`, MySQL
`DO RELEASE_ALL_LOCKS()`. That is the release after which nobody owes work on the connection
(`Driver::check()`): the withdrawal's own when no live caller shares the session — the reset then
goes out at once — or else the last of the callers sharing it, so the reset never fails one of them
and never ends what one still runs. The driver writes it behind everything the session still owes,
so the server runs it right after the abandoned statement ends even if nobody reads, and the next
operation on the connection absorbs its answer like a stand-in's. Withdrawals on one session before
it idles share one reset. A server that rejects the statement answers an error, which is absorbed
and ignored. PostgreSQL session-level advisory locks (`pg_advisory_lock`), MySQL `GET_LOCK` locks
and `LISTEN` registrations a withdrawn statement took therefore do not outlive a disconnected
client.

A session that owes a reset is never picked for co-location — a caller pipelined there would run
before the reset — so in a saturated pool new operations park in `pending` and are promoted once
the session idles, behind its reset. If the reset cannot be written whole at that release — a batch
still holds the write stream, the stream takes less than the whole reset, the session is gone — the
session is severed instead: no live caller is left on it, and the slot rules above apply.

The reset ends session-level state whoever took it. A caller still pipelined on the session when it
was tainted keeps what its own statement takes only until it has its answer: if that statement
takes a session-level lock (`pg_advisory_lock`, `GET_LOCK`) or a `LISTEN` outside a transaction, the
reset written once the callers sharing the session are done releases it. Take such locks inside a
transaction (`begin()`, or `transact()` in an HTTP route) — its connection is reserved, so no reset
runs inside it — in their transaction-scoped forms (`pg_advisory_xact_lock`) where the engine has
one.

The reset does not touch session variables: `SET` / `SET SESSION` stays on the pooled session handed
to later requests, so prefer `SET LOCAL` (or restore the value explicitly). It covers withdrawn and
adopted work only — state a request leaves behind when it completes normally is its own to release
(`pg_advisory_xact_lock` and `SET LOCAL` end with their transaction).

A withdrawn transaction teardown — the top-level `COMMIT` or `ROLLBACK` — always counts as
never sent, so its session is severed instead of trusting an answer nobody will read. What that
leaves on the server depends on how far the teardown got. A `ROLLBACK`, or a `COMMIT` that never
reached the server, ends in a server-side rollback when the session is severed. A `COMMIT` that
already reached the server (`Querying` or `Reading`) may have committed: the server usually
processes the statement it already read before it notices the hangup. The caller only knows the
operation failed as withdrawn, so its outcome is unknown — check whether its writes landed, or
make the unit of work idempotent, before retrying it.
`Transaction::abort()` composes that teardown for a caller that can no longer wait: the
top-level `ROLLBACK` at any savepoint depth, discarding the outstanding statement and emitting no
transaction events. A transaction also reads as not active once the session its `BEGIN` ran on
is gone — the connection was dropped, or rebuilt for another caller — so its next statement
fails with `SQL transaction is not active.` instead of running inside someone else's session.

The HTTP response resource does not withdraw the transaction of a request Fiber destroyed inside
`transact()`: it adopts it, drives what was in flight to completion and rolls it back on its own
session, so the session is kept — and taints it (`Pool::taint()`), so the release that ends the
reservation is the one that writes the session reset, before the connection is `idle` again. See
[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/).

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
