# Query dialects

The builder has one fluent API. The active dialect controls identifier quoting, placeholders
and a few SQL features.

## Choosing the dialect

`SQL::table()` and `Transaction::table()` use the dialect from the SQL config:

```php
new SQL;                       // PostgreSQL
new SQL(['driver' => 'mysql']);
new SQL(['driver' => 'sqlite']);
```

You can also compile the same builder through another dialect:

```php
use Bootgly\ADI\Databases\SQL\Builder\Dialects\MySQL;

$Query = $Builder->compile(new MySQL);
```

## Same builder, different SQL

```php
$Builder = $Database
   ->table(Tables::Users)
   ->insert()
   ->set(Columns::Id, 1)
   ->set(Columns::Name, 'Ada')
   ->upsert(Columns::Id);
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

## Differences that matter

| Feature | PostgreSQL | MySQL | SQLite |
|---------|------------|-------|--------|
| Identifier quotes | `"name"` | `` `name` `` | `"name"` |
| Placeholders | `$1`, `$2` | `?`, `?` | `?1`, `?2` |
| `output()` | `RETURNING` | rejected | rejected (the `sqlite3` extension would run it twice) |
| `upsert()` | `ON CONFLICT` | `ON DUPLICATE KEY UPDATE` | `ON CONFLICT` |
| `Matches::Insensitive` | `ILIKE` | `LOWER(...) LIKE LOWER(...)` | `LIKE ... COLLATE NOCASE` |
| `Matches::Text` | `to_tsvector(...) @@ plainto_tsquery(...)` | `MATCH (...) AGAINST (...)` | `MATCH` |
| `Nulls::First/Last` | native `NULLS` clause | boolean sort expression | native `NULLS` clause |

## Capabilities

The builder uses `Capabilities` to reject unsupported features early:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Capabilities;

$Database->Dialect->check(Capabilities::Output); // false on MySQL
$Database->Dialect->check(Capabilities::Upsert); // true on supported dialects
```

Calling `output()` on a MySQL builder throws `InvalidArgumentException` before broken SQL is
produced.

## Identifier defaults

Direct `Identifier::quote()` calls use PostgreSQL by default. You can configure that process
default:

```php
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Builder\Dialects\MySQL;

Identifier::configure(new MySQL);

$quoted = Identifier::quote(Columns::Name); // `name`

Identifier::configure(); // reset to default
```

Normal builders do not need this. They pass their own dialect to `Identifier::quote()`.

## Auxiliary enums

Namespace: `Bootgly\ADI\Databases\SQL\Builder\Auxiliaries`.

| Enum | Cases |
|------|-------|
| `Aggregates` | `Average`, `Maximum`, `Minimum`, `Sum` |
| `Capabilities` | `Output`, `Upsert` |
| `Joins` | `Full`, `Inner`, `Left`, `Right` |
| `Junctions` | `And`, `Or` |
| `Locks` | `Share`, `Update` |
| `Matches` | `Insensitive`, `Like`, `Text` |
| `Modes` | `Delete`, `Insert`, `Select`, `Update` |
| `Nulls` | `First`, `Last` |
| `Operators` | `Between`, `Equal`, `Greater`, `GreaterOrEqual`, `In`, `IsFalse`, `IsNotNull`, `IsNull`, `IsTrue`, `Less`, `LessOrEqual`, `Unequal` |
| `Orders` | `Asc`, `Desc` |

`Auxiliaries::check($class)` returns whether a class is one of the registered builder
auxiliary enums.

## Executing the dialects

Since v0.22.0, every dialect has a matching native wire driver — the SQL that MySQL and
SQLite dialects generate now executes end-to-end, with the same Pool, Transactions and ORM
used by PostgreSQL. See **[SQL Drivers](/manual/ADI/Databases/SQL/Drivers/overview/)** for
driver selection and the capability matrix.
