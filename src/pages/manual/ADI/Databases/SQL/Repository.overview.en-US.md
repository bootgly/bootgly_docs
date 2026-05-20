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
      $Users->fetch($Users->select()->load('posts'))
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
      $Users->fetch($Users->select()->load('posts'))
   )
);
```

The HTTP database response resource injects itself as that bridge, so repositories created through `$Response->Database->map()` eager-load requested relations without extra orchestration.

Relations declared with `lazy: true` are installed as lazy wrappers during hydration when the repository has an await bridge. Plural relations use `LazyCollection`; singular relations use `LazyReference`. First access loads the relation once for every entity in the mapped-result window.

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
