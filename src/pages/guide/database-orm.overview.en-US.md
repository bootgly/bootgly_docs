# Database ORM

Bootgly's ORM is a Data Mapper layer over the native async SQL DBAL. It maps result rows to plain entity objects, but database I/O still flows through `Operation`: fetch first, await through the DBAL or HTTP response resource, then hydrate explicitly.

Use the ORM when application code wants entity-shaped data without moving query execution out of Bootgly's SQL pipeline. Use the Query Builder directly when a route only needs rows or custom projections.

## What kind of ORM is this?

In pattern terms, it is a **Data Mapper**, with a **Repository** per entity class and an **Identity Map** per repository, and no Unit of Work:

- **Data Mapper.** An entity is a plain PHP class described by attributes: no base class to extend, no persistence method to call. It never queries or saves itself — even a lazy relation is loaded by a wrapper the repository installs. The repository compiles the SQL from the class's mapping and moves the data between rows and objects.
- **Repository.** Every read and write goes through the repository `map()` returns for one entity class: `$Database->map()`, or the `map()` of a transaction or of `$Response->Database` in a route. It finds, fetches, paginates, saves and deletes the entities of that class.
- **Identity Map.** A repository keeps one object per primary key: hydrating a row it already tracks writes the row into that object. The map belongs to that repository; another `map()` has its own and hydrates the same row into another object.
- **No Unit of Work.** Nothing records your changes and nothing flushes them. Each `save()` or `delete()` composes one statement and returns it as an asynchronous `Operation` you await; a change you do not save is never written, not even when a transaction commits. The `UPDATE` of a hydrated entity writes every column its hydrations carried, changed or not — never the key, an `update: false` column or a `generated` one holding `null` —, and the `UPDATE` of an entity the repository never hydrated writes every column it can update.

| Pattern | Who saves | Where the SQL lives | Change tracking | Bootgly |
|---|---|---|---|---|
| Active Record | The entity: `$User->save()` | The entity's base class | Often, on the entity | No: an entity has no base class and no persistence methods |
| Data Mapper | A mapper: `$Users->save($User)` | The mapper, built from the mapping | Not part of the pattern | Yes: the repository, built from the attributes |
| Unit of Work | A session that flushes every pending change at once | The session, at flush time | Yes: it compares tracked entities with the state they were loaded with | No: each `save()` or `delete()` is one operation you await |

## Define entities

Entity metadata comes from attributes in `Bootgly\ADI\Databases\SQL\Model`.

```php
namespace Demo\HTTP_Server_CLI\Models;

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
   public null|DateTimeImmutable|string $CreatedAt = null;

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

PostgreSQL and MySQL hydrate date and timestamp columns as `DateTimeImmutable` and SQLite as the text it stored, and for now PostgreSQL's `save()` refuses a `DateTimeImmutable` — so `CreatedAt` accepts both types and stays read-only; **[Dates and times](/manual/ADI/Databases/SQL/Model/overview/#dates-and-times)** has the rules, and **[ORM hydration](/manual/ADI/Databases/SQL/Repository/Hydration/overview/)** how each property type is filled. Format the value when serializing to JSON.

## Fetch and hydrate

`SQL::map()` creates one repository context for an entity class. The repository compiles SQL and returns `Operation`; it does not block by itself.

A repository created directly from `SQL::map()` has no await bridge unless you pass `Awaiting:`, so by default it stays in explicit/deferred relation mode: if the entity has a `lazy: true` relation that the selection does not name in `load()`, `hydrate()` throws `ORM lazy loading requires an await bridge.` Hydrating a `save()` or a `delete()` never needs a bridge. Pass an `Awaiting` bridge, use a transaction (see **[Repositories inside a transaction](/manual/ADI/Databases/SQL/Transaction/overview/#repositories-inside-a-transaction)**), or map through the HTTP Database Response Resource when you want eager or lazy relation loading.

In a boot function, a command or a script inside a project, open `$Database` from the project's `database` config scope; outside a project, pass the connection as an array (see **[Open a database](/manual/ADI/Databases/SQL/overview/#open-a-database)**):

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\API\Environment\Configs\DatabaseConfig;

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
$Users = $Database->map(User::class);

$Operation = $Database->await($Users->fetch(
   $Users
      ->select()
      ->order(Orders::Asc, new Identifier('id'))
));
$Mapped = $Users->hydrate($Operation);

$Entities = $Mapped->entities;
$Entity = $Mapped->entity;
```

`$Database->await()` drives the operation to its end and throws when it fails; `hydrate()` then turns its rows into entities. In a route, `$Response->Database->await()` hands a failed operation back instead, and `hydrate()` is what throws (see **[Unfinished and failed operations](/manual/ADI/Databases/SQL/Repository/Hydration/overview/#unfinished-and-failed-operations)**). The selection methods — filters, text matches, order, limits, row locks and named scopes — are on **[ORM selections](/manual/ADI/Databases/SQL/Repository/Selection/overview/)**, and the mapped result, the casting rules and the identity map on **[ORM hydration](/manual/ADI/Databases/SQL/Repository/Hydration/overview/)**.

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

`save()` inserts when a generated primary key is `null`; otherwise it updates. Hydrate the save and continue with `$Mapped->entity ?? $User`: `hydrate()` writes the generated id into the object you passed, and the `??` keeps your object when the save hydrates to no entity, as an UPDATE does on MySQL and SQLite. The routing, what each driver returns and the cases the identity map does not cover yet are on **[Save entities](/manual/ADI/Databases/SQL/Repository/overview/#save-entities)**.

```php
$User = new User;
$User->name = 'Ada Lovelace';
$User->email = 'ada@example.test';
$User->active = true;

$Operation = $Database->await($Users->save($User));
$Mapped = $Users->hydrate($Operation);
$User = $Mapped->entity ?? $User;
```

Saving `$User` again updates its row. A relation you set on it before the save keeps its value.

## Load relations

Use explicit/deferred batch loading when application code wants to control the async boundary directly.

```php
$Users = $Database->map(User::class);

$MappedUsers = $Users->hydrate($Database->await($Users->fetch()));
$Operations = $Users->load($MappedUsers->entities, ['Posts']);
$Operation = $Operations['Posts'] ?? null;

if ($Operation !== null) {
   $Users->attach(
      $MappedUsers->entities,
      'Posts',
      $Database->await($Operation)
   );
}
```

`load()` leaves a relation out of its result when there is nothing to look up (no entities, or no parent carries the local key), so guard the lookup instead of indexing it directly.

`Selection::load()` records deferred relation operations on the mapped result when the repository has no await bridge. Await each operation and call `attach()` once per relation.

```php
$MappedUsers = $Users->hydrate(
   $Database->await(
      $Users->fetch($Users->select()->load('Posts'))
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
      $Users->fetch($Users->select()->load('Posts'))
   )
);
```

Inside `HTTP_Server_CLI`, `$Response->Database->map()` injects the response scheduler as the await bridge automatically.

Lazy loading is opt-in on the relation attribute. To make `User::$Posts` lazy, declare it with `lazy: true` and type it `LazyCollection`:

```php
use Bootgly\ADI\Databases\SQL\Repository\LazyCollection;

/** @var LazyCollection<Post> */
#[Relation(Relations::HasMany, Post::class, 'id', 'user', lazy: true)]
public LazyCollection $Posts;
```

First access to one lazy relation in a mapped-result window batch-loads that relation for every entity in that window: `count($User->Posts)` sends a single query covering every user the hydration returned. A singular relation (`HasOne`, `BelongsTo`) is lazy as a `LazyReference`, whose `fetch()` returns the related entity or `null`. The wrappers, the property types they accept and their current limits are on **[ORM relations](/manual/ADI/Databases/SQL/Repository/Relations/overview/#lazy-policy)**.

Relation keys may name the property or the column: `'user'` above and `'user_id'` both name the `user_id` column `Post` maps to `$user`. Relation names are single-level: a dotted path such as `Posts.Comments` is not parsed — load the next level through the related class's repository.

## Paginate

Repositories paginate in page mode (`LIMIT`/`OFFSET` plus a `COUNT(*)` total) or cursor mode (keyset predicate + opaque token, no count). In HTTP routes, one call reads `?page`, `?limit` and `?cursor`, emits the `X-Total-Count`/`Link` headers and returns a negotiable body:

```php
return $Response->Negotiation->send(
   $Response->Database->paginate(User::class)
);
```

See **[ORM Pagination](/manual/ADI/Databases/SQL/Repository/Pagination/overview/)** for filtered selections, cursor walks and the ADI-level API.

## Demo project

`projects/Demo/HTTP_Server_CLI/router/routes/Database.routes.php` exposes ORM examples:

- `/deferred/database/orm/users`
- `/deferred/database/orm/user`
- `/deferred/database/orm/relations`
- `/deferred/database/orm/lazy-relations`
- `/deferred/database/orm/save`

The entity classes used by those routes live in `projects/Demo/HTTP_Server_CLI/Models/`. Run `/deferred/database/setup` first: it creates and seeds the demo tables on PostgreSQL. The Postman collection in `projects/Demo/HTTP_Server_CLI/router/HTTP_Server_CLI-response-database.postman_collection.json` includes the same routes.

## Reference

- **[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)** - attributes and metadata compilation.
- **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)** - operations, save, delete and repositories.
- **[ORM Selection](/manual/ADI/Databases/SQL/Repository/Selection/overview/)** - filters, matches, order, limits, locks and named scopes.
- **[ORM Hydration](/manual/ADI/Databases/SQL/Repository/Hydration/overview/)** - the mapped result, casting rules, identity map and saved entities.
- **[ORM Hooks](/manual/ADI/Databases/SQL/Repository/Hooks/overview/)** - lifecycle listeners and when each one runs.
- **[ORM Relations](/manual/ADI/Databases/SQL/Repository/Relations/overview/)** - batch, eager and lazy relation loading.
- **[ORM Pagination](/manual/ADI/Databases/SQL/Repository/Pagination/overview/)** - page/cursor pagination and REST headers.
- **[Database DBAL](/guide/database-dbal/overview/)** - async database resource in HTTP routes.
