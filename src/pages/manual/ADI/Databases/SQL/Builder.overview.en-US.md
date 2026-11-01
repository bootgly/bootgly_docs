# Query Builder

The Query Builder is how you read and write rows without concatenating SQL strings. It
builds DML statements — `SELECT`, `INSERT`, `UPDATE` and `DELETE` — from typed names and bound
values, and writes them in the dialect of your database: PostgreSQL, MySQL or SQLite.

> New here? Follow the **[Database queries](/guide/database-queries/overview/)** guide
> first. This page explains the builder object: where it comes from, how it compiles and runs,
> its modes and its errors.

## The loop

With a `users` table where Ada (id `1`) is active and Grace (id `2`) is not — every example on this
page continues this script, with its imports, enums and `$Database`:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\API\Environment\Configs\DatabaseConfig;

enum Tables: string { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Name = 'name'; case Active = 'active'; }

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());

$Builder = $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::Equal, true);

$Query = $Builder->compile();
```

`$Query` is a `Bootgly\ADI\Databases\SQL\Builder\Query`. On PostgreSQL — the engine of every SQL
comment on this page — it holds:

```php
$Query->SQL;        // SELECT "id", "name" FROM "users" WHERE "active" = $1
$Query->parameters; // [true]
$Query->reading;    // true
```

To run it, pass the builder or the compiled query to the database and await the operation:

```php
$Operation = $Database->query($Builder);
$Database->await($Operation);

$Operation->Result->rows; // [['id' => 1, 'name' => 'Ada']]
```

`query()` and `await()` belong to the SQL facade: what they accept, what they throw and what a
finished operation holds are in **[Run a query](/manual/ADI/Databases/SQL/overview/#run-a-query)**
and **[Read the outcome](/manual/ADI/Databases/SQL/overview/#read-the-outcome)**.

> **Opening the database.** The `DatabaseConfig` line builds the facade from the project's
> `database` config scope, so it runs in a project's boot function, a command or a script inside
> the project. In an `HTTP_Server_CLI` route, use the per-worker
> **[`$Response->Database`](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**
> resource instead, and outside a project pass the connection as an array — see
> **[Open a database](/manual/ADI/Databases/SQL/overview/#open-a-database)**.

## Entry points

A builder compiles with one dialect, which decides its quotes, its placeholders and the SQL of a
few features. Where you start the builder decides which dialect it gets. `Tables` is the enum of
[The loop](#the-loop):

```php
use Bootgly\ADI\Databases\SQL\Builder;

$Database->table(Tables::Users)->Dialect === $Database->Dialect;   // true
(new Builder($Database->Dialect))->Dialect === $Database->Dialect; // true
(new Builder)->Dialect::class; // Bootgly\ADI\Databases\SQL\Builder\Dialects\PostgreSQL
```

- **`$Database->table()`** starts a builder with the facade's dialect, `$Database->Dialect`, which
  the `driver` key chose when the facade was built — see
  **[Choosing the dialect](/manual/ADI/Databases/SQL/Builder/Dialects/overview/#choosing-the-dialect)**.
  This is the usual start.
- **`$Transaction->table()`** starts one with the same dialect, for a statement you run with
  `$Transaction->query()` on the transaction's connection — see
  **[Run statements](/manual/ADI/Databases/SQL/Transaction/overview/#run-statements)**.
- **`$Response->Database->table()`** does the same in an `HTTP_Server_CLI` route, through the
  per-worker resource.
- **`new Builder($Dialect)`** starts a builder without a facade, for code that has none at hand or
  compiles for another engine. Without an argument it compiles PostgreSQL, whatever your database
  is, so pass `$Database->Dialect`.

`table()` takes a table name and an optional alias. A builder or a compiled query given in place
of the name makes a derived table, which requires the alias — see
**[Derived tables](/manual/ADI/Databases/SQL/Builder/Composing/overview/#derived-tables)**.

## Names are typed

Builder identifiers are not raw strings: PHP's type check refuses a plain `string` where a name
goes. Use a string-backed enum for the names your application knows, `Identifier` for a name
known only at runtime, and `Expression` for a trusted SQL fragment written as it is:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Query = $Database
   ->table(new Identifier('public.users'))
   ->select(Columns::Id, new Expression('NOW()'))
   ->compile();

$Query->SQL; // SELECT "id", NOW() FROM "public"."users"
```

The dialect quotes an `Identifier`, segment by segment; it never quotes or binds an `Expression`.
Values are the other way round: what you pass as a value to `filter()`, `having()`, `match()` or
`set()` is sent as a parameter. The identifier rules, and where an `Expression` is accepted, are in
**[Composing queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/)**.

## Compile and run

Every fluent call changes the builder and returns the same object, so a chain and separate
statements on one variable build the same query. `compile()` turns the builder into a `Query`:

- `SQL` — the statement, written in the builder's dialect;
- `parameters` — the bound values, in the order of their placeholders in the text, so a
  subquery's values sit where the subquery does;
- `reading` — `true` for a `SELECT` without `lock()`, the statements `query()` may send to a read
  replica (see **[Routing rules](/guide/database-read-replicas/overview/#routing-rules)**).

`compile()` is memoized: it returns the same `Query` object until the next fluent call.
`query()` and `Transaction::query()` compile the builder you pass, through that memo, and the
operation keeps the compiled statement, so a later change to the builder does not reach an
operation already created. Each `query()` of one builder creates a new operation that runs the
same statement.

```php
use Bootgly\ADI\Databases\SQL\Builder\Dialects\MySQL;
use Bootgly\ADI\Databases\SQL\Builder\Dialects\SQLite;

$Builder = $Database
   ->table(Tables::Users)
   ->select(Columns::Id)
   ->filter(Columns::Name, Operators::Equal, 'Ada');

$Query = $Builder->compile();
$Query === $Builder->compile();     // true

$Builder->compile(new MySQL)->SQL;  // SELECT `id` FROM `users` WHERE `name` = ?
$Builder->compile(new SQLite)->SQL; // SELECT "id" FROM "users" WHERE "name" = ?1

$Builder->filter(Columns::Active, Operators::IsTrue);

$Builder->compile()->SQL; // SELECT "id" FROM "users" WHERE "name" = $1 AND "active" IS TRUE
$Query->SQL;              // SELECT "id" FROM "users" WHERE "name" = $1
```

`compile($Dialect)` with a dialect of another class replays every call the builder recorded into
a new builder of that dialect, compiles it, and keeps the result per dialect class until the next
fluent call; a dialect of the builder's own class compiles like `compile()`. The replay runs each
`nest()` closure again, so keep those closures free of side effects. A call the other dialect
refuses throws from `compile()` — `output()` replayed into MySQL or SQLite, for one (see
[Errors](#errors)).

For now, the memo follows only the builder's own calls. A builder embedded in it — a subquery, a
derived table, a CTE — that you change after the outer builder compiled is not seen: the outer
builder keeps returning its earlier SQL and parameters. Compile a `DELETE` to preview it, change
its subquery builder, and the `DELETE` that runs still removes the rows the old subquery selected.
Finish the inner builder before you compile or run the outer one, or build the outer statement
again.

### Reuse a builder

Because a builder is mutable, two statements started from one variable share every call made on
it. To share a shape, build each statement from a function:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;

$Active = fn (): Builder => $Database
   ->table(Tables::Users)
   ->select(Columns::Id, Columns::Name)
   ->filter(Columns::Active, Operators::IsTrue);

$Ada = $Active()->filter(Columns::Name, Operators::Equal, 'Ada');
$Latest = $Active()->order(Orders::Desc, Columns::Id)->limit(10);

$Ada->compile()->SQL;    // SELECT "id", "name" FROM "users" WHERE "active" IS TRUE AND "name" = $1
$Latest->compile()->SQL; // SELECT "id", "name" FROM "users" WHERE "active" IS TRUE ORDER BY "id" DESC LIMIT 10
```

## Modes

A builder is in one of four modes and compiles the statement of its mode. The mode is
`$Builder->Mode`, a case of `Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Modes`, and the last
call that sets one wins:

| Mode | Set by | Compiles | Built from |
| --- | --- | --- | --- |
| `Modes::Select` (the default) | `select()`, `distinct()`, `count()`, `aggregate()` | `SELECT` | columns, joins, filters, `group()`, `having()`, `order()`, `limit()`, `skip()`, `lock()` |
| `Modes::Insert` | `insert()`, `upsert()` | `INSERT` | `set()` values, `upsert()` conflict columns, `output()` |
| `Modes::Update` | `update()` | `UPDATE` | `set()` values, filters, `output()` |
| `Modes::Delete` | `delete()` | `DELETE` | filters, `output()` |

`set()` does not set a mode. A builder you forget to switch with `insert()` or `update()` stays a
`SELECT` — marked `reading`, so with replicas configured `query()` may even send it to one:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Modes;

$Builder = $Database->table(Tables::Users)->set(Columns::Name, 'Ada');

$Builder->Mode === Modes::Select; // true
$Builder->compile()->SQL;         // SELECT * FROM "users"

$Builder->insert();

$Builder->Mode === Modes::Insert; // true
$Builder->compile()->SQL;         // INSERT INTO "users" ("name") VALUES ($1)
```

A call of another mode keeps everything recorded before it, and each statement takes only what
the table lists for it; the rest is left out without an error. `insert()->set(...)->count()`
compiles `SELECT COUNT(*) FROM "users"`, and `limit()`, `order()` or `join()` on an `update()` do
not reach the `UPDATE`. A CTE from `define()` goes before the statement in every mode.

## Errors

Every error the builder raises is an `InvalidArgumentException`, raised before anything is sent. A
call throws for input it can check on its own; `compile()` throws for a statement that is
incomplete as a whole. `query()` and `Transaction::query()` compile the builder you pass, so the
compile errors surface there:

```php
use InvalidArgumentException;

try {
   $Database->query($Database->table(Tables::Users)->delete());
}
catch (InvalidArgumentException $Exception) {
   $Exception->getMessage(); // SQL update/delete requires at least one filter.
}
```

The filter guard has no switch, and a filter written to match every row would only hide the
intent. To change or remove every row on purpose, send the statement as raw SQL, which the builder
never checks: `$Database->query('DELETE FROM users')`.

Thrown by `compile()`:

| Message | Cause |
| --- | --- |
| `SQL builder requires a table.` | No `table()` call — only a builder made with `new Builder` can lack one |
| `SQL derived tables are only valid for SELECT.` | A derived table with `insert()`, `update()`, `delete()` or `upsert()` |
| `SQL insert/update requires at least one set value.` | `insert()`, `upsert()` or `update()` without `set()` |
| `SQL update/delete requires at least one filter.` | `update()` or `delete()` without `filter()`, `match()` or `nest()` |
| `SQL insert set columns must have the same value count.` | `set()` calls with different value counts, made before `upsert()` switched the builder to `INSERT`; after `insert()`, `set()` throws it at once |
| `SQL subquery placeholders could not be rewritten.` | PHP's regular-expression engine failed while renumbering the `$n` or `?n` placeholders of an embedded subquery — not expected in practice |

`compile($Dialect)` also re-runs every call through that dialect, so a call it refuses throws from
`compile()` with the call's own message.

Thrown by the call:

| Message | Thrown by | Cause |
| --- | --- | --- |
| `SQL derived table requires an alias.` | `table()` | A builder or a compiled query as the source, without `$Alias` |
| `SQL update set values must be singular.` | `set()`, `update()` | Several values for one column in UPDATE mode — several values are for a multi-row `insert()` |
| `SQL insert set columns must have the same value count.` | `set()`, `insert()` | Columns with different value counts in INSERT mode |
| `SQL expression alias conflicts with an existing column alias.` | `alias()` | An `Expression` whose text already has a column alias |
| `SQL column alias conflicts with an existing expression alias.` | `alias()` | A column whose quoted name already has an `Expression` alias |
| `SQL aggregate cannot take *: use count() for COUNT(*).` | `aggregate()` | `*` as the column |
| `SQL BETWEEN filter requires exactly two values.` | `filter()`, `having()` | `Operators::Between` without an array of two values |
| `SQL IN filter requires a non-empty array value.` | `filter()`, `having()` | `Operators::In` with neither a non-empty array nor a builder or compiled query |
| `SQL literal filters do not accept values.` | `filter()`, `having()` | A value with `Operators::IsNull`, `IsNotNull`, `IsTrue` or `IsFalse` |
| `SQL nested filter requires at least one filter.` | `nest()` | The closure added no `filter()`, `match()` or `nest()` |
| `SQL text match value must be a string.` | `match()` | A value that is not a `string` — an `Expression` included |
| `SQL order requires a column identifier.` | `order()` | A `Nulls` case as the column: `order(Orders::Asc, Nulls::Last)` instead of `order(Orders::Asc, $Column, Nulls::Last)` |
| `SQL limit and offset must be non-negative integers.` | `limit()` | A negative count or offset |
| `SQL offset must be a non-negative integer.` | `skip()` | A negative offset |
| `SQL dialect does not support RETURNING output.` | `output()` | A MySQL or SQLite builder |
| `SQL dialect does not support upsert handling.` | `upsert()` | A dialect whose `check(Capabilities::Upsert)` is `false` — none of the three shipped ones |
| `SQL upsert requires at least one conflict column.` | `upsert()` | No column |
| `SQL identifier cannot be empty.` | `new Identifier()` | An empty name |
| `SQL identifier segment cannot be empty.` | The call that receives the name | A dotted name with an empty part, such as `'public.'` or `'a..b'` |
| `SQL enum identifiers must be non-empty strings.` | The call that receives the case | A case of an int-backed enum, or a string-backed case whose value is `''` |
| `SQL object identifiers must render to non-empty strings.` | The call that receives the object | A `Stringable` whose string is `''` |
| `SQL expression cannot be empty.` | `new Expression()` | An empty fragment |
| `SQL builder dialect is not registered: mariadb` | `new SQL()`, `Dialects::fetch()` | A `driver` with no dialect |

A plain `string`, or a case of an enum without values, where a name goes fails PHP's own type check
with a `TypeError` instead.

## Reference

The SQL facade methods that start and run a builder — `table()`, `query()`, `begin()` — are in the
**[SQL database](/manual/ADI/Databases/SQL/overview/#reference)** Reference. The builder's fluent
verbs are in the References of **[Reading rows](/manual/ADI/Databases/SQL/Builder/Reading/overview/)**,
**[Writing rows](/manual/ADI/Databases/SQL/Builder/Writing/overview/)** and
**[Composing queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/)**.

### Builder

```php
__construct (Dialect $Dialect = new PostgreSQL)
```

Creates an empty builder that compiles with `$Dialect` — PostgreSQL when omitted. `SQL::table()`
and `Transaction::table()` call it with the facade's dialect, then `table()`.

```php
compile (null|Dialect $Dialect = null): Query
```

Compiles the builder into a `Query`: the statement in the builder's dialect, the parameters in
placeholder order and the `reading` flag. The result is memoized until the next fluent call. A
`$Dialect` of another class replays the recorded calls through it, memoized per dialect class.
Throws `InvalidArgumentException` for the compile errors in [Errors](#errors), and, while
replaying, for a call the target dialect refuses.

```php
public private(set) Dialect $Dialect
```

The dialect the builder compiles with, set by the constructor. Read it to branch on what the
engine supports: `$Builder->Dialect->check(Capabilities::Output)` says whether `output()` is
accepted (see **[Query dialects](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)**).

```php
public private(set) Modes $Mode = Modes::Select
```

The mode `compile()` builds the statement for — see [Modes](#modes).

```php
public private(set) null|string $table = null
```

The table `table()` set, quoted for the builder's dialect — `"users"` on PostgreSQL — or `null`
for a derived table and before `table()`.

```php
public private(set) null|string $sourceAlias = null
```

The quoted alias of a derived table — the `$Alias` that `table()` received with a builder or a
compiled query — or `null`.

```php
public private(set) bool $distinct = false
```

Whether `distinct()` was called, so the statement starts with `SELECT DISTINCT`.

```php
public private(set) array $columns = []
```

The select list in call order, as quoted text: the columns of `select()` and the expressions
`count()` and `aggregate()` wrote, with the alias given to them. `alias()` and table aliases are
applied when the builder compiles.

```php
public private(set) array $joins = []
```

One entry per `join()`: its quoted `table`, `left` and `right` names, its `operator` (an
`Operators` case) and its `join` (a `Joins` case).

```php
public private(set) array $groups = []
```

The quoted `GROUP BY` columns, in call order.

```php
public private(set) array $orders = []
```

One entry per `order()`: its quoted `column`, its `order` (an `Orders` case) and its `nulls` (a
`Nulls` case or `null`).

```php
public private(set) null|int $limited = null
```

The row count `limit()` set, or `null` without one.

```php
public private(set) int $offset = 0
```

The offset the last `limit()` or `skip()` call set; `0` means none.

```php
public private(set) null|Locks $Lock = null
```

The `Locks` case `lock()` set, or `null`. A builder with one compiles a `Query` whose `reading` is
`false`.

```php
public private(set) array $assignments = []
```

The values each `set()` assigned, keyed by the compiled column — the dialect-quoted identifier,
or the raw SQL of an `Expression` — with one value per row. Read-only outside the builder; the
seed Runner reads it to move identity sequences on PostgreSQL.

```php
public Conjunction $and
```

Returns a new `Bootgly\ADI\Databases\SQL\Builder\Conjunction` whose `filter()`, `nest()`,
`match()` and `having()` add the next predicate joined with `AND`, and return the builder. Reading
the property changes nothing.

```php
public Conjunction $or
```

The same with `OR`: `->filter($A)->or->filter($B)` compiles `A OR B`. The junction binds only the
predicate added through it. On the first predicate of `WHERE` or of `HAVING`, there is nothing to
join, and it is dropped.

### Query

```php
__construct (string $sql, array $parameters = [], bool $reading = false)
```

A compiled statement: `compile()` builds one, and you can build one around raw SQL for `query()`.
`$parameters` are the bound values, in placeholder order. `$reading` decides
**[read replica](/guide/database-read-replicas/overview/)** routing and only matters when replicas
are configured: `true` lets `query()` send the statement to a replica, while the default `false`
keeps it on the primary and counts it as a write for read-after-write.

```php
public private(set) string $SQL
```

The statement text. `__toString()` returns it.

```php
public private(set) array $parameters
```

The bound values, in the order of their placeholders.

```php
public private(set) bool $reading
```

Whether the statement only reads. `compile()` sets it for a `SELECT` without `lock()`, and
`query()` reads it to route the statement.

### Enums on this page

Namespace `Bootgly\ADI\Databases\SQL\Builder\Auxiliaries`. Every case of every builder enum, and
the SQL it compiles to, is in
**[Auxiliary enums](/manual/ADI/Databases/SQL/Builder/Dialects/overview/#auxiliary-enums)**.

| Enum | Cases used here |
| --- | --- |
| `Capabilities` | `Output`, `Upsert` |
| `Modes` | `Delete`, `Insert`, `Select`, `Update` |
| `Nulls` | `Last` |
| `Operators` | `Between`, `Equal`, `In`, `IsFalse`, `IsNotNull`, `IsNull`, `IsTrue` |
| `Orders` | `Asc`, `Desc` |

Next: **[Reading rows](/manual/ADI/Databases/SQL/Builder/Reading/overview/)**,
**[Writing rows](/manual/ADI/Databases/SQL/Builder/Writing/overview/)**,
**[Composing queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/)** and
**[Query dialects](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)**.
