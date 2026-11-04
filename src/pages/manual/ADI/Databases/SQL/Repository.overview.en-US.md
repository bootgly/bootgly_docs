# ORM Repository

`Bootgly\ADI\Databases\SQL\Repository` is the Data Mapper surface for one mapped entity class. It
composes the database work for that class — `find()`, `fetch()`, `paginate()`, `save()` and
`delete()` — as SQL `Operation`s, and `hydrate()` turns a finished operation into entities. It owns
an identity map and a hydrator, but no connection: you await each operation it composes, and only a
repository with an await bridge waits on its own — `hydrate()` then also awaits the relation
queries a selection names and the `COUNT(*)` of a page, and a lazy relation queries on first
access. Entities reach the database only through a repository, one explicit operation per `save()`
or `delete()`, with no unit of work behind it (see
**[What kind of ORM is this?](/guide/database-orm/overview/#what-kind-of-orm-is-this)**).

The examples use `$Database`, the SQL facade: in a project's boot function, command or script,
`new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure())`; outside a
project, `new SQL([...])` with the connection keys — see
**[Open a database](/manual/ADI/Databases/SQL/overview/#open-a-database)**. In an `HTTP_Server_CLI`
route, map through `$Response->Database` instead (see [Create a repository](#create-a-repository)).

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

#[Table('settings')]
class Setting
{
   #[Key(generated: false)]
   public string $name = '';

   #[Column]
   public string $value = '';
}
```

`User` and `Post` are keyed by an id the database generates (`#[Key]`); `Setting` by a name the
application chooses (`#[Key(generated: false)]`). The attributes are on
**[ORM attributes](/manual/ADI/Databases/SQL/Model/Attributes/overview/)**. The `users` table
starts with Ada (id 1), Grace (2) and Linus (3) — Linus inactive —, Ada has two posts and Grace
one, and `settings` holds `theme` set to `dark`.

## Create a repository

```php
$Users = $Database->map(User::class);
```

`map()` returns a repository for one entity class. The class's metadata — table, key, columns,
relations — is compiled from its attributes on the first `map()` and cached on the facade (see
**[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)**); the repository itself is a light object,
so create one per unit of work. What it remembers — its identity map, named scopes and hook
listeners — belongs to that one object: a second `map()` of the same class starts empty.

Where you map decides how the repository runs:

- `$Database->map()` runs on the facade's pool and has no **await bridge** by default: the relations
  a selection names in `load()` come back as operations for you to await, and an entity with a
  `lazy: true` relation cannot be hydrated (see [Load relations](#load-relations)). Pass
  `Awaiting: $Database` and `hydrate()` awaits those relations itself. `Scope:` is covered in
  [Read-after-write scope](#read-after-write-scope).
- `$Transaction->map()` runs on the transaction's pinned connection, with the transaction as
  bridge — see [Inside a transaction](#inside-a-transaction).
- In an `HTTP_Server_CLI` route, `$Response->Database->map(User::class)` takes only the class. The
  repository gets the response resource as bridge, which awaits without blocking the worker, and
  the request's read-after-write scope; inside the callback of `$Response->Database->transact()`, it
  runs through the open transaction. See
  **[Database methods](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#database-methods)**.

## Find and fetch

```php
$User = $Users->hydrate($Database->await($Users->find(1)))->entity;

$User->name; // Ada
$User->mail; // ada@example.test
```

`find()` composes a `SELECT` of every mapped column, filtered by the key and limited to one row, and
returns its `Operation` at once. `$Database->await()` runs it to the end and throws a
`RuntimeException` carrying its error when it fails; `hydrate()` then turns its rows into entities.
When no row has that key, `entity` is `null`.

`fetch()` reads the rows a selection describes, and every row without one:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Selection = $Users->select()
   ->filter(new Identifier('active'), Operators::Equal, true)
   ->order(Orders::Asc, new Identifier('name'));

$Active = $Users->hydrate($Database->await($Users->fetch($Selection)));

$Active->count;        // 2
$Active->entity->name; // Ada
```

`select()` starts a selection for the repository's entity. Its predicates, text matching, order,
slice, row locks and named scopes are on
**[ORM selections](/manual/ADI/Databases/SQL/Repository/Selection/overview/)**.

`hydrate()` also takes a database `Result`, so rows read by a query of your own become entities too,
as long as they carry the mapped columns:

```php
$Query = $Database->table(new Identifier('users'))
   ->select(new Identifier('id'), new Identifier('name'), new Identifier('email'), new Identifier('active'))
   ->filter(new Identifier('id'), Operators::Equal, 2);

$Grace = $Users->hydrate($Database->await($Database->query($Query))->Result)->entity;
```

`hydrate()` throws a `RuntimeException` for an operation that failed — the same error `await()`
throws — and `ORM hydration requires a completed SQL result.` for one that has not finished yet.

## Read the result

`hydrate()` returns a `Repository\Result`:

| Property | Holds |
| --- | --- |
| `entities` | every hydrated entity, in row order |
| `entity` | the first entity, or `null` |
| `count` | the number of hydrated entities |
| `empty` | `true` when there is none |
| `Result` | the database `Result` the entities came from: `rows`, `status`, `affected`, `inserted` |
| `loads` | relation operations left for you to await, keyed by relation name (see [Load relations](#load-relations)) |
| `Pagination` | the resolved page of a `paginate()` operation, `null` for any other |

Each column is cast to its property's type, and a row that misses a column not marked `nullable` or
`generated`, or brings `null` where the property refuses it, is refused, as
**[Rows into properties](/manual/ADI/Databases/SQL/Repository/Hydration/overview/#rows-into-properties)**
details. The repository also keeps one object per key, its **identity map**: hydrating a row whose
key it already tracks writes the row into that same object, so map a repository per request or job,
or call `reset()` (see
**[Identity map](/manual/ADI/Databases/SQL/Repository/Hydration/overview/#identity-map)**).

## Load relations

```php
$Selection = $Users->select()->order(Orders::Asc, new Identifier('id'))->load('Posts');

$Mapped = $Users->hydrate($Database->await($Users->fetch($Selection)));

foreach ($Mapped->loads as $relation => $Operation) {
   $Users->attach($Mapped->entities, $relation, $Database->await($Operation));
}

count($Mapped->entity->Posts); // 2, Ada's
```

`load()` names relations — the relation name is the property name unless the attribute sets
`name:` — and `hydrate()` composes one query per relation for the whole result. Without an await
bridge, it leaves those queries in `$Mapped->loads`: await each and pass it to `attach()`, which
writes the related entities onto their parents. With a bridge, `hydrate()` does that itself and
`loads` stays empty:

```php
$Bridged = $Database->map(User::class, Awaiting: $Database);

$Mapped = $Bridged->hydrate($Database->await($Bridged->fetch($Selection)));

count($Mapped->entity->Posts); // 2
```

Relation names are case-sensitive: `load('posts')` throws
`ORM relation is not mapped: posts` from `hydrate()` — once rows came back. Batch loading with
`load()` and `attach()`, and lazy relations, are on
**[ORM relations](/manual/ADI/Databases/SQL/Repository/Relations/overview/)**.

> **Lazy relations need a bridge.** An entity with a `lazy: true` relation that the selection does
> not name in `load()` can only be hydrated by a repository with an await bridge; otherwise
> `hydrate()` throws `ORM lazy loading requires an await bridge.` Naming the relation in `load()`
> returns it as a deferred `loads` operation instead. Hydrating a `save()` or a `delete()` never
> needs a bridge.

## Save entities

```php
$User = new User;
$User->name = 'Edsger';
$User->mail = 'edsger@example.test';

$Mapped = $Users->hydrate($Database->await($Users->save($User)));
$User = $Mapped->entity ?? $User;

$User->id; // 4

$User->name = 'Edsger Dijkstra';
$Database->await($Users->save($User));
```

`save()` composes an `INSERT` or an `UPDATE`, and the key decides which:

- A **generated** key (`#[Key]`) that is `null` means a new row: `INSERT`. Any other value means
  an `UPDATE` of the row with that key, whether the repository has seen the entity or not — the
  second `save()` above is an `UPDATE`.
- An **application-assigned** key (`#[Key(generated: false)]`) is already set on a new entity, so
  the repository asks its identity map: a key it tracks — the entity was hydrated through this
  repository — means `UPDATE`, any other key `INSERT`. A `null` key makes `save()` throw
  `ORM update requires a primary key value.`

```php
$Settings = $Database->map(Setting::class);

$Locale = new Setting;
$Locale->name = 'locale';
$Locale->value = 'en';
$Database->await($Settings->save($Locale)); // INSERT: 'locale' is not tracked

$Theme = $Settings->hydrate($Database->await($Settings->find('theme')))->entity;
$Theme->value = 'light';
$Database->await($Settings->save($Theme));  // UPDATE: 'theme' is tracked
```

A key is tracked once the repository hydrates a row that carries it, as `find('theme')` does above;
`save()` alone tracks nothing. So save an application-keyed entity through the repository that
hydrated it: another repository — another `map()`, a transaction's — does not track the key, sends
an `INSERT`, and fails on the duplicate key.

Hydrate the saves you build on, too: `hydrate()` is what writes a generated id into the entity and
records what the repository knows about it. A new entity whose `save()` you did not hydrate keeps
its `null` id, so saving it again inserts a second row.

The `INSERT` writes every column mapped for insertion — each `#[Column]` unless `insert: false`,
and an application-assigned key; a generated key never — and leaves out a `generated` column that
holds `null`, so the database fills it. On PostgreSQL, both statements end with `RETURNING` and
every mapped column; MySQL and SQLite report the generated id instead (see
**[Generated keys without RETURNING](/manual/ADI/Databases/SQL/Drivers/overview/#generated-keys-without-returning)**).

`save()` on a hydrated entity writes back the columns that hydration actually carried, and
only those. A projection that omits a mapped column leaves its property holding the class
default, which reads exactly like a value you chose — writing it back would replace stored
data with a plausible-looking default and report success. Hydrate a wider projection later
and the columns it carried join the set. A column marked `generated` holding `null` is never
written, the same way an INSERT has always skipped it.

An entity you built yourself is not hydrated, so nothing is known about it: `save()` writes
every column mapped for update, which is what you asked for. And a hydrated entity with no writable
column left is refused with `ORM update has no column carrying a value to write.` rather than
compiling an `UPDATE` with an empty `SET`. An entity class with no column to insert or to update
at all is refused the same way, by `save()` itself: `ORM insert requires at least one writable column.`
or `ORM update requires at least one writable column.`

> **Keep the saved instance.** Hydrating the `save()` of a new entity writes the generated id back
> into the object you passed, on every driver: PostgreSQL fills it from the `RETURNING` row, MySQL
> and SQLite from `Result->inserted`. PostgreSQL returns the row of every `save()`, so `hydrate()`
> also refreshes the entity from it, a value the database filled in included. On MySQL and SQLite
> only that generated-key INSERT hydrates to an entity: an UPDATE, or an INSERT with an
> application-assigned key, returns no row, so `$Mapped->entity` is `null` — keep the object you
> saved. `$User = $Mapped->entity ?? $User;` keeps the right object on every driver. A relation
> already set on that object keeps its value; which unset lazy relations get their wrapper is on
> **[Property types](/manual/ADI/Databases/SQL/Repository/Relations/overview/#property-types)**.
> One exception: when a `readonly` property holds a value the `RETURNING` row of the INSERT
> contradicts (the database normalized it), the row hydrates into a new instance in
> `$Mapped->entity` and your object is left untouched.

For now, five paths still depend on the driver or leave the identity map behind:

- An `INSERT` with an application-assigned key is tracked only on PostgreSQL, and only when you
  hydrate it. Otherwise, saving the same object again — `$Locale` above — inserts it a second time
  and fails on the duplicate key: `find()` the entity through the repository before you save it
  again.
- On PostgreSQL, saving an entity this repository never hydrated — an `UPDATE` of an object you
  built yourself, or an `INSERT` with an application-assigned key — hydrates the `RETURNING` row
  into the object the map already holds for that key, or else into a new one: `$Mapped->entity` is
  not the object you passed, and a later `find()` returns that other object.
- On MySQL and SQLite, the entity of a generated-key `INSERT` is not recorded as hydrated, so its
  next `save()` writes every mapped column — an `insert: false` column included, whose property still
  holds the class default while the row holds the database's. `find()` the entity before you change
  it, or mark such a column `update: false` too.
- Setting a tracked entity's key to `null` and saving it inserts a new row, but the repository keeps
  the object under its old key as well: a later `find()` of the old key returns that object and
  writes the old row back into it. Build a new object for a new row.
- A key you delete through the repository stays tracked: see [Delete entities](#delete-entities).

## Delete entities

```php
$Database->await($Users->delete($User)); // Edsger, by entity
$Database->await($Users->delete(3));     // Linus, by key
```

`delete()` takes the entity — its class is checked, `ORM entity does not match model: User`
otherwise — or the key itself, and composes a `DELETE` of the row with that key. Await it:
`->Result->affected` is the number of rows deleted, `0` when no row has the key, as for an entity
whose key is still `null`. Hydrating a delete returns no entity and never needs a bridge.
`delete()` removes that one row, and `save()` never writes relation properties: save or delete
related entities through their own repository, and leave the rows that reference a deleted one to
the database's foreign keys.

The deleted object keeps its key, so a later `save()` of it is an `UPDATE` that matches no row. For
now, the repository keeps tracking a deleted key, which matters for an application-assigned one:
a new entity saved with that key through the same repository is sent as an `UPDATE`, which matches
no row, so nothing is written and no error is raised. Save it through a new repository, which does
not track the key:

```php
$Theme = $Settings->hydrate($Database->await($Settings->find('theme')))->entity;
$Database->await($Settings->delete($Theme));

$Theme = new Setting;
$Theme->name = 'theme';
$Theme->value = 'light';
$Database->await($Database->map(Setting::class)->save($Theme)); // INSERT
```

## Read-after-write scope

```php
use stdClass;

$Job = new stdClass;
$Users = $Database->map(User::class, Scope: $Job);

$Grace = $Users->hydrate($Database->await($Users->find(2)))->entity;
$Grace->name = 'Grace Hopper';
$Database->await($Users->save($Grace));

$Grace = $Users->hydrate($Database->await($Users->find(2)))->entity;
$Grace->name; // Grace Hopper
```

With read replicas configured, the facade sends each read to a replica and each write to the
primary, and after a write, the reads of the same **scope** stay on the primary for
`routing.sticky` seconds (see
**[Read-after-write scope](/manual/ADI/Databases/SQL/overview/#read-after-write-scope)**). Every
operation a repository composes runs in a scope: the `$Scope` argument of that call — `find()`,
`fetch()`, `paginate()`, `save()`, `delete()` and `load()` all take one —, else the `Scope:` given to
`map()`, else the facade's default, the current Fiber or, outside one, the facade itself.

So the `save()` above marks `$Job`, and the `find()` after it reads Grace back from the primary,
while a read passed another scope object — `$Users->find(2, $Report)` — can still reach a replica
that has not replayed the write. The relation queries `hydrate()` sends, eager or lazy, and the
`COUNT(*)` of a page run in the scope of the operation hydrated. Without replicas, the scope changes
nothing. `$Response->Database->map()` gives the repository the request's scope.

## Inside a transaction

```php
$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Settings = $Transaction->map(Setting::class);

$Theme = $Settings->hydrate($Database->await($Settings->find('theme')))->entity;
$Theme->value = 'dark';
$Database->await($Settings->save($Theme));

$Database->await($Transaction->commit());
```

`$Transaction->map()` returns a repository whose statements run on the transaction's pinned
connection, with the transaction as await bridge. Put the work and the commit in a `try` and end
the transaction in the `catch`, as
**[Commit or roll back](/guide/database-transactions/overview/#commit-or-roll-back)** does; how
eager loads and pages behave there is on
**[Repositories inside a transaction](/manual/ADI/Databases/SQL/Transaction/overview/#repositories-inside-a-transaction)**.
For the entities themselves:

- A transaction runs one statement at a time: await each operation before you compose the next. A
  `find()` composed while another statement is still running fails with
  `SQL transaction operation is still active.` (SQLite runs each statement inside the call, so it
  never has one running).
- The repository is new, so its identity map is empty. Read the entities you change through it, as
  above: an entity hydrated by another repository is one it never saw, and with an
  application-assigned key its `save()` is an `INSERT` that fails on the duplicate key. To keep
  other transactions off those rows until the commit, lock them as you read them (see
  **[Lock rows](/manual/ADI/Databases/SQL/Repository/Selection/overview/#lock-rows)**).
- The repository lasts as long as the transaction: once it commits or rolls back, the repository's
  operations fail with `SQL transaction is not active.`

## Named scopes

```php
use Bootgly\ADI\Databases\SQL\Repository;
use Bootgly\ADI\Databases\SQL\Repository\Selection;

$Users->scope('active', function (Selection $Selection): void {
   $Selection->filter(new Identifier('active'), Operators::Equal, true);
});

$Latest = function (Selection $Selection, Repository $Repository): void {
   $Selection->order(Orders::Desc, new Identifier($Repository->Model->key));
};
$Users->scope('latest', $Latest);

$Mapped = $Users->hydrate($Database->await(
   $Users->fetch($Users->select()->scope('active')->scope('latest'))
));

$Mapped->entity->name; // Grace Hopper
```

`scope()` registers a named piece of selection on this repository, and the selection's `scope()`
asks for it by name. The closure receives the selection and the repository applying it, so one
closure — `$Latest` orders by whatever the entity's key is — can serve every repository. `fetch()`
and `paginate()` run the named closures in the order named, after the predicates you wrote. A name
this repository has not registered makes them throw `InvalidArgumentException`:
`ORM scope is not registered: active` — a second `map()` of `User` has none.

Since 1.0.13, the predicates a scope adds form a group of their own, ANDed after yours: an `OR` of
yours cannot get around a scope, and an `OR` the scope writes joins its own predicates only, so the
predicates of a scope can only narrow the selection (see
**[Combine predicates with OR](/manual/ADI/Databases/SQL/Repository/Selection/overview/#combine-predicates-with-or)**).

`compile()` and `count()` on the selection do not run scopes, and for now `fetch()` runs them on the
selection you pass: read
**[Reuse a selection](/manual/ADI/Databases/SQL/Repository/Selection/overview/#reuse-a-selection)**
before you fetch a scoped selection twice.

## Lifecycle hooks

```php
use Bootgly\ADI\Databases\SQL\Repository\Hooks;
use Bootgly\ADI\Databases\SQL\Repository\Result;

$Users->listen(Hooks::Hydrated, function (Result $Mapped): void {
   // $Mapped->entities are hydrated here
});
```

`find()`, `fetch()` and `paginate()` emit `Selecting` and `Selected`, `save()` emits `Saving` and
`Saved`, `delete()` `Deleting` and `Deleted`, and `hydrate()` `Hydrating` and `Hydrated`, to the
listeners registered on that repository; `listen()` returns the repository, so registrations chain.
`Selected`, `Saved` and `Deleted` run before PostgreSQL and MySQL have received the statement, so do
the work that depends on the write after `await()`: what each listener receives, and when it runs,
is on **[ORM hooks](/manual/ADI/Databases/SQL/Repository/Hooks/overview/)**.

## Paginate

`paginate()` reads one page of a selection — by page number with a total, or by cursor — and
`hydrate()` resolves the page into `$Mapped->Pagination`. In a route, `$Response->Database->paginate()`
also reads the page from the request and writes the REST headers. See
**[ORM pagination](/manual/ADI/Databases/SQL/Repository/Pagination/overview/)**.

## Reference

`MappedResult` in the signatures is `Bootgly\ADI\Databases\SQL\Repository\Result` and
`DatabaseResult` is `Bootgly\ADI\Database\Operation\Result`, as the source imports them.

### Methods

```php
__construct (Querying $Querying, Dialect $Dialect, Model $Model, Models $Models, null|object $Scope = null, null|Awaiting $Awaiting = null)
```

Builds a repository over one compiled model. Applications call `$Database->map()`,
`$Transaction->map()` or `$Response->Database->map()` instead; `create()` builds one for a custom
`Querying` surface.

```php
static create (Querying $Querying, Dialect $Dialect, Models $Models, string $Entity, null|object $Scope = null, null|Awaiting $Awaiting = null): self
```

Fetches the entity's model from `$Models` — compiling it on first use — and builds the repository.
`$Querying` runs its statements, `$Scope` is its default read-after-write scope and `$Awaiting` its
await bridge. Both `map()` methods call it.

```php
find (mixed $id, null|object $Scope = null): Operation
```

Composes a `SELECT` of every mapped column of the row whose key is `$id`, limited to one row. Emits
`Selecting` and `Selected`.

```php
fetch (null|Selection $Selection = null, null|object $Scope = null): Operation
```

Runs the selection's named scopes on it, compiles it and composes the `SELECT`; without a selection,
every row. Records the relations it names in `load()` for `hydrate()`. Throws
`InvalidArgumentException` for a scope this repository has not registered. Emits `Selecting` and
`Selected`.

```php
hydrate (Operation|DatabaseResult $Source): MappedResult
```

Turns a finished operation, or a database result, into entities: casts each column to its property,
reuses the tracked object of a key, writes a generated key back into a saved entity, resolves a
pagination, and loads relations — awaiting them through the bridge, or leaving them in `loads`.
Throws `RuntimeException` for a failed operation, for an unfinished one
(`ORM hydration requires a completed SQL result.`), for a row it cannot hydrate, for an entity with
a `lazy: true` relation when there is no bridge, and for a page count it cannot await
(`ORM pagination count requires an await bridge.`); and `InvalidArgumentException` for a relation
name the selection loads that is not mapped, and for a cursor page whose last row holds `NULL` in an
order column (`ORM pagination cursor requires scalar, non-null order values.`). Emits `Hydrating`
and `Hydrated`.

```php
save (object $Entity, null|object $Scope = null): Operation
```

Composes an `INSERT` or an `UPDATE` of the entity, chosen by its key (see
[Save entities](#save-entities)), with `RETURNING` on PostgreSQL. Throws `InvalidArgumentException`
for an entity of another class and `RuntimeException` when the statement cannot be built: a `null`
application-assigned key, or no column to write. Emits `Saving` and `Saved`.

```php
delete (mixed $Entity, null|object $Scope = null): Operation
```

Composes a `DELETE` of the row whose key is the entity's, or `$Entity` itself when it is not an
object. Throws `InvalidArgumentException` for an entity of another class. Emits `Deleting` and
`Deleted`.

```php
paginate (null|Selection $Selection = null, null|Pagination $Pagination = null, null|object $Scope = null): Operation
```

Composes one page of a copy of the selection and returns the items operation; `hydrate()` resolves
the outcome. See the **[ORM pagination](/manual/ADI/Databases/SQL/Repository/Pagination/overview/#reference)**
Reference.

```php
select (): Selection
```

Starts an empty selection for the repository's entity, compiled with its dialect.

```php
scope (string $name, Closure $Scope): static
```

Registers a named scope on this repository, replacing one of the same name. `fetch()` and
`paginate()` call `$Scope($Selection, $Repository)` for each name the selection carries, through
`Selection::guard()`: the predicates it adds form a group ANDed after the selection's own.

```php
load (object|array $Entities, array $relations = [], null|object $Scope = null): array
```

Composes one query per relation for the given entities and returns the operations keyed by
relation name, without awaiting them. A relation is left out when no entity carries its local key,
and an empty list of entities returns `[]`. Throws `InvalidArgumentException` for a relation name
that is not mapped and for an entity of another class.

```php
attach (object|array $Entities, string $relation, Operation|DatabaseResult $Source): MappedResult
```

Hydrates the related entities of a finished relation query and writes them onto the given
entities, then returns them as a result. Throws `InvalidArgumentException` for a relation that is
not mapped and for a parent of another class (`ORM entity does not match model: <class>`), and
`RuntimeException` for a failed or unfinished operation and for rows that lack the key matching
them to their parents (`ORM relation attachment result is missing key column: <column>`).

```php
listen (Hooks $Hook, Closure $Listener): static
```

Registers a listener for one hook on this repository.

```php
reset (): static
```

Forgets every entity the identity map tracks and the columns their hydrations carried. Entities
hydrated before then are saved as if you had built them: every mapped column is written, and an
application-assigned key is sent as an `INSERT`.

### Properties

```php
public private(set) Querying $Querying
```

The surface the repository's statements run on: the `SQL` facade or a `Transaction`.

```php
public private(set) Dialect $Dialect
```

The Query Builder dialect selections and statements are compiled with.

```php
public private(set) Model $Model
```

The compiled metadata of the entity class (see
**[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)**).

```php
public private(set) Models $Models
```

The metadata cache the related entities' models come from: the facade's.

```php
public private(set) null|Awaiting $Awaiting
```

The await bridge, or `null`. `SQL`, `Transaction` and the HTTP database resource implement
`Awaiting`.

```php
public private(set) Identity $Identity
```

The identity map. `$Users->Identity->fetch(User::class, 1)` returns the tracked entity of a key,
or `null`.

### Result

`Bootgly\ADI\Databases\SQL\Repository\Result`, returned by `hydrate()` and `attach()`.

```php
__construct (DatabaseResult $Result, array $entities, array $loads = [], null|Pagination $Pagination = null)
```

Built by the repository.

```php
public private(set) DatabaseResult $Result
```

The database result the entities came from.

```php
public private(set) array $entities
```

The hydrated entities, in row order.

```php
public private(set) array $loads
```

The relation operations left for you to await, keyed by relation name; empty with an await bridge.

```php
public private(set) null|Pagination $Pagination
```

The pagination of a `paginate()` operation, resolved; `null` for any other operation.

```php
public null|object $entity { get; }
```

The first entity, or `null`.

```php
public int $count { get; }
```

The number of entities.

```php
public bool $empty { get; }
```

Whether there is no entity.
