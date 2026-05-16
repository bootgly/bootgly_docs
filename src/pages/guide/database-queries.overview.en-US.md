# Database queries

After your migrations create the tables, the daily loop is simple: build a query, run it
against the configured SQL database, then read the resulting `Operation`.

Use the **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** when query shape
comes from application code. Use raw SQL only when the builder is not the right fit.

## The flow

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; case Active = 'active'; }

$Database = new SQL;

$Users = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true);

$Operation = $Database->query($Users);
$Database->Pool->wait($Operation);

$rows = $Operation->rows;
```

`SQL::table()` starts the builder with the database dialect already selected. Passing the
builder to `SQL::query()` compiles it into SQL and ordered parameters before the operation
is assigned to the pool.

## Read rows

```php
$Users = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Name, Operators::Equal, 'Ada')
   ->limit(10);

$Operation = $Database->query($Users);
$Database->Pool->wait($Operation);
```

Compiled for PostgreSQL:

```sql
SELECT "id", "name" FROM "users" WHERE "name" = $1 LIMIT 10
```

Parameters:

```php
['Ada']
```

## Write rows

```php
$Insert = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Name, 'Ada')
   ->set(Columns::Active, true)
   ->output(Columns::Id);

$Operation = $Database->query($Insert);
$Database->Pool->wait($Operation);
```

PostgreSQL and SQLite support `output()` through `RETURNING`. MySQL rejects that capability,
so omit `output()` there and read generated values with the driver-specific flow your app
uses.

## Update inside a transaction

Transactions pin queries to one pooled connection. Wait for each operation before sending
the next statement on the same transaction.

```php
$Transaction = $Database->begin();
$Database->Pool->wait($Transaction->Operation);

$Update = $Transaction
   ->table(Tables::Users)
   ->update()
   ->set(Columns::Active, false)
   ->filter(Columns::Id, Operators::Equal, 7);

$Database->Pool->wait($Transaction->query($Update));
$Database->Pool->wait($Transaction->commit());
```

`update()` and `delete()` require at least one `filter()`. The builder stops global mutation
queries before they can run.

## Dynamic names and raw expressions

Prefer backed enums for table and column names. When a name is only known at runtime, wrap
it in `Identifier` so the dialect can quote it safely:

```php
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Users = $Database
   ->table(new Identifier('public.users'))
   ->select(new Identifier('id'));
```

Use `Expression` only for trusted SQL fragments:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;

$Now = new Expression('NOW()');

$Query = $Database
   ->table(Tables::Users)
   ->select($Now);
```

`Expression` does not carry bindings. Values that come from users should go through
`filter()` or `set()` so they become parameters.

## Next references

- **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** - lifecycle, compile and execution.
- **[Reading rows](/manual/ADI/Databases/SQL/Builder/Reading/overview/)** - select, filters, joins, grouping and limits.
- **[Writing rows](/manual/ADI/Databases/SQL/Builder/Writing/overview/)** - insert, update, delete, output and upsert.
- **[Composing queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/)** - identifiers, expressions, subqueries and CTEs.
- **[Query dialects](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)** - PostgreSQL, MySQL and SQLite differences.
