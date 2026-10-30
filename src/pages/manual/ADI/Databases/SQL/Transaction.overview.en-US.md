# Transactions

`Bootgly\ADI\Databases\SQL\Transaction` pins SQL operations to one pooled connection, so that
several statements commit or roll back together. Open one with `$Database->begin()`. In
`HTTP_Server_CLI` routes, use `$Response->Database->transact()` instead: it begins the
transaction, runs your callback, commits, and rolls back when the callback throws (see
**[Database methods](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#database-methods)**).

> Looking for the practical flow first? Start with the
> **[Database transactions](/guide/database-transactions/overview/)** guide.

## Lifecycle

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\API\Environment\Configs\DatabaseConfig;

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());

$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Database->await($Transaction->query('UPDATE accounts SET balance = balance - 100 WHERE id = 1'));
$Database->await($Transaction->query('UPDATE accounts SET balance = balance + 100 WHERE id = 2'));

$Database->await($Transaction->commit());
```

`$Database->begin()` builds the transaction and composes its `BEGIN` at once. A `BEGIN` is an
exclusive request: the pool reserves a connection for it and shares that connection with nobody
until the transaction ends. `$Transaction->Operation` holds the `BEGIN`: await it before the first
statement, then await each statement before you send the next (see
[Run statements](#run-statements)). `commit()` ends the transaction, and the pool takes the
connection back once the `COMMIT` finishes.

`await()` returns the finished operation and throws a `RuntimeException` carrying its `error` when
it fails. Put the work and the commit in a `try` and end the transaction in the `catch`, as the
guide's **[Commit or roll back](/guide/database-transactions/overview/#commit-or-roll-back)**
recipe does. The example opens `$Database` from the project's `database` config scope, the form
for a boot function, a command or a script inside a project; outside a project, pass the
connection keys as an array (see **[Configuration](/manual/ADI/Database/Config/overview/)**).

The `BEGIN` wait is not a formality. `depth` becomes `1` the moment the `BEGIN` is composed, long
before any server sees it, and it stays `1` if the statement fails. A transaction whose `BEGIN`
failed is dead and says so: `query()`, `commit()`, `rollback()`, `abort()` and `save()` return a
failed operation reading `SQL transaction is not active.`, and `release()` one reading
`SQL transaction savepoint is not active.` Without that, your work would run on a connection where
no transaction was ever opened — committed by autocommit and surviving the rollback you asked for.

A transaction also reads as not active once the session its `BEGIN` ran on is gone — the
connection was dropped, or the pool rebuilt the same connection object for another caller. Its
calls then return the same refusals without touching the pool, instead of composing a statement
that would run inside another caller's session and whose teardown would end it.

## Run statements

`query()` takes what `$Database->query()` takes — raw SQL with its parameters, a Query Builder or a
compiled `Query` — and runs it on the pinned connection. `table()` starts a builder with the
database's dialect (see **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)**). A
builder or a `Query` carries its own parameters, so the second argument of `query()` is ignored
for them.

A transaction is a serial surface — its `pipelining` is `false` — so it carries one operation at a
time:

```php
$Debit = $Transaction->query('UPDATE accounts SET balance = balance - 100 WHERE id = 1');
$Balance = $Transaction->query('SELECT balance FROM accounts WHERE id = 1');

$Balance->error; // SQL transaction operation is still active.

$Database->await($Debit);
$Balance = $Database->await($Transaction->query('SELECT balance FROM accounts WHERE id = 1'));
```

A call made while the previous operation is still running is refused. The refused operation has
already failed when the call returns, nothing in the pool was touched, and it never becomes
`$Transaction->Operation` — so the refusal is durable: every call is refused until the statement in
flight finishes. Awaiting a refused operation throws its message as a `RuntimeException`, like any
failed operation. SQLite runs a statement inside `query()`, so there the `UPDATE` has already
finished and the first `SELECT` is accepted.

Two inputs throw an `InvalidArgumentException` instead, before any of these checks: an empty or
blank statement (`SQL cannot be empty.`) and a builder that cannot compile, such as an `update()`
with nothing to set (`SQL insert/update requires at least one set value.`).

A statement the server rejects — a constraint, a syntax error — and a lost connection are not
refusals: they reach the operation's `error` and `code` when it finishes, and `await()` throws
them. On PostgreSQL such a failure also aborts the whole transaction (see
**[Engine notes](/guide/database-transactions/overview/#engine-notes)**). Every refusal is listed in
[Refusals](#refusals).

## Repositories inside a transaction

```php
$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Users = $Transaction->map(User::class);

$Mapped = $Users->hydrate(
   $Database->await($Users->fetch($Users->select()->load('Posts')))
);

foreach ($Mapped->entities as $User) {
   $User->active = $User->Posts !== [];

   $Database->await($Users->save($User));
}

$Database->await($Transaction->commit());
```

`User` and `Post` are the entities of
**[Database ORM](/guide/database-orm/overview/#define-entities)**. `$Transaction->map()` creates a
repository whose statements run through the transaction, on its pinned connection, and whose await
bridge is the transaction itself. So `hydrate()` loads the `Posts` the selection names in `load()`
before it returns, and `lazy: true` relations resolve on first access. `$Database->map()` has no
bridge unless you pass one: there the same code returns the relation in `$Mapped->loads`, leaves
every `Posts` empty — and deactivates every user.

The transaction's `await()` is that bridge. It calls `$Database->await()`, so it waits the same way
and throws the same `RuntimeException`; in your own code, keep calling `$Database->await()`.

The repository follows the serial surface. An eager load sends one relation at a time and awaits
each before the next, and a page-mode `paginate()` whose items query is still running leaves its
`COUNT(*)` for `hydrate()` to send (see
**[Pagination](/manual/ADI/Databases/SQL/Repository/Pagination/overview/)**). Pass
`Scope:` to `map()` to choose the read-after-write scope the repository's writes mark (see
[Read-after-write scope](#read-after-write-scope)).

## Commit and rollback

`commit()` at depth `1` composes the `COMMIT` and closes the transaction at once: `depth` drops to
`0` and `Connection` to `null` before the server answers, and the reservation is given back when
the `COMMIT` finishes. At a savepoint level (`depth > 1`) it releases the current savepoint
instead. `commit()` is refused while a statement is still in flight: committing behind an
un-awaited write would report success for work the server may have rejected or discarded, so await
the write first.

The `COMMIT` can itself fail, and by then the transaction is already closed. PostgreSQL answers
the `COMMIT` of a transaction in which a statement had failed with a rollback, which Bootgly turns
into `SQL transaction was rolled back by the server: a statement inside it had failed.`, and a
deferred constraint that fails at commit time fails the `COMMIT` too. Either way, a `rollback()` or
`abort()` that follows is refused with `SQL transaction is not active.`, which is why the guide's
recipe guards the `abort()` in its `catch` (on SQLite, keep foreign keys immediate for now: see
**[Engine notes](/guide/database-transactions/overview/#engine-notes)**).

`rollback()` without a name ends the current level: the whole transaction at depth `1`, the
current savepoint above it. With a name, it rolls back to that savepoint and keeps it (see
[Savepoints](#savepoints)).

Rolling back the outer transaction runs even with a statement still outstanding — a teardown that
refused would strand the pinned connection and leave the server session open inside the
transaction. The outstanding statement is discarded: it is withdrawn through its pool, as a caller
that stops waiting withdraws one (see
**[Withdrawn operations](/manual/ADI/Database/Pool/overview/#withdrawn-operations)**), so it fails
with `Database operation was withdrawn: its caller stopped waiting.` and its buffered command is
dropped with it. It can never reach the wire afterwards and run outside the transaction that was
meant to contain it.

A statement that had already reached the server is another matter: nobody is left to read its
answer on the reserved connection, so the pool drops that session. The server rolls the
transaction back as the session closes, the `ROLLBACK` composed right after fails with
`Database operation lost the connection it was pinned to.`, and the statement keeps its slot
counted until its own deadline, because the server still runs it (see
**[Lingering slots](/manual/ADI/Database/Pool/overview/#lingering-slots)**). A savepoint rollback is
an ordinary statement and is refused like any other.

### Abort or roll back

`abort()` is the teardown without conditions. It composes the top-level `ROLLBACK` at any depth,
which ends every savepoint with it, discards an outstanding statement as the outer `rollback()`
does, and gives the pool reservation back. Its only refusal is `SQL transaction is not active.` An
outer `rollback()` is a `Rollback` event followed by exactly that `abort()`.

| | `rollback()` | `rollback('name')` | `abort()` |
| --- | --- | --- | --- |
| Ends | The current level: the transaction at depth `1`, the current savepoint above it | The work after the savepoint, and every savepoint after it; the named one stays open | The whole transaction, at any depth |
| A statement still in flight | Discarded at depth `1`, refused above it | Refused | Discarded |
| `Rollback` event | Emitted | Emitted | None |

Use `abort()` where the transaction must end whatever state it is in: the `catch` of a unit of
work, where an unnamed `rollback()` would end only the innermost savepoint the work left open, and
a caller that can no longer wait, such as a deferred response whose Fiber is being destroyed, where
a listener could not suspend. Use `rollback()` to undo one level, or to return to a savepoint and
carry on.

## Savepoints

```php
$Database->await($Transaction->save('outer'));
$Database->await($Transaction->save('inner'));
$Database->await($Transaction->rollback('outer'));

$Transaction->depth;                   // 2
$Transaction->release('inner')->error; // SQL transaction savepoint is not available.
```

`save()` creates a savepoint and adds a level to `depth`; without a name, Bootgly generates
`bootgly_0`, `bootgly_1` and so on. `begin()` on an open transaction does the same, and `commit()`
above depth `1` releases the current savepoint. `release()` releases the current savepoint, or a
named one, and `rollback()` without a name rolls back the current savepoint and ends its level.

A **named** teardown reaches further than one level, because that is what the server does.
`ROLLBACK TO SAVEPOINT x` destroys every savepoint established after `x` and keeps `x` itself;
`RELEASE SAVEPOINT x` destroys `x` along with them. So after `save('outer')`, `save('inner')` and
`rollback('outer')`, only `outer` is still open, `depth` is its level rather than one less than
before, and `inner` can no longer be named. Naming a savepoint below the top is exactly the case to
reach for it — the unnamed forms already handle the top of the stack.

If a name appears twice, the servers resolve it to the most recent one, and so does Bootgly. A
missing name — never created, or destroyed by an earlier named teardown — fails with
`SQL transaction savepoint is not available.` Savepoint identifiers are quoted by the active
dialect (see **[Query dialects](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)**).

Reusing the object after a commit or rollback asks the pool for a **new** exclusive claim:
`begin()` at depth `0` composes a fresh `BEGIN`. The connection the last teardown carried is
history, not a reservation, so the `BEGIN` never resumes on a connection another caller is serving.
On a saturated pool it waits like any other exclusive request — parked in `pending` on the async
path, refused by `await()` with `Database pool has no capacity for the operation.` — and reserves a
connection only once capacity frees.

## Refusals

A refusal is an operation that has already failed when the call returns. The call does not throw
and the pool is not touched. The operation's `code` is `null`, and its `SQL` is your query or the
keyword of the statement the call would have composed: `BEGIN`, `SAVEPOINT`, `RELEASE SAVEPOINT`,
`COMMIT` or `ROLLBACK`. `await()` throws the message as a `RuntimeException`, and
`SQL\Events::Failed` listeners see it like any other failure.

| Message | Returned by | When |
| --- | --- | --- |
| `SQL transaction operation is still active.` | `begin()`, `query()`, `commit()`, `save()`, `release()`, and `rollback()` at a savepoint level or with a name | The previous statement has not finished |
| `SQL transaction is not active.` | `query()`, `commit()`, `rollback()`, `abort()`, `save()`, and `begin()` while `depth` is `1` or more | A `COMMIT` or top-level `ROLLBACK` already closed the transaction, its `BEGIN` failed, or the session its `BEGIN` ran on is gone |
| `SQL transaction savepoint is not active.` | `release()` | No savepoint is open, or the transaction is not active |
| `SQL transaction savepoint is not available.` | `release('name')`, `rollback('name')` | The name is not open: never created, or destroyed by an earlier named teardown |

The checks run in a fixed order, and a call that two of them would refuse reports the first: a
statement in flight before an inactive transaction. A `query()` sent right after `commit()`, before
the `COMMIT` finishes, therefore reads `SQL transaction operation is still active.`

Other errors a transaction meets come from elsewhere:

| Message | Raised | When |
| --- | --- | --- |
| `SQL cannot be empty.` | Thrown by `query()` (`InvalidArgumentException`) | The statement is empty or blank |
| `Database operation was withdrawn: its caller stopped waiting.` | The operation's `error` | An outer `rollback()` or `abort()` discarded the statement |
| `Database operation lost the connection it was pinned to.` | The operation's `error` | The pinned session was dropped, as for the `ROLLBACK` that follows a discarded statement already on the server |
| `Database pool has no capacity for the operation.` | Thrown by `await()` | The awaited `BEGIN` is still parked in `pending` |
| `SQL transaction was rolled back by the server: a statement inside it had failed.` | The `COMMIT`'s `error` | PostgreSQL: a statement inside the transaction had failed |

## Read-after-write scope

```php
$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Database->await($Transaction->query('UPDATE users SET active = false WHERE id = 7'));
$Database->await($Transaction->commit());

$Read = $Database->await($Database->query('SELECT active FROM users WHERE id = 7'));
$Read->Pool === $Database->Pool; // true
```

When read replicas are configured, a write through `$Transaction->query()` marks a
read-after-write scope, exactly as a write through `$Database->query()` does: the `$Scope` you
pass, or by default the current Fiber, else the `SQL` facade. While the mark is younger than
`routing.sticky` (5 seconds by default), `$Database->query()` reads in the same scope go to the
primary rather than to a replica that may not have replayed the commit yet. This script runs
outside any Fiber, so the `UPDATE` marked the facade itself and the read after the commit stays on
the primary.

The mark is set when the write is composed, before the transaction commits. Every statement through
the transaction is classified, a raw string included, and a hand-built `Query` counts as a write
unless it was built with `reading: true`. Statements through the transaction itself always run on
its pinned primary connection, whatever they are. Without replicas, the mark changes nothing. See
**[Database read replicas](/guide/database-read-replicas/overview/#read-after-write-scope)**.

## Events

`Bootgly\ADI\Databases\SQL\Transaction\Events` announces the transaction calls through
`Emitter::$Instance`, with the `Transaction` as payload:

| Event | Emitted by | Payload |
| --- | --- | --- |
| `Begin` | `$Transaction->begin()`: it re-opens a closed transaction or opens a nested savepoint (`$Database->begin()` emits no `Begin`) | `Transaction` |
| `Commit` | `$Transaction->commit()`, at any depth (at a savepoint level it releases the savepoint) | `Transaction` |
| `Rollback` | `$Transaction->rollback()`, at any depth — even when the named savepoint is unavailable and the call is refused | `Transaction` |

Each one is emitted after the call's own guards and before it composes its statement. A call those
guards refuse emits nothing: any call made while the previous statement is still in flight (except
the outer `rollback()`, which overtakes that statement), and a `commit()` or `rollback()` on a
transaction that is not active. A listener does see calls whose statement then fails, and the two
refusals that come after the guards: a `rollback('name')` whose savepoint is not available, and a
`begin()` that would open a savepoint in a transaction that is not active. `save()`, `release()`
and `abort()` emit nothing. The listener reads the transaction as it was before the call: `depth`
is still the level being committed or rolled back, and `Operation` the previous statement.

```php
use RuntimeException;

use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ADI\Databases\SQL\Transaction\Events;

Emitter::$Instance->listen(Events::Commit, function (Emission $Emission): void {
   [$Transaction] = $Emission->payload;

   if ($Transaction->depth === 1) {
      throw new RuntimeException('Commits are paused.');
   }
});

try {
   $Database->await($Transaction->commit());
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // Commits are paused.
   $Transaction->depth;      // 1

   $Database->await($Transaction->abort());
}
```

Unlike the SQL events, which are observed only, these events keep the steering contract: a
listener that throws makes `begin()`, `commit()` or `rollback()` throw before any statement is
composed. The listener above refuses every top-level commit, a maintenance switch for instance; the
transaction stays open on its reserved connection, and `abort()`, which emits nothing, still ends
it. See **[Priority and propagation](/guide/events/overview/#priority-and-propagation)**.

## Reference

`Bootgly\ADI\Databases\SQL\Transaction` implements `Awaiting` and `Querying`, the surfaces a
repository runs on.

### Constructor

```php
__construct (SQL $Database)
```

Builds the transaction and composes its `BEGIN` at once: `Operation` holds it and `depth` is `1`.
`$Database->begin()` calls it. Emits no event.

### Methods

```php
begin (): Operation
```

At depth `0`, re-opens the transaction with a new `BEGIN`, a new exclusive claim on the pool.
Otherwise opens a nested savepoint, as `save()` does. Emits `Begin` first. Refused while a statement
is in flight.

```php
query (string|Builder|Query $query, array $parameters = [], null|object $Scope = null): Operation
```

Composes one statement on the pinned connection: raw SQL with `$parameters`, a Query Builder, or a
compiled `Query`, which both carry their own parameters. A write marks `$Scope` as written — by
default the current Fiber, else the facade. Throws `InvalidArgumentException` for an empty
statement or a builder that cannot compile; refused while a statement is in flight or when the
transaction is not active.

```php
table (BackedEnum|Stringable|Builder|Query $Table, null|BackedEnum|Stringable $Alias = null): Builder
```

Starts a Query Builder with the database's dialect. Pass the built statement to `query()`.

```php
map (string $Entity, null|object $Scope = null, null|Awaiting $Awaiting = null): Repository
```

Creates an ORM repository for a mapped entity class whose statements run through this transaction.
`$Awaiting` defaults to the transaction, so eager and lazy relations resolve during `hydrate()`;
`$Scope` is the read-after-write scope its writes mark.

```php
await (Operation $Operation): Operation
```

Waits for an operation through `$Database->await()` and returns it; throws a `RuntimeException`
with the operation's `error` when it fails. It is the await bridge `map()` gives repositories.

```php
commit (): Operation
```

At depth `1`, composes the `COMMIT`: `depth` drops to `0` and `Connection` to `null` at once. Above
depth `1`, releases the current savepoint. Emits `Commit` first. Refused while a statement is in
flight or when the transaction is not active.

```php
rollback (null|string $name = null): Operation
```

Without a name: at depth `1`, the top-level `ROLLBACK`, as `abort()` composes it; above, rolls back
the current savepoint and ends its level. With a name: rolls back to that savepoint and keeps it.
Emits `Rollback` first. Only the top-level form runs with a statement in flight.

```php
abort (): Operation
```

Composes the top-level `ROLLBACK` at any depth: discards an outstanding statement, ends every
savepoint and gives the pool reservation back. Emits no event, and is refused only when the
transaction is not active. Since 1.0.5.

```php
save (null|string $name = null): Operation
```

Creates a savepoint and adds a level to `depth`; without a name, it is `bootgly_0`, `bootgly_1` and
so on. Emits no event.

```php
release (null|string $name = null): Operation
```

Releases the current savepoint, or a named one with every savepoint after it. Emits no event.
Refused with `SQL transaction savepoint is not active.` when no savepoint is open.

### Properties

```php
public SQL $Database
```

The facade that created the transaction. Its pool, dialect, config and models are the ones the
transaction uses.

```php
public private(set) null|Operation $Operation
```

The latest operation the transaction composed: the `BEGIN`, a statement, a savepoint, the `COMMIT`
or the `ROLLBACK`. A refused call never replaces it.

```php
public private(set) null|Connection $Connection
```

The pooled connection the transaction is pinned to, or `null`: before its `BEGIN` gets a connection
— a `BEGIN` promoted from `pending` is picked up by the transaction's next call — and from the
moment `commit()`, an outer `rollback()` or `abort()` composes its teardown.

```php
public private(set) int $depth
```

The levels composed: `1` for the outer transaction and one more per savepoint, `0` once a teardown
closes it. It counts what was composed, not what the server opened: after a failed `BEGIN` it still
reads `1`.

```php
public protected(set) bool $pipelining
```

Always `false`: the transaction is a serial surface. Repositories read it to defer a pagination
`COUNT(*)` until hydration.

### Event cases

`Bootgly\ADI\Databases\SQL\Transaction\Events`, dispatched through `Emitter::$Instance` with the
`Transaction` as payload.

```php
case Begin;
```

`$Transaction->begin()` re-opened the transaction or opened a nested savepoint.

```php
case Commit;
```

`$Transaction->commit()` was called, at any depth.

```php
case Rollback;
```

`$Transaction->rollback()` was called, at any depth, named or not.
