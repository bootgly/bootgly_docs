# Writing rows

Mutations use the same builder lifecycle as reads: choose a table, switch mode, assign
values, add guards when needed and run the operation.

## Insert one row

```php
$Query = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Name, 'Ada')
   ->set(Columns::Active, true)
   ->compile();
```

PostgreSQL:

```sql
INSERT INTO "users" ("name", "active") VALUES ($1, $2)
```

Parameters:

```php
['Ada', true]
```

## Insert many rows

Pass multiple values to each `set()`. Every inserted column must have the same value count.

```php
$Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Id, 1, 2)
   ->set(Columns::Name, 'Ada', 'Bob');
```

PostgreSQL:

```sql
INSERT INTO "users" ("id", "name") VALUES ($1, $2), ($3, $4)
```

## Returning output

```php
$Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Id, 1)
   ->set(Columns::Name, 'Ada')
   ->output(Columns::Id, Columns::Name);
```

PostgreSQL and SQLite append `RETURNING`:

```sql
INSERT INTO "users" ("id", "name") VALUES ($1, $2) RETURNING "id", "name"
```

MySQL does not support the canonical `RETURNING` path, so the builder rejects `output()`
when the configured dialect is MySQL.

## Update rows

```php
$Database
   ->table(Tables::Users)
   ->update()
   ->set(Columns::Active, false)
   ->filter(Columns::Id, Operators::Equal, 7);
```

PostgreSQL:

```sql
UPDATE "users" SET "active" = $1 WHERE "id" = $2
```

`update()` accepts exactly one value per assigned column. If you set multiple values before
calling `update()`, the builder rejects that earlier assignment.

## Delete rows

```php
$Database
   ->table(Tables::Users)
   ->delete()
   ->filter(Columns::Id, Operators::Equal, 7);
```

PostgreSQL:

```sql
DELETE FROM "users" WHERE "id" = $1
```

`update()` and `delete()` require at least one `filter()`. A global mutation throws
`InvalidArgumentException`.

## Upsert

```php
$Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Id, 1, 2)
   ->set(Columns::Name, 'Ada', 'Bob')
   ->upsert(Columns::Id)
   ->output(Columns::Id, Columns::Name);
```

PostgreSQL:

```sql
INSERT INTO "users" ("id", "name") VALUES ($1, $2), ($3, $4) ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name" RETURNING "id", "name"
```

When every assigned column is also a conflict column, PostgreSQL and SQLite use
`DO NOTHING`. MySQL compiles the same builder to `ON DUPLICATE KEY UPDATE`.

## Trusted SQL values

Use `Expression` only for SQL fragments you control:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;

$Database
   ->table(Tables::Users)
   ->update()
   ->set(Columns::Name, new Expression('LOWER("name")'))
   ->filter(Columns::Id, Operators::Equal, 1);
```

Values passed directly to `set()` become parameters. `Expression` values are inserted
without binding.

## Reference

```php
insert (): static
```
Switch to INSERT mode.

```php
update (): static
```
Switch to UPDATE mode and validate that every assignment is singular.

```php
delete (): static
```
Switch to DELETE mode.

```php
set (BackedEnum|Stringable $Column, mixed $value, mixed ...$values): static
```
Assign one or more values to a column. Multiple values are for multi-row INSERT only.

```php
output (BackedEnum|Stringable ...$Columns): static
```
Return mutation rows through `RETURNING` when the dialect supports it.

```php
upsert (BackedEnum|Stringable ...$Columns): static
```
Enable conflict handling for INSERT. Requires at least one conflict column.
