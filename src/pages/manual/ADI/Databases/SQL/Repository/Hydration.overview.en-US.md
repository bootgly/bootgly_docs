# ORM hydration

`hydrate()` is where rows become entities. A repository composes its operations — `find()`,
`fetch()`, `paginate()`, `save()`, `delete()` — and never waits for them: you await an operation,
then pass it to `hydrate()`. It casts each row into the entity's typed properties, keeps one object
per primary key, writes the key the database generated back into the entity you saved, and loads
the relations the selection named. Composing operations is on
**[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)**, relation loading on
**[ORM relations](/manual/ADI/Databases/SQL/Repository/Relations/overview/)**, and what each driver
returns for a column on **[Type mapping](/manual/ADI/Databases/SQL/Drivers/Types/overview/)**.

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
flag that defaults to true. It starts with one row — `1`, `'Ada'`, `'ada@example.com'` — and the
examples, run in order, give the results their comments show.

## Hydrate an operation

```php
$Operation = $Database->await($Users->find(1));
$Mapped = $Users->hydrate($Operation);

$User = $Mapped->entity;

$User->name;   // 'Ada'
$User->active; // true
```

`$Database->await()` drives the operation to its end, and `hydrate()` reads its rows. When the
repository composed the operation, it noted what the operation stands for — the relations a
selection named, the entity a `save()` writes, the page a `paginate()` asked for — and `hydrate()`
uses that note once. Hydrate each operation one time: hydrated again, the same operation gives its
rows back without that context, so no relation is loaded, no pagination is resolved and no
generated key is written back.

`hydrate()` also takes the `Result` of a finished operation, so rows that did not come from the
repository become entities too, as long as they carry every mapped column — the rows of a query
you wrote yourself, or the `Result` that `$Response->Database->fetch()` returns in an
`HTTP_Server_CLI` route:

```php
$Operation = $Database->await($Database->query('SELECT id, name, email, active FROM users ORDER BY id'));

$Mapped = $Users->hydrate($Operation->Result);

$Mapped->entity === $User; // true: the same row hydrates into the same object
```

### Unfinished and failed operations

On PostgreSQL and MySQL, an operation you have not awaited has no result yet, and `hydrate()`
refuses it with `ORM hydration requires a completed SQL result.` SQLite runs a statement inside the
call that composes it, so there the operation has already finished — await it anyway, so the same
code runs on every driver.

A failed operation throws its `error` as a `RuntimeException`. `$Database->await()` has already
thrown it by then; this matters where the wait does not throw. In an `HTTP_Server_CLI` route,
`$Response->Database->await()` returns a failed operation as it is, so `hydrate()` is the first call
that throws. Check `error` first when the route should answer the failure itself:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

return $Response->defer(function (Response $Response): void {
   $Database = $Response->Database;
   $Users = $Database->map(User::class);

   $Operation = $Database->await($Users->find(1));

   if ($Operation->error !== null) {
      $Response->code(503)->JSON->send(['error' => 'The database is unavailable.']);

      return;
   }

   $Response->JSON->send(['user' => $Users->hydrate($Operation)->entity]);
});
```

## Read the mapped result

`hydrate()` returns a mapped result, `Bootgly\ADI\Databases\SQL\Repository\Result`:

```php
$Mapped = $Users->hydrate($Database->await($Users->fetch()));

$Mapped->count;          // 1
$Mapped->empty;          // false
$Mapped->entity;         // the first entity: $User
$Mapped->entities;       // every entity, in row order
$Mapped->Result->status; // 'SELECT 1'
$Mapped->loads;          // []
$Mapped->Pagination;     // null
```

- `entities` holds every hydrated entity in row order, and `entity` the first one or `null` — the
  way to read a `find()`. `count` and `empty` tell how many there are.
- `Result` is the DBAL result the rows came from, with its `rows`, `status`, `affected` and
  `inserted` (see **[Result](/manual/ADI/Database/overview/#result)**). Read a delete's `affected`
  count there: a `delete()` hydrates to no entity.
- `loads` holds the relation operations a selection named in `load()`, keyed by relation name, when
  the repository has no await bridge — await and `attach()` each one (see
  **[ORM relations](/manual/ADI/Databases/SQL/Repository/Relations/overview/)**). With a bridge,
  `hydrate()` attaches them itself and `loads` stays empty.
- `Pagination` holds the resolved outcome of a `paginate()` operation, and `null` for any other
  (see **[ORM pagination](/manual/ADI/Databases/SQL/Repository/Pagination/overview/)**).

## Rows into properties

`hydrate()` writes every mapped column of a row into its property, by the property's declared
type:

| Property type | What it receives |
|---|---|
| `bool`, `int`, `float` or `string`, with or without `null\|` | A scalar value cast with PHP's `(bool)`, `(int)`, `(float)` or `(string)`; any other value as the driver decoded it |
| A class — `DateTimeImmutable`, a value object | The value as the driver decoded it |
| A union of two or more types, such as `int\|string` | The value as the driver decoded it |
| `mixed`, `object`, or no type | The value as the driver decoded it |

The casts are what make one entity read the same on every driver: the `true` of `$User->active`
above is the `1` MySQL and SQLite return for a `BOOLEAN`, and a `float` property turns the
`'19.90'` that PostgreSQL and MySQL return for a `DECIMAL` into `19.9`. They are PHP's casts, not a
validation: a string of letters becomes `0` in an `int` property, and a float loses its fraction.
The hydrator refuses two values instead:

- `null` for a property whose single type does not allow it:
  `ORM cannot assign null to non-nullable property: name` — the message names the property, not
  the class.
- A string of digits beyond `PHP_INT_MAX` for an `int` property — MySQL returns one for a
  `BIGINT UNSIGNED` past 2^63:
  `ORM cannot hydrate a value beyond PHP_INT_MAX into an int property: User::$id (18446744073709551615) — declare it as null|int|string.`
  Declare such a property `null|int|string`, which keeps the exact string (see
  **[Keys wider than a PHP int](/manual/ADI/Databases/SQL/Drivers/overview/#keys-wider-than-a-php-int)**).

A value the table leaves uncast reaches PHP's own assignment, which checks it against the property
type: a value that does not fit throws a `TypeError`, which is an `Error` — a `catch (Exception)`
does not catch it. For now this is how these cases fail:

- **Dates.** PostgreSQL and MySQL decode `DATE` and `TIMESTAMP` columns to `DateTimeImmutable`,
  which a `string` property refuses, and SQLite returns the text it stored, which a
  `DateTimeImmutable` property refuses: type a temporal property for the drivers it runs on, as
  **[Dates and times](/manual/ADI/Databases/SQL/Model/overview/#dates-and-times)** shows.
- **Enums and arrays.** No driver decodes a column into an enum case or an array: an enum, `array`
  or `iterable` property receives the column's scalar value, and PHP refuses it. Map the stored value
  instead (see **[Types](/manual/ADI/Databases/SQL/Model/overview/#types)**).
- **`null` for a union** that does not include `null`, such as `int|string`: the hydrator checks
  `null` only for a single type, so PHP refuses it.

### Missing and extra columns

A row must carry every mapped column. A column it leaves out throws
`ORM result row is missing required column: <column>`, unless the column is marked `nullable` or
`generated` (see **[Attributes](/manual/ADI/Databases/SQL/Model/Attributes/overview/)**): then the
property is left as it is — a new entity keeps its class default, a tracked one the value it held.
Columns that no property maps are ignored.

```php
$Operation = $Database->await($Database->query('SELECT id, name FROM users'));

$Users->hydrate($Operation); // RuntimeException: ORM result row is missing required column: email
```

The repository also notes which columns each hydration carried, and a later `save()` of the entity
writes back only those — see
**[Save entities](/manual/ADI/Databases/SQL/Repository/overview/#save-entities)**.

### Readonly properties

A `readonly` property is written once. Hydrating the entity again with an equal value — for an
object, an equal one, such as the same instant decoded again — leaves the property as it is. A
different value is refused before any column of the row is written:
`ORM cannot overwrite a readonly property: User::$email`. The same holds for a value the
constructor set, when it runs (see
**[Construction and defaults](/manual/ADI/Databases/SQL/Model/overview/#construction-and-defaults)**).
On PostgreSQL, the row the INSERT of a new entity returns can contradict a value the database
normalized, such as `'ab'` padded to `'ab  '` by a `char(4)` column: that row hydrates into a new
object instead (see **[Save entities](/manual/ADI/Databases/SQL/Repository/overview/#save-entities)**).

## Identity map

A repository keeps one object per primary key. Every row whose key it has seen hydrates into the
object it already holds:

```php
$User->name = 'Ada (unsaved)';

$Again = $Users->hydrate($Database->await($Users->find(1)))->entity;

$Again === $User; // true
$User->name;      // 'Ada': the row overwrote the unsaved change
```

- **The newer row wins.** Hydration writes every column the row carries over the tracked object, so
  a change you have not saved is lost.
- **The map belongs to one repository.** A second `$Database->map(User::class)` has a map of its
  own and hydrates the same row into another object.
- **Related entities share it.** The entities a repository loads through a relation — with
  `attach()`, eagerly or lazily — are tracked in its map, one object per key and class.
- **A row without the key column is never tracked.** It hydrates into a new object every time.
- **A reused object is not constructed again.** The constructor runs only for a new object, and only
  when it has no required parameters (see
  **[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)**).

The map grows with every key the repository hydrates, for as long as the repository lives. Map a
repository per request, job or transaction — `$Response->Database->map()` maps a new one on every
call — rather than one per worker.

### Start over

`reset()` forgets every tracked entity, and the columns each hydration carried:

```php
$Users->reset();

$Fresh = $Users->hydrate($Database->await($Users->find(1)))->entity;

$Fresh === $User; // false
```

An entity you still hold is then new to the repository, and `save()` routes it as one you built
yourself (see **[Save entities](/manual/ADI/Databases/SQL/Repository/overview/#save-entities)**).

## Saved entities

Hydrating a `save()` writes the key the database generated back into the entity you passed, on
every driver — PostgreSQL from the row `RETURNING` sends back, MySQL and SQLite from the id they
report in `Result->inserted` — so continue with `$Mapped->entity ?? $Entity`. What else each driver
returns, the relations of the saved entity and the cases the identity map does not cover yet are on
**[Save entities](/manual/ADI/Databases/SQL/Repository/overview/#save-entities)**.

## Reference

The signatures name the classes as `Repository.php` imports them: `DatabaseResult` is
`Bootgly\ADI\Database\Operation\Result`, and `MappedResult` is
`Bootgly\ADI\Databases\SQL\Repository\Result`.

### Repository

```php
hydrate (Operation|DatabaseResult $Source): MappedResult
```

Turns the rows of a finished operation, or of a result, into entities, attaches or defers the
relations its selection named, and returns the mapped result. Throws a `RuntimeException` with the
operation's `error` when it failed; `ORM hydration requires a completed SQL result.` when it has no
result yet; `ORM lazy loading requires an await bridge.` when the entity declares a `lazy: true`
relation the selection did not name and the repository has no bridge;
`ORM pagination count requires an await bridge.` for a page count it cannot await; and the error of
a row it cannot take — a missing column, `null` for a non-nullable property, a readonly conflict, an
integer beyond `PHP_INT_MAX` (see [Rows into properties](#rows-into-properties)). Throws an
`InvalidArgumentException` for a relation name the selection loads that is not mapped, and for a
cursor page that ends on a `NULL` order value. Emits `Hydrating` and `Hydrated` (see
**[ORM hooks](/manual/ADI/Databases/SQL/Repository/Hooks/overview/)**).

```php
reset (): static
```

Forgets every tracked entity and the columns each hydration carried, and returns the repository.

```php
public private(set) Identity $Identity
```

The repository's identity map, `Bootgly\ADI\Databases\SQL\Repository\Identity`.

### Identity

`Bootgly\ADI\Databases\SQL\Repository\Identity`. Read it with `fetch()` and clear it with the
repository's `reset()`; the repository calls the other methods as it hydrates.

```php
__construct ()
```

Starts an empty map. Each repository builds its own.

```php
fetch (string $class, mixed $key): null|object
```

Returns the object tracked for `$key`, or `null`: `$Users->Identity->fetch(User::class, 1)`.

```php
store (string $class, mixed $key, object $Entity): object
```

Tracks `$Entity` as the object of `$key`, and returns it.

```php
record (object $Entity, array $columns): void
```

Adds the columns a hydration carried for `$Entity`, each column name mapped to `true`, to the ones
already recorded.

```php
carried (object $Entity): null|array
```

The columns recorded for `$Entity`, which an `UPDATE` of it writes back; `null` when no hydration
recorded any, and the `UPDATE` then writes every mapped column it can.

```php
reset (): void
```

Forgets every tracked object and every recorded column. The repository's `reset()` calls it.

### Mapped result

`Bootgly\ADI\Databases\SQL\Repository\Result`.

```php
__construct (DatabaseResult $Result, array $entities, array $loads = [], null|Pagination $Pagination = null)
```

Builds a mapped result. `hydrate()` and `attach()` create it.

```php
public private(set) DatabaseResult $Result
```

The DBAL result the rows came from.

```php
public private(set) array $entities
```

The hydrated entities, in row order.

```php
public private(set) array $loads
```

The deferred relation operations, keyed by relation name; empty when the repository has an await
bridge or the selection named no relation.

```php
public private(set) null|Pagination $Pagination
```

The resolved pagination outcome of a `paginate()` operation, or `null`.

```php
public null|object $entity { get; }
```

The first entity, or `null` when there is none.

```php
public int $count { get; }
```

The number of entities.

```php
public bool $empty { get; }
```

`true` when no entity was hydrated.
