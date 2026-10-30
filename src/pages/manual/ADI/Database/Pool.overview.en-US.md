# Connection pool

`Bootgly\ADI\Database\Pool` owns the connections to one database endpoint. Every facade builds
one for the endpoint it is configured with (`$Database->Pool`), and the SQL facade builds one more
per read replica (`$Database->ReplicaPools`). The pool hands each operation a connection,
pipelines further operations onto busy connections once it is full, parks what cannot run yet in
`pending`, and takes the slot back whenever an operation finishes, fails, times out, is cancelled
or is withdrawn. Its size and deadline come from the connection config: `pool.max` and `timeout`
(see **[Configuration](/manual/ADI/Database/Config/overview/)**).

In `HTTP_Server_CLI` routes the `$Response->Database` resource drives the pool for you (see
**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**). This
page shows what the pool does underneath, and how to drive it from a script.

## Size the pool

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
   'pool' => ['max' => 1],
]);

$Database->await($Database->query('SELECT 1'));

$Slow = $Database->query('SELECT pg_sleep(0.2)');
$Fast = $Database->query('SELECT 2 AS value');

$Database->Pool->created;        // 1
count($Database->Pool->busy);    // 1
count($Database->Pool->pending); // 0

$Database->await($Fast);
$Database->await($Slow);
```

`pool.max` (default `8`) caps the connections one pool opens. The cap is per pool: every `SQL` or
`KV` instance owns its pool — the HTTP resource builds one per worker — and each read replica has
a pool of its own, with the primary's `pool.max` unless the replica sets one. Connections open
lazily, on the first operation that needs one: `pool.min` is accepted, but for now the pool never
opens connections ahead of time.

The first `await()` dials and authenticates the pool's only connection. Then `$Slow` takes it and
the pool is full, so `$Fast` joins the busy connection instead of waiting: PostgreSQL pipelines it
on the same socket, MySQL queues it behind the statement at the head. `pending` stays empty.

### Saturation and co-location

The pool tracks its `idle` and `busy` connections, the operations parked in `pending`, and how
many connections it has `created`. It is exhausted when no idle connection is available and
`created`, plus the slots still held for withdrawn SQL statements whose session had to be dropped
(each until its deadline — see [Lingering slots](#lingering-slots)), reaches `max`. Past that
point a new operation joins a ready busy connection — round-robin across them — that no
transaction holds and that owes no session reset (see [Session reset](#session-reset)); a
`BEGIN`, or an operation with no such connection to join, waits in `pending`. A connection still
dialing or authenticating is not ready, so on a cold pool an operation that finds no room parks in
`pending` too. When a connection is released, the pool promotes pending operations.

`created` is the pool's own count, and every connection it holds — idle, busy or reserved by a
transaction — is one it counts. A connection the pool has dropped stays dropped even if a driver
reconnects the same object on its own: it is not handed out again and it is not a pipelining
target, because work on it would never count against `max`. And an operation the pool has parked
leaves the queue the moment it is finished, so nothing can promote and re-dispatch work a caller
already cancelled.

## Await synchronously

```php
$Operation = $Database->query('SELECT * FROM missing_table');

try {
   $Database->await($Operation);
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // relation "missing_table" does not exist
   $Operation->error;        // relation "missing_table" does not exist
   $Operation->code;         // 42P01
}
```

`await()` is `Pool::wait()` on the operation's own pool, so `$Database->Pool->wait($Operation)`
does the same. It advances the operation and sleeps in `stream_select()` on the socket the driver
asks for, until the operation finishes. When the operation fails, `wait()` throws a
`RuntimeException` whose message is `$Operation->error`, and the operation keeps its `error` — and,
on SQL, its `code`. Two more `RuntimeException`s come from the wait itself and leave the operation
unfinished: `Database operation did not provide readiness.` (an unfinished operation gave it
nothing to wait on) and `Database operation readiness wait failed.` (`stream_select()` failed for
a reason other than a signal).

The next example reuses the `pool.max` `1` pool from [Size the pool](#size-the-pool):

```php
$Slow = $Database->query('SELECT pg_sleep(0.2)');
$Transaction = $Database->begin();

count($Database->Pool->pending); // 1

$Database->await($Slow);
$Database->await($Transaction->Operation);

$Database->await($Transaction->commit());
```

A `BEGIN` never shares a connection, so while `$Slow` holds the only one, the transaction's
`BEGIN` waits in `pending`. Awaiting `$Slow` first releases its connection, and that release
promotes the parked `BEGIN` onto it.

The other order fails. `pending` belongs to the async path, where something else keeps advancing
the operations that hold the connections. `Pool::wait()` is the synchronous API: while it blocks,
nothing advances those operations, and only they can free a slot. So awaiting a parked operation —
the `BEGIN` above, before `$Slow` — refuses it with
`Database pool has no capacity for the operation.` and takes it out of `pending`, instead of
waiting for capacity that cannot arrive. Leaving it queued would be worse than refusing it: the
caller is told its write failed and compensates, with a rollback for instance, while `promote()`
would still put the command on the wire once capacity freed — outside the transaction, in
autocommit. In a script, await operations in the order you created them, or keep fewer of them in
flight than `pool.max`.

A no-restart signal can interrupt the `stream_select()` used by synchronous `wait()`. EINTR does
not change the operation or its readiness, so the pool recognizes the syscall's errno even when
the operating-system message is localized and retries with the same operation. Other select
failures still propagate, and the operation's configured timeout can still expire it normally; an
interrupted wait is not converted into a database result.

## Cancel a running statement

```php
$Running = $Database->query('SELECT pg_sleep(30)');
$Database->advance($Running);

$Database->cancel($Running);

try {
   $Database->await($Running);
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // canceling statement due to user request
}

$Running->cancelled; // true
$Running->revoked;   // true
```

`cancel()` asks the server to stop the statement through a side channel — PostgreSQL's
`CancelRequest`, MySQL's `KILL QUERY` — and sets `cancelled` once that request reached the wire. It
is advisory: the operation still resolves, fails or expires on its own connection, depending on
how the server ends the statement. PostgreSQL fails it with
`canceling statement due to user request` (SQLSTATE `57014`); a MySQL statement interrupted by
`KILL QUERY` may also just return early — `SLEEP()` returns `1` — and then finishes normally.
Here one `advance()` writes the statement because the connection is already open. On a connection
still dialing there is no server session to name yet, and the cancel fails the operation locally:
`PostgreSQL cancellation requires BackendKeyData.` or
`MySQL cancellation requires the greeting thread id.` Redis has no cancellation: `cancel()` fails
a command already sent with `Database driver does not support cancellation.` A SQLite operation that
got the connection is already finished when `query()` returns, so it leaves nothing to cancel; one
parked in `pending` — behind a transaction that holds the connection — is failed locally like any
parked operation.

Cancelling is a decision, not a message. The withdrawal is recorded the moment you ask for it —
`revoked` is set before the driver is consulted at all — so it holds whether the driver sends the
request, refuses because the protocol has nothing to send it on, refuses because it does not
support cancellation, or fails outright while trying. The automatic fallback of a replica read to
the primary pool will not revive a cancelled operation afterwards. That is separate from whether
the cancel reached the server, which is what decides whether the connection still has an answer
to reconcile.

Whether anything is *sent* depends on where the operation actually is. A cancel request names a
backend, not a statement, so one sent for work that is not running would reach whatever else that
backend is doing. An operation that already finished, and one still composed but never written,
are therefore withdrawn locally and nothing goes on the wire. The two differ in what the caller is
left holding: a finished operation keeps its state and its result, while one that never reached
the server is failed with `Database operation was cancelled before reaching the server.`, since
its work did not happen. A parked operation has no driver yet and is failed with
`Database operation has no protocol to cancel.` Only an operation genuinely in flight produces a
request.

If the local socket has been closed while that request goes out, the operation is failed straight
away with `Database connection was lost while cancelling the operation.` rather than waiting for
an answer that can no longer arrive, so its slot returns to the pool. A peer that goes away
without the local socket noticing is not detectable here — that connection is discovered by the
next operation to use it.

A cancellation that never reaches the server takes the same route as an elapsed deadline (see
[Set a deadline](#set-a-deadline)): when its side channel cannot be established, the operation is
finished locally while the server keeps answering the original command, and the pool reconciles
that wire (`Driver::abandon()`) before taking the connection back.

## Withdrawn operations

```php
$Running = $Database->query('SELECT pg_sleep(0.3)');
$Database->advance($Running);

$Database->withdraw($Running);

$Running->error;              // Database operation was withdrawn: its caller stopped waiting.
$Running->revoked;            // true
count($Database->Pool->idle); // 1

$Database->await($Database->query('SELECT 1'));
```

When the caller simply stops waiting — a deferred response whose wait was refused or interrupted,
or whose Fiber was destroyed — the local counterpart of `cancel()` is `withdraw()`, and nothing is
sent to the server. `Pool::withdraw()` fails one unfinished operation with
`Database operation was withdrawn: its caller stopped waiting.`, marks it `revoked` so no fallback
pool re-dispatches it, lets the driver reconcile the wire (`Driver::detach()`) and takes the slot
back; a connection still connecting or authenticating is discarded. An operation that already
finished keeps its result, is marked `revoked` and is only forgotten. It is synchronous and never
suspends, so it is safe in the `finally` of a Fiber being destroyed. `Database::withdraw()` — on the
SQL and KV facades — takes several operations in a safe order (parked ones first, then those not
reading yet, then the pipelined readers), attempts every one and rethrows the first failure.

In the example the connection is already open, so one `advance()` puts the statement on the server
before it is withdrawn: its connection goes straight back to `idle`, and the next query waits behind
the rest of the withdrawn answer — about `0.3` seconds — before it reads its own. Withdrawn while
its connection was still dialing, the operation would take that connection with it instead.

### Kept sessions

A withdrawal does not stop a statement the server already received, and it does not cost the
session. When the operation's batch is whole on the wire (state `Reading`), the driver keeps the
session and **detaches** the operation (`Driver::detach()`): the remaining answer is absorbed by a
stand-in nobody waits for, the connection goes back to `idle` at once — unless other callers still
read there — and the next operation the pool hands it queues behind the stand-in and drains that
answer before its own. An idle connection that still owes such answers serves only when no clean
idle connection is available, but before a new one is dialed: it already holds its slot, and
draining it is what returns it to service. The slot is held by the live session for the
statement's real runtime, not until its deadline — so a burst of client disconnects does not stall
the pool for the operations' `timeout` (`30` seconds by default).

### Lingering slots

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
- a session reset that cannot be written whole when the session returns to `idle` (see
  [Session reset](#session-reset)): the session is severed like one that could not be kept — no
  caller shares it any more.

The HTTP response resource never reaches the second case when a request Fiber is destroyed inside
`transact()` — it adopts the transaction instead (see [Session reset](#session-reset)) — but a wait
refused or interrupted there still does.

The trade-off is that a dropped session's slot stays unavailable until that deadline passes. A
statement that is still running holds its kept session until it ends: the next operation handed
that connection waits behind it, up to its own deadline. That operation fails at its deadline, but
what it sent may still run: PostgreSQL pipelines, so a batch queued behind a stand-in is typically
already on the wire when it times out, and the server runs it once it reaches it. A timed-out
operation's outcome is unknown — check whether its writes landed, or make the unit of work
idempotent, before retrying it. (MySQL writes a queued command only once it reaches the head, so
one that never got there ran nowhere.) When a session is kept, the connection itself counts and
nothing extra is held. A key-value server such as Redis drops a disconnected client's work at once
(`Driver::LINGERING` is `false`), so a withdrawn KV command never holds its slot past its dropped
session.

That accounting keeps a burst of client disconnects from flooding the database with abandoned
queries: a kept session is one session, and it runs its statements one after another. For a
dropped session the `pool.max` cap on statements running on the server holds only while those
statements finish within their own deadline, and only when the operation has a deadline. An
operation with `timeout` `0` has none, so a withdrawal that drops its session holds no slot. A
statement still running once its deadline passes — withdrawn or timed out — is no longer counted,
so the server can then run more than `pool.max` statements at once. Pair the pool's `timeout` with
a server-side statement timeout at or below it (PostgreSQL's `statement_timeout`, for example) so
the server stops what the pool no longer counts.

### Session reset

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

The reset does not touch session variables: `SET` / `SET SESSION` stays on the pooled session
handed to later requests, so prefer `SET LOCAL` (or restore the value explicitly). It covers
withdrawn and adopted work only — state a request leaves behind when it completes normally is its
own to release (`pg_advisory_xact_lock` and `SET LOCAL` end with their transaction).

The HTTP response resource does not withdraw the transaction of a request Fiber destroyed inside
`transact()`: it adopts it, drives what was in flight to completion and rolls it back on its own
session, so the session is kept — and taints it (`Pool::taint()`), so the release that ends the
reservation is the one that writes the session reset, before the connection is `idle` again. See
[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/).

### Withdrawn teardowns

A withdrawn transaction teardown — the top-level `COMMIT` or `ROLLBACK` — always counts as never
sent, so its session is severed instead of trusting an answer nobody will read. What that leaves on
the server depends on how far the teardown got. A `ROLLBACK`, or a `COMMIT` that never reached the
server, ends in a server-side rollback when the session is severed. A `COMMIT` that already reached
the server (`Querying` or `Reading`) may have committed: the server usually processes the statement
it already read before it notices the hangup. The caller only knows the operation failed as
withdrawn, so its outcome is unknown — check whether its writes landed, or make the unit of work
idempotent, before retrying it. `Transaction::abort()` composes that teardown for a caller that can
no longer wait: the top-level `ROLLBACK` at any savepoint depth, discarding the outstanding
statement and emitting no transaction events. A transaction also reads as not active once the
session its `BEGIN` ran on is gone — the connection was dropped, or rebuilt for another caller — so
its next statement fails with `SQL transaction is not active.` instead of running inside someone
else's session.

## Set a deadline

```php
$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
   'timeout' => 0.5,
]);

$Operation = $Database->query('SELECT pg_sleep(2)');

try {
   $Database->await($Operation);
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // Database operation timed out after 0.5 seconds.
}
```

`timeout` (seconds, default `30`) is a deadline for the whole operation, fixed when `query()`
creates it: the time parked in `pending`, the dial, TLS, authentication and the answer all count
against it, so an operation awaited after its deadline has passed fails at once. `0`, or a negative
value, means no deadline. `query()` gives each operation the `timeout` of the pool it is routed to;
there is no per-query option. A read that fails on a replica and is re-run on the primary is
retried with a fresh deadline of its own `timeout` — the replica's, not the primary's — so it can
take up to twice that value (see [Replica health](#replica-health)).

SQLite is synchronous when an operation gets the connection: the statement runs inside `query()`,
so `timeout` is no deadline for it — a slow statement runs to completion, and an operation awaited
late still succeeds. For that statement `timeout` is only SQLite's busy wait, which `0` or a
negative value turns off (see [Timeout](/manual/ADI/Database/Config/overview/#timeout)). A SQLite
operation that finds no free connection — the single connection of a `:memory:` database held by a
transaction, for instance — parks in `pending` like any other, and its deadline runs while it waits
there.

When an operation's `timeout` elapses, the pool fails it with
`Database operation timed out after <timeout> seconds.` and asks its driver to reconcile the wire
(`Driver::abandon()`) before releasing the connection. The server is usually still answering the
command it was given: a driver that has a co-located sibling left to read the socket drains the
abandoned answer and keeps the connection; with nobody left to read it, the connection is dropped
instead. Either way the slot comes back to the pool, and the timed-out operation is never revived
by its own late answer.

## Connection release

A connection goes back to the pool only once nothing is owed on its socket. While the driver still
has an operation waiting for a reply, the connection stays `busy` — handing it out would give one
caller's rows to another. "Owed" means an operation that has not finished: a failed or expired one
owes its caller nothing, even though the driver keeps its slot in the FIFO a little longer to absorb
the message that terminates it. Backends do not always answer in one TCP read, so a query refused
with a syntax error can leave a finished entry parked there; the pool does not read that as work in
flight, so the slot is not lost — and transactions, which never share a connection, are not
refused capacity that exists.

A connection goes back to `idle` as soon as the driver owes no live work. The pool also keeps, per
connection, the operations it handed to it that have not settled yet — one still composed, or
parked behind another caller's write, is invisible to the driver — but weighs that claim only when
an exclusive operation acquires. A `BEGIN` is never handed an idle connection that an unflushed
co-located operation still claims: that statement would run inside its transaction. It takes
another idle connection, dials a new one while capacity allows, or waits in `pending`. The claim
never holds a connection out of `idle`, and it counts only while its operation is unfinished, so an
operation its caller dropped never pins a connection. A detached stand-in (see
[Kept sessions](#kept-sessions)) is not live work either: nobody waits for it, so a connection
whose only pending work is a stand-in goes back to `idle`.

A socket that can no longer deliver is dropped rather than held, whatever the driver still has
queued on it: it owes an answer it can never bring, and everything that frees the slot happens
after that check.

## Transactions

Transactions pin one connection with `lock` and release it with `unlock` after commit or rollback.
The reservation is freed by the operation that carries `unlock`, even when the driver still has a
co-located sibling to finish — the intent lives on that operation, so deferring it would lose it
and park the connection as reserved forever.

One case takes the connection with it: a commit or rollback the pool retires *before it reaches the
server*, whether you cancelled it or its own deadline elapsed. That statement ended nothing, and by
then nobody can — the transaction gave up its depth and its connection the moment the statement was
composed. Handing that connection on would run the next caller's work inside an open transaction it
never asked for, and keeping it reserved would lose the slot for good while the session stayed open
anyway. So the connection is dropped: the server rolls the transaction back, which is what a commit
that never ran means, and the slot returns to the pool.

Ending a session also retires the driver that owned it. A statement composed on that session but
never written is in neither the driver's queue nor its write buffer, so the teardown cannot see it
and it outlives the session holding a driver whose socket is gone. Advancing one afterwards fails
it — `PostgreSQL connection was torn down before the query was sent.`,
`MySQL connection was torn down before the query was sent.` or, for Redis,
`Redis connection was torn down before the command was sent.` — and its buffered command is
discarded, rather than being written to whatever connection the pool has rebuilt in the meantime. A
reservation left over from that session is inert for the same reason.

An operation pinned to a connection the pool can no longer provide — a server restart, a
load-balancer recycle, a dropped socket — fails immediately with
`Database operation lost the connection it was pinned to.` instead of waiting in `pending`. No
amount of capacity can satisfy a pin, so queueing it would keep it there for good while every
promotion pass reconsidered it.

## Replica health

```php
$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
   'replicas' => [
      ['host' => '127.0.0.1', 'port' => 5433],
   ],
]);

$Replica = $Database->ReplicaPools[0];

$Operation = $Database->await($Database->query('SELECT 1 AS one'));

$Operation->fallback; // true
$Replica->failures;   // 1
$Replica->healthy;    // true

$Database->await($Database->query('SELECT 1 AS one'));

$Replica->failures;   // 2
$Replica->healthy;    // false
```

Nothing listens on the replica's port here, so every read routed to it is refused. The first read
is re-run on the primary — `fallback` is `true` — and counts one failure against the replica pool.
The second consecutive failure (`Pool::DEFAULT_FAILURES`, `2`) closes the replica for
`Pool::DEFAULT_RETRY` (`5.0`) seconds plus a random jitter of up to `Pool::DEFAULT_JITTER` (`0.25`)
seconds: `healthy` is `false`, and reads go to another healthy replica or to the primary. Once the
window passes the replica is tried again; its `failures` count is kept, so one more failure closes
it again at once, while a read that succeeds on it clears the count (`recover()`).

Only failures the driver marks as connection-level count (`Operation->quarantine`), such as a
refused or failed dial, a TLS failure, an authentication the driver refuses to finish, or a session
lost to a transport error. Any failed replica read is still re-run once on the primary with a fresh
deadline of the replica's `timeout` — a plain SQL error included — but neither a SQL error nor a
timeout counts against the replica. So a replica that accepts connections and never answers keeps
receiving reads, and each one waits for its `timeout` before the primary answers it. A read that
was cancelled or withdrawn is never re-run. Routing and the read-after-write window are covered in
**[Database read replicas](/guide/database-read-replicas/overview/)**.

## Errors

These failures come from the pool and from the core `Operation` and `Driver` classes. Each one is
the operation's `error`, and `wait()` rethrows it as a `RuntimeException`.

| Message | When |
| --- | --- |
| `Database pool has no capacity for the operation.` | `wait()` was given an operation parked in `pending` |
| `Database operation timed out after <timeout> seconds.` | The operation's deadline passed |
| `Database operation lost the connection it was pinned to.` | A pinned operation's connection is gone |
| `Database operation was withdrawn: its caller stopped waiting.` | `withdraw()` on an unfinished operation |
| `Database operation was cancelled before reaching the server.` | `cancel()` on an operation composed but never written |
| `Database operation has no protocol to cancel.` | `cancel()` on an operation parked in `pending` |
| `Database connection was lost while cancelling the operation.` | The cancel went out on a socket already closed |
| `Database driver does not support cancellation.` | `cancel()` with a driver that has no cancellation (Redis) |

`wait()` also throws two `RuntimeException`s of its own without failing the operation:
`Database operation did not provide readiness.` and `Database operation readiness wait failed.`

## Reference

### Pool

`Bootgly\ADI\Database\Pool`.

```php
__construct (Config $Config, Connection $Connection, string $drivers = Drivers::class)
```

Builds a pool for one endpoint. `$Connection` is the first connection it dials — reused whenever
the pool holds none — and `$drivers` is the `Drivers` registry it builds a driver from for each new
connection. Facades build their pools themselves: `$Database->Pool`, and `$Database->ReplicaPools`
on SQL.

```php
assign (Operation $Operation): Operation
```

Hands an operation a connection: an idle one, a new one while the pool has room under `max`, or —
once the pool is full — a ready busy one it can share. Then it binds the driver and lets it compose the
command (state `Queued`). With no connection to give, the operation parks in `pending`; a pinned
operation whose connection is gone fails instead. `query()` and `command()` call it. An operation
the driver finishes at once — a SQLite operation that got a connection — is released before
`assign()` returns.

```php
advance (Operation $Operation): Operation
```

Moves an operation one step: it expires an operation past its deadline, assigns a pending one, or
lets the driver read and write what the socket allows, and it releases the connection of an
operation that finished. It never waits for socket readiness, but a dial still resolves the host
name synchronously (see [Timeout](/manual/ADI/Database/Config/overview/#timeout)), and any SQLite
statement it starts runs to completion inside the step. A failed replica read is re-run on its
fallback pool from here. The facades' `advance()` and the HTTP resource call it.

```php
wait (Operation $Operation): Operation
```

Advances the operation until it finishes, sleeping in `stream_select()` on the socket and direction
the driver asks for, at most one second at a time and never past the readiness deadline. Throws a
`RuntimeException` with the operation's `error` when it fails, refuses an operation parked in
`pending` (`Database pool has no capacity for the operation.`), and throws
`Database operation did not provide readiness.` or `Database operation readiness wait failed.` when
it cannot wait. A wait interrupted by a signal is retried. An operation owned by another pool is
waited on there. Facades call it from `await()`.

```php
cancel (Operation $Operation): Operation
```

Sets `revoked`, then sends a cancel request through the driver only when the operation is actually
in flight. A finished operation keeps its result, a parked or composed one fails locally, and a
cancel that never reached the server, or that went out on a closed socket, is reconciled and its
slot taken back. See [Cancel a running statement](#cancel-a-running-statement).

```php
withdraw (Operation $Operation): Operation
```

Withdraws one unfinished operation locally, because its caller stopped waiting: fails it with
`Database operation was withdrawn: its caller stopped waiting.`, sets `revoked`, lets the driver
reconcile the wire and takes the slot back. A finished operation keeps its result and is only
forgotten. Synchronous and never suspends; freeing a slot may still promote a parked operation,
which can dial a new connection. See [Withdrawn operations](#withdrawn-operations). Since 1.0.5.

```php
release (Operation $Operation): self
```

Settles a finished operation's claim on its connection: frees a reservation (`unlock`, or a `lock`
that failed), keeps the connection `busy` while the driver still owes work on it, drops a socket
that can no longer deliver, writes a pending session reset, returns the connection to `idle` and
promotes pending operations. The pool calls it; a second call for the same operation does nothing.

```php
attach (Connection $Connection): self
```

Adds a connection you opened yourself to `idle` and counts it in `created`.

```php
lock (Connection $Connection): self
```

Reserves a connection the pool counts for one owner, as a `BEGIN` does through its `lock` flag: a
reserved connection takes no co-located operation, and it stays `busy` across releases until
`unlock()`. A connection the pool does not count is ignored.

```php
unlock (Connection $Connection): self
```

Ends a reservation; the next release returns the connection to normal scheduling.

```php
taint (Connection $Connection): void
```

Marks a lent session whose owner was orphaned — `withdraw()` marks the one a withdrawn statement
that reached the server was on; an adopted transaction marks its reserved one — so its session state
is reset before the connection is lent again. The next release that would return the connection to
`idle` has the driver write its reset (`Driver::reset()`) behind everything the session still owes,
once; a session that cannot take it is severed and dropped instead. Until then no new caller is
co-located there. Meant for a connection the pool has lent, busy or reserved: one already idle is
reset only after its next caller. A connection the pool does not count is ignored, and a dropped one
loses its mark. Since 1.0.11.

```php
penalize (float $seconds = self::DEFAULT_RETRY, int $failures = self::DEFAULT_FAILURES, float $jitter = self::DEFAULT_JITTER): self
```

Counts one health failure. From the `$failures`-th consecutive one, it closes the pool to routing
for `$seconds` plus a random jitter of up to `$jitter` seconds. The pool calls it on a replica whose
read failed at the connection level, before re-running the read on the primary.

```php
recover (): self
```

Clears the failure count and the retry window. The pool calls it when an operation that finished
successfully hands its connection back.

```php
public bool $healthy { get; }
```

`true` unless a retry window is open: `retry` is `0.0` or already in the past. The SQL facade routes
reads only to healthy replicas.

```php
public private(set) int $failures
```

Consecutive health failures counted by `penalize()` since the last `recover()`.

```php
public private(set) float $retry
```

`microtime(true)` timestamp until which the pool is closed to routing; `0.0` when no window is open.

```php
public array $idle
```

Ready connections no operation holds, keyed by object id (`array<int,Connection>`).

```php
public array $busy
```

Connections handed to operations, or reserved by a transaction (`array<int,Connection>`).

```php
public array $pending
```

Operations parked until a connection is free (`array<int,Operation>`).

```php
public int $created
```

How many connections the pool counts: idle, busy and reserved ones.

`idle`, `busy`, `pending` and `created` are publicly writable, but they are the pool's own
bookkeeping: read them, never write them.

```php
public int $max
```

The cap on `created`, copied from `pool.max` when the pool is built.

```php
public int $min
```

Copied from `pool.min`; for now the pool does not act on it.

```php
public Config $Config
```

The connection config of the pool's endpoint; its `timeout` is the one `query()` gives each
operation it routes to the pool, kept when a failed replica read is re-run on the primary.

```php
public Connection $Connection
```

The first connection; in the primary pool, the facade's own `$Database->Connection`.

```php
public string $drivers
```

The `Drivers` class the pool builds drivers from (`class-string<Drivers>`).

```php
public const int DEFAULT_FAILURES = 2;
```

Consecutive health failures that close a pool.

```php
public const float DEFAULT_RETRY = 5.0;
```

Seconds a closed pool stays closed, before jitter.

```php
public const float DEFAULT_JITTER = 0.25;
```

Upper bound, in seconds, of the random jitter added to the retry window, so pools closed together
do not reopen together.

### Pools

`Bootgly\ADI\Database\Pools` — the registry of a facade's pools by driver name
(`$Database->Pools`). The facade registers its primary pool under `Config->driver`; replica pools
are not registered there.

```php
register (string $driver, Pool $Pool): self
```

Registers a pool under a driver name, replacing any pool registered under it.

```php
fetch (string $driver = ''): Pool
```

Returns the pool registered under `$driver` — the config's `driver` when empty. An unknown name
throws `InvalidArgumentException` (`Database pool is not registered: <driver>.`).
