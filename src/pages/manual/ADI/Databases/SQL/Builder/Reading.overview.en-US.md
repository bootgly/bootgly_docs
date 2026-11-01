# Reading rows

Start with `$Database->table(...)`, choose columns, then add filters and shape the result.
`$Database` is the SQL facade. In an `HTTP_Server_CLI` route it is `$Response->Database`; in a
project's boot function, command or script,
`new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure())`; outside a
project, `new SQL([...])` with the connection keys — see
**[Open a database](/manual/ADI/Databases/SQL/overview/#open-a-database)**. Running a statement and
reading its outcome and errors are covered on **[SQL database](/manual/ADI/Databases/SQL/overview/)**.

## Names used on this page

Builder identifiers are string-backed enum cases, or `Identifier` objects for names known only at
runtime (see **[Dynamic identifiers](/manual/ADI/Databases/SQL/Builder/Composing/overview/#dynamic-identifiers)**).
The examples below use these enums:

```php
enum Tables: string
{
   case Posts = 'posts';
   case Users = 'users';
}

enum Columns: string
{
   case Active = 'active';
   case Bio = 'bio';
   case City = 'city';
   case Id = 'id';
   case Name = 'name';
   case PostsId = 'posts.id';
   case PostsTitle = 'posts.title';
   case PostsUser = 'posts.user_id';
   case UsersId = 'users.id';
   case UsersName = 'users.name';
}

enum Aliases: string
{
   case Cities = 'cities';
   case Initial = 'initial';
   case P = 'p';
   case Posts = 'posts';
   case Total = 'total';
   case Town = 'town';
   case U = 'u';
}
```

The dialect quotes a dotted value segment by segment: `Columns::UsersId` compiles to
`"users"."id"`. Qualify a column as `table.column` when the query joins or aliases tables — a table
alias rewrites only the references that start with its table's name (see [Aliases](#aliases)).

## A first query

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;

$Builder = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true)
   ->order(Orders::Asc, Columns::Name)
   ->limit(10, 5);

$Query = $Builder->compile();
$Query->SQL;        // SELECT "id", "name" FROM "users" WHERE "active" = $1 ORDER BY "name" ASC LIMIT 10 OFFSET 5
$Query->parameters; // [true]

$rows = $Database->await($Database->query($Builder))->Result->rows;
```

`compile()` shows the statement the builder sends, here for PostgreSQL. MySQL quotes with backticks
and writes `?` placeholders, SQLite writes `?1` (see
**[Query dialects](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)**). Every value you
filter on is bound as a parameter, never written into the SQL text — an `Expression` is the one
exception (see [Filters](#filters)). `query()` takes the builder, or the compiled `Query`, and
`await()` returns the finished operation, whose `Result->rows` holds the rows keyed by column name
(see **[Read the outcome](/manual/ADI/Databases/SQL/overview/#read-the-outcome)**). With read
replicas configured, a `SELECT` without a [row lock](#row-locks) can run on a replica (see
**[Routing rules](/guide/database-read-replicas/overview/#routing-rules)**).

## Select and distinct

```php
$Database->table(Tables::Users);                                     // SELECT * FROM "users"
$Database->table(Tables::Users)->select();                           // SELECT * FROM "users"
$Database->table(Tables::Users)->select(Columns::Id, Columns::Name); // SELECT "id", "name" FROM "users"
$Database->table(Tables::Users)->distinct()->select(Columns::City);  // SELECT DISTINCT "city" FROM "users"
```

A builder reads by default: with no columns, it selects `*`. `distinct()` removes duplicate rows
from the result.

`select()`, `count()` and `aggregate()` append projections in call order:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Aggregates;

$Database
   ->table(Tables::Users)
   ->aggregate(Aggregates::Maximum, Columns::Id, Aliases::Total)
   ->select(Columns::Name)
   ->group(Columns::Name);
```

Compiles to:

```sql
SELECT MAX("id") AS "total", "name" FROM "users" GROUP BY "name"
```

## Filters

```php
$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Id, Operators::Between, [1, 10])
   ->filter(Columns::City, Operators::In, ['London', 'Paris'])
   ->filter(Columns::Name, Operators::IsNotNull);
```

Compiles to:

```sql
SELECT "id" FROM "users" WHERE "id" BETWEEN $1 AND $2 AND "city" IN ($3, $4) AND "name" IS NOT NULL
```

The parameters are `[1, 10, 'London', 'Paris']`. Each `filter()` adds one `WHERE` predicate,
joined to the previous one with `AND` — for `OR`, see [OR and AND](#or-and-and). The operator
decides the value:

- `Equal`, `Unequal`, `Greater`, `GreaterOrEqual`, `Less` and `LessOrEqual` bind one value.
- `Between` takes an array of exactly two values.
- `In` takes a non-empty array, or a builder or compiled query that becomes a subquery (see
  **[IN subqueries](/manual/ADI/Databases/SQL/Builder/Composing/overview/#in-subqueries)**).
- `IsNull`, `IsNotNull`, `IsTrue` and `IsFalse` take no value.

For `Between`, `In` and the `Is*` operators, a value that does not fit throws
`InvalidArgumentException` from `filter()` itself, before anything compiles:
`SQL BETWEEN filter requires exactly two values.`, `SQL IN filter requires a non-empty array value.`
or `SQL literal filters do not accept values.` The single-value operators take any value, so one the
driver cannot bind — an array, or an object it has no mapping for, such as a builder — fails only
when the operation runs: `await()` throws `RuntimeException`
(`PostgreSQL parameter must be scalar or null.` on PostgreSQL). What each driver binds is in
**[SQL types](/manual/ADI/Databases/SQL/Drivers/Types/overview/)**, and every operator and the SQL it
compiles to are in
**[Auxiliary enums](/manual/ADI/Databases/SQL/Builder/Dialects/overview/#auxiliary-enums)**.

`NULL` is neither equal nor unequal to anything: `filter(Columns::City, Operators::Equal, null)`
matches no row, and `Operators::Unequal` skips the rows whose value is `NULL`. Test for it with
`IsNull` or `IsNotNull`.

An `Expression` value is not bound: its text takes the placeholder's place, which is how one column
is compared with another. Its text reaches the database as written, so keep user input out of it
and write names the way your engine reads them — MySQL, by default, reads `"city"` as the string
`'city'`, while a lowercase name left unquoted, such as `city`, works on all three. See
**[Trusted expressions](/manual/ADI/Databases/SQL/Builder/Composing/overview/#trusted-expressions)**.

## OR and AND

```php
$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Active, Operators::IsTrue)
   ->or->filter(Columns::Name, Operators::Equal, 'Ada');
```

Compiles to:

```sql
SELECT "id" FROM "users" WHERE "active" IS TRUE OR "name" = $1
```

`->or` joins the predicate that follows it with `OR`, and only that one: the next predicate is
joined with `AND` again. `->and` spells out the default. Both are read-only properties that return a
proxy with four methods — `filter()`, `match()`, `having()` and `nest()` — so `->or->match(...)` and
`->or->having(...)` work the same way. `WHERE` and `HAVING` each have a first predicate, which has
nothing to join: an `->or` before it is ignored, and `->filter(...)->or->having(...)` starts
`HAVING` without an `OR`.

The builder writes the predicates in call order without parentheses, and SQL evaluates `AND` before
`OR`:

```php
$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Active, Operators::IsTrue)
   ->filter(Columns::Name, Operators::Equal, 'Ada')
   ->or->filter(Columns::City, Operators::Equal, 'London');
```

That compiles to `WHERE "active" IS TRUE AND "name" = $1 OR "city" = $2`, which reads
`("active" IS TRUE AND "name" = $1) OR "city" = $2`: an inactive user in London passes. Group
predicates with `nest()`. Its closure receives a new builder, and what it filters becomes one
predicate in parentheses:

```php
use Bootgly\ADI\Databases\SQL\Builder;

$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Active, Operators::IsTrue)
   ->nest(function (Builder $Group): void {
      $Group
         ->filter(Columns::Name, Operators::Equal, 'Ada')
         ->or->filter(Columns::City, Operators::Equal, 'London');
   });
```

```sql
SELECT "id" FROM "users" WHERE "active" IS TRUE AND ("name" = $1 OR "city" = $2)
```

`->or->nest(...)` joins a whole group with `OR`:

```php
$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Name, Operators::Equal, 'Ada')
   ->or->nest(function (Builder $Group): void {
      $Group
         ->filter(Columns::Active, Operators::IsTrue)
         ->filter(Columns::City, Operators::Equal, 'London');
   });
```

```sql
SELECT "id" FROM "users" WHERE "name" = $1 OR ("active" IS TRUE AND "city" = $2)
```

A group holds `WHERE` predicates only: the closure's `filter()`, `match()` and `nest()` calls enter
it, and anything else it calls — `having()`, `select()`, `order()`, `limit()` — is dropped without
an error, so there is no grouped `HAVING`. A closure that adds no predicate makes `nest()` throw
`SQL nested filter requires at least one filter.` `compile()` calls the closure again whenever it
replays the builder for another dialect (see
**[Compile and run](/manual/ADI/Databases/SQL/Builder/overview/#compile-and-run)**), so keep it free
of side effects.

`filter()`, `match()`, `having()` and `nest()` end with a `Junctions $Junction = Junctions::And`
parameter. It is what `->or` and `->and` pass for you, so write the proxy form instead of passing it.

## Text matching

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Matches;

$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->match(Columns::Name, 'ada%', Matches::Insensitive)
   ->compile();
```

```sql
-- PostgreSQL
SELECT "id" FROM "users" WHERE "name" ILIKE $1
-- MySQL
SELECT `id` FROM `users` WHERE LOWER(`name`) LIKE LOWER(?)
-- SQLite
SELECT "id" FROM "users" WHERE "name" LIKE ?1 COLLATE NOCASE
```

`match()` adds one text predicate to `WHERE`, joined like a `filter()`. Its value is bound like any
other and must be a string — anything else throws `SQL text match value must be a string.` What a
mode matches depends on the engine:

| Mode | PostgreSQL | MySQL | SQLite |
| --- | --- | --- | --- |
| `Matches::Like`, the default | case-sensitive | follows the column's collation: MySQL 8's default, `utf8mb4_0900_ai_ci`, ignores case and accents | ignores case for ASCII letters only |
| `Matches::Insensitive` | ignores case as the column's collation defines it — ASCII letters only under `C` | ignores case, even on a case-sensitive collation | ignores case for ASCII letters only: `é%` does not find `Élise` |

In both modes the value is a `LIKE` pattern: `%` matches any run of characters and `_` one
character, and `match()` binds the value as given, so a `%` or `_` in user input stays a wildcard.
PostgreSQL and MySQL match one literally after a backslash, by default — `'50\%%'` finds `50% off`
but not `50 dollars`. SQLite has no escape character unless the statement names one, and `match()`
names none, so there `%` and `_` always act as wildcards.

`Matches::Text` runs the engine's full-text search:

```php
$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->match(Columns::Bio, 'first database', Matches::Text)
   ->compile();
```

```sql
-- PostgreSQL
SELECT "id" FROM "users" WHERE to_tsvector('simple', "bio") @@ plainto_tsquery('simple', $1)
-- MySQL
SELECT `id` FROM `users` WHERE MATCH (`bio`) AGAINST (? IN NATURAL LANGUAGE MODE)
-- SQLite
SELECT "id" FROM "users" WHERE "bio" MATCH ?1
```

Each engine needs its own setup and reads the value its own way:

| | PostgreSQL | MySQL | SQLite |
| --- | --- | --- | --- |
| Needs | nothing: any text column | a `FULLTEXT` index on the column, or the statement fails with `1191: Can't find FULLTEXT index matching the column list` | a column of an FTS5 virtual table, or the statement fails with `unable to use function MATCH in the requested context` |
| `'first database'` finds | rows that hold both words | rows that hold either word | rows that hold both words |
| Words | whole words, any case, no stemming: `database` does not find `Databases` | whole words, no stemming; stopwords such as `the`, and words shorter than three characters, find nothing | whole words, any case, no stemming |

On SQLite the value is an FTS5 query: `OR`, `NOT` and a trailing `*` are operators, and a `'`, `-`
or `:` in it fails the statement. To search user input as a phrase there, wrap it in double quotes
and double any `"` inside it.

PostgreSQL searches through its `simple` configuration, which is what leaves words unstemmed; a
dialect of your own can search through another one, as
**[Writing a custom dialect](/manual/ADI/Databases/SQL/Builder/Dialects/overview/#writing-a-custom-dialect)**
shows.

## Joins

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Joins;

$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::UsersName, Columns::PostsTitle)
   ->join(Tables::Posts, Columns::PostsUser, Operators::Equal, Columns::UsersId, Joins::Left)
   ->compile();
```

```sql
SELECT "users"."name", "posts"."title" FROM "users" LEFT JOIN "posts" ON "posts"."user_id" = "users"."id"
```

`join()` adds a table and one `ON` comparison between two columns. Neither side is a value, so
nothing is bound. Use a comparison operator — `Equal`, `Unequal`, `Greater`, `GreaterOrEqual`,
`Less` or `LessOrEqual`: `join()` accepts any `Operators` case, and the others compile to SQL that
no engine accepts. The last argument picks the join: `Joins::Inner`, the default, keeps the rows
that match on both sides; `Joins::Left` keeps every row of the base table, `Joins::Right` every row
of the joined table, and `Joins::Full` every row of both.

Rows are keyed by column name, so two selected columns with the same name — `users.id` and
`posts.id`, say — come back as one key holding the later column's value. Alias one of them (see
[Aliases](#aliases)).

Not every engine runs every join. PostgreSQL runs all four. SQLite runs `RIGHT JOIN` and
`FULL JOIN` from version 3.39.0 on, and an older SQLite rejects them.

> [!WARNING]
> MySQL has no `FULL JOIN`, and the builder does not stop `Joins::Full`. MySQL reads `FULL` as an
> alias of the table before it. When the statement names that table again, it fails — with
> `1054: Unknown column`, or with a `1064` syntax error once the table has an alias. When it does
> not, the statement runs as an inner join and drops the unmatched rows of both tables without an
> error. Do not use `Joins::Full` on MySQL.

## Aliases

```php
$Query = $Database
   ->table(Tables::Users, Aliases::U)
   ->select(Columns::UsersName, Columns::PostsTitle)
   ->join(Tables::Posts, Columns::PostsUser, Operators::Equal, Columns::UsersId)
   ->alias(Tables::Posts, Aliases::P)
   ->filter(Columns::UsersId, Operators::Equal, 1)
   ->order(Orders::Asc, Columns::PostsTitle)
   ->compile();
```

```sql
SELECT "u"."name", "p"."title" FROM "users" AS "u" JOIN "posts" AS "p" ON "p"."user_id" = "u"."id" WHERE "u"."id" = $1 ORDER BY "p"."title" ASC
```

A table gets its alias from the second argument of `table()`, or from `alias()` on the base table or
a joined one. The alias renders `"users" AS "u"` and rewrites every reference that starts with the
table's name — `"users"."id"` becomes `"u"."id"` — in the select list, `ON`, `WHERE`, `GROUP BY`,
`HAVING`, `ORDER BY` and the aggregated columns. An unqualified column such as `Columns::Id` stays as
it is, and so does the text of an `Expression`: write the alias inside it. `alias()` can come before
or after the `join()` that adds its table — an alias for a table the builder does not have yet waits
for it.

Columns and expressions take aliases too:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;

$Initial = new Expression('UPPER(SUBSTR(name, 1, 1))');

$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::City, $Initial)
   ->alias(Columns::City, Aliases::Town)
   ->alias($Initial, Aliases::Initial)
   ->group(Columns::City, $Initial)
   ->order(Orders::Asc, Columns::City)
   ->compile();
```

```sql
SELECT "city" AS "town", UPPER(SUBSTR(name, 1, 1)) AS "initial" FROM "users" GROUP BY "town", "initial" ORDER BY "town" ASC
```

The select list renders `AS`, and `GROUP BY`, `HAVING` and `ORDER BY` name the alias instead of the
column or the expression. `WHERE` and `ON` keep the column, because SQL evaluates them before the
select list. An expression alias belongs to the SQL text, so any `Expression` with the same text
gets it.

For now they name the alias even when the column or expression is not in the select list, where no
output column carries that name, so alias only what you select. Otherwise PostgreSQL and MySQL
reject the statement — `column "town" does not exist`, `1054: Unknown column 'town'` — and SQLite
reads `"town"` as a string and runs it without an error: the ordering is lost, and a grouping by it
alone folds every row into one group.

`HAVING` names the alias as well:

```php
$Database
   ->table(Tables::Users)
   ->select(Columns::City)
   ->alias(Columns::City, Aliases::Town)
   ->group(Columns::City)
   ->having(Columns::City, Operators::IsNotNull);
```

```sql
SELECT "city" AS "town" FROM "users" GROUP BY "town" HAVING "town" IS NOT NULL
```

> [!WARNING]
> For now, PostgreSQL rejects that statement with `column "town" does not exist`: its `HAVING`
> sees no output names. MySQL and SQLite run it. Until the builder changes, do not filter an aliased
> column or expression with `having()`. Filter a grouped column with `filter()` instead —
> `WHERE "city" IS NOT NULL` keeps the same groups — and give an aggregate its alias through
> `aggregate()` or `count()`, then filter it with an `Expression` of its SQL, as in
> [Grouping, having and order](#grouping-having-and-order).

## Grouping, having and order

```php
$Query = $Database
   ->table(Tables::Users)
   ->select(Columns::City)
   ->count(Aliases::Total)
   ->filter(Columns::Active, Operators::IsTrue)
   ->group(Columns::City)
   ->having(new Expression('COUNT(*)'), Operators::Greater, 1)
   ->order(Orders::Desc, Aliases::Total)
   ->compile();
```

```sql
SELECT "city", COUNT(*) AS "total" FROM "users" WHERE "active" IS TRUE GROUP BY "city" HAVING COUNT(*) > $1 ORDER BY "total" DESC
```

That lists the cities with more than one active user, the busiest first. `group()` appends
`GROUP BY` columns. `having()` filters the groups, with the operators, values and checks of
`filter()`, and `->or->having(...)` joins a predicate with `OR`. `order()` takes a direction and a
column — or an output name, as `Aliases::Total` here — and each call appends one `ORDER BY` term.

Ordering can place `NULL` values:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Nulls;

$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->order(Orders::Asc, Columns::City, Nulls::Last)
   ->order(Orders::Asc, Columns::Name);
```

```sql
-- PostgreSQL, SQLite
SELECT "id" FROM "users" ORDER BY "city" ASC NULLS LAST, "name" ASC
-- MySQL
SELECT `id` FROM `users` ORDER BY `city` IS NULL ASC, `city` ASC, `name` ASC
```

Without `Nulls`, the engines disagree: PostgreSQL sorts `NULL` after every value in `ASC` order and
before them in `DESC` order, and MySQL and SQLite do the opposite. Pass `Nulls::First` or
`Nulls::Last` when the position matters. MySQL has no `NULLS` clause, so its dialect sorts on
`IS NULL` first.

## Counting and aggregates

Count per group with `Aggregates::Count` — here, how many posts each user has written:

```php
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

To filter on the count, pass `having()` an `Expression`. Its text reaches the database as written,
so spell the table alias in it:

```php
$Query = $Database
   ->table(Tables::Users)
   ->alias(Tables::Users, Aliases::U)
   ->select(Columns::UsersId)
   ->aggregate(Aggregates::Count, Columns::PostsId, Aliases::Posts)
   ->join(Tables::Posts, Columns::PostsUser, Operators::Equal, Columns::UsersId, Joins::Left)
   ->alias(Tables::Posts, Aliases::P)
   ->group(Columns::UsersId)
   ->having(new Expression('COUNT(p.id)'), Operators::Greater, 1)
   ->compile();
```

The statement ends in `GROUP BY "u"."id" HAVING COUNT(p.id) > $1`.

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
> argument and accepted a `*` column, and an aggregated column ignored table aliases.

## Limit and offset

```php
$Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->order(Orders::Asc, Columns::Id)
   ->limit(25)
   ->skip(50);
```

Compiles to:

```sql
SELECT "id" FROM "users" ORDER BY "id" ASC LIMIT 25 OFFSET 50
```

`limit($count, $offset)` sets the row count and the offset; `skip($offset)` sets only the offset.
Order the rows before you slice them: without `ORDER BY`, the engine returns them in any order, and
pages can overlap. `limit(0)` returns no rows, and `skip(0)` clears the offset. A negative number throws
`SQL limit and offset must be non-negative integers.` from `limit()` and
`SQL offset must be a non-negative integer.` from `skip()`.

> [!WARNING]
> For now, `limit($count)` also resets the offset to 0, so a `skip()` called before it is lost:
> `->skip(50)->limit(25)` compiles `LIMIT 25` and returns the first page, without an error. Call
> `skip()` after `limit()`, or pass both to `limit(25, 50)`.

Skipping without a limit is spelled differently by each dialect, and the builder handles that
for you. Only PostgreSQL's grammar accepts a standalone `OFFSET n`; MySQL and SQLite require a
row count before it, so the builder supplies the one each of them reads as "no limit" —
`18446744073709551615` for MySQL, `-1` for SQLite. The two are not interchangeable: each
engine rejects the other's. Write `skip(50)` and the same query runs everywhere.

To page through entities by page number or cursor, see
**[ORM pagination](/manual/ADI/Databases/SQL/Repository/Pagination/overview/)**.

## Row locks

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Locks;

$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$row = $Database->await($Transaction->query(
   $Transaction
      ->table(Tables::Users)
      ->select(Columns::Id, Columns::Name)
      ->filter(Columns::Id, Operators::Equal, 1)
      ->lock(Locks::Update)
))->Result->row;

$Database->await($Transaction->query(
   $Transaction
      ->table(Tables::Users)
      ->update()
      ->set(Columns::Name, "{$row['name']} Lovelace")
      ->filter(Columns::Id, Operators::Equal, 1)
));

$Database->await($Transaction->commit());
```

The `SELECT` compiles to `SELECT "id", "name" FROM "users" WHERE "id" = $1 FOR UPDATE`.
`Locks::Update` appends `FOR UPDATE`: until the transaction ends, other transactions can neither
change the selected rows nor lock them, so nobody changes the row between the read and the
`UPDATE`. `Locks::Share` appends `FOR SHARE`, which stops other transactions from changing the rows
but lets them take a share lock too. PostgreSQL and MySQL support both.

- Take the lock inside a transaction, as above: outside one, each statement commits on its own, and
  its lock ends with it (see **[Transactions](/manual/ADI/Databases/SQL/Transaction/overview/)**).
  Put the statements in a `try` and end the transaction in the `catch`, as
  **[Commit or roll back](/guide/database-transactions/overview/#commit-or-roll-back)** shows.
- A locked `SELECT` always runs on the primary, even with read replicas configured.
- SQLite has no row locks. The builder still appends the clause, and SQLite rejects the statement
  with `Unable to prepare statement: near "FOR": syntax error`. Code that also runs on SQLite skips
  `lock()` there:

```php
use Bootgly\ADI\Databases\SQL\Builder\Dialects\SQLite;

$Builder = $Transaction
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Id, Operators::Equal, 1);

if ($Builder->Dialect instanceof SQLite === false) {
   $Builder->lock(Locks::Update);
}
```

## Reference

The builder's `table()` is in the
**[Composing queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/#reference)** Reference;
`compile()` and the `$and` and `$or` properties in the
**[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/#reference)** one; and the facade's
`table()`, `query()` and `await()` in the **[SQL database](/manual/ADI/Databases/SQL/overview/#reference)**
one.

### Builder methods

```php
select (BackedEnum|Stringable ...$Columns): static
```

Switches to SELECT mode and appends the columns to the select list, after the projections already
added. A builder with no columns selects `*`.

```php
distinct (): static
```

Switches to SELECT mode and emits `SELECT DISTINCT`, which removes duplicate result rows.

```php
filter (BackedEnum|Stringable $Column, Operators $Operator, mixed $value = null, Junctions $Junction = Junctions::And): static
```

Appends one `WHERE` predicate. The value is bound, unless it is an `Expression`, and checked at once:
`Between` needs an array of two values, `In` a non-empty array or a builder or compiled query, and
the `Is*` operators no value — otherwise it throws `InvalidArgumentException`. `$Junction` joins the
predicate to the previous one, and is ignored on the first: leave it to `->or` and `->and`.

```php
nest (Closure $Group, Junctions $Junction = Junctions::And): static
```

Calls `$Group` with a new builder of the same dialect and appends the `filter()`, `match()` and
`nest()` predicates the closure added as one predicate in parentheses; the closure's other calls are
dropped. A closure that adds none throws `SQL nested filter requires at least one filter.`
`compile($Dialect)` calls the closure again when it replays the builder, so keep it free of side
effects. `$Junction` joins the group to the previous predicate, and is ignored on the first: leave
it to `->or` and `->and`.

```php
match (BackedEnum|Stringable $Column, mixed $value, Matches $Match = Matches::Like, Junctions $Junction = Junctions::And): static
```

Appends one text predicate to `WHERE`, compiled by the dialect for `$Match`. The value is bound and
must be a string; anything else throws `SQL text match value must be a string.`

```php
join (BackedEnum|Stringable $Table, BackedEnum|Stringable $Left, Operators $Operator, BackedEnum|Stringable $Right, Joins $Join = Joins::Inner): static
```

Appends a join of `$Table` on `$Left $Operator $Right`, two identifiers. Neither the operator nor the
dialect's support for `$Join` is checked.

```php
alias (BackedEnum|Stringable $Identifier, BackedEnum|Stringable $Alias): static
```

Gives `$Identifier` an alias: a table alias for the base table or a joined table, an expression alias
for an `Expression`, and a column alias for any other name — which becomes a table alias if
`table()` or `join()` later adds a table of that name. Throws
`SQL expression alias conflicts with an existing column alias.` or
`SQL column alias conflicts with an existing expression alias.` when one SQL text would get both
kinds.

```php
aggregate (Aggregates $Aggregate, BackedEnum|Stringable $Column, null|BackedEnum|Stringable $Alias = null, bool $distinct = false): static
```

Switches to SELECT mode and appends `AVG`, `COUNT`, `MAX`, `MIN` or `SUM` over one column. The
column resolves through table aliases at compile time. `distinct: true` compiles
`FUNC(DISTINCT column)`. A bare `*` column is refused with
`SQL aggregate cannot take *: use count() for COUNT(*).` Since 1.0.3 for `Count`, `distinct`, the
alias resolution and the `*` refusal.

```php
count (null|BackedEnum|Stringable $Alias = null): static
```

Switches to SELECT mode and appends `COUNT(*)`, which counts rows — including the `NULL`-filled row
a `LEFT JOIN` produces for an unmatched parent. To count a column's non-`NULL` values, use
`aggregate(Aggregates::Count, ...)`.

```php
group (BackedEnum|Stringable ...$Columns): static
```

Appends `GROUP BY` columns. An aliased column or expression is named by its alias — for now even
when it is not selected (see [Aliases](#aliases)).

```php
having (BackedEnum|Stringable $Column, Operators $Operator, mixed $value = null, Junctions $Junction = Junctions::And): static
```

Appends one `HAVING` predicate, with the values and checks of `filter()`. For now an aliased column
or expression is named by its alias, which PostgreSQL rejects (see [Aliases](#aliases)).

```php
order (Orders $Order, BackedEnum|Stringable $Column, null|Nulls $Nulls = null): static
```

Appends one `ORDER BY` term; an aliased column or expression is named by its alias, for now even
when it is not selected (see [Aliases](#aliases)). `$Nulls` places the `NULL` values — natively on
PostgreSQL and SQLite, through an `IS NULL` sort on MySQL. A `Nulls` case given as the column
throws `SQL order requires a column identifier.`

```php
limit (int $count, int $offset = 0): static
```

Sets `LIMIT` and the offset. For now it always sets the offset, so a one-argument call resets an
earlier `skip()` to 0. A negative value throws `SQL limit and offset must be non-negative integers.`

```php
skip (int $offset): static
```

Sets the offset only. Without a `limit()`, PostgreSQL writes `OFFSET` alone, and MySQL and SQLite
add the row count they read as "no limit". A negative value throws
`SQL offset must be a non-negative integer.`

```php
lock (Locks $Lock): static
```

Appends `FOR UPDATE` or `FOR SHARE` to a `SELECT` and keeps the statement on the primary. The dialect
is not checked: SQLite rejects the clause.

### Enums on this page

Namespace `Bootgly\ADI\Databases\SQL\Builder\Auxiliaries`. Every case of every builder enum, and
the SQL it compiles to, is in
**[Auxiliary enums](/manual/ADI/Databases/SQL/Builder/Dialects/overview/#auxiliary-enums)**.

| Enum | Cases used here |
| --- | --- |
| `Aggregates` | `Count`, `Maximum` |
| `Joins` | `Full`, `Inner`, `Left`, `Right` |
| `Junctions` | `And`, `Or` |
| `Locks` | `Share`, `Update` |
| `Matches` | `Insensitive`, `Like`, `Text` |
| `Nulls` | `First`, `Last` |
| `Operators` | `Between`, `Equal`, `Greater`, `GreaterOrEqual`, `In`, `IsFalse`, `IsNotNull`, `IsNull`, `IsTrue`, `Less`, `LessOrEqual`, `Unequal` |
| `Orders` | `Asc`, `Desc` |
