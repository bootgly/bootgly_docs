# Composing queries

Use this page when the query needs more than a flat `SELECT`: typed and dynamic identifiers,
trusted expressions, subqueries, derived tables and CTEs.

The examples use a `$Database` opened as in
**[The loop](/manual/ADI/Databases/SQL/Builder/overview/#the-loop)**, these enums, and a `users`
table where Ada (id `1`) is active and Grace (id `2`) is not. The SQL shown is PostgreSQL's:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;

enum Tables: string { case Users = 'users'; }
enum Columns: string
{
   case Id = 'id';
   case Name = 'name';
   case Active = 'active';
   case Created = 'created';
   case Updated = 'updated';
}
enum Aliases: string { case Current = 'current'; case U = 'u'; }
```

## Dynamic identifiers

Every name the builder takes — a table, a column, an alias, a CTE name — is a string-backed enum
case or a `Stringable` object, never a plain `string`. Enum cases are for the names your
application knows. Wrap a name known only at runtime, such as one read from configuration, in
`Identifier`:

```php
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Query = $Database
   ->table(new Identifier('public.users'))
   ->select(new Identifier('users.*'))
   ->compile();
```

PostgreSQL:

```sql
SELECT "users".* FROM "public"."users"
```

The dialect splits a name on every dot and quotes each segment, doubling the quote character
inside it, so a name read at runtime cannot break out of its quotes — and a dot can never be part
of a segment:

| Name | PostgreSQL and SQLite | MySQL |
| --- | --- | --- |
| `Columns::Id` (value `'id'`) | `"id"` | `` `id` `` |
| `new Identifier('users.id')` | `"users"."id"` | `` `users`.`id` `` |
| `new Identifier('users.*')` | `"users".*` | `` `users`.* `` |
| `new Identifier('*')` | `*` | `*` |
| `new Identifier('na"me')` | `"na""me"` | `` `na"me` `` |

A `*` segment stays unquoted. An enum case can hold a qualified name too —
`case UsersId = 'users.id'` — which is the form table aliases rewrite (see
**[Reading rows](/manual/ADI/Databases/SQL/Builder/Reading/overview/)**).

A name the builder cannot quote throws an `InvalidArgumentException`:

| Name | Message | Thrown by |
| --- | --- | --- |
| `new Identifier('')` | `SQL identifier cannot be empty.` | The constructor |
| `new Identifier('public.')`, `new Identifier('a..b')` | `SQL identifier segment cannot be empty.` | The call that receives it |
| A case of an int-backed enum, or a string-backed case whose value is `''` | `SQL enum identifiers must be non-empty strings.` | The call that receives it |
| A `Stringable` whose string is `''` | `SQL object identifiers must render to non-empty strings.` | The call that receives it |

A plain `string` never gets that far: PHP's type check refuses it with a `TypeError`.

Quoting stops injection, not access. A name taken from a request can name any table or column the
database role can read — `password_hash`, say — so check it against the names you allow before
you use it: `Columns::tryFrom($input)` returns the case for an allowed name and `null` for any
other, so it both checks the name and types it.

Builders quote names with their own dialect. To quote one for SQL you write yourself, call
`Identifier::quote()` with the dialect. Without one it uses a process-wide default: PostgreSQL,
until `Identifier::configure()` sets another, and again after `configure()` without an argument.

```php
use Bootgly\ADI\Databases\SQL\Builder\Dialects\MySQL;

Identifier::quote(Columns::Name, new MySQL); // `name`
Identifier::quote(Columns::Name);            // "name"

Identifier::configure(new MySQL);
Identifier::quote(Columns::Name);            // `name`

Identifier::configure();
```

## Trusted expressions

`Expression` is the raw SQL escape hatch. The builder writes its text where you put it — never
quoted, never bound, never rewritten for the dialect:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;

$Now = new Expression('NOW()');
$LowerName = new Expression('LOWER("name")');

$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, $Now)
   ->alias($Now, Aliases::Current)
   ->filter($LowerName, Operators::Equal, 'ada')
   ->filter(Columns::Updated, Operators::Greater, new Expression('"created"'))
   ->compile();
```

PostgreSQL:

```sql
SELECT "id", NOW() AS "current" FROM "users" WHERE LOWER("name") = $1 AND "updated" > "created"
```

`$Query->parameters` is `['ada']`: an expression adds no parameter. An `Expression` is accepted:

- wherever a name goes — a selected column, the column of `filter()`, `having()`, `group()`,
  `order()` or `aggregate()`, the target of `alias()`;
- as the value of `filter()` or `having()`, and as each value of an `In` array or a `Between` pair:
  its text takes the placeholder's place, which is how you compare two columns, as above;
- as a `set()` value: `set(Columns::Name, new Expression('LOWER("name")'))` compiles
  `"name" = LOWER("name")` (see **[Writing rows](/manual/ADI/Databases/SQL/Builder/Writing/overview/)**).

`match()` is the exception: its value must be a string, and an `Expression` there throws
`SQL text match value must be a string.`

Write the text for your engine, since the builder does not translate it: `NOW()` does not exist on
SQLite, and MySQL, by default, reads `"created"` as the string `'created'`, not as a column (it
writes `` `created` ``). Never build an `Expression` from user input — a value goes through
`filter()` or `set()`, which bind it. An empty text throws `SQL expression cannot be empty.`

An `Expression` you `alias()` is written as its alias in `GROUP BY`, `HAVING` and `ORDER BY` as
well. For now that includes `HAVING`, where PostgreSQL refuses an output alias: an expression
aliased `total` fails there with `column "total" does not exist`. To filter on an aggregate, give
its alias through `aggregate()` and pass `having()` an expression you did not alias, as in
**[Reading rows](/manual/ADI/Databases/SQL/Builder/Reading/overview/)**.

## Nested filters

Grouping predicates in parentheses with `nest()`, and joining a group with `OR` through
`->or->nest()`, is part of filtering: both are in
**[OR and AND](/manual/ADI/Databases/SQL/Builder/Reading/overview/#or-and-and)**. The closure runs
again whenever `compile()` replays the builder for another dialect, so keep it free of side effects
(see **[Compile and run](/manual/ADI/Databases/SQL/Builder/overview/#compile-and-run)**).

## IN subqueries

`Operators::In` takes a builder or a compiled `Query` in place of a value array, in `filter()` and
in `having()`:

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

MySQL:

```sql
SELECT `id` FROM `users` WHERE `active` = ? AND `id` IN (SELECT `id` FROM `users` WHERE `name` = ?)
```

SQLite:

```sql
SELECT "id" FROM "users" WHERE "active" = ?1 AND "id" IN (SELECT "id" FROM "users" WHERE "name" = ?2)
```

Subquery parameters are inserted where the subquery appears, so `$Query->parameters` follows the
placeholders in SQL text order — here `[true, 'Ada']`. The numbered placeholders of PostgreSQL and
SQLite are renumbered to match; MySQL uses anonymous `?` placeholders.

Every statement embedded in another — an `IN` subquery, a [derived table](#derived-tables) or a
[CTE](#common-table-expressions) — follows the same rules:

- A builder is compiled with the outer builder's dialect, so pass the builder when you can.
- A compiled `Query` is written as it is, except that its placeholders in the outer dialect's style
  — `$n` on PostgreSQL, `?n` on SQLite — are renumbered after the parameters before it. Number them
  from 1 (`$1`, `?1`), as `compile()` does.
- For now nothing checks a compiled `Query`'s dialect: one compiled by `new Builder` (PostgreSQL)
  inside a MySQL statement fails on the server with a syntax error, so compile it with the outer
  builder's dialect, as `$Database->table()` does. The renumbering also rewrites text that only
  looks like a placeholder, such as a `$1` inside a string literal of the `Query`, which silently
  changes the literal: bind such a value as a parameter instead.
- Finish an embedded builder before you compile or run the outer statement: a change made after the
  outer builder compiled does not reach its memo (see
  **[Compile and run](/manual/ADI/Databases/SQL/Builder/overview/#compile-and-run)**).

Only `Operators::In` takes a subquery. To any other operator a builder is a value that does not
fit, and it fails as **[Filters](/manual/ADI/Databases/SQL/Builder/Reading/overview/#filters)**
describes.

## Derived tables

A builder or a compiled `Query` passed to `table()` with an alias becomes the `FROM` source:

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

Refer to the source's columns through the alias, as `new Identifier('u.id')` or an enum case such
as `case UId = 'u.id'`. The alias is required: without it, `table()` throws
`SQL derived table requires an alias.` A derived table is valid only for a `SELECT`; with
`insert()`, `update()`, `delete()` or `upsert()`, `compile()` throws
`SQL derived tables are only valid for SELECT.`

## Common table expressions

`define()` adds a named statement to a `WITH` clause before the main one. It is a builder method —
the `SQL` facade has none — so chain it after `table()`:

```php
$Recent = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true);

$Query = $Database
   ->table(new Identifier('recent'))
   ->define(new Identifier('recent'), $Recent)
   ->select(Columns::Id)
   ->filter(Columns::Name, Operators::Equal, 'Ada')
   ->compile();
```

PostgreSQL:

```sql
WITH "recent" AS (SELECT "id", "name" FROM "users" WHERE "active" = $1) SELECT "id" FROM "recent" WHERE "name" = $2
```

The `WITH` clause is compiled first wherever you call `define()`, so the CTE's parameters come
first: `[true, 'Ada']`. Each `define()` adds one CTE, in call order. It takes a builder or a
compiled `Query`, embedded as [IN subqueries](#in-subqueries) describes: number a `Query`'s own
placeholders from 1, wherever its CTE stands.

A recursive CTE refers to itself, which a builder cannot express, so pass its body as a `Query`
written for your engine and set `recursive: true`:

```php
use Bootgly\ADI\Databases\SQL\Builder\Query;

$Numbers = new Query('SELECT 1 AS n UNION ALL SELECT n + 1 FROM "numbers" WHERE n < $1', [3]);

$Query = $Database
   ->table(new Identifier('numbers'))
   ->define(new Identifier('numbers'), $Numbers, recursive: true)
   ->select(new Identifier('n'))
   ->compile();
```

PostgreSQL:

```sql
WITH RECURSIVE "numbers" AS (SELECT 1 AS n UNION ALL SELECT n + 1 FROM "numbers" WHERE n < $1) SELECT "n" FROM "numbers"
```

It returns three rows, with `n` at `1`, `2` and `3`. One recursive CTE makes the whole clause
`WITH RECURSIVE`. On MySQL the body is written with `?` and backquotes, on SQLite with `?1`.

The `WITH` clause goes before the statement in every mode. MySQL accepts it only before `SELECT`,
`UPDATE` and `DELETE`: a CTE on an `insert()` is a syntax error there.

For now, a CTE that writes — an `INSERT`, `UPDATE` or `DELETE` inside `WITH`, which PostgreSQL
allows — does not make the statement a write: a `SELECT` over it is still marked `reading`. With
read replicas configured, `query()` sends it to a replica and opens no read-after-write window. Run
such a statement as raw SQL: `query()` keeps a raw `WITH` that contains a write on the primary.

## Reference

`nest()` and the other filtering verbs are in the
**[Reading rows](/manual/ADI/Databases/SQL/Builder/Reading/overview/#reference)** Reference.

### Identifier

`Bootgly\ADI\Databases\SQL\Builder\Identifier` implements `Stringable`.

```php
__construct (string $name)
```

Wraps a table, column or alias name known at runtime. Throws `InvalidArgumentException` with
`SQL identifier cannot be empty.` for `''`; the segments are checked when the name is quoted.

```php
public private(set) string $name
```

The name as given, unquoted. `__toString()` returns it.

```php
static quote (BackedEnum|Stringable $Identifier, null|Dialect $Dialect = null): string
```

Quotes an enum case or a `Stringable` with `$Dialect`, segment by segment, or with the process
default when `$Dialect` is `null` — PostgreSQL unless `configure()` set another. Builders pass
their own dialect. Throws the identifier errors listed in [Dynamic identifiers](#dynamic-identifiers).

```php
static configure (null|Dialect $Dialect = null): void
```

Sets the dialect `quote()` uses when it gets none. Without an argument, it resets the default to
PostgreSQL. Builders do not read it.

### Expression

`Bootgly\ADI\Databases\SQL\Builder\Expression` implements `Stringable`.

```php
__construct (string $sql)
```

Wraps a trusted SQL fragment the builder writes as it is, without quoting or binding. Throws
`InvalidArgumentException` with `SQL expression cannot be empty.` for `''`.

```php
public private(set) string $SQL
```

The fragment. `__toString()` returns it.

### Builder

```php
table (BackedEnum|Stringable|self|Query $Table, null|BackedEnum|Stringable $Alias = null): static
```

Sets the table, or a derived `SELECT` source: another builder or a compiled `Query`, which requires
`$Alias`. Without it, throws `InvalidArgumentException` with `SQL derived table requires an alias.`

```php
define (BackedEnum|Stringable $Name, self|Query $Query, bool $recursive = false): static
```

Adds one CTE named `$Name` before the main statement. A builder is compiled with this builder's
dialect; a `Query` is written as it is, with its placeholders renumbered (see
[IN subqueries](#in-subqueries)). `recursive: true` on any CTE emits `WITH RECURSIVE`.

### Enums on this page

Namespace `Bootgly\ADI\Databases\SQL\Builder\Auxiliaries`. Every case of every builder enum, and
the SQL it compiles to, is in
**[Auxiliary enums](/manual/ADI/Databases/SQL/Builder/Dialects/overview/#auxiliary-enums)**.

| Enum | Cases used here |
| --- | --- |
| `Operators` | `Between`, `Equal`, `Greater`, `In` |
