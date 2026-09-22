# Reading rows

Start with `$Database->table(...)`, choose columns, then add filters and result shaping.

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;

$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true)
   ->order(Orders::Asc, Columns::Name)
   ->limit(10, 5)
   ->compile();
```

PostgreSQL:

```sql
SELECT "id", "name" FROM "users" WHERE "active" = $1 ORDER BY "name" ASC LIMIT 10 OFFSET 5
```

## Select and distinct

```php
$Database->table(Tables::Users)->select(Columns::Id, Columns::Name);
$Database->table(Tables::Users)->select(); // SELECT *
$Database->table(Tables::Users)->distinct()->select(Columns::Name);
```

`select()`, `count()` and `aggregate()` append projections in call order:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Aggregates;

$Database
   ->table(Tables::Users)
   ->aggregate(Aggregates::Maximum, Columns::Id, Aliases::Total)
   ->select(Columns::Name);
```

Compiles to:

```sql
SELECT MAX("id") AS "total", "name" FROM "users"
```

## Filters

```php
$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Id, Operators::Between, [1, 10])
   ->filter(Columns::Name, Operators::IsNotNull);
```

Operators:

| Case | SQL |
|------|-----|
| `Equal`, `Unequal` | `=`, `<>` |
| `Greater`, `GreaterOrEqual`, `Less`, `LessOrEqual` | comparisons |
| `Between` | two values |
| `In` | non-empty array or subquery |
| `IsNull`, `IsNotNull`, `IsTrue`, `IsFalse` | no value |

`Between` must receive exactly two values. `In` must receive a non-empty array or a builder/
compiled query. Literal filters reject values.

## Text matching

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Matches;

$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->match(Columns::Name, 'Ada%')
   ->match(Columns::Bio, 'database', Matches::Text);
```

`Matches::Like` is the default. `Matches::Insensitive` and `Matches::Text` compile through
the active dialect.

## Joins and aliases

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Joins;

$Query = $Database
   ->table(Tables::Users)
   ->alias(Tables::Users, Aliases::U)
   ->select(Columns::UsersId)
   ->join(Tables::Profiles, Columns::UsersId, Operators::Equal, Columns::ProfilesUser, Joins::Left)
   ->alias(Tables::Profiles, Aliases::P)
   ->filter(Columns::ProfilesUser, Operators::IsNotNull)
   ->compile();
```

Aliases rewrite qualified references in `SELECT`, `JOIN`, `WHERE`, `GROUP BY` and
`ORDER BY`. You can register a table alias before or after `table()` / `join()`.

## Grouping, having and order

```php
$Database
   ->table(Tables::Users)
   ->distinct()
   ->select(Columns::Name)
   ->group(Columns::Name)
   ->having(Columns::Name, Operators::IsNotNull)
   ->order(Orders::Asc, Columns::Name);
```

Ordering can include null placement:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Nulls;

$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->order(Orders::Asc, Columns::Name, Nulls::Last);
```

## Counting and aggregates

Count per group with `Aggregates::Count` — here, how many posts each user has written:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Aggregates;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Joins;

$Query = $Database
   ->table(Tables::Users)
   ->alias(Tables::Users, Aliases::U)
   ->select(Columns::UsersId)
   ->aggregate(Aggregates::Count, Columns::PostsId, Aliases::Posts)
   ->join(Tables::Posts, Columns::PostsUser, Operators::Equal, Columns::UsersId, Joins::Left)
   ->alias(Tables::Posts, Aliases::P)
   ->group(Columns::UsersId)
   ->compile();
```

PostgreSQL:

```sql
SELECT "u"."id", COUNT("p"."id") AS "posts" FROM "users" AS "u" LEFT JOIN "posts" AS "p" ON "p"."user_id" = "u"."id" GROUP BY "u"."id"
```

Count the joined column, not the rows. A user with no posts still gets one row from the
`LEFT JOIN`, with every `posts` column `NULL`: `count()` compiles `COUNT(*)` and reports that
user with 1 post, while `COUNT("p"."id")` skips the `NULL` and reports 0. The aggregated
column follows table aliases like every other reference, whether the alias is registered
before or after `aggregate()`.

To filter on the count, pass `having()` an `Expression`, before `compile()`. Its text reaches
the database as written, so spell the table aliases in it:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;

$Query = $Database
   ->table(Tables::Users)
   ->alias(Tables::Users, Aliases::U)
   ->select(Columns::UsersId)
   ->aggregate(Aggregates::Count, Columns::PostsId, Aliases::Posts)
   ->join(Tables::Posts, Columns::PostsUser, Operators::Equal, Columns::UsersId, Joins::Left)
   ->alias(Tables::Posts, Aliases::P)
   ->group(Columns::UsersId)
   ->having(new Expression('COUNT("p"."id")'), Operators::Greater, 1)
   ->compile();
```

The statement ends in `GROUP BY "u"."id" HAVING COUNT("p"."id") > $1`.

`distinct: true` aggregates each distinct value once:

```php
$Database
   ->table(Tables::Users)
   ->aggregate(Aggregates::Count, Columns::City, Aliases::Cities, distinct: true);
```

Compiles to:

```sql
SELECT COUNT(DISTINCT "city") AS "cities" FROM "users"
```

It works with every aggregate. It is not `distinct()`, which removes duplicate result rows
(`SELECT DISTINCT`) and never enters the aggregate.

> Since 1.0.3 — before, `Aggregates` had no `Count`, `aggregate()` had no `distinct`
> argument, and an aggregated column ignored table aliases.

## Limit, offset and locks

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Locks;

$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->limit(25)
   ->skip(50)
   ->lock(Locks::Update);
```

`limit($count, $offset)` sets both values. `skip($offset)` sets only the offset. Both reject
negative integers. Locks append `FOR UPDATE` or `FOR SHARE`.

Skipping without a limit is spelled differently by each dialect, and the builder handles that
for you. Only PostgreSQL's grammar accepts a standalone `OFFSET n`; MySQL and SQLite require a
row count before it, so the builder supplies the one each of them reads as "no limit" —
`18446744073709551615` for MySQL, `-1` for SQLite. The two are not interchangeable: each
engine rejects the other's. Write `skip(50)` and the same query runs everywhere.

## Reference

```php
select (BackedEnum|Stringable ...$Columns): static
```
Switch to SELECT mode and append selected columns. No columns means `*`.

```php
distinct (): static
```
Switch to SELECT mode and emit `SELECT DISTINCT`.

```php
filter (BackedEnum|Stringable $Column, Operators $Operator, mixed $value = null): static
```
Append one `WHERE` predicate. Use `->or->filter(...)` or `->and->filter(...)` to choose the next predicate junction.

```php
match (BackedEnum|Stringable $Column, mixed $value, Matches $Match = Matches::Like): static
```
Append one text predicate. The value must be a string. Use `->or->match(...)` or `->and->match(...)` for explicit junctions.

```php
join (BackedEnum|Stringable $Table, BackedEnum|Stringable $Left, Operators $Operator, BackedEnum|Stringable $Right, Joins $Join = Joins::Inner): static
```
Append a table join with an identifier comparison.

```php
alias (BackedEnum|Stringable $Identifier, BackedEnum|Stringable $Alias): static
```
Alias a table, column or expression.

```php
aggregate (Aggregates $Aggregate, BackedEnum|Stringable $Column, null|BackedEnum|Stringable $Alias = null, bool $distinct = false): static
```
Append `AVG`, `COUNT`, `MAX`, `MIN` or `SUM` over one column. The column resolves through table aliases at compile time. `distinct: true` compiles `FUNC(DISTINCT column)`. A bare `*` column is refused — `COUNT(*)` is `count()`. Since 1.0.3 for `Count`, `distinct` and the alias resolution.

```php
count (null|BackedEnum|Stringable $Alias = null): static
```
Append `COUNT(*)`, which counts rows — including the `NULL`-filled row a `LEFT JOIN` produces for an unmatched parent. To count a column's non-`NULL` values, use `aggregate(Aggregates::Count, ...)`.

```php
group (BackedEnum|Stringable ...$Columns): static
```
Append `GROUP BY` columns.

```php
having (BackedEnum|Stringable $Column, Operators $Operator, mixed $value = null): static
```
Append one `HAVING` predicate. Use `->or->having(...)` or `->and->having(...)` for explicit junctions.

```php
order (Orders $Order, BackedEnum|Stringable $Column, null|Nulls $Nulls = null): static
```
Append one `ORDER BY` expression.

```php
limit (int $count, int $offset = 0): static
```
Set `LIMIT` and optional `OFFSET`.

```php
skip (int $offset): static
```
Set `OFFSET`.

```php
lock (Locks $Lock): static
```
Append a row lock.
