# Query Builder

The Query Builder is how you read and write rows without concatenating SQL strings. It
builds DML statements: `SELECT`, `INSERT`, `UPDATE` and `DELETE`.

> New here? Follow the **[Database queries](/guide/database-queries/overview/)** guide
> first. This page explains the builder object, compilation and execution.

## The loop

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\API\Environment\Configs\DatabaseConfig;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; case Active = 'active'; }

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());

$Builder = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true);

$Query = $Builder->compile();
```

`$Query` is a `Bootgly\ADI\Databases\SQL\Builder\Query`:

```php
$Query->SQL;        // SELECT "id", "name" FROM "users" WHERE "active" = $1
$Query->parameters; // [true]
```

To run it, pass the builder or the compiled query to the database:

```php
$Operation = $Database->query($Builder);
$Database->Pool->wait($Operation);

$rows = $Operation->rows;
```

> **Opening the database.** The `DatabaseConfig` line reads the project's `database` config
> scope, so it runs in a project's boot function, a command or a script inside the project
> (without a `configs/` directory, `BOOTGLY_PROJECT->Configs` is `null`). In an
> `HTTP_Server_CLI` route, use the per-worker
> **[`$Response->Database`](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**
> resource instead. Outside a project, pass the connection as an array:
> `new SQL(['driver' => 'pgsql', 'host' => '127.0.0.1', 'port' => 5432, 'database' => 'app', 'username' => 'app', 'password' => 'secret'])`.
> A bare `new SQL` reads no config: it uses the built-in local defaults (PostgreSQL at
> `127.0.0.1:5432`, database `bootgly`, user `postgres`).

## Names are typed

Builder identifiers are not raw strings. Use a string-backed enum for stable application
names, or `Identifier` for dynamic names:

```php
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Database
   ->table(new Identifier('public.users'))
   ->select(new Identifier('id'));
```

`Identifier` still quotes the value through the active dialect. Use `Expression` only for
trusted SQL fragments that should not be quoted:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;

$Database
   ->table(Tables::Users)
   ->select(new Expression('NOW()'));
```

## Execution model

`SQL::query()` accepts three forms:

```php
$Database->query('SELECT 1');
$Database->query($Builder);
$Database->query($Builder->compile());
```

All three return a SQL `Operation`. The operation stores the SQL text, parameters, affected
row count, result columns and result rows. In scripts and tests, `Pool->wait()` drives the
operation to completion. In HTTP code, use the response scheduler flow already used by your
route.

## Transactions

Use `SQL::begin()` when several statements must run on the same connection and commit or
roll back together. `Transaction::table()` starts the same Query Builder surface with the
database dialect, and `Transaction::query()` accepts raw SQL, `Builder` and `Query`, like
`SQL::query()`.

See **[Transactions](/manual/ADI/Databases/SQL/Transaction/overview/)** for commit,
rollback and savepoints.

## Reference

### SQL facade

```php
table (BackedEnum|Stringable|Builder|Query $Table, null|BackedEnum|Stringable $Alias = null): Builder
```
Start a query builder for one table or derived source.

```php
query (string|Builder|Query $query, array $parameters = [], null|object $Scope = null): Operation
```
Create an async SQL operation from raw SQL, a builder or a compiled query.
`$Scope` names the operation's read-after-write scope (by default the current Fiber, else the
facade): after a write through a scope, reads through that scope stay on the primary for the
sticky window. It only matters when replicas are configured; see
**[Database read replicas](/guide/database-read-replicas/overview/#read-after-write-scope)**.

```php
begin (): Transaction
```
Start a transaction pinned to one pooled connection. See
**[Transactions](/manual/ADI/Databases/SQL/Transaction/overview/)**.

### Builder lifecycle

```php
compile (null|Dialect $Dialect = null): Query
```
Compile the builder into SQL and ordered parameters. Passing a dialect replays the fluent
actions through that dialect and memoizes the result by dialect class.

```php
public private(set) array $assignments
```
The values each `set()` assigned, keyed by the compiled column — the dialect-quoted
identifier, or the raw SQL of an `Expression` — with one value per row. Read-only outside the
builder; the seed Runner reads it to move identity sequences on PostgreSQL.

### Supporting objects

```php
new Query(string $sql, array $parameters = [], bool $reading = false)
```
Compiled SQL text plus ordered parameters. `__toString()` returns the SQL string. `$reading`
decides **[read replica](/guide/database-read-replicas/overview/)** routing and only matters
when replicas are configured: `true` lets `SQL::query()` send the query to a replica, while the
default `false` keeps it on the primary and counts it as a write for read-after-write.

```php
new Identifier(string $name)
```
Dynamic table or column name. The active dialect quotes each dotted segment.

```php
new Expression(string $sql)
```
Trusted raw SQL fragment. It is inserted as-is and does not carry parameter bindings.

Next: **[Reading rows](/manual/ADI/Databases/SQL/Builder/Reading/overview/)** and
**[Writing rows](/manual/ADI/Databases/SQL/Builder/Writing/overview/)**.
