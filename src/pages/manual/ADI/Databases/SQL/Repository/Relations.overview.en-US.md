# ORM relations

ORM relations are explicit. Bootgly stores relation metadata on the model. Relations can be materialized explicitly/eagerly, or marked as lazy with `lazy: true`.

Supported relation kinds are in `Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations`:

- `HasOne`
- `HasMany`
- `BelongsTo`
- `BelongsToMany`

## Map relations

```php
use Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations;
use Bootgly\ADI\Databases\SQL\Model\Relation;
use Bootgly\ADI\Databases\SQL\Repository\LazyCollection;
use Bootgly\ADI\Databases\SQL\Repository\LazyReference;

/** @var array<int,Post> */
#[Relation(Relations::HasMany, Post::class, 'id', 'user')]
public array $Posts = [];

#[Relation(Relations::BelongsTo, User::class, 'user', 'id', name: 'author')]
public null|User $Author = null;

/** @var array<int,Group> */
#[Relation(Relations::BelongsToMany, Group::class, 'id', 'id', table: 'memberships', pivotLocal: 'user_id', pivotForeign: 'group_id')]
public array $Groups = [];

/** @var LazyCollection<Post> */
#[Relation(Relations::HasMany, Post::class, 'id', 'user', lazy: true)]
public LazyCollection $LazyPosts;

#[Relation(Relations::HasOne, Profile::class, 'id', 'user', lazy: true)]
public LazyReference $LazyProfile;
```

The arguments are relation type, target class, local key and foreign key. Many-to-many relations also need a pivot table and pivot keys.

## Load in batches

Call `load()` after hydrating root entities. It returns operations keyed by relation name.

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

This keeps query count visible and avoids ad hoc per-parent relation queries.

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

## Lazy policy

Lazy loading is opt-in with `lazy: true` and requires an await bridge. Direct SQL repositories need `Awaiting: $Database`; transaction repositories and HTTP database resources can provide the bridge from their awaited context.

```php
$Users = $Database->map(User::class, Awaiting: $Database);

$MappedUsers = $Users->hydrate(
   $Database->await($Users->fetch())
);

$count = count($MappedUsers->entities[0]->LazyPosts);
$Profile = $MappedUsers->entities[0]->LazyProfile->fetch();
```

The first access to one lazy relation in a mapped-result window loads that relation for every parent entity in that same window with one relation operation. Later access uses the attached relation state and does not query again.

An isolated entity is a batch of one. That boundary is explicit so application code can avoid N+1 by hydrating related parents in one selection before touching lazy relations.

Plural lazy relations use `LazyCollection`. Singular lazy relations use `LazyReference`, whose `fetch()` method returns the related entity or `null`. A plain `array` property cannot hold a lazy relation placeholder in PHP, so existing `array` relation properties remain the materialized form used by explicit/deferred and eager loading. Likewise, `null|Target` is the materialized singular form, not the lazy form.

Relation names are single-level in v0.16. Dotted paths such as `posts.comments` are not parsed.

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

- **[Attributes](/manual/ADI/Databases/SQL/Model/Attributes/overview/)** - relation attribute arguments.
- **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)** - repository operations and hydration.
