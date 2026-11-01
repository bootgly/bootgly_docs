# ORM selections

`Bootgly\ADI\Databases\SQL\Repository\Selection` describes the rows a repository reads: predicates,
order, slice, a row lock, the relations to load and the named scopes to apply. `$Repository->select()`
starts one; each method adds to it and returns it, and nothing runs until you pass it to `fetch()` or
`paginate()`, which compile it with the repository's dialect. A selection reads every mapped column
of its entity's table, and only that table: for projections, joins or aggregates, write the query
with the **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — `hydrate()` also takes
the result of a query that selects the mapped columns (see
**[Find and fetch](/manual/ADI/Databases/SQL/Repository/overview/#find-and-fetch)**).

The examples use `$Database`, the SQL facade: in a project's boot function, command or script,
`new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure())`; outside a
project, `new SQL([...])` with the connection keys — see
**[Open a database](/manual/ADI/Databases/SQL/overview/#open-a-database)**. In an `HTTP_Server_CLI`
route, map the repository with `$Response->Database->map(User::class)`.

## Entities on this page

```php
use Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations;
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Relation;
use Bootgly\ADI\Databases\SQL\Model\Table;

#[Table('users')]
class User
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $name = '';

   #[Column('email')]
   public string $mail = '';

   #[Column]
   public bool $active = true;

   #[Column(nullable: true)]
   public null|string $city = null;

   /** @var array<int,Post> */
   #[Relation(Relations::HasMany, Post::class, 'id', 'user')]
   public array $Posts = [];
}

#[Table('posts')]
class Post
{
   #[Key]
   public null|int $id = null;

   #[Column('user_id')]
   public int $user = 0;

   #[Column]
   public string $title = '';
}
```

The `users` table holds four rows: Ada (id 1, London), Grace (2, New York), Linus (3, Helsinki,
inactive) and Alan (4, no city). Ada has two posts and Grace one. The attributes are on
**[ORM attributes](/manual/ADI/Databases/SQL/Model/Attributes/overview/)**.

## Build a selection

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Users = $Database->map(User::class);

$Selection = $Users->select()
   ->filter(new Identifier('active'), Operators::Equal, true)
   ->order(Orders::Asc, new Identifier('name'))
   ->limit(2);

$Mapped = $Users->hydrate($Database->await($Users->fetch($Selection)));

array_column($Mapped->entities, 'name'); // ['Ada', 'Alan']
```

On PostgreSQL, `fetch()` sends:

```sql
SELECT "id", "name", "email", "active", "city" FROM "users" WHERE "active" = $1 ORDER BY "name" ASC LIMIT 2
```

The `SELECT` lists every mapped column, and the methods you called add the rest in their own
clauses: `filter()` to `WHERE`, `order()` to `ORDER BY`, `limit()` the slice. MySQL and SQLite get
the same statement in their own quoting and placeholders. How the repository runs it, and what
`hydrate()` returns, is on **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)**.

## Name columns

```php
enum Fields: string
{
   case Mail = 'mail';
   case Name = 'name';
}

$Selection = $Users->select()
   ->filter(Fields::Mail, Operators::Equal, 'grace@example.test')
   ->order(Orders::Asc, Fields::Name);
```

On PostgreSQL:

```sql
SELECT "id", "name", "email", "active", "city" FROM "users" WHERE "email" = $1 ORDER BY "name" ASC
```

A selection names a column by its mapped property — `mail` compiles to `"email"` — or by the column
itself: `new Identifier('mail')` and `new Identifier('email')` read the same column. A name that is
neither passes through unchanged, so a typo reaches the database: PostgreSQL and MySQL refuse the
unknown column when the statement runs, but SQLite reads a quoted name that matches no column as
text — `"mial" = 'x'` runs and matches no row. A string-backed enum case works as its value does,
as `Fields` shows; an int-backed one makes `fetch()`, `paginate()` and `compile()` throw
`InvalidArgumentException`: `ORM selection enum identifiers must be string-backed.`

## Filter rows

```php
$Selection = $Users->select()
   ->filter(new Identifier('id'), Operators::Between, [1, 3])
   ->filter(new Identifier('city'), Operators::In, ['London', 'Helsinki'])
   ->order(Orders::Asc, new Identifier('id'));

$Mapped = $Users->hydrate($Database->await($Users->fetch($Selection)));

array_column($Mapped->entities, 'name'); // ['Ada', 'Linus']
```

`filter()` takes the operators of the Query Builder's `filter()` — `Equal`, `In`, `Between`,
`IsNull` and the others — with the same values and checks (see
**[Filters](/manual/ADI/Databases/SQL/Builder/Reading/overview/#filters)**), and each call adds one
predicate joined to the previous one with `AND`. The selection checks nothing when you call it: a
value that does not fit its operator, such as a `Between` with one value, throws
`InvalidArgumentException` from `fetch()`, as the selection compiles.

## Combine predicates with OR

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Junctions;

$Selection = $Users->select()
   ->filter(new Identifier('name'), Operators::Equal, 'Ada')
   ->filter(new Identifier('city'), Operators::Equal, 'Helsinki', Junctions::Or)
   ->order(Orders::Asc, new Identifier('id'));

$Mapped = $Users->hydrate($Database->await($Users->fetch($Selection)));

array_column($Mapped->entities, 'name'); // ['Ada', 'Linus']
```

On PostgreSQL:

```sql
SELECT "id", "name", "email", "active", "city" FROM "users" WHERE "name" = $1 OR "city" = $2 ORDER BY "id" ASC
```

Pass `Junctions::Or` as the fourth argument of `filter()`, or of `match()`, to join that predicate
with `OR`. A selection has neither the builder's `->or` nor `nest()`: it writes the predicates in
call order without parentheses, and SQL evaluates `AND` before `OR` (see
**[OR and AND](/manual/ADI/Databases/SQL/Builder/Reading/overview/#or-and-and)**). The first
predicate has nothing to join, so its junction is ignored.

> [!WARNING]
> For now, the predicates the repository adds itself — a named scope's, and the keyset of each
> cursor page — are joined after yours with `AND`, without parentheses. After an `OR` they bind to
> the last predicate only: `A OR B` with a scope that adds `C` runs as `A OR (B AND C)`, so the rows
> that match `A` skip the scope, and a cursor walk serves them again on every page — once they fill
> a whole page, it repeats that page forever. Keep `Junctions::Or` out of selections that name scopes
> or that you paginate by cursor.

## Match text

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Matches;

$Selection = $Users->select()
   ->match(new Identifier('mail'), 'A%', Matches::Insensitive)
   ->order(Orders::Asc, new Identifier('id'));

$Mapped = $Users->hydrate($Database->await($Users->fetch($Selection)));

array_column($Mapped->entities, 'name'); // ['Ada', 'Alan']
```

`match()` adds a text predicate. `Matches::Like`, the default, and `Matches::Insensitive` take a
`LIKE` pattern — `%` for any run of characters, `_` for one —, and `Matches::Text` runs the engine's
full-text search. What each mode finds on each engine, and the setup `Text` needs, are on
**[Text matching](/manual/ADI/Databases/SQL/Builder/Reading/overview/#text-matching)**. The value
must be a string: anything else throws `SQL text match value must be a string.` from `fetch()`.

> [!WARNING]
> For now, a selection writes every `match()` after every `filter()`, whatever order you call them
> in. With `AND` alone that changes nothing; with `Junctions::Or` it moves the `OR`:
> `->match(new Identifier('name'), 'A%')->filter(new Identifier('active'), Operators::Equal, false, Junctions::Or)`
> compiles to `WHERE "active" = $1 AND "name" LIKE $2`. Call `filter()` before `match()`, and the
> order compiled is the order you called.

## Order rows

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Nulls;

$Selection = $Users->select()
   ->order(Orders::Asc, new Identifier('city'), Nulls::Last)
   ->order(Orders::Asc, new Identifier('name'));

$Mapped = $Users->hydrate($Database->await($Users->fetch($Selection)));

array_column($Mapped->entities, 'name'); // ['Linus', 'Ada', 'Grace', 'Alan']
```

Each `order()` appends one `ORDER BY` term: a direction, a column and, optionally, where `NULL`
goes. Without `Nulls`, the engines disagree — PostgreSQL sorts `NULL` last in ascending order,
MySQL and SQLite first —, so pass `Nulls::First` or `Nulls::Last` when the position matters (see
**[Grouping, having and order](/manual/ADI/Databases/SQL/Builder/Reading/overview/#grouping-having-and-order)**).
Cursor pagination refuses `Nulls`, and refuses an order column marked `nullable` (see
**[Order a cursor walk](/manual/ADI/Databases/SQL/Repository/Pagination/overview/#order-a-cursor-walk)**).

## Slice rows

```php
$Selection = $Users->select()
   ->order(Orders::Asc, new Identifier('id'))
   ->limit(2, 2);

$Mapped = $Users->hydrate($Database->await($Users->fetch($Selection)));

array_column($Mapped->entities, 'name'); // ['Linus', 'Alan']
```

`limit($count, $offset)` sets how many rows to read and how many to skip first; `skip($offset)`
sets only the offset. Order the rows before you slice them: without `ORDER BY`, the engine returns
them in any order. A negative count or offset throws
`SQL limit and offset must be non-negative integers.` from `fetch()`; for now, a negative `skip()`
without a `limit()` is dropped without an error. `paginate()` replaces both with the slice of the
page it reads.

> [!WARNING]
> For now, `limit($count)` also resets the offset to 0, so a `skip()` called before it is lost:
> `->skip(2)->limit(2)` reads the first two rows, without an error. Call `skip()` after `limit()`,
> or pass both to `limit(2, 2)`.

## Lock rows

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Locks;
use Bootgly\ADI\Databases\SQL\Builder\Dialects\SQLite;

$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Locked = $Transaction->map(User::class);

$Selection = $Locked->select()->filter(new Identifier('id'), Operators::Equal, 2);

if ($Locked->Dialect instanceof SQLite === false) {
   $Selection->lock(Locks::Update);
}

$Grace = $Locked->hydrate($Database->await($Locked->fetch($Selection)))->entity;
$Grace->city = 'Arlington';
$Database->await($Locked->save($Grace));

$Database->await($Transaction->commit());
```

On PostgreSQL and MySQL the read ends with `FOR UPDATE`: until the transaction ends, no other
transaction can change or lock Grace's row, so nobody changes it between the read and the `UPDATE`.
`Locks::Share` writes `FOR SHARE`, which lets other transactions lock the row for reading too. Lock
inside a transaction, as above — outside one, each statement commits on its own and its lock ends
with it — and put the work in a `try`, as
**[Commit or roll back](/guide/database-transactions/overview/#commit-or-roll-back)** does. SQLite
has no row locks and rejects the statement with `Unable to prepare statement: near "FOR": syntax error`,
so code that also runs there skips `lock()`. See
**[Row locks](/manual/ADI/Databases/SQL/Builder/Reading/overview/#row-locks)** and
**[Inside a transaction](/manual/ADI/Databases/SQL/Repository/overview/#inside-a-transaction)**.

## Load relations

```php
$Users = $Database->map(User::class, Awaiting: $Database);

$Selection = $Users->select()
   ->filter(new Identifier('id'), Operators::Equal, 1)
   ->load('Posts');

$Ada = $Users->hydrate($Database->await($Users->fetch($Selection)))->entity;

count($Ada->Posts); // 2
```

`load()` names relations for `hydrate()` to load after the root query; it changes nothing in the
statement `fetch()` sends. The relation name is the property name unless the attribute sets
`name:`, and it is case-sensitive: a name that is not a mapped relation throws
`ORM relation is not mapped: …` from `hydrate()`, once rows came back. This repository has an await
bridge, so `hydrate()` loads `Posts` itself; without one, the relation comes back in
`$Mapped->loads` — see
**[Load relations](/manual/ADI/Databases/SQL/Repository/overview/#load-relations)** and
**[ORM relations](/manual/ADI/Databases/SQL/Repository/Relations/overview/)**.

## Named scopes

```php
use Bootgly\ADI\Databases\SQL\Repository\Selection;

$Users->scope('active', function (Selection $Selection): void {
   $Selection->filter(new Identifier('active'), Operators::Equal, true);
});

$Selection = $Users->select()
   ->scope('active')
   ->order(Orders::Asc, new Identifier('id'));

$Mapped = $Users->hydrate($Database->await($Users->fetch($Selection)));

array_column($Mapped->entities, 'name'); // ['Ada', 'Grace', 'Alan']
```

`scope()` names a scope the repository registered with its own `scope()` (see
**[Named scopes](/manual/ADI/Databases/SQL/Repository/overview/#named-scopes)**). `fetch()` and
`paginate()` run each named closure on the selection, in the order named, after the predicates you
added; `compile()` and `count()` do not run them. A name the repository has not registered throws
`ORM scope is not registered: …` from `fetch()` or `paginate()`, not from `scope()`.

## Inspect and count

```php
$Selection = $Users->select()->filter(new Identifier('active'), Operators::Equal, true);

$Query = $Selection->compile();
$Query->parameters; // [true]

$Database->await($Database->query($Selection->count()))->Result->cell; // 3
```

On PostgreSQL, `$Query->SQL` and the count read:

```sql
SELECT "id", "name", "email", "active", "city" FROM "users" WHERE "active" = $1
SELECT COUNT(*) AS "total" FROM "users" WHERE "active" = $1
```

`compile()` returns the `Query` that `fetch()` would send — its `SQL` and `parameters`, in the
repository's dialect — and changes nothing, so call it whenever you want to see the statement.
`count()` compiles a count over the same predicates, without the order, the slice and the lock; run
it through `$Database->query()`. Neither runs named scopes.

## Reuse a selection

```php
$Active = fn (): Selection => $Users->select()->scope('active');

$First = $Users->hydrate($Database->await($Users->fetch($Active())));
$Again = $Users->hydrate($Database->await($Users->fetch($Active())));

$Again->count; // 3
```

A selection is a mutable object. Without named scopes, fetch it as often as you like: each compile
starts over from what you called. `paginate()` works on a copy and leaves yours as it was.

For now, `fetch()` runs the named scopes on the selection you pass, and their predicates stay on it.
Fetching the same selection again adds them a second time, as in
`WHERE "active" = $1 AND "active" = $2`, and a scope that reads a value as it runs keeps the old
value too, so the second fetch can return the wrong rows; a selection fetched before you paginate it
carries them into the copy. Build a new selection for each fetch that names scopes, as `$Active`
does. A `Selecting` listener that adds predicates leaves them on the selection the same way.

## Reference

`Bootgly\ADI\Databases\SQL\Repository\Selection`. Every method but `compile()` and `count()`
returns the selection itself. The enums — `Operators`, `Junctions`, `Matches`, `Nulls`, `Orders`
and `Locks`, in `Bootgly\ADI\Databases\SQL\Builder\Auxiliaries` — are listed with the SQL each case
compiles to in **[Auxiliary enums](/manual/ADI/Databases/SQL/Builder/Dialects/overview/#auxiliary-enums)**.

### Methods

```php
__construct (Model $Model, Dialect $Dialect)
```

Starts an empty selection of the entity `$Model` describes, compiled with `$Dialect`.
`$Repository->select()` builds one with the repository's model and dialect.

```php
filter (BackedEnum|Stringable $Column, Operators $Operator, mixed $value = null, Junctions $Junction = Junctions::And): static
```

Adds one predicate, joined to the previous one by `$Junction`. `$Column` is a mapped property, a
column or a string-backed enum case. The value is checked when the selection compiles.

```php
match (BackedEnum|Stringable $Column, mixed $value, Matches $Match = Matches::Like, Junctions $Junction = Junctions::And): static
```

Adds one text predicate in the `$Match` mode. For now it is compiled after every `filter()`
predicate.

```php
order (Orders $Order, BackedEnum|Stringable $Column, null|Nulls $Nulls = null): static
```

Appends one `ORDER BY` term, with `NULL` placed by `$Nulls` when given.

```php
limit (int $count, int $offset = 0): static
```

Sets the row count and the offset. For now it always sets the offset, so a one-argument call resets
an earlier `skip()` to 0.

```php
skip (int $offset): static
```

Sets the offset only. Without a `limit()`, PostgreSQL writes `OFFSET` alone, and MySQL and SQLite
the row count each of them reads as "no limit".

```php
lock (Locks $Lock): static
```

Adds `FOR UPDATE` or `FOR SHARE` to the statement. Not checked against the dialect: SQLite rejects
the statement when it runs.

```php
load (string ...$relations): static
```

Adds relation names for `hydrate()` to load after the root query. Checked by `hydrate()`, against the
entity's relations.

```php
scope (string $name): static
```

Adds a named scope for `fetch()` and `paginate()` to run. Checked by them, against the scopes the
repository registered.

```php
compile (): Query
```

Compiles the statement `fetch()` sends, without named scopes: every mapped column of the entity's
table, the predicates, the order, the slice and the lock. Throws `InvalidArgumentException` for an
int-backed enum identifier and for a value the builder refuses.

```php
count (): Query
```

Compiles `SELECT COUNT(*) AS "total"` over the predicates — filters, matches and keysets — without
the order, the slice, the lock and the named scopes. Page pagination runs it for the total.

```php
seek (array $orders, array $values): static
```

Restricts the selection to the rows strictly after one keyset position — the predicate cursor
pagination adds for each page. `$orders` lists `['column' => …, 'order' => Orders::…]` pairs of
resolved column names, the unique tiebreak last, and `$values` holds one value per pair. Throws
`InvalidArgumentException` (`ORM keyset seek requires matching order columns and values.`) when the
lists are empty or differ in length.

### Properties

```php
public private(set) Model $Model
```

The compiled metadata of the entity the selection reads.

```php
public private(set) Dialect $Dialect
```

The Query Builder dialect it compiles with.

```php
public private(set) array $loads = []
```

The relation names added by `load()`, in order.

```php
public private(set) array $scopes = []
```

The scope names added by `scope()`, in order.

```php
public private(set) array $orders = []
```

The `ORDER BY` terms added by `order()`: one `['order' => Orders, 'column' => …, 'nulls' => null|Nulls]`
entry each. Pagination reads them to build its keyset.
