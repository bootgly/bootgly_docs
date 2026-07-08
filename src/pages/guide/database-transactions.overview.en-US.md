# Database transactions

Transactions keep several SQL statements on the same pooled connection and finish them as
one unit. Use them when later writes depend on earlier writes, or when a failure should
roll back the whole group.

## The flow

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;

enum Tables: string { case Users = 'users'; case Profiles = 'profiles'; }
enum Columns: string { case Id = 'id'; case UserId = 'user_id'; case Active = 'active'; }

$Database = new SQL;

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

`begin()` starts immediately and stores the `BEGIN` operation in
`$Transaction->Operation`. Wait for it before sending the first statement. Then wait for
each later operation before sending the next one on that transaction.

## Commit or roll back

Wrap application work in `try/catch` and roll back when any operation fails:

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
   $Database->Pool->wait($Transaction->rollback());

   throw $Throwable;
}
```

After `commit()` or outer `rollback()`, the transaction depth is `0` and the pinned
connection is released back to the pool.

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
   $Database->Pool->wait($Transaction->release('optional_profile'));
}
catch (Throwable) {
   $Database->Pool->wait($Transaction->rollback('optional_profile'));
}

$Database->Pool->wait($Transaction->commit());
```

`save()` creates an automatic savepoint name. `save('name')` creates a named savepoint.
`release()` releases the latest savepoint, while `release('name')` releases a named one.
`rollback()` rolls back the latest savepoint when nested, or the whole transaction when it
is not nested. `rollback('name')` rolls back to a named savepoint.

Calling `begin()` while a transaction is already active also creates a savepoint. Calling
`commit()` while the depth is greater than `1` releases the current savepoint instead of
committing the outer transaction.

## Engine notes

- **MySQL/MariaDB** — DDL statements (`CREATE`/`ALTER`/`DROP` ...) inside a transaction
  cause an **implicit commit**: keep schema changes out of transactional business flows.
- **SQLite** — transactions and savepoints work on the synchronous driver exactly like on
  the async ones; even DDL is transactional.
- Savepoint identifiers are quoted by the active dialect (`"bootgly_0"` on
  PostgreSQL/SQLite, `` `bootgly_0` `` on MySQL).

## Reference

- **[Transactions](/manual/ADI/Databases/SQL/Transaction/overview/)** — API, state and
  savepoint behavior.
- **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — build the statements
  executed by a transaction.
- **[Database queries](/guide/database-queries/overview/)** — everyday read/write query
  flow outside explicit transactions.
