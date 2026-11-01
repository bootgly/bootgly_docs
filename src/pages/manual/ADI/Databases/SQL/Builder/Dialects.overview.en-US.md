# Query dialects

The builder has one fluent API. The active dialect controls identifier quoting, placeholders
and a few SQL features.

## Choosing the dialect

The facade takes its dialect from the `driver` config key — the key that also picks the wire
driver: `pgsql` (the default), `mysql` or `sqlite`; in a project, `DB_CONNECTION` sets it (see
**[Choose a driver](/guide/database-dbal/overview/#choose-a-driver)**). Every builder the facade
starts compiles with that dialect (see
**[Entry points](/manual/ADI/Databases/SQL/Builder/overview/#entry-points)**):

```php
use Bootgly\ADI\Databases\SQL;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; case Bio = 'bio'; }

$Database = new SQL([
   'driver' => 'mysql',
   'host' => '127.0.0.1',
   'port' => 3306,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
]);

$Database->Dialect::class; // Bootgly\ADI\Databases\SQL\Builder\Dialects\MySQL
```

Building the facade opens no connection, so this runs without a server. The examples below
continue this script: they use these enums, this `$Database` and the imports of the blocks before
them. Outside a builder, `Identifier::quote()` quotes for a
process-wide default dialect instead — see
**[Dynamic identifiers](/manual/ADI/Databases/SQL/Builder/Composing/overview/#dynamic-identifiers)**.

## Same builder, different SQL

`compile($Dialect)` compiles a builder for another dialect. How it replays the builder's calls, and
keeps one result per dialect class, is in
**[Compile and run](/manual/ADI/Databases/SQL/Builder/overview/#compile-and-run)**; how a compiled
`Query` embedded in a statement is written, in
**[IN subqueries](/manual/ADI/Databases/SQL/Builder/Composing/overview/#in-subqueries)**. Here one
upsert compiles for the three:

```php
use Bootgly\ADI\Databases\SQL\Builder\Dialects\MySQL;
use Bootgly\ADI\Databases\SQL\Builder\Dialects\PostgreSQL;
use Bootgly\ADI\Databases\SQL\Builder\Dialects\SQLite;

$Builder = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Id, 1)
   ->set(Columns::Name, 'Ada')
   ->upsert(Columns::Id);

$Builder->compile(new PostgreSQL);
$Builder->compile(new MySQL);
$Builder->compile(new SQLite);
```

PostgreSQL:

```sql
INSERT INTO "users" ("id", "name") VALUES ($1, $2) ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name"
```

MySQL:

```sql
INSERT INTO `users` (`id`, `name`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `name` = VALUES(`name`)
```

SQLite:

```sql
INSERT INTO "users" ("id", "name") VALUES (?1, ?2) ON CONFLICT ("id") DO UPDATE SET "name" = EXCLUDED."name"
```

The parameters are `[1, 'Ada']` on all three. How each engine treats the conflict columns is in
**[Writing rows](/manual/ADI/Databases/SQL/Builder/Writing/overview/#upsert)**.

## Differences that matter

| Feature | PostgreSQL | MySQL | SQLite |
|---------|------------|-------|--------|
| [Identifier quotes](/manual/ADI/Databases/SQL/Builder/Composing/overview/#dynamic-identifiers) | `"name"` | `` `name` `` | `"name"` |
| Placeholders | `$1`, `$2` | `?`, `?` | `?1`, `?2` |
| [`output()`](/manual/ADI/Databases/SQL/Builder/Writing/overview/#returning-output) | `RETURNING` | rejected | rejected (the `sqlite3` extension would run it twice) |
| [`upsert()`](/manual/ADI/Databases/SQL/Builder/Writing/overview/#upsert) | `ON CONFLICT` | `ON DUPLICATE KEY UPDATE` | `ON CONFLICT` |
| [`skip()` without `limit()`](/manual/ADI/Databases/SQL/Builder/Reading/overview/#limit-and-offset) | `OFFSET n` | `LIMIT 18446744073709551615 OFFSET n` | `LIMIT -1 OFFSET n` |
| [`lock()`](/manual/ADI/Databases/SQL/Builder/Reading/overview/#row-locks) | `FOR UPDATE`, `FOR SHARE` | `FOR UPDATE`, `FOR SHARE` | emitted, then refused by SQLite |
| [`Joins::Full`](/manual/ADI/Databases/SQL/Builder/Reading/overview/#joins) | `FULL JOIN` | unsupported | `FULL JOIN` |
| [`Matches::Like`](/manual/ADI/Databases/SQL/Builder/Reading/overview/#text-matching) | `LIKE`, case-sensitive | `LIKE`, by collation | `LIKE`, case-insensitive for ASCII |
| [`Matches::Insensitive`](/manual/ADI/Databases/SQL/Builder/Reading/overview/#text-matching) | `ILIKE` | `LOWER(...) LIKE LOWER(...)` | `LIKE ... COLLATE NOCASE` |
| [`Matches::Text`](/manual/ADI/Databases/SQL/Builder/Reading/overview/#text-matching) | `to_tsvector(...) @@ plainto_tsquery(...)` | `MATCH (...) AGAINST (...)` | `MATCH` |
| [`Nulls::First/Last`](/manual/ADI/Databases/SQL/Builder/Reading/overview/#grouping-having-and-order) | native `NULLS` clause | boolean sort expression | native `NULLS` clause |

A linked feature can fail at run time, or answer differently, on some engine; its link leads to the
page that explains it engine by engine.

## Capabilities

The builder uses `Capabilities` to reject unsupported features early:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Capabilities;

$Builder = $Database->table(Tables::Users);

$Builder->Dialect->check(Capabilities::Output); // false on MySQL and SQLite
$Builder->Dialect->check(Capabilities::Upsert); // true on the three
```

Calling `output()` on a MySQL or SQLite builder throws `InvalidArgumentException` with
`SQL dialect does not support RETURNING output.` before broken SQL is produced — at the call, or
inside `compile($Dialect)` when a builder that used `output()` replays into one of them.

No capability covers `lock()`, `Joins::Full` or `Matches::Text`: branch on the class of
`$Builder->Dialect`, the dialect a builder compiles with, as
**[Row locks](/manual/ADI/Databases/SQL/Builder/Reading/overview/#row-locks)** does for SQLite.

## Dialect registry

`Bootgly\ADI\Databases\SQL\Builder\Dialects` maps a driver name to a dialect. The facade builds one
when it is constructed and fetches its `driver` from it:

```php
use Bootgly\ADI\Databases\SQL\Builder\Dialects;

$Dialects = new Dialects;

$Dialects->fetch()::class;                       // Bootgly\ADI\Databases\SQL\Builder\Dialects\PostgreSQL
$Dialects->fetch('mysqli') === $Dialects->MySQL; // true
$Dialects->fetch('sqlite3')::class;              // Bootgly\ADI\Databases\SQL\Builder\Dialects\SQLite
```

| Names | Dialect |
|-------|---------|
| `pgsql` (the default), `postgres`, `postgresql` | `PostgreSQL` |
| `mysql`, `mysqli` | `MySQL` |
| `sqlite`, `sqlite3` | `SQLite` |

- Names match exactly, in lower case. Any other — `mariadb`, `PGSQL` — throws
  `InvalidArgumentException` with `SQL builder dialect is not registered: mariadb`, which is what
  `new SQL()` throws for such a `driver`.
- The registry accepts more names than the facade runs: only `pgsql`, `mysql` and `sqlite` also
  name a wire driver (see **[Driver names](/manual/ADI/Database/Config/overview/#driver-names)**).
- Each registry holds one instance per dialect, so `fetch()` returns the same object every time.
- It has no way to add a dialect: a custom one goes to the builder directly.

## Writing a custom dialect

A dialect is a subclass of `Bootgly\ADI\Databases\SQL\Builder\Dialect`. Extend a shipped one and
override what differs — here, text search through PostgreSQL's `english` configuration, which stems
words:

```php
use Bootgly\ADI\Databases\SQL\Builder;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Matches;

class English extends PostgreSQL
{
   public function match (string $column, string $placeholder, Matches $Match): string
   {
      if ($Match === Matches::Text) {
         return "to_tsvector('english', {$column}) @@ plainto_tsquery('english', {$placeholder})";
      }

      return parent::match($column, $placeholder, $Match);
   }
}

$Search = (new Builder(new English))
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->match(Columns::Bio, 'database', Matches::Text);

$Search->compile()->SQL; // SELECT "id" FROM "users" WHERE to_tsvector('english', "bio") @@ plainto_tsquery('english', $1)
```

Run it through `query()` on a PostgreSQL facade: with the bios `Databases and engines` and
`A database pioneer`, it finds both rows, where the shipped dialect finds only the second.

- **Inject it** — `new Builder($Dialect)` builds with the dialect from the start, and
  `$Builder->compile($Dialect)` replays an existing builder through it. `SQL::table()` and
  `Transaction::table()` keep the facade's dialect, since the registry cannot take a new one.
- **The hooks** — `Dialect` declares eight abstract methods — `quote()`, `mark()`, `rebase()`,
  `order()`, `slice()`, `upsert()`, `match()` and `output()` — plus `check()`, which reports every
  capability as supported until you override it. A `false` for `Capabilities::Output` or
  `Capabilities::Upsert` makes `output()` or `upsert()` throw. The protected helpers `segment()` and
  `resolve()` quote a dotted name and build an `ON CONFLICT` clause. Each one is in the
  [Reference](#reference).
- **Keep it stateless** — `compile($Dialect)` keeps its result per dialect class, and a builder whose
  dialect has the same class compiles with its own instance. Two instances of one class with
  different settings therefore compile alike: give each variant a class of its own.

## Executing the dialects

Every dialect has a matching native wire driver, so the SQL a dialect generates runs end to end,
with the same Pool, transactions and ORM on the three engines. See
**[SQL Drivers](/manual/ADI/Databases/SQL/Drivers/overview/)** for driver selection and the
capability matrix, and **[Type mapping](/manual/ADI/Databases/SQL/Drivers/Types/overview/)** for how
each driver binds the values you pass and decodes what comes back.

## Reference

The builder's `$Dialect` property and `compile()` are in the
**[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/#reference)** Reference, and
`Identifier::quote()` and `Identifier::configure()` in the
**[Composing queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/#reference)** one.

### Dialects

```php
__construct ()
```
Creates the registry with one instance of each shipped dialect.

```php
fetch (string $driver = 'pgsql'): Dialect
```
Returns the dialect registered under `$driver` — see [Dialect registry](#dialect-registry) for the
names. Throws `InvalidArgumentException` with `SQL builder dialect is not registered: <name>` for
any other.

```php
public private(set) MySQL $MySQL
```
The registry's MySQL dialect, returned for `mysql` and `mysqli`.

```php
public private(set) PostgreSQL $PostgreSQL
```
The registry's PostgreSQL dialect, returned for `pgsql`, `postgres` and `postgresql`.

```php
public private(set) SQLite $SQLite
```
The registry's SQLite dialect, returned for `sqlite` and `sqlite3`.

### Dialect

`Bootgly\ADI\Databases\SQL\Builder\Dialect` is abstract; `PostgreSQL`, `MySQL` and `SQLite` in
`Bootgly\ADI\Databases\SQL\Builder\Dialects` extend it.

```php
check (Capabilities $Capability): bool
```
Whether the dialect supports `$Capability`. The base returns `true` for every case; `MySQL` and
`SQLite` return `false` for `Capabilities::Output`.

```php
abstract quote (string $name): string
```
Quotes an identifier, dotted names segment by segment.

```php
abstract mark (int $position): string
```
Writes the placeholder of the parameter at `$position`, counted from 1 — `$1`, `?` or `?1` in the
shipped dialects.

```php
abstract rebase (string $sql, int $offset): string
```
Renumbers the placeholders of an embedded statement by `$offset`, the count of parameters before
it. MySQL's `?` need none, so its dialect returns the SQL unchanged.

```php
abstract order (string $column, Orders $Order, null|Nulls $Nulls = null): string
```
Writes one `ORDER BY` item, with the `NULLS FIRST` or `NULLS LAST` placement of `$Nulls`.

```php
abstract slice (null|int $limited, int $offset): string
```
Writes the `LIMIT` and `OFFSET` text, with a leading space, or an empty string when neither is set.

```php
abstract upsert (array $assignments, array $conflicts): string
```
Writes the conflict clause of an `INSERT`, with a leading space, from the quoted assigned columns
(the keys of `$assignments`) and the quoted `$conflicts`; an empty string when `$conflicts` is
empty.

```php
abstract match (string $column, string $placeholder, Matches $Match): string
```
Writes the text predicate for `$Match` on `$column`.

```php
abstract output (string $sql, array $columns): string
```
Appends the `RETURNING` columns to a write, or returns `$sql` unchanged when `$columns` is empty.
`MySQL` throws `SQL dialect does not support RETURNING output.` for a non-empty list.

```php
protected segment (string $name, string $open, string $close, string $escape): string
```
Splits `$name` on dots and wraps each segment in `$open` and `$close`, replacing `$close` inside it
with `$escape`; a `*` segment stays bare. Throws `InvalidArgumentException` with
`SQL identifier segment cannot be empty.` for an empty segment.

```php
protected resolve (array $assignments, array $conflicts, string $source = 'EXCLUDED'): string
```
Builds `ON CONFLICT (...) DO UPDATE SET column = EXCLUDED.column, ...` — with `$source` in place of
`EXCLUDED` — for every assigned column that is not a conflict column, or
`ON CONFLICT (...) DO NOTHING` when none is left, with a leading space; an empty string when
`$conflicts` is empty. The PostgreSQL and SQLite `upsert()` return it.

### Auxiliaries

```php
static check (string $class): bool
```
Whether `$class` is one of the builder's auxiliary enums.

```php
const array ENUMS
```
The auxiliary enum classes, as listed in [Auxiliary enums](#auxiliary-enums).

### Auxiliary enums

Namespace `Bootgly\ADI\Databases\SQL\Builder\Auxiliaries`. Each case is followed by the SQL it
compiles to, where that SQL is fixed:

| Enum | Cases |
|------|-------|
| `Aggregates` | `Average` (`AVG`), `Count` (`COUNT`, since 1.0.3), `Maximum` (`MAX`), `Minimum` (`MIN`), `Sum` (`SUM`) |
| `Capabilities` | `Output`, `Upsert` |
| `Joins` | `Full` (`FULL JOIN`), `Inner` (`JOIN`), `Left` (`LEFT JOIN`), `Right` (`RIGHT JOIN`) |
| `Junctions` | `And` (`AND`), `Or` (`OR`) |
| `Locks` | `Share` (`FOR SHARE`), `Update` (`FOR UPDATE`) |
| `Matches` | `Insensitive`, `Like`, `Text` — each dialect writes its own, see [Differences that matter](#differences-that-matter) |
| `Modes` | `Delete`, `Insert`, `Select`, `Update` |
| `Nulls` | `First` (`NULLS FIRST`), `Last` (`NULLS LAST`) — MySQL writes an `IS NULL` sort instead |
| `Operators` | `Between` (`BETWEEN … AND …`), `Equal` (`=`), `Greater` (`>`), `GreaterOrEqual` (`>=`), `In` (`IN (…)`), `IsFalse` (`IS FALSE`), `IsNotNull` (`IS NOT NULL`), `IsNull` (`IS NULL`), `IsTrue` (`IS TRUE`), `Less` (`<`), `LessOrEqual` (`<=`), `Unequal` (`<>`) |
| `Orders` | `Asc` (`ASC`), `Desc` (`DESC`) |
