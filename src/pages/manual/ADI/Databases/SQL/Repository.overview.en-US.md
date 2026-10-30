# ORM Repository

`Bootgly\ADI\Databases\SQL\Repository` is the Data Mapper surface for one mapped entity class. It owns a local identity map and a hydrator, but it does not own database connections or run hidden I/O.

Create repositories from a SQL facade, a transaction or the HTTP database response resource:

```php
$Users = $Database->map(User::class);
$UsersInTransaction = $Transaction->map(User::class);
$UsersInResponse = $Response->Database->map(User::class);
```

`$Response->Database->map()` binds the repository to the response resource's read-after-write scope. This keeps read replica routing consistent inside `HTTP_Server_CLI` routes.

`SQL::map()` does not default an await bridge. Direct SQL repositories stay explicit/deferred unless you pass `Awaiting: $Database`. Transactions and the HTTP response resource already operate in awaited contexts, so their `map()` calls can provide the bridge for eager and lazy relations.

## Operations

Repository methods return `Operation` for database work:

```php
$Find = $Users->find(1);
$Fetch = $Users->fetch($Users->select());
$Save = $Users->save($User);
$Delete = $Users->delete($User);
```

Await the operation through the DBAL, then hydrate when rows should become entities:

```php
$Operation = $Database->await($Users->find(1));
$Mapped = $Users->hydrate($Operation);

$User = $Mapped->entity;
```

`save()` on a hydrated entity writes back the columns that hydration actually carried, and
only those. A projection that omits a mapped column leaves its property holding the class
default, which reads exactly like a value you chose — writing it back would replace stored
data with a plausible-looking default and report success. Hydrate a wider projection later
and the columns it carried join the set. A column marked `generated` holding `null` is never
written, the same way an INSERT has always skipped it.

An entity you built yourself is not hydrated, so nothing is known about it: `save()` writes
every mapped column, which is what you asked for. And a hydrated entity with no writable
column left is refused with `ORM update has no column carrying a value to write.` rather than
compiling an `UPDATE` with an empty `SET`.

> **Keep the saved instance.** For now, hydrating the `save()` of a new entity on PostgreSQL returns a new instance in `$Mapped->entity`, built from the `RETURNING` row, and the object you passed keeps `id === null`; MySQL and SQLite write the generated id back into that same object. On MySQL and SQLite only that generated-key INSERT hydrates to an entity: an UPDATE, or an INSERT with an application-assigned key, returns no row, so `$Mapped->entity` is `null` — keep the object you saved. `$User = $Mapped->entity ?? $User;` keeps the right object on every driver. On MySQL and SQLite an application-assigned key also stays untracked after that INSERT: saving the same object again through the repository inserts it a second time and fails on the duplicate key, until a `find()` through that repository hydrates the row.

## Selection

`select()` creates a `Selection`, which compiles through the SQL Query Builder.

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Selection = $Users
   ->select()
   ->filter(new Identifier('active'), Operators::Equal, true)
   ->order(Orders::Asc, new Identifier('id'))
   ->limit(10);

$Operation = $Users->fetch($Selection);
```

Named scopes are local to the repository:

```php
$Users->scope('active', function ($Selection): void {
   $Selection->filter(new Identifier('active'), Operators::Equal, true);
});

$Operation = $Users->fetch($Users->select()->scope('active'));
```

## Hydration result

`hydrate()` returns `Repository\Result`:

- `entities` - all hydrated entities.
- `entity` - first entity or `null`.
- `count` - hydrated entity count.
- `empty` - whether no entities were hydrated.
- `Result` - original DBAL result.
- `loads` - deferred single-level relation operations keyed by relation name; empty when eager loading attaches them during hydration.

The identity map is local to the repository instance. Hydrating repeated rows with the same primary key reuses the same object inside that repository only.

When a selection uses `load()` without an await bridge, await each `$Mapped->loads` operation and attach it explicitly:

```php
$Mapped = $Users->hydrate(
   $Database->await(
      $Users->fetch($Users->select()->load('Posts'))
   )
);

foreach ($Mapped->loads as $relation => $Operation) {
   $Users->attach($Mapped->entities, $relation, $Database->await($Operation));
}
```

When the repository has an await bridge, `hydrate()` performs eager loading and returns with the requested relations already attached:

```php
$Users = $Database->map(User::class, Awaiting: $Database);

$Mapped = $Users->hydrate(
   $Database->await(
      $Users->fetch($Users->select()->load('Posts'))
   )
);
```

The HTTP database response resource injects itself as that bridge, so repositories created through `$Response->Database->map()` eager-load requested relations without extra orchestration.

Relations declared with `lazy: true` are installed as lazy wrappers during hydration, which needs an await bridge. Plural relations use `LazyCollection`; singular relations use `LazyReference`. First access loads the relation once for every entity in the mapped-result window.

> **Lazy relations need a bridge.** An entity with a `lazy: true` relation that the selection does not name in `load()` can only be hydrated by a repository with an await bridge; otherwise `hydrate()` throws `ORM lazy loading requires an await bridge.` Naming the relation in `load()` returns it as a deferred `loads` operation instead. A `save()` names no relation, so hydrating one without a bridge throws the same error — on every UPDATE, and on every INSERT except a generated-key one on MySQL or SQLite — after the write has already run.

## Hooks

`listen()` registers local lifecycle listeners for repository events such as `Selecting`, `Selected`, `Saving`, `Saved`, `Hydrating` and `Hydrated`.

```php
use Bootgly\ADI\Databases\SQL\Repository\Hooks;

$Users->listen(Hooks::Hydrated, function ($Mapped): void {
   // inspect mapped entities
});
```

## Reference

- **[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)** - compiled entity metadata.
- **[Relations](/manual/ADI/Databases/SQL/Repository/Relations/overview/)** - explicit batch loading.
- **[Database ORM](/guide/database-orm/overview/)** - end-to-end usage.
