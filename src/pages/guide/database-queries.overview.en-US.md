# Database queries

After your migrations create the tables, the daily loop is simple: build a query, run it
against the database your project configures in `configs/database`, then read the resulting
`Operation`.

Use the **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** when query shape
comes from application code. Use raw SQL only when the builder is not the right fit.

In `HTTP_Server_CLI` routes, do not build `SQL` yourself: use the per-worker
`$Response->Database`
**[Response Resource](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**. The
**[Database DBAL](/guide/database-dbal/overview/)** guide shows how to await operations
through it instead of calling `Pool->wait()` directly.

## The flow

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\API\Environment\Configs\DatabaseConfig;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; case Active = 'active'; }

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());

$Users = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true);

$Operation = $Database->query($Users);
$Database->Pool->wait($Operation);

$rows = $Operation->rows;
```

This builds `SQL` from the project's `database` config scope, so it runs inside a project (its
boot function, a command or a script) whose `configs/database` defines that scope; see
**[Configure the database](/guide/database-dbal/overview/#configure-the-database)**. In a
project without a `configs/` directory, `BOOTGLY_PROJECT->Configs` is `null`. Outside a
project, pass the connection settings as an array, for example
`new SQL(['driver' => 'pgsql', 'host' => '127.0.0.1', 'port' => 5432, 'database' => 'app', 'username' => 'app', 'password' => 'secret'])`.
A bare `new SQL` never reads your project config: it uses the built-in local defaults
(PostgreSQL at `127.0.0.1:5432`, database `bootgly`, user `postgres`, empty password), and an
array falls back to them for every key it omits, whatever its `driver`, so a MySQL array must
set `port` and `username` too.

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

When read replicas are configured, read builders like this can route to a replica unless the
current scope is sticky after a write. See
**[Database read replicas](/guide/database-read-replicas/overview/)** for the routing rules.

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

Only PostgreSQL supports `output()`, which compiles to `RETURNING`; the returned columns
arrive in `$Operation->rows`. MySQL and SQLite reject it (`output()` throws
`InvalidArgumentException` with `SQL dialect does not support RETURNING output.`), so omit it
there and read the generated key from `$Operation->Result->inserted` after awaiting the
operation; PostgreSQL leaves that field at `0`. See
**[Returning output](/manual/ADI/Databases/SQL/Builder/Writing/overview/#returning-output)**
and
**[Generated keys without RETURNING](/manual/ADI/Databases/SQL/Drivers/overview/#generated-keys-without-returning)**.

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
- **[Database ORM](/guide/database-orm/overview/)** - Data Mapper entities over SQL operations.
- **[Database read replicas](/guide/database-read-replicas/overview/)** - route safe reads to replicas and keep writes on primary.
- **[Reading rows](/manual/ADI/Databases/SQL/Builder/Reading/overview/)** - select, filters, joins, grouping and limits.
- **[Writing rows](/manual/ADI/Databases/SQL/Builder/Writing/overview/)** - insert, update, delete, output and upsert.
- **[Composing queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/)** - identifiers, expressions, subqueries and CTEs.
- **[Query dialects](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)** - PostgreSQL, MySQL and SQLite differences.
- **[Transactions](/manual/ADI/Databases/SQL/Transaction/overview/)** - commit, rollback and savepoints.
