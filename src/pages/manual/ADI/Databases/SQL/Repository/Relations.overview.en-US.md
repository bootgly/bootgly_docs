# ORM relations

ORM relations are explicit. Bootgly stores relation metadata on the model, and a repository loads a
relation only when you ask for it: as deferred operations you await and attach yourself, eagerly
during `hydrate()`, or lazily on first access with `lazy: true`.

Supported relation kinds are in `Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations`:

- `HasOne`
- `HasMany`
- `BelongsTo`
- `BelongsToMany`

## Map relations

The examples on this page share these entities and a `$Database` opened from the project's
`database` config scope. In an `HTTP_Server_CLI` route, use `$Response->Database` instead (see
[HTTP routes](#http-routes)), and outside a project pass the connection as an array — see
**[Open a database](/manual/ADI/Databases/SQL/overview/#open-a-database)**.

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations;
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Relation;
use Bootgly\ADI\Databases\SQL\Model\Table;
use Bootgly\API\Environment\Configs\DatabaseConfig;

#[Table('users')]
class User
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $name = '';

   /** @var array<int,Post> */
   #[Relation(Relations::HasMany, Post::class, 'id', 'user')]
   public array $Posts = [];

   #[Relation(Relations::HasOne, Profile::class, 'id', 'user')]
   public null|Profile $Profile = null;

   /** @var array<int,Group> */
   #[Relation(Relations::BelongsToMany, Group::class, 'id', 'id', table: 'memberships', pivotLocal: 'user_id', pivotForeign: 'group_id')]
   public array $Groups = [];
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

   #[Relation(Relations::BelongsTo, User::class, 'user', 'id')]
   public null|User $Author = null;
}

#[Table('profiles')]
class Profile
{
   #[Key]
   public null|int $id = null;

   #[Column('user_id')]
   public int $user = 0;

   #[Column]
   public string $bio = '';
}

#[Table('groups')]
class Group
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $name = '';
}

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
```

The tables hold three users — `1` Ada, `2` Grace, `3` Linus — and Ada's two posts, `'Notes'` and
`'Engine'`, Grace's `'Compilers'`, Ada's profile, `'First programmer'`, and two groups, `'Computing'`
and `'Mathematics'`: Ada belongs to both, Grace to `'Computing'`. Run in order, the examples give
the results their comments show.

The arguments are relation type, target class, local key and foreign key. What the two keys name
depends on the kind:

| Kind | Local key | Foreign key | The property holds |
|---|---|---|---|
| `HasMany` | The parent's key | The target's column pointing at the parent | An array of targets |
| `HasOne` | The parent's key | The target's column pointing at the parent | One target, or `null` |
| `BelongsTo` | The parent's column pointing at the target | The target's key | One target, or `null` |
| `BelongsToMany` | The parent's key | The target's key | An array of targets |

A key may name the property or the column: `Post` maps the `user_id` column to `$user`, so
`'user'` and `'user_id'` name the same key. A many-to-many relation also needs its pivot table
(`table`), the pivot column pointing at the parent (`pivotLocal`) and the one pointing at the target
(`pivotForeign`); without them it is refused when it loads, with
`ORM belongsToMany relation requires pivot table and keys.`

A relation is named after its property — `Posts`, `Profile`, `Groups`, `Author` — unless `name:`
gives it another name (see **[Attributes](/manual/ADI/Databases/SQL/Model/Attributes/overview/)**).
That name, case-sensitive, is what `load()`, `attach()` and `Selection::load()` take.

## Load in batches

Call `load()` after hydrating root entities. It returns operations keyed by relation name.

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Users = $Database->map(User::class);

$MappedUsers = $Users->hydrate($Database->await(
   $Users->fetch($Users->select()->order(Orders::Asc, new Identifier('id')))
));

$Operations = $Users->load($MappedUsers->entities, ['Posts']);
$Operation = $Operations['Posts'] ?? null;

if ($Operation !== null) {
   $Users->attach($MappedUsers->entities, 'Posts', $Database->await($Operation));
}

count($MappedUsers->entities[0]->Posts); // 2
```

This keeps query count visible and avoids ad hoc per-parent relation queries: `load()` composes
one query per relation for the whole batch, filtered by the parents' keys, and leaves it to you to
await. `attach()` hydrates its rows as entities of the target class, writes each parent's share onto
the relation property — an array, the entity or `null` — and returns those targets as a mapped
result. The targets join the repository's identity map, so a post loaded twice is the same object.
The query has no `ORDER BY`: sort the loaded entities in PHP when their order matters.

The key is absent when no parent in the batch carries the relation's local key — there is
nothing to look up, so `load()` issues no query. Guard the lookup rather than indexing it
directly. `hydrate()` needs no such care: a relation it cannot look up is written to its empty
form, so the property is never left holding a result from an earlier window.

A name the model does not map throws `ORM relation is not mapped: <name>`, so `['posts']` fails
for the `Posts` relation. `load()` returns before it reads the names when the batch is empty, so an
empty result hides a wrong name.

For multiple deferred relations, await and attach one operation per relation:

```php
$MappedUsers = $Users->hydrate(
   $Database->await(
      $Users->fetch($Users->select()->load('Posts', 'Groups'))
   )
);

foreach ($MappedUsers->loads as $relation => $Operation) {
   $Users->attach(
      $MappedUsers->entities,
      $relation,
      $Database->await($Operation)
   );
}
```

For eager loading, create the repository with an await bridge. `hydrate()` then awaits and attaches each requested relation before returning:

```php
$Users = $Database->map(User::class, Awaiting: $Database);

$MappedUsers = $Users->hydrate(
   $Database->await(
      $Users->fetch($Users->select()->load('Posts', 'Groups'))
   )
);
```

Relation names are single-level: a dotted path such as `Posts.Author` is not parsed, and it throws
as an unmapped name. Load the next level through the repository of the related class: pass the
posts a first load attached to `$Database->map(Post::class)->load()`, then await and `attach()`
through that repository.

## Lazy policy

Lazy loading is opt-in with `lazy: true` and requires an await bridge. Direct SQL repositories need
`Awaiting: $Database`; transaction repositories and HTTP database resources can provide the bridge
from their awaited context. An entity declares each relation one way, so the lazy examples map the
same `users` table to a second class, `Member`:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations;
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Relation;
use Bootgly\ADI\Databases\SQL\Model\Table;
use Bootgly\ADI\Databases\SQL\Repository\LazyCollection;
use Bootgly\ADI\Databases\SQL\Repository\LazyReference;

#[Table('users')]
class Member
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $name = '';

   /** @var LazyCollection<Post> */
   #[Relation(Relations::HasMany, Post::class, 'id', 'user', lazy: true)]
   public LazyCollection $Posts;

   #[Relation(Relations::HasOne, Profile::class, 'id', 'user', lazy: true)]
   public LazyReference $Profile;
}

$Members = $Database->map(Member::class, Awaiting: $Database);

$MappedMembers = $Members->hydrate($Database->await(
   $Members->fetch($Members->select()->order(Orders::Asc, new Identifier('id')))
));
[$Ada, $Grace] = $MappedMembers->entities;

count($Ada->Posts);   // 2: one query loads the posts of every member in the result
count($Grace->Posts); // 1: no new query
```

The first access to one lazy relation in a mapped-result window loads that relation for every
parent entity in that same window with one relation operation. Later access uses the attached
relation state and does not query again.

An isolated entity is a batch of one. That boundary is explicit so application code can avoid
N+1 by hydrating related parents in one selection before touching lazy relations.

### Lazy collections

A plural lazy relation is a `LazyCollection`. It loads on first use, then reads as the list of the
related entities, in the order the database returned them — insertion order here, since the
relation query has no `ORDER BY`:

```php
foreach ($Ada->Posts as $Post) {
   $Post->title; // 'Notes', then 'Engine'
}

$Ada->Posts[0]->title;      // 'Notes'
$Ada->Posts[9];             // null: a missing index reads as null
isset($Ada->Posts[1]);      // true
$Ada->Posts->fetch(1)->id;  // 2
count($Ada->Posts->load()); // 2: the loaded posts as an array
```

Writes stay in memory. `$Ada->Posts[] = $Post` appends an object to the loaded list, and anything
else throws `ORM lazy collection accepts only objects.`; `unset($Ada->Posts[0])` removes one, and
`set()` replaces the list. `reset()` drops those changes and reads the loaded posts again, without a
new query. None of them writes the database (see [Writing relations](#writing-relations)). Do not add
or remove items while you iterate the collection: each change rewinds its position, so the loop skips
or repeats items — collect the changes and apply them after the loop, with `set()`.

### Lazy references

A singular lazy relation is a `LazyReference`. `fetch()` loads it and returns the related entity or
`null`, and `empty` tells whether there is one. Everything else is forwarded to the entity it
loads — property reads, writes, `isset()` and method calls — except the wrapper's own members: the
properties `key`, `Batch` and `empty` and the methods `fetch()`, `set()` and `reset()` answer for the
wrapper, so reach a member of the related entity with one of those names through `fetch()`:

```php
$Ada->Profile->bio;          // 'First programmer'
$Ada->Profile->empty;        // false
$Grace->Profile->fetch();    // null
isset($Grace->Profile->bio); // false
$Grace->Profile->bio;        // RuntimeException: ORM lazy reference is empty.
```

A read, a write or a call forwarded to a missing entity throws `ORM lazy reference is empty.`, while
`isset()` answers `false` and never throws. Guard an optional relation with `fetch()`, `empty` or
`isset()`. A write through the reference changes the loaded entity in memory only.

### Property types

A lazy relation's property must be able to hold its wrapper:

| Relation | The property may be typed |
|---|---|
| `HasMany`, `BelongsToMany` | `LazyCollection`, `object`, `mixed`, a union that includes `LazyCollection` or `object`, `iterable` on its own, or not at all |
| `HasOne`, `BelongsTo` | `LazyReference`, `object`, `mixed`, a union that includes `LazyReference` or `object`, or not at all |

Any other type throws when the wrapper is installed, naming the wrapper and the property — for a
lazy `Posts` typed `array`:
`ORM lazy relation property must accept Bootgly\ADI\Databases\SQL\Repository\LazyCollection: User::$Posts`.
For now `iterable` works only on its own: `null|iterable`, which PHP reads as
`Traversable|array|null`, is refused, and so are the interfaces `LazyCollection` implements, such as
`Traversable`, `Iterator` and `Countable` — type a plural lazy property that may hold `null` as
`null|LazyCollection`. A plain `array` cannot hold a lazy placeholder in PHP, so `array` stays the
materialized plural form of deferred and eager loading, and `null|Target` the materialized singular
form.

A typed property without a default, like `Member::$Posts`, stays uninitialized until a repository
installs its wrapper: on an entity you built yourself, reading it throws PHP's `Error`. Hydrating
the `save()` that inserts such an entity with a generated key, through a repository with an await
bridge, installs the wrappers its unset lazy relations lack; other saves leave them unset, and a
relation you set yourself keeps its value. Declare `null|LazyReference $Profile = null` when the
property must read as `null` until then.

`LazyCollection` declares no template type. PHPStan reads `@var LazyCollection<Post>` as
`LazyCollection&iterable<Post>`, so `foreach` yields `Post`; `fetch()`, `load()` and an index still
return `null|object`, `array<int,object>` and `mixed` — narrow those with `instanceof`.

### Bridges and failures

Without an await bridge, hydrating an entity that declares a `lazy: true` relation the selection
does not name in `load()` throws `ORM lazy loading requires an await bridge.` A lazy relation named
in `load()` is loaded like any other relation: eagerly into its wrapper when the repository has a
bridge, so its first access sends no query, or as a deferred operation in `loads` when it has none —
`attach()` then installs the filled wrapper. Hydrating a `save()` or a `delete()` never needs a
bridge.

A load that fails throws the operation's error from the access that started it, and it is not
kept: the next access queries again. A lazy relation touched while its own load is still waiting —
from another Fiber that shares the entity, or from inside a custom await bridge — throws
`ORM lazy relation is already loading.`

For now, the entities a relation loads get no wrappers of their own. A `Post` that declares a
`lazy: true` relation of its own, loaded through `$Ada->Posts`, comes back with that property
unset, and reading it throws PHP's `Error` (`must not be accessed before initialization`), not a
`RuntimeException`. Give such a property a default — `null|LazyReference $Author = null` reads as
`null` — and load that relation explicitly through the `Post` repository, whose `attach()` installs
the filled wrapper.

## Writing relations

`save()` writes the mapped columns of the entity you pass, and nothing else: relation properties are
never persisted, and nothing cascades. To link a post to a user, set the post's key column and save
the post through its own repository. To add a user to a group, insert the pivot row with the Query
Builder:

```php
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Posts = $Database->map(Post::class);

$Post = new Post;
$Post->user = 3;
$Post->title = 'Kernels';

$Posts->hydrate($Database->await($Posts->save($Post)));

$Database->await($Database->query(
   $Database->table(new Identifier('memberships'))
      ->insert()
      ->set(new Identifier('user_id'), 3)
      ->set(new Identifier('group_id'), 1)
));
```

Adding a post to `$User->Posts`, or to a lazy collection, only changes the list in memory: load the
relation again to read what the database holds. Deleting an entity deletes its row only; the rows
that point at it are the database's to keep, cascade or refuse.

## HTTP routes

Inside `HTTP_Server_CLI`, repositories created through `$Response->Database` receive the response resource as their await bridge:

```php
return $Response->defer(function ($Response): void {
   $Database = $Response->Database;
   $Users = $Database->map(User::class);

   $MappedUsers = $Users->hydrate(
      $Database->await(
         $Users->fetch($Users->select()->load('Posts'))
      )
   );
});
```

## Reference

Relation attribute arguments are on
**[Attributes](/manual/ADI/Databases/SQL/Model/Attributes/overview/)**, and the other repository
operations on **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)**. In the
signatures below, `DatabaseResult` is `Bootgly\ADI\Database\Operation\Result`, and `MappedResult`
is `Bootgly\ADI\Databases\SQL\Repository\Result`.

### Repository

```php
load (object|array $Entities, array $relations = [], null|object $Scope = null): array
```

Composes one batch query per named relation for the given parents and returns the operations keyed
by relation name, without awaiting them. A relation whose parents carry no local key gets no
operation. Throws `InvalidArgumentException` for an unmapped name. `$Scope` is the read-after-write
scope of the queries; it defaults to the repository's.

```php
attach (object|array $Entities, string $relation, Operation|DatabaseResult $Source): MappedResult
```

Hydrates the finished relation operation, or a result, as target entities, writes each parent's
share onto the relation property, and returns the targets. Throws `InvalidArgumentException` for
an unmapped name, and a `RuntimeException` with the operation's `error` when it failed,
`ORM relation attachment requires a completed SQL result.` when it has not finished, or
`ORM relation attachment result is missing key column: <column>` when its rows lack the key that
matches them to their parents.

### Selection

```php
load (string ...$relations): static
```

Names relations for `hydrate()` to load with the root query's result: attached before it returns
when the repository has an await bridge, and returned as operations in `loads` when it has none.

### LazyCollection

`Bootgly\ADI\Databases\SQL\Repository\LazyCollection` implements `ArrayAccess`, `Countable` and
`Iterator`: `foreach`, `count()`, `[$index]`, `isset()`, `[] =` and `unset()` work on the loaded
list. Each of its reads loads the batch on first use.

```php
count (): int
```

The number of related entities.

```php
fetch (int $index): null|object
```

The related entity at `$index`, or `null`.

```php
load (): array
```

The related entities, as a list.

```php
offsetGet (mixed $offset): mixed
```

The entity at an index, or `null` — what `$Collection[$index]` reads.

```php
offsetExists (mixed $offset): bool
```

Whether the index exists — what `isset($Collection[$index])` asks.

```php
offsetSet (mixed $offset, mixed $value): void
```

Sets or appends an entity in the loaded list, in memory only, and rewinds the iteration. Throws
`InvalidArgumentException` with `ORM lazy collection accepts only objects.` for anything but an
object.

```php
offsetUnset (mixed $offset): void
```

Removes an entity from the loaded list, in memory only, and rewinds the iteration.

```php
set (array $items): void
```

Replaces the loaded list, in memory only, and rewinds the iteration.

```php
reset (): void
```

Drops the list's changes; the next read takes the loaded batch again, without a new query.

```php
__construct (LazyBatch $Batch, null|string $key)
```

Built by the repository as it installs the wrapper; applications do not build wrappers.

```php
public private(set) LazyBatch $Batch
```

The batch the wrapper loads from, a `Bootgly\ADI\Databases\SQL\Repository\LazyBatch`: one per
relation and hydration, shared by the wrappers of every parent in it.

```php
public private(set) null|string $key
```

The parent's `local` value as the batch indexes it, or `null` when the parent has none.

### LazyReference

`Bootgly\ADI\Databases\SQL\Repository\LazyReference` forwards to the related entity every member
that is not one of its own public members.

```php
fetch (): null|object
```

The related entity, or `null` when there is none.

```php
public bool $empty { get; }
```

`true` when there is no related entity.

```php
__get (string $property): mixed
```

Reads a property of the related entity. Throws `RuntimeException` with
`ORM lazy reference is empty.` when there is none — as do `__set()` and `__call()`.

```php
__set (string $property, mixed $value): void
```

Writes a property of the related entity, in memory.

```php
__isset (string $property): bool
```

Whether the related entity has the property set; `false`, never an exception, when there is no
entity.

```php
__call (string $method, array $arguments): mixed
```

Calls a method of the related entity.

```php
set (null|object $Entity): void
```

Replaces the related entity, in memory only.

```php
reset (): void
```

Forgets the entity the reference read; the next read takes it from the loaded batch again.

```php
__construct (LazyBatch $Batch, null|string $key)
```

Built by the repository as it installs the wrapper; applications do not build wrappers.

```php
public private(set) LazyBatch $Batch
```

The batch the wrapper loads from, a `Bootgly\ADI\Databases\SQL\Repository\LazyBatch`: one per
relation and hydration, shared by the wrappers of every parent in it.

```php
public private(set) null|string $key
```

The parent's `local` value as the batch indexes it, or `null` when the parent has none. It is the
wrapper's own: read a `key` property of the related entity through `fetch()`.
