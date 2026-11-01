# Writing rows

Mutations use the same builder lifecycle as reads: choose a table, switch mode, assign
values, add guards when needed and run the operation.

The examples on this page share these imports, names and a `$Database` opened from the project's
`database` config scope. In an `HTTP_Server_CLI` route, use `$Response->Database` instead, and
outside a project pass the connection as an array — see
**[Open a database](/manual/ADI/Databases/SQL/overview/#open-a-database)**.

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\API\Environment\Configs\DatabaseConfig;

enum Tables: string { case Users = 'users'; case Tags = 'tags'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; case Email = 'email'; case Active = 'active'; }

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
```

`users` has a key the database generates (`id`), a required `name`, a unique `email` and an
`active` flag that defaults to true; `tags` has a generated `id` and a unique `name`. Run in order
on empty tables, the examples give the results their comments show.

## Modes

A builder starts as a `SELECT`, and `insert()`, `upsert()`, `update()` and `delete()` switch it to
the statement they name. Which call sets which mode, and what each mode compiles, is in
**[Modes](/manual/ADI/Databases/SQL/Builder/overview/#modes)** on the Query Builder page.

> [!WARNING]
> `set()` alone does not make a write: without `insert()`, `update()` or `upsert()`, the builder
> stays a `SELECT`, runs without an error and writes nothing.

A `SELECT` whose common table expression writes still counts as a read for now, so it can run on a
read replica — see
**[Common table expressions](/manual/ADI/Databases/SQL/Builder/Composing/overview/#common-table-expressions)**.

## Insert one row

```php
$Insert = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Name, 'Ada')
   ->set(Columns::Email, 'ada@example.com');

$Query = $Insert->compile();
```

PostgreSQL:

```sql
INSERT INTO "users" ("name", "email") VALUES ($1, $2)
```

Parameters:

```php
['Ada', 'ada@example.com']
```

Each `set()` adds one column, in call order; a second `set()` of the same column replaces its
value and keeps its place. Values become parameters, bound by the driver: how booleans, decimals
and dates map on each one is on **[SQL types](/manual/ADI/Databases/SQL/Drivers/Types/overview/)**
— on PostgreSQL, format a `DateTimeInterface` first, since its driver refuses one for now.

Run the builder like any other:

```php
$Inserted = $Database->await($Database->query($Insert));

$Inserted->Result->affected; // 1
```

## Insert many rows

Pass multiple values to each `set()`. Every inserted column must have the same value count.

```php
$Many = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Name, 'Grace', 'Linus')
   ->set(Columns::Email, 'grace@example.com', 'linus@example.com');

$Database->await($Database->query($Many))->Result->affected; // 2
```

PostgreSQL:

```sql
INSERT INTO "users" ("name", "email") VALUES ($1, $2), ($3, $4)
```

Parameters, row after row:

```php
['Grace', 'grace@example.com', 'Linus', 'linus@example.com']
```

The `set()` that breaks the count throws `InvalidArgumentException` with
`SQL insert set columns must have the same value count.` — or `insert()` does, for values assigned
before it.

One statement binds rows × columns parameters, and each engine caps that number. Past the cap the
operation fails and writes nothing:

| Engine | Parameters per statement | Past the cap |
|--------|--------------------------|--------------|
| PostgreSQL | 65535 | currently `invalid message format` (`08P01`) |
| MySQL | 65535 | `1390: Prepared statement contains too many placeholders` |
| SQLite | 32766 in the default build (999 before SQLite 3.32) | `Unable to prepare statement: variable number must be between ?1 and ?32766` |

To load more rows, send them in batches. Here 2500 tag names go out as three `INSERT`s:

```php
$names = array_map(fn (int $number): string => "tag-{$number}", range(1, 2500));

foreach (array_chunk($names, 1000) as $chunk) {
   $Database->await($Database->query(
      $Database->table(Tables::Tags)->insert()->set(Columns::Name, ...$chunk)
   ));
}
```

## Returning output

On PostgreSQL, `output()` appends `RETURNING`:

```php
$Insert = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Name, 'Barbara')
   ->set(Columns::Email, 'barbara@example.com')
   ->output(Columns::Id, Columns::Name);
```

```sql
INSERT INTO "users" ("name", "email") VALUES ($1, $2) RETURNING "id", "name"
```

The returned columns arrive as the result's rows. `output()` works with `update()` and
`delete()` too — `RETURNING` follows the `WHERE` — and a `SELECT` ignores it.

MySQL and SQLite reject `output()`: MySQL has no `RETURNING`, and on SQLite the `sqlite3`
extension would execute the statement twice, duplicating the write. The call itself throws
`InvalidArgumentException` with `SQL dialect does not support RETURNING output.`, before any SQL is
built. On both, the generated key arrives through `Result->inserted` instead, which PostgreSQL
leaves at `0`. Code that runs on all three asks the builder's dialect first:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Capabilities;

$Insert = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Name, 'Barbara')
   ->set(Columns::Email, 'barbara@example.com');

if ($Insert->Dialect->check(Capabilities::Output)) {
   $Insert->output(Columns::Id, Columns::Name);
}

$Inserted = $Database->await($Database->query($Insert));

$Inserted->Result->rows;     // PostgreSQL: [['id' => 4, 'name' => 'Barbara']] — MySQL and SQLite: []
$Inserted->Result->inserted; // PostgreSQL: 0 — MySQL and SQLite: 4

$id = $Inserted->Result->row['id'] ?? $Inserted->Result->inserted; // 4
```

Read `inserted` right after a plain `INSERT`. For a multi-row one, MySQL reports the first new id
and SQLite the last, and after an upsert it can name another row — see
**[Result differences](/manual/ADI/Databases/SQL/Drivers/overview/#result-differences)**. An id
past `PHP_INT_MAX` arrives as a string (see
**[Generated keys without RETURNING](/manual/ADI/Databases/SQL/Drivers/overview/#generated-keys-without-returning)**,
which also shows the ORM filling entity keys from it).

## Update rows

```php
$Update = $Database
   ->table(Tables::Users)
   ->update()
   ->set(Columns::Active, false)
   ->filter(Columns::Id, Operators::Equal, 2);
```

PostgreSQL:

```sql
UPDATE "users" SET "active" = $1 WHERE "id" = $2
```

```php
$Database->await($Database->query($Update))->Result->affected; // 1
```

`update()` accepts exactly one value per assigned column. A second value throws
`InvalidArgumentException` with `SQL update set values must be singular.` — from the `set()` that
passes it, or from `update()` for values assigned before it.

`limit()`, `order()`, `join()` and the other reading calls do not reach an `UPDATE` or a `DELETE`:
they are dropped without an error, so `limit(1)` does not cap the rows either statement changes.
What each mode compiles is in **[Modes](/manual/ADI/Databases/SQL/Builder/overview/#modes)**.

## Delete rows

```php
$Delete = $Database
   ->table(Tables::Users)
   ->delete()
   ->filter(Columns::Id, Operators::Equal, 3);
```

PostgreSQL:

```sql
DELETE FROM "users" WHERE "id" = $1
```

```php
$Database->await($Database->query($Delete))->Result->affected; // 1
```

`update()` and `delete()` require at least one `filter()`, `match()` or `nest()` — `having()` does
not count. Without one, `compile()` throws `InvalidArgumentException` with
`SQL update/delete requires at least one filter.`, and so does `query()`, which compiles the
builder before anything is sent (see
**[What throws and what fails](/manual/ADI/Databases/SQL/overview/#what-throws-and-what-fails)**).
**[Errors](/manual/ADI/Databases/SQL/Builder/overview/#errors)** shows the error caught, and the one
way to change or remove every row on purpose.

> [!WARNING]
> For now, a subquery builder you change after the outer builder compiled does not reach the
> statement that runs, so a `DELETE` can remove the rows of the old subquery — see
> **[Compile and run](/manual/ADI/Databases/SQL/Builder/overview/#compile-and-run)**.

## Upsert

```php
$Upsert = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Email, 'ada@example.com', 'alan@example.com')
   ->set(Columns::Name, 'Ada Lovelace', 'Alan Turing')
   ->upsert(Columns::Email);
```

PostgreSQL:

```sql
INSERT INTO "users" ("email", "name") VALUES ($1, $2), ($3, $4) ON CONFLICT ("email") DO UPDATE SET "name" = EXCLUDED."name"
```

MySQL:

```sql
INSERT INTO `users` (`email`, `name`) VALUES (?, ?), (?, ?) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`)
```

SQLite:

```sql
INSERT INTO "users" ("email", "name") VALUES (?1, ?2), (?3, ?4) ON CONFLICT ("email") DO UPDATE SET "name" = EXCLUDED."name"
```

Ada's email is taken, so her row gets the new name, and Alan's row is inserted:

```php
$Database->await($Database->query($Upsert))->Result->affected; // PostgreSQL and SQLite: 2 — MySQL: 3
```

- `upsert()` switches the builder to INSERT itself: the `insert()` above is optional.
- Every assigned column that is not a conflict column takes the incoming value; there is no way to
  update only some of them.
- On PostgreSQL and SQLite, the conflict columns must be the columns of a primary key or unique
  index, or the operation fails: `there is no unique or exclusion constraint matching the ON CONFLICT specification`
  (`42P10`) on PostgreSQL, `Unable to prepare statement: ON CONFLICT clause does not match any PRIMARY KEY or UNIQUE constraint`
  on SQLite.
- PostgreSQL fails a statement that carries one key twice:
  `ON CONFLICT DO UPDATE command cannot affect row a second time` (`21000`). MySQL and SQLite apply
  the rows in order, so the later one wins.
- A second `upsert()` call replaces the conflict columns of the first.
- `output()` after `upsert()` returns inserted and updated rows alike on PostgreSQL; a row that
  `DO NOTHING` skips is not returned.
- `affected` and `inserted` report an upsert differently on each driver — MySQL counts an updated
  row twice — see
  **[Result differences](/manual/ADI/Databases/SQL/Drivers/overview/#result-differences)**.

> [!WARNING]
> MySQL ignores the conflict columns for now. `ON DUPLICATE KEY UPDATE` fires on a collision with
> any primary key or unique index, so with `upsert(Columns::Id)`, a new row whose `email` belongs to
> another user updates that user's row and reports success — where PostgreSQL and SQLite fail it with
> a unique violation. On MySQL, upsert only when no column you assign belongs to a unique key other
> than the conflict columns.

When every assigned column is a conflict column, there is nothing to update — the insert-if-missing
case:

```php
$Tag = $Database
   ->table(Tables::Tags)
   ->insert()
   ->set(Columns::Name, 'php')
   ->upsert(Columns::Name);

$Database->await($Database->query($Tag))->Result->affected; // 1
$Database->await($Database->query($Tag))->Result->affected; // 0
```

PostgreSQL and SQLite compile `ON CONFLICT ("name") DO NOTHING`, and MySQL
`` ON DUPLICATE KEY UPDATE `name` = `name` ``, which leaves the row as it was: the first run
inserts the tag, and the second changes nothing.

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

PostgreSQL:

```sql
UPDATE "users" SET "name" = LOWER("name") WHERE "id" = $1
```

Values passed directly to `set()` become parameters. `Expression` values are inserted without
binding — as `INSERT` values too — and without rewriting: the builder does not adapt them to the
dialect. Write them for the engine that runs them. MySQL, by default, reads `"name"` as a string, so
there the statement above stores the word `name`; write ``LOWER(`name`)`` instead. More uses of
`Expression` are in **[Composing queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/)**.

## Errors

The errors the write calls raise, and whether the call or `compile()` throws each one, are listed
in **[Errors](/manual/ADI/Databases/SQL/Builder/overview/#errors)** on the Query Builder page; the
Reference below gives each method's own.

## Reference

Reading verbs — `select()`, `filter()`, `match()`, `nest()` — are in the
**[Reading rows](/manual/ADI/Databases/SQL/Builder/Reading/overview/)** Reference, and `compile()`,
`$Mode` and `$assignments` in the **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)**
one.

```php
insert (): static
```
Switch to INSERT mode. With values already assigned, check that every column has the same
count; throws `SQL insert set columns must have the same value count.` otherwise.

```php
update (): static
```
Switch to UPDATE mode and check that every value assigned so far is singular; throws
`SQL update set values must be singular.` otherwise. Compiling needs a `set()` and a filter.

```php
delete (): static
```
Switch to DELETE mode. Assigned values are ignored; compiling needs a filter.

```php
upsert (BackedEnum|Stringable ...$Columns): static
```
Switch to INSERT mode and handle conflicts on `$Columns`: update every other assigned column, or
do nothing when none is left. Replaces the conflict columns of an earlier call. Throws
`SQL dialect does not support upsert handling.` when the dialect lacks `Capabilities::Upsert`, and
`SQL upsert requires at least one conflict column.` without columns.

```php
set (BackedEnum|Stringable $Column, mixed $value, mixed ...$values): static
```
Assign values to a column — one, or one per row for a multi-row INSERT — without changing the
mode. Values become parameters, except an `Expression`, which is inlined. Assigning a column again
replaces its values and keeps its position. In INSERT mode, throws
`SQL insert set columns must have the same value count.` when the counts differ; in UPDATE mode,
`SQL update set values must be singular.` for more than one value.

```php
output (BackedEnum|Stringable ...$Columns): static
```
Return these columns through `RETURNING` from an INSERT, UPDATE or DELETE; calls add up, and a
column alias applies. Throws `SQL dialect does not support RETURNING output.` when the dialect
lacks `Capabilities::Output` — MySQL and SQLite.

### Enums on this page

Namespace `Bootgly\ADI\Databases\SQL\Builder\Auxiliaries`. Every case of every builder enum, and
the SQL it compiles to, is in
**[Auxiliary enums](/manual/ADI/Databases/SQL/Builder/Dialects/overview/#auxiliary-enums)**.

| Enum | Cases used here |
| --- | --- |
| `Capabilities` | `Output`, `Upsert` |
| `Operators` | `Equal` |
