# Database ORM

Bootgly's ORM is a Data Mapper layer over the native async SQL DBAL. It maps result rows to plain entity objects, but database I/O still flows through `Operation`: fetch first, await through the DBAL or HTTP response resource, then hydrate explicitly.

Use the ORM when application code wants entity-shaped data without moving query execution out of Bootgly's SQL pipeline. Use the Query Builder directly when a route only needs rows or custom projections.

## Define entities

Entity metadata comes from attributes in `Bootgly\ADI\Databases\SQL\Model`.

```php
use DateTimeImmutable;

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

   #[Column]
   public string $email = '';

   #[Column]
   public bool $active = true;

   #[Column('created_at', insert: false, update: false, generated: true, nullable: true)]
   public null|DateTimeImmutable $CreatedAt = null;

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

PostgreSQL timestamps are hydrated as `DateTimeImmutable`. Type entity properties accordingly and format them when serializing to JSON.

## Fetch and hydrate

`SQL::map()` creates one repository context for an entity class. The repository compiles SQL and returns `Operation`; it does not block by itself.

A repository created directly from `SQL::map()` stays in explicit/deferred relation mode. Pass an `Awaiting` bridge, use a transaction, or map through the HTTP Database Response Resource when you want eager or lazy relation loading.

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Users = $Database->map(User::class);

$Operation = $Users->fetch(
   $Users
      ->select()
      ->order(Orders::Asc, new Identifier('id'))
);

$Database->Pool->wait($Operation);
$Mapped = $Users->hydrate($Operation);

$Entities = $Mapped->entities;
$Entity = $Mapped->entity;
```

In `HTTP_Server_CLI`, use the built-in Database Response Resource so the event loop keeps handling readiness while the operation waits:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

return $Response->defer(function (Response $Response): void {
   $Database = $Response->Database;
   $Users = $Database->map(User::class);

   $Operation = $Database->await($Users->find(1));
   $Mapped = $Users->hydrate($Operation);

   $Response->JSON->send([
      'status' => 'ok',
      'user' => $Mapped->entity,
   ]);
});
```

## Save entities

`save()` inserts when a generated primary key is `null`; otherwise it updates. PostgreSQL and SQLite return mapped columns through `RETURNING` when supported by the dialect.

```php
$User = new User;
$User->name = 'Ada Lovelace';
$User->email = 'ada@example.test';
$User->active = true;

$Operation = $Database->await($Users->save($User));
$Mapped = $Users->hydrate($Operation);
```

## Load relations

Use explicit/deferred batch loading when application code wants to control the async boundary directly.

```php
$Users = $Database->map(User::class);

$MappedUsers = $Users->hydrate($Database->await($Users->fetch()));
$Operations = $Users->load($MappedUsers->entities, ['Posts']);
$Users->attach(
   $MappedUsers->entities,
   'Posts',
   $Database->await($Operations['Posts'])
);
```

`Selection::load()` records deferred relation operations on the mapped result when the repository has no await bridge. Await each operation and call `attach()` once per relation.

```php
$MappedUsers = $Users->hydrate(
   $Database->await(
      $Users->fetch($Users->select()->load('Posts', 'Profile'))
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

For eager loading, inject an ADI await bridge. `hydrate()` then auto-awaits and auto-attaches requested relations, and `loads` stays empty.

```php
$Users = $Database->map(User::class, Awaiting: $Database);

$MappedUsers = $Users->hydrate(
   $Database->await(
      $Users->fetch($Users->select()->load('Posts', 'Profile'))
   )
);
```

Inside `HTTP_Server_CLI`, `$Response->Database->map()` injects the response scheduler as the await bridge automatically.

Lazy loading is opt-in on the relation attribute:

```php
use Bootgly\ADI\Databases\SQL\Repository\LazyCollection;
use Bootgly\ADI\Databases\SQL\Repository\LazyReference;

/** @var LazyCollection<Post> */
#[Relation(Relations::HasMany, Post::class, 'id', 'user_id', lazy: true)]
public LazyCollection $Posts;

#[Relation(Relations::HasOne, Profile::class, 'id', 'user_id', lazy: true)]
public LazyReference $Profile;
```

First access to one lazy relation in a mapped-result window batch-loads that relation for every entity in that window. `count($User->Posts)` loads plural relations through `LazyCollection`; `$User->Profile->fetch()` returns the singular target or `null` through `LazyReference`. Lazy loading requires an await bridge. A plain `array` property is the materialized plural form for explicit/deferred and eager loading, not the lazy form.

Relation names are single-level in v0.16. Nested paths such as `posts.comments` are intentionally out of scope.

## Demo project

`projects/Demo-HTTP_Server_CLI/router/routes/Database.php` exposes ORM examples:

The entity classes used by those routes live in `projects/Demo-HTTP_Server_CLI/Models/`.

- `/deferred/database/orm/users`
- `/deferred/database/orm/user`
- `/deferred/database/orm/relations`
- `/deferred/database/orm/lazy-relations`
- `/deferred/database/orm/save`

Run `/deferred/database/setup` first. The Postman collection in `projects/Demo-HTTP_Server_CLI/router/HTTP_Server_CLI-response-database.postman_collection.json` includes the same routes.

## Reference

- **[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)** - attributes and metadata compilation.
- **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)** - selections, save, delete and hydration.
- **[ORM Relations](/manual/ADI/Databases/SQL/Repository/Relations/overview/)** - explicit batch relation loading.
- **[Database DBAL](/guide/database-dbal/overview/)** - async database resource in HTTP routes.
