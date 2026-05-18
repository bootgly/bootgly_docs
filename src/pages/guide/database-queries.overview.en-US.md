# Database queries

After your migrations create the tables, the daily loop is simple: build a query, run it
against the configured SQL database, then read the resulting `Operation`.

Use the **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** when query shape
comes from application code. Use raw SQL only when the builder is not the right fit.

In `HTTP_Server_CLI` routes, use the
**[Database DBAL](/guide/database-dbal/overview/)** guide to await operations through the
Response resource instead of calling `Pool->wait()` directly.

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

## Use a transaction when writes must stay together

When several statements must share one connection and commit or roll back as a unit, use
`SQL::begin()` and run builders through `Transaction::query()`. See
**[Database transactions](/guide/database-transactions/overview/)** for the full flow,
rollback pattern and savepoints.

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
- **[Database DBAL](/guide/database-dbal/overview/)** - async DBAL usage in HTTP responses.
- **[Reading rows](/manual/ADI/Databases/SQL/Builder/Reading/overview/)** - select, filters, joins, grouping and limits.
- **[Writing rows](/manual/ADI/Databases/SQL/Builder/Writing/overview/)** - insert, update, delete, output and upsert.
- **[Composing queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/)** - identifiers, expressions, subqueries and CTEs.
- **[Query dialects](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)** - PostgreSQL, MySQL and SQLite differences.
- **[Transactions](/manual/ADI/Databases/SQL/Transaction/overview/)** - commit, rollback and savepoints.
