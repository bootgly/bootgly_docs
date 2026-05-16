# Composing queries

Use this page when the query needs more than a flat `SELECT`: dynamic identifiers, trusted
expressions, grouped predicates, subqueries, derived tables and CTEs.

## Dynamic identifiers

Prefer enums for stable names. Use `Identifier` when the name is dynamic:

```php
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Query = $Database
   ->table(new Identifier('public.users'))
   ->select(new Identifier('id'))
   ->compile();
```

PostgreSQL:

```sql
SELECT "id" FROM "public"."users"
```

Dotted names are quoted segment by segment. Empty segments are rejected.

## Trusted expressions

`Expression` is the raw SQL escape hatch:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;

$Now = new Expression('NOW()');
$LowerName = new Expression('LOWER("name")');

$Database
   ->table(Tables::Users)
   ->select($Now)
   ->alias($Now, Aliases::Current)
   ->filter($LowerName, Operators::Equal, 'ada');
```

PostgreSQL:

```sql
SELECT NOW() AS "current" FROM "users" WHERE LOWER("name") = $1
```

`Expression` does not carry bindings. Keep user values in `filter()` and `set()`.

## Nested filters

```php
use Bootgly\ADI\Databases\SQL\Builder;

$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->nest(function (Builder $Group): void {
      $Group
         ->filter(Columns::Active, Operators::IsTrue)
         ->or
         ->filter(Columns::Name, Operators::Equal, 'Ada');
   })
   ->filter(Columns::Id, Operators::Greater, 10);
```

PostgreSQL:

```sql
SELECT "id" FROM "users" WHERE ("active" IS TRUE OR "name" = $1) AND "id" > $2
```

`nest()` applies to `WHERE` filters. The group must add at least one `filter()`.

## IN subqueries

```php
$Subquery = $Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Name, Operators::Equal, 'Ada');

$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Active, Operators::Equal, true)
   ->filter(Columns::Id, Operators::In, $Subquery)
   ->compile();
```

PostgreSQL:

```sql
SELECT "id" FROM "users" WHERE "active" = $1 AND "id" IN (SELECT "id" FROM "users" WHERE "name" = $2)
```

Subquery parameters are merged after the outer parameters. PostgreSQL and SQLite numbered
placeholders are rebased automatically; MySQL uses anonymous `?` placeholders.

## Derived tables

```php
$Source = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true);

$Query = $Database
   ->table($Source, Aliases::U)
   ->select(new Identifier('u.id'))
   ->filter(new Identifier('u.name'), Operators::Equal, 'Ada')
   ->compile();
```

PostgreSQL:

```sql
SELECT "u"."id" FROM (SELECT "id", "name" FROM "users" WHERE "active" = $1) AS "u" WHERE "u"."name" = $2
```

Derived table sources require an alias and are valid only for SELECT.

## Common table expressions

```php
$Recent = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true);

$Query = $Database
   ->define(new Identifier('recent'), $Recent)
   ->table(new Identifier('recent'))
   ->select(Columns::Id)
   ->filter(Columns::Name, Operators::Equal, 'Ada')
   ->compile();
```

PostgreSQL:

```sql
WITH "recent" AS (SELECT "id", "name" FROM "users" WHERE "active" = $1) SELECT "id" FROM "recent" WHERE "name" = $2
```

Pass `recursive: true` to emit `WITH RECURSIVE`.

## Reference

```php
new Identifier(string $name)
```
Wrap a runtime table or column name so the dialect can quote it.

```php
new Expression(string $sql)
```
Wrap trusted raw SQL so the builder does not quote or bind it.

```php
nest (Closure $Group): static
```
Append one grouped `WHERE` predicate scope.

```php
define (BackedEnum|Stringable $Name, Builder|Query $Query, bool $recursive = false): static
```
Add one CTE before the main statement.

```php
table (BackedEnum|Stringable|Builder|Query $Table, null|BackedEnum|Stringable $Alias = null): static
```
Set a base table or a derived SELECT source. Derived sources require an alias.
