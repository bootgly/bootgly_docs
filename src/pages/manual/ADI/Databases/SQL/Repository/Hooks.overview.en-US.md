# ORM hooks

A repository announces each step of its work to the listeners you register on it: before and after
it composes a selection, a save or a delete, and before and after it hydrates. A listener reads
what the repository is about to do, changes it — normalizes an entity before it is written,
restricts a selection — or refuses it by throwing. Hooks belong to one repository; the database's
own events, such as failed and slow queries, go through the global event bus instead (see
**[SQL database events](/manual/ADI/Databases/SQL/overview/#events)**).

The examples on this page share this entity and a `$Database` opened from the project's `database`
config scope. In an `HTTP_Server_CLI` route, use `$Response->Database` instead, and outside a
project pass the connection as an array — see
**[Open a database](/manual/ADI/Databases/SQL/overview/#open-a-database)**.

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;
use Bootgly\API\Environment\Configs\DatabaseConfig;

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
}

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
$Users = $Database->map(User::class);
```

`users` has a key the database generates (`id`), a required `name` and `email`, and an `active`
flag that defaults to true. Run in order on an empty table, the examples give the results their
comments show.

## Listen to a hook

```php
use Bootgly\ADI\Databases\SQL\Repository\Hooks;

$Users->listen(Hooks::Saving, function (User $User): void {
   $User->email = strtolower(trim($User->email));
});

$User = new User;
$User->name = 'Ada';
$User->email = ' Ada@Example.com ';

$Users->hydrate($Database->await($Users->save($User)));

$User->email; // 'ada@example.com'
```

`listen()` takes a `Hooks` case and a `Closure`, and returns the repository, so registrations
chain. A hook calls its listeners in the order they were registered, with the arguments of the
hook. The `Saving` listener above runs before the repository composes the `INSERT`, so the row
holds the normalized email.

## Hooks and their arguments

| Hook | Emitted by | Listener arguments | Runs |
|---|---|---|---|
| `Selecting` | `find()`, `fetch()`, `paginate()` | `Selection $Selection` | After named scopes apply, before the selection compiles |
| `Selected` | `find()`, `fetch()`, `paginate()` | `Operation $Operation, Selection $Selection` | Once the query is queued — on SQLite, once it ran |
| `Saving` | `save()` | `object $Entity` | Before the key is read and the `INSERT` or `UPDATE` composed |
| `Saved` | `save()` | `Operation $Operation, object $Entity` | Once the statement is queued — on SQLite, once it ran |
| `Deleting` | `delete()` | `mixed $Entity`: the entity or the key you passed | After the key is read, before the `DELETE` is composed |
| `Deleted` | `delete()` | `Operation $Operation, mixed $Entity` | Once the statement is queued — on SQLite, once it ran |
| `Hydrating` | `hydrate()` | `DatabaseResult $Result` | Before any row is read |
| `Hydrated` | `hydrate()` | `Result $Mapped` | Last, with entities, relations and pagination in place |

`Operation` is `Bootgly\ADI\Databases\SQL\Operation`, `DatabaseResult` is
`Bootgly\ADI\Database\Operation\Result`, and `Result` is the mapped result,
`Bootgly\ADI\Databases\SQL\Repository\Result` (see
**[ORM hydration](/manual/ADI/Databases/SQL/Repository/Hydration/overview/)**). `find()` emits the
`Selecting` and `Selected` of the selection it builds: the key filter and `LIMIT 1`.

Nothing else emits a hook. `load()` and `attach()`, the relations `hydrate()` loads eagerly, a
lazy relation's first access and the `COUNT(*)` of a page-mode `paginate()` all run without one.

## Dispatch is not completion

`Selected`, `Saved` and `Deleted` run once the repository has queued the statement, not when the
database answers. On PostgreSQL and MySQL the database has not received it yet: the operation a
listener receives is queued, the row is not written, and the statement goes to the database only
when you await the operation — it can still fail then. SQLite runs a statement inside the call that
composes it, so there the operation has finished — and may have failed.

```php
use Bootgly\ADI\Databases\SQL\Operation;

$Users->listen(Hooks::Saved, function (Operation $Operation, User $User): void {
   $Operation->finished; // false on PostgreSQL and MySQL: nothing is written yet
});
```

A side effect that must follow a confirmed write — a notification, a cache purge, a message to
another system — does not belong in `Saved`. Run it after the wait, which throws when the write
fails:

```php
$User->name = 'Ada Lovelace';

$Operation = $Database->await($Users->save($User)); // throws when the write fails
$Users->hydrate($Operation);

// The row is written here: run the side effects of the save.
```

`Hydrated` runs after the database answered, but for every hydration: reads as well as writes.

## Steer the repository

The hooks that run before the work can change it or stop it:

- **`Selecting`** receives the selection about to compile, after named scopes: a predicate the
  listener adds restricts the query — `find()` included. It forms a group of its own, ANDed after
  the caller's predicates, so a caller's `OR` cannot get around it.
- **`Saving`** receives the entity before the repository reads its key and composes the statement,
  so what the listener changes is written. For a generated key, a key it sets on a new entity turns
  the `INSERT` into an `UPDATE`.
- **`Deleting`** receives the entity or the key after the repository has read the key: changing
  the entity there does not change which row is deleted.

A listener on `Selecting` keeps inactive users out of every selection of the repository:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Repository\Selection;

$Linus = new User;
$Linus->name = 'Linus';
$Linus->email = 'linus@example.com';
$Linus->active = false;

$Users->hydrate($Database->await($Users->save($Linus)));

$Users->listen(Hooks::Selecting, function (Selection $Selection): void {
   $Selection->filter(new Identifier('active'), Operators::Equal, true);
});

$Users->hydrate($Database->await($Users->fetch()))->count;   // 1: Linus is filtered out
$Users->hydrate($Database->await($Users->find(2)))->entity; // null: find() is restricted too
```

### Refuse by throwing

An exception a listener throws leaves the call that emitted the hook, and the listeners registered
after it do not run. Thrown from `Selecting`, `Saving` or `Deleting`, it stops the call before any
statement exists, so nothing reaches the database:

```php
use InvalidArgumentException;

$Users->listen(Hooks::Saving, function (User $User): void {
   if ($User->email === '') {
      throw new InvalidArgumentException('A user needs an email.');
   }
});

$Nobody = new User;
$Nobody->name = 'Nobody';

$Users->save($Nobody); // InvalidArgumentException: A user needs an email.
```

Thrown from `Selected`, `Saved` or `Deleted`, it leaves the call after the statement was queued,
before you hold its operation. On SQLite the statement has already run. On PostgreSQL and MySQL it
stays queued with nobody to await it: nothing guarantees it ever runs, and when it was waiting for a
new connection to open, it keeps that pool slot. Never throw from these hooks; refuse in the hook
that runs before the work.

Thrown from `Hydrating` or `Hydrated`, it leaves `hydrate()`. By then the repository has used up
what it noted about the operation, so hydrating the operation again loads no relation and writes
no generated key back; and when `Hydrated` throws, the entities are already written and tracked.

### Reused selections

`fetch()` hands `Selecting` the selection object you passed, not a copy, so a predicate a listener
adds stays on it. Fetch the same selection twice and the listener above adds its predicate twice:

```php
$Selection = $Users->select();

$Database->await($Users->fetch($Selection));
$Database->await($Users->fetch($Selection))->SQL; // ... WHERE "active" = $1 AND "active" = $2 on PostgreSQL
```

A listener whose predicate reads changing state — the current tenant, the signed-in user — then
piles up conflicting predicates on the reused selection. For now, build a new selection for every
`fetch()`; `paginate()` already works on a copy. Named scopes behave the same way (see
**[Reuse a selection](/manual/ADI/Databases/SQL/Repository/Selection/overview/#reuse-a-selection)**).

## Listeners belong to one repository

Listeners live on the repository you registered them on. Another `map()` of the same class starts
with none — and `$Response->Database->map()` maps a new repository on every call — so register them
where you map the repository.

### Forward hooks to the event bus

`Hooks` cases implement the `Bootgly\ABI\Event` marker, but a repository never emits them on the
global event bus. When one observer must hear a hook from every repository, forward it from each
repository you map:

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ADI\Databases\SQL\Repository\Result;

Emitter::$Instance->listen(Hooks::Hydrated, function (Emission $Emission): void {
   [$Mapped] = $Emission->payload;
});

$Users->listen(Hooks::Hydrated, function (Result $Mapped): void {
   Emitter::$Instance->emit(Hooks::Hydrated, $Mapped);
});
```

The bus delivers its own `Emission`, and the arguments of the hook are its `payload`. See
**[Events](/guide/events/overview/)** for priorities and propagation.

## Reference

### Repository

```php
listen (Hooks $Hook, Closure $Listener): static
```

Registers a listener on this repository for one hook and returns the repository. The listeners of a
hook run in registration order, with the hook's arguments, and an exception one of them throws
leaves the call that emitted the hook. A listener cannot be removed: map a new repository instead.

### Hook cases

`Bootgly\ADI\Databases\SQL\Repository\Hooks`, a unit enum implementing `Bootgly\ABI\Event`.

```php
case Selecting;
```

Emitted by `find()`, `fetch()` and `paginate()` after named scopes apply, before the selection
compiles. The listener receives `(Selection $Selection)`: the selection `fetch()` was given, the
one `find()` builds, or the copy `paginate()` works on.

```php
case Selected;
```

Emitted by `find()`, `fetch()` and `paginate()` once the query is queued. The listener receives
`(Operation $Operation, Selection $Selection)`; on PostgreSQL and MySQL the database has not received
the query yet, and on SQLite it has already run.

```php
case Saving;
```

Emitted by `save()` before it reads the key and composes the `INSERT` or `UPDATE`. The listener
receives `(object $Entity)`, and what it changes is written.

```php
case Saved;
```

Emitted by `save()` once the statement is queued. The listener receives
`(Operation $Operation, object $Entity)`; on PostgreSQL and MySQL the database has not received it
yet, so the row is not written.

```php
case Deleting;
```

Emitted by `delete()` after it reads the key, before it composes the `DELETE`. The listener
receives `(mixed $Entity)`: the entity or the key passed to `delete()`.

```php
case Deleted;
```

Emitted by `delete()` once the statement is queued. The listener receives
`(Operation $Operation, mixed $Entity)`; on PostgreSQL and MySQL the database has not received it
yet.

```php
case Hydrating;
```

Emitted by `hydrate()` before it reads any row. The listener receives `(DatabaseResult $Result)`.

```php
case Hydrated;
```

Emitted by `hydrate()` as its last step, with entities, relations and pagination in place. The
listener receives `(Result $Mapped)`, the mapped result `hydrate()` returns.
