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
filter (BackedEnum|Stringable $Column, Operators $Operator, mixed $value = null, Junctions $Junction = Junctions::And): static
```
Append one `WHERE` predicate.

```php
match (BackedEnum|Stringable $Column, mixed $value, Matches $Match = Matches::Like, Junctions $Junction = Junctions::And): static
```
Append one text predicate. The value must be a string.

```php
join (BackedEnum|Stringable $Table, BackedEnum|Stringable $Left, Operators $Operator, BackedEnum|Stringable $Right, Joins $Join = Joins::Inner): static
```
Append a table join with an identifier comparison.

```php
alias (BackedEnum|Stringable $Identifier, BackedEnum|Stringable $Alias): static
```
Alias a table, column or expression.

```php
aggregate (Aggregates $Aggregate, BackedEnum|Stringable $Column, null|BackedEnum|Stringable $Alias = null): static
```
Append `AVG`, `MAX`, `MIN` or `SUM`.

```php
count (null|BackedEnum|Stringable $Alias = null): static
```
Append `COUNT(*)`.

```php
group (BackedEnum|Stringable ...$Columns): static
```
Append `GROUP BY` columns.

```php
having (BackedEnum|Stringable $Column, Operators $Operator, mixed $value = null, Junctions $Junction = Junctions::And): static
```
Append one `HAVING` predicate.

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
