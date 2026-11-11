# Database transactions

Transactions keep several SQL statements on the same pooled connection and finish them as
one unit. Use them when later writes depend on earlier writes, or when a failure should
roll back the whole group.

## The flow

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Transaction;
use Bootgly\API\Environment\Configs\DatabaseConfig;

enum Tables: string { case Users = 'users'; case Profiles = 'profiles'; }
enum Columns: string { case Id = 'id'; case UserId = 'user_id'; case Active = 'active'; }

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());

$deactivated = $Database->transact(function (Transaction $Transaction): int {
   $Deactivate = $Transaction
      ->table(Tables::Users)
      ->update()
      ->set(Columns::Active, false)
      ->filter(Columns::Id, Operators::Equal, 7);

   return $Transaction->await($Transaction->query($Deactivate))->affected;
});
```

`transact()` is one call for the whole unit of work: it begins the transaction, waits for the
`BEGIN`, runs your closure with the `Transaction`, commits and returns what the closure
returned. When the closure throws, the transaction is rolled back and the same throwable comes
out. Either way the transaction is over and its connection is back in the pool when the call
ends.

This opens `$Database` from the project's `database` config scope (see
**[Database DBAL](/guide/database-dbal/overview/)**), and `transact()` blocks until the
transaction ends: it is the form for a command, a job or a script. In an HTTP route, use the
per-worker
**[`$Response->Database`](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**
resource instead: its `transact()` has the same contract without blocking the worker, and its
callback takes two arguments — the transaction and the resource.

Inside the closure, await each statement before sending the next one: a transaction carries one
operation at a time, and a call sent while the previous one is still running is refused (see
**[Refusals](/manual/ADI/Databases/SQL/Transaction/overview/#refusals)**). Send every statement
of the unit of work through `$Transaction`: a `$Database->query()` made inside the closure runs
on another connection, outside the transaction.

### Step by step

`transact()` is built on calls you can also make yourself, when a transaction has to outlive one
function:

```php
$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Deactivate = $Transaction
   ->table(Tables::Users)
   ->update()
   ->set(Columns::Active, false)
   ->filter(Columns::Id, Operators::Equal, 7);

$Database->await($Transaction->query($Deactivate));
$Database->await($Transaction->commit());
```

`begin()` starts immediately and stores the `BEGIN` operation in
`$Transaction->Operation`. Await it before sending the first statement: a `begin()` called
while it is still in flight is refused with
`SQL transaction BEGIN is still in flight: await it before the next operation.`

## Commit or roll back

```php
use RuntimeException;

try {
   $Database->transact(function (Transaction $Transaction): void {
      $Create = $Transaction
         ->table(Tables::Users)
         ->insert()
         ->set(Columns::Active, true);

      $Transaction->await($Transaction->query($Create));

      throw new RuntimeException('The profile could not be created.');
   });
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // The profile could not be created.
   // Nothing was inserted, and the connection is back in the pool.
}
```

`$Transaction->await()` waits through the operation's pool (see
**[Await synchronously](/manual/ADI/Database/Pool/overview/#await-synchronously)**) and throws a
`RuntimeException` whose message is `$Operation->error` when the operation fails — a refused
call included. Let it escape the closure: `transact()` ends the transaction for you.

- **On return** it commits the whole transaction, not one level of it: every savepoint level the
  closure left open is released first, then the `COMMIT` is sent.
- **On a throwable** it rolls back level by level — one `rollback()` for each open level, so
  `Rollback` listeners hear every one — and rethrows the same throwable. When a level cannot be
  rolled back — a `Rollback` listener that throws, a statement the closure left in flight at a
  savepoint level, a rollback the server refuses — it ends the whole transaction with `abort()`
  instead, which composes the top-level `ROLLBACK` and emits no event (see
  **[Abort or roll back](/manual/ADI/Databases/SQL/Transaction/overview/#abort-or-roll-back)**).
  The throwable you get is still the closure's.
- **A `BEGIN` that fails** is thrown before the closure runs. **A `COMMIT` that fails** is
  thrown too — a deferred constraint, for example, which makes PostgreSQL roll the whole
  transaction back: `transact()` returns only after the outermost `COMMIT` succeeded.
- **A closure that returns with a statement still in flight** is not committed: the transaction
  is rolled back and `transact()` throws `SQL transaction operation is still active.`
- **A closure that ends the top level itself** — with `commit()`, `rollback()` or `abort()` —
  makes `transact()` throw `SQL transaction is not active.` What the closure did stands: a
  `commit()` it sent is committed, and this error does not undo it. Savepoints are yours to
  manage; the outer level is `transact()`'s.

After the call the transaction is over and the pinned connection is back in the pool — or was
dropped, when the teardown had to cut off a statement that had already reached the server,
whose slot then stays counted until that statement's deadline (see
**[Commit and rollback](/manual/ADI/Databases/SQL/Transaction/overview/#commit-and-rollback)**).
The `Transaction` reads depth `0`, with one exception: when the connection to the server was
lost in the middle of the work, the object keeps the depth it had. Nothing stays reserved
then either, but do not use that object again.

One failure is not the server's answer: the wait itself can throw, before the operation
finishes. `transact()` then withdraws that operation and drops its session, so nothing stays
reserved. For a `BEGIN` or a `ROLLBACK` the server rolls the work back. For the `COMMIT`, its
outcome on the server is unknown — it may have been applied — so read the data back before
retrying the unit of work.

### By hand

A transaction you drive yourself needs the same care. Wrap the work and the commit in
`try/catch`, and end the transaction with `abort()` in the `catch`:

```php
use Throwable;

$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

try {
   $Create = $Transaction
      ->table(Tables::Users)
      ->insert()
      ->set(Columns::Active, true);

   $Database->await($Transaction->query($Create));

   $Database->await($Transaction->commit());
}
catch (Throwable $Throwable) {
   try {
      $Database->await($Transaction->abort());
   }
   catch (Throwable) {
      // Refused or failed: the COMMIT already ended the transaction, or the session
      // is gone and the server rolled the work back. Keep the original error.
   }

   throw $Throwable;
}
```

The `catch` uses `abort()`, not `rollback()`: it composes the top-level `ROLLBACK` at any
depth, so it also unwinds every savepoint level the work opened (an unnamed `rollback()` only
ends the latest one), and it emits no `Rollback` event. The recipe commits inside the `try`, so
the `catch` also ends a transaction that `commit()` could not close: a `Commit` listener that
throws (see **[Events](/manual/ADI/Databases/SQL/Transaction/overview/#events)**) or a statement
the work left in flight. When the `COMMIT` itself fails, `commit()` has already closed the
transaction, so the `abort()` is refused and the `COMMIT`'s own error is the one rethrown.

## Builders, raw SQL and Query objects

`Transaction::table()` starts a Query Builder with the same dialect as the database.
`Transaction::query()` accepts the same query forms as `SQL::query()`:

```php
use Bootgly\ADI\Databases\SQL\Builder\Query;

$Database->await($Transaction->query('SELECT 1'));
$Database->await($Transaction->query(new Query('SELECT 2')));
$Database->await($Transaction->query($Transaction->table(Tables::Users)->select()));
```

All three run on the transaction's pinned connection. The second is a hand-built `Query`,
which counts as a write unless it is built with `reading: true`, so it also marks the
read-after-write scope — which only matters when replicas are configured (see
**[Read-after-write scope](/manual/ADI/Databases/SQL/Transaction/overview/#read-after-write-scope)**);
`transact()` marks the scope again once its outermost `COMMIT` succeeded, so the window counts
from the commit.
For entities, `$Transaction->map()` gives an ORM repository whose statements run inside the
transaction (see
**[Repositories inside a transaction](/manual/ADI/Databases/SQL/Transaction/overview/#repositories-inside-a-transaction)**).

## Savepoints

Savepoints are nested checkpoints inside the open transaction:

```php
use Throwable;

$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Database->await($Transaction->save('optional_profile'));

try {
   $Profile = $Transaction
      ->table(Tables::Profiles)
      ->insert()
      ->set(Columns::UserId, 7);

   $Database->await($Transaction->query($Profile));
}
catch (Throwable) {
   $Database->await($Transaction->rollback('optional_profile'));
}

$Database->await($Transaction->release('optional_profile'));
$Database->await($Transaction->commit());
```

`save()` creates an automatic savepoint name. `save('name')` creates a named savepoint.
`release()` releases the latest savepoint, while `release('name')` releases a named one.
`rollback()` rolls back the latest savepoint when nested, or the whole transaction when it
is not nested. `rollback('name')` rolls back to a named savepoint but keeps that savepoint,
and its level, open: that is why the recipe releases `optional_profile` after the
`try/catch`, on both paths. Without that `release()`, the final `commit()` would only release
the savepoint and leave the outer transaction open on its pinned connection.

Calling `begin()` while a transaction is already active also creates a savepoint. Calling
`commit()` while the depth is greater than `1` releases the current savepoint instead of
committing the outer transaction.

### Nested units of work

```php
$Database->transact(function (Transaction $Transaction) use ($Database): void {
   $Transaction->await($Transaction->query('UPDATE users SET active = false WHERE id = 7'));

   try {
      $Database->transact(function (Transaction $Transaction): void {
         $Transaction->await($Transaction->query('INSERT INTO profiles (user_id) VALUES (7)'));
      });
   }
   catch (RuntimeException) {
      // The profile is optional: the UPDATE above is still part of the transaction.
   }
});
```

A `transact()` called inside the closure does not open a second transaction: it nests on the one
already open, as a savepoint, and its closure receives the same `Transaction`. When the nested
closure returns, its savepoint is released; when it throws, that level alone is rolled back and
the throwable reaches the outer closure, which may catch it and carry on. A function that wraps
its own work in `transact()` can therefore be called on its own or from inside a larger unit of
work.

When the nested level cannot be closed — its rollback or its release is refused by the server,
or one of the cases above — the whole transaction is ended and the outer `transact()` reports
it — `SQL transaction is not active.` — rather than commit work it can no longer vouch for.
An outer closure that catches the nested failure has nothing left to continue: let it end, and
do not reopen the transaction with `begin()`. This also covers a `rollback()` or a `commit()` of
that level you send yourself: when the server refuses it, the nested `transact()` throws that
error even if the closure caught it and returned. Only a closure that catches it and then sends
more statements hides it — `transact()` cannot know the level is in doubt any more. The nesting
is per context: a `transact()` made from another Fiber opens its
own transaction on its own connection.

## Engine notes

- **PostgreSQL** — a statement that fails inside a transaction aborts the whole block. Every
  later statement fails on the server (SQLSTATE `25P02`), and the eventual `COMMIT` is
  answered as a rollback: the transaction is discarded. Catching an error and carrying on
  therefore does not save the work done before it, so `commit()` fails with
  `SQL transaction was rolled back by the server: a statement inside it had failed.` Use a
  savepoint around the statement you expect to fail, `rollback('name')` on it, then
  `release('name')`, as the savepoint recipe above does.
- **MySQL/MariaDB** — DDL statements (`CREATE`/`ALTER`/`DROP` ...) inside a transaction
  cause an **implicit commit**: keep schema changes out of transactional business flows.
- **SQLite** — transactions and savepoints work on the synchronous driver exactly like on
  the async ones; even DDL is transactional. A `COMMIT` that fails — on a
  `DEFERRABLE INITIALLY DEFERRED` key, or with `database is locked` — is rolled back before the
  connection serves anyone else, as on the other engines; its error is the engine's own message
  (`FOREIGN KEY constraint failed`, `database is locked`), so retry the whole transaction.
- Savepoint identifiers are quoted by the active dialect (`"bootgly_0"` on
  PostgreSQL/SQLite, `` `bootgly_0` `` on MySQL).

## Reference

- **[SQL database](/manual/ADI/Databases/SQL/overview/#reference)** — `transact()` and
  `begin()` on the facade.
- **[Transactions](/manual/ADI/Databases/SQL/Transaction/overview/)** — API, refusals,
  events, repositories and savepoint behavior.
- **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — build the statements
  executed by a transaction.
- **[Database queries](/guide/database-queries/overview/)** — everyday read/write query
  flow outside explicit transactions.
