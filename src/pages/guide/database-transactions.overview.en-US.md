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
$Database->Pool->wait($Transaction->Operation);

$Deactivate = $Transaction
   ->table(Tables::Users)
   ->update()
   ->set(Columns::Active, false)
   ->filter(Columns::Id, Operators::Equal, 7);

$Database->Pool->wait($Transaction->query($Deactivate));
$Database->Pool->wait($Transaction->commit());
```

This opens `$Database` from the project's `database` config scope (see
**[Database DBAL](/guide/database-dbal/overview/)**): the form for a boot function, a command or
a script that runs inside a project. In an HTTP route, use the per-worker
**[`$Response->Database`](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**
resource instead: its `transact()` begins the transaction, runs your callback and commits, or
rolls back when the callback throws.

`begin()` starts immediately and stores the `BEGIN` operation in
`$Transaction->Operation`. Wait for it before sending the first statement. Then wait for
each later operation before sending the next one on that transaction.

## Commit or roll back

`Pool::wait()` throws a `RuntimeException` whose message is `$Operation->error` when the
operation it waits for fails (`SQL::await()` does the same). Wrap the application work and the
commit in `try/catch`, and end the transaction with `abort()` in the `catch`:

```php
$Transaction = $Database->begin();
$Database->Pool->wait($Transaction->Operation);

try {
   $Create = $Transaction
      ->table(Tables::Users)
      ->insert()
      ->set(Columns::Active, true);

   $Database->Pool->wait($Transaction->query($Create));

   $Database->Pool->wait($Transaction->commit());
}
catch (Throwable $Throwable) {
   try {
      $Database->Pool->wait($Transaction->abort());
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
throws (see **[Events](/guide/events/overview/)**) or a statement the work left in flight,
which makes `commit()` return a refused operation. When the `COMMIT` itself fails — a deferred
constraint, for example, which makes PostgreSQL roll the whole transaction back — `commit()`
has already closed the transaction, so the `catch`'s `abort()` is refused and the `COMMIT`'s
own error is the one rethrown.

The `catch` uses `abort()`, not `rollback()`: it composes the top-level `ROLLBACK` at any
depth, so it also unwinds every savepoint level the work opened (an unnamed `rollback()` only
ends the latest one), and it emits no `Rollback` event — a `Rollback` listener can neither
refuse this teardown nor see it.

## Builders, raw SQL and Query objects

`Transaction::table()` starts a Query Builder with the same dialect as the database.
`Transaction::query()` accepts the same query forms as `SQL::query()`:

```php
use Bootgly\ADI\Databases\SQL\Builder\Query;

$Database->Pool->wait($Transaction->query('SELECT 1'));
$Database->Pool->wait($Transaction->query(new Query('SELECT 2')));
$Database->Pool->wait($Transaction->query($Transaction->table(Tables::Users)->select()));
```

## Savepoints

Savepoints are nested checkpoints inside the open transaction:

```php
$Transaction = $Database->begin();
$Database->Pool->wait($Transaction->Operation);

$Database->Pool->wait($Transaction->save('optional_profile'));

try {
   $Profile = $Transaction
      ->table(Tables::Profiles)
      ->insert()
      ->set(Columns::UserId, 7);

   $Database->Pool->wait($Transaction->query($Profile));
}
catch (Throwable) {
   $Database->Pool->wait($Transaction->rollback('optional_profile'));
}

$Database->Pool->wait($Transaction->release('optional_profile'));
$Database->Pool->wait($Transaction->commit());
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

- **[Transactions](/manual/ADI/Databases/SQL/Transaction/overview/)** — API, state and
  savepoint behavior.
- **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — build the statements
  executed by a transaction.
- **[Database queries](/guide/database-queries/overview/)** — everyday read/write query
  flow outside explicit transactions.
