# Query Builder

The Query Builder is how you read and write rows without concatenating SQL strings. It
builds DML statements: `SELECT`, `INSERT`, `UPDATE` and `DELETE`.

> New here? Follow the **[Database queries](/guide/database-queries/overview/)** guide
> first. This page explains the builder object, compilation and execution.

## The loop

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; case Active = 'active'; }

$Database = new SQL;

$Builder = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true);

$Query = $Builder->compile();
```

`$Query` is a `Bootgly\ADI\Databases\SQL\Builder\Query`:

```php
$Query->sql;        // SELECT "id", "name" FROM "users" WHERE "active" = $1
$Query->parameters; // [true]
```

To run it, pass the builder or the compiled query to the database:

```php
$Operation = $Database->query($Builder);
$Database->Pool->wait($Operation);

$rows = $Operation->rows;
```

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

Use `SQL::begin()` when several statements must run on the same connection:

```php
$Transaction = $Database->begin();
$Database->Pool->wait($Transaction->Operation);

$Builder = $Transaction
   ->table(Tables::Users)
   ->update()
   ->set(Columns::Active, false)
   ->filter(Columns::Id, Operators::Equal, 7);

$Database->Pool->wait($Transaction->query($Builder));
$Database->Pool->wait($Transaction->commit());
```

`Transaction::table()` starts a builder with the same database dialect. `Transaction::query()`
accepts raw SQL, `Builder` and `Query`, like `SQL::query()`.

## Reference

### SQL facade

```php
table (BackedEnum|Stringable|Builder|Query $Table, null|BackedEnum|Stringable $Alias = null): Builder
```
Start a query builder for one table or derived source.

```php
query (string|Builder|Query $query, array $parameters = []): Operation
```
Create an async SQL operation from raw SQL, a builder or a compiled query.

```php
begin (): Transaction
```
Start a transaction pinned to one pooled connection.

### Builder lifecycle

```php
compile (null|Dialect $Dialect = null): Query
```
Compile the builder into SQL and ordered parameters. Passing a dialect replays the fluent
actions through that dialect and memoizes the result by dialect class.

### Supporting objects

```php
new Query(string $sql, array $parameters = [])
```
Compiled SQL text plus ordered parameters. `__toString()` returns the SQL string.

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
