# Database transactions

Transactions keep several SQL statements on the same pooled connection and finish them as
one unit. Use them when later writes depend on earlier writes, or when a failure should
roll back the whole group.

## The flow

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\API\Environment\Configs\DatabaseConfig;

enum Tables: string { case Users = 'users'; case Profiles = 'profiles'; }
enum Columns: string { case Id = 'id'; case UserId = 'user_id'; case Active = 'active'; }

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());

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

This opens `$Database` from the project's `database` config scope (see
**[Database DBAL](/guide/database-dbal/overview/)**): the form for a boot function, a command or
a script that runs inside a project. In an HTTP route, use the per-worker
**[`$Response->Database`](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**
resource instead: its `transact()` begins the transaction, runs your callback and commits, or
rolls back when the callback throws.

`begin()` starts immediately and stores the `BEGIN` operation in
`$Transaction->Operation`. Await it before sending the first statement, then await each later
operation before sending the next one: a transaction carries one operation at a time, and a
call sent while the previous one is still running is refused (see
**[Refusals](/manual/ADI/Databases/SQL/Transaction/overview/#refusals)**).

## Commit or roll back

`$Database->await()` waits through the operation's pool (see
**[Await synchronously](/manual/ADI/Database/Pool/overview/#await-synchronously)**) and throws a
`RuntimeException` whose message is `$Operation->error` when the operation fails — a refused
call included. Wrap the application work and the commit in `try/catch`, and end the transaction
with `abort()` in the `catch`:

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
      // Refused: the COMMIT already ended the transaction, or the session is gone and the
      // server rolled the work back. Keep the original error.
   }

   throw $Throwable;
}
```

After `commit()`, an outer `rollback()` or `abort()`, the transaction depth is `0` and the
pinned connection is released back to the pool. The recipe commits inside the `try`, so the
`catch` also ends a transaction that `commit()` could not close: a `Commit` listener that
throws (see **[Events](/manual/ADI/Databases/SQL/Transaction/overview/#events)**) or a
statement the work left in flight, which makes `commit()` return a refused operation. When the
`COMMIT` itself fails — a deferred constraint, for example, which makes PostgreSQL roll the
whole transaction back — `commit()` has already closed the transaction, so the `catch`'s
`abort()` is refused and the `COMMIT`'s own error is the one rethrown.

The `catch` uses `abort()`, not `rollback()`: it composes the top-level `ROLLBACK` at any
depth, so it also unwinds every savepoint level the work opened (an unnamed `rollback()` only
ends the latest one), and it emits no `Rollback` event — a `Rollback` listener can neither
refuse this teardown nor see it (see
**[Abort or roll back](/manual/ADI/Databases/SQL/Transaction/overview/#abort-or-roll-back)**).

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
**[Read-after-write scope](/manual/ADI/Databases/SQL/Transaction/overview/#read-after-write-scope)**).
For entities, `$Transaction->map()` gives an ORM repository whose statements run inside the
transaction (see
**[Repositories inside a transaction](/manual/ADI/Databases/SQL/Transaction/overview/#repositories-inside-a-transaction)**).

## Savepoints

Savepoints are nested checkpoints inside the open transaction:

```php
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

## Engine notes

- **PostgreSQL** — a statement that fails inside a transaction aborts the whole block. Every
  later statement is refused, and the eventual `COMMIT` is answered as a rollback: the
  transaction is discarded. Catching an error and carrying on therefore does not save the
  work done before it, so `commit()` fails with
  `SQL transaction was rolled back by the server: a statement inside it had failed.` Use a
  savepoint around the statement you expect to fail, `rollback('name')` on it, then
  `release('name')`, as the savepoint recipe above does.
- **MySQL/MariaDB** — DDL statements (`CREATE`/`ALTER`/`DROP` ...) inside a transaction
  cause an **implicit commit**: keep schema changes out of transactional business flows.
- **SQLite** — transactions and savepoints work on the synchronous driver exactly like on
  the async ones; even DDL is transactional. For now, keep foreign keys immediate (the
  default): when a `COMMIT` fails on a `DEFERRABLE INITIALLY DEFERRED` key, SQLite keeps the
  transaction open, but Bootgly hands the connection back as if it had ended, so later
  statements on that connection run inside the leftover transaction.
- Savepoint identifiers are quoted by the active dialect (`"bootgly_0"` on
  PostgreSQL/SQLite, `` `bootgly_0` `` on MySQL).

## Reference

- **[Transactions](/manual/ADI/Databases/SQL/Transaction/overview/)** — API, refusals,
  events, repositories and savepoint behavior.
- **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — build the statements
  executed by a transaction.
- **[Database queries](/guide/database-queries/overview/)** — everyday read/write query
  flow outside explicit transactions.
