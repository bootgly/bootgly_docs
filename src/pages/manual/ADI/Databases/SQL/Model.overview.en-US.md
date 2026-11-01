# ORM Model

`Bootgly\ADI\Databases\SQL\Model` is the compiled mapping of one entity class: its table, its
primary key, the column behind each stored property and its relations, read from the attributes
on the class. A repository compiles its SQL from it and hydrates rows through it: the entity itself
never reads or writes the database, which is what makes the ORM a Data Mapper (see
**[What kind of ORM is this?](/guide/database-orm/overview/#what-kind-of-orm-is-this)**). This page
covers what makes a class an entity, how its metadata is compiled and cached, the errors a bad
mapping throws, and how entity properties are typed, constructed and inherited. The attributes
themselves are on **[ORM attributes](/manual/ADI/Databases/SQL/Model/Attributes/overview/)**, and
running queries with an entity on **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)**.

> Looking for the practical flow first? Start with the
> **[Database ORM](/guide/database-orm/overview/)** guide.

## Map an entity

An entity is a plain PHP class, with no base class to extend and no interface to implement.
`#[Table]` names its table, `#[Key]` marks its primary key, and `#[Column]` marks every other
property the database stores:

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

   #[Column('email')]
   public string $mail = '';

   public string $greeting = 'Hello';
}

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());

$Users = $Database->map(User::class);

$Users->Model->table;   // 'users'
$Users->Model->columns; // ['id' => 'id', 'name' => 'name', 'email' => 'mail']
```

`map()` compiles the class into a `Model` the first time it meets it, and returns a repository that
carries the model as `$Model`; it opens no connection. `$mail` is stored in the `email` column.
`$greeting` carries no attribute, so it is not mapped: the ORM never reads or writes it, and a
hydrated `User` keeps its default. The example opens `$Database` from the project's `database`
config scope; in an `HTTP_Server_CLI` route, call `$Response->Database->map()` instead, and outside
a project pass the connection as an array (see
**[Open a database](/manual/ADI/Databases/SQL/overview/#open-a-database)**).

A class maps when:

- it carries exactly one `#[Table]`;
- exactly one property carries `#[Key]`. The primary key is one column: composite keys are not
  supported;
- each stored property carries one `#[Column]`, or the `#[Key]`, and no two properties name the
  same column;
- each relation property carries one `#[Relation]`, under a name no other relation of the class
  uses.

Mapped properties can be `public`, `protected` or `private`: the ORM reads and writes them through
reflection. Never map a `static` property: the ORM maps it like any other, so every entity it
hydrates writes the one value they all share. [Mapping errors](#mapping-errors) lists what breaking
a rule throws.

## Read the metadata

The compiled model is plain data. With the `User` above:

```php
$Model = $Users->Model;

$Model->table;       // 'users'
$Model->key;         // 'id': the primary key column
$Model->keyProperty; // 'id': the property that holds it
$Model->generated;   // true: the database assigns the key
$Model->columns;     // ['id' => 'id', 'name' => 'name', 'email' => 'mail']
$Model->properties;  // ['id' => 'id', 'name' => 'name', 'mail' => 'email']
$Model->insertions;  // ['name' => 'name', 'email' => 'mail']
$Model->updates;     // ['name' => 'name', 'email' => 'mail']

$Model->identify('mail');  // 'email'
$Model->resolve('email');  // 'mail'
```

`columns` maps each column to its property and `properties` the other way round, the key
included. `insertions` and `updates` hold the columns an INSERT and an UPDATE write: a generated
key is in neither, and the `insert:` and `update:` flags of
**[Column](/manual/ADI/Databases/SQL/Model/Attributes/overview/#column)** take a column out of one
or the other. `identify()` turns a property name into its column and `resolve()` a column into its
property; both return a name they do not map unchanged. Every property and method of the model is
in the [Reference](#reference).

## Compile and cache

```php
use Bootgly\ADI\Databases\SQL\Model;

$Cached = $Database->Models->fetch(User::class);
$Cached === $Users->Model;               // true

$Compiled = Model::reflect(User::class);
$Compiled === $Cached;                   // false
$Compiled->columns === $Cached->columns; // true
```

- `Models::fetch()` compiles a class on its first call and returns the same `Model` after. Each
  `SQL` facade owns one `Models`, `$Database->Models`, which its `map()`, the `map()` of its
  transactions and `$Response->Database->map()` in a route all share. Another `SQL` instance
  compiles its own copy.
- `Model::reflect()` compiles the class on every call, caches nothing and needs no database. Use it
  to check a mapping in a test, with no connection to open.
- A mapping error is thrown by the first `map()` of the class, or by the first load of a relation
  that targets it. A failed compilation is not cached, so every later call throws again.

Only the metadata is cached. Each `map()` call returns a new repository with an identity map of
its own, so create repositories per request, job or transaction.

## Mapping errors

`map()`, `Models::fetch()` and `Model::reflect()` throw an `InvalidArgumentException` for a class
that breaks a mapping rule. `<class>` stands for the class name, `<property>` for the property,
`<column>` for the column and `<name>` for the relation name:

| Mapping | Message |
|---|---|
| No `#[Table]`, or two | `ORM entity requires one Table attribute: <class>` |
| `#[Table('')]` | `ORM table name cannot be empty.` |
| No `#[Key]` | `ORM entity requires one primary key: <class>` |
| `#[Key]` on two properties | `ORM entity accepts one primary key: <class>` |
| `#[Key]` and `#[Column]` on one property | `ORM property cannot have both Key and Column attributes: <class>::$<property>` |
| Two `#[Column]`, or two `#[Key]`, on one property | `ORM property accepts one mapping attribute: <class>::$<property>` |
| Two properties on one column, the key's included | `ORM column is mapped twice: <column>` |
| `#[Column('')]` or `#[Key('')]` | `ORM column name cannot be empty.` |
| Two relations under one name | `ORM relation is mapped twice: <name>` |
| An empty `local` or `foreign` key in `#[Relation]` | `ORM relation keys cannot be empty.` |
| `name: ''` in `#[Relation]` | `ORM relation name cannot be empty.` |

The table is checked first, then each property, then the presence of the key, and the first
problem found is thrown. Two more failures come from PHP itself: a class that does not exist throws
a `ReflectionException` (`Class "<class>" does not exist`), and two `#[Relation]` on one property
throw an `Error` (`Attribute "Bootgly\ADI\Databases\SQL\Model\Relation" must not be repeated`).

Compiling does not check what can only fail later:

- a relation's `target` class, its `local` and `foreign` keys and a `BelongsToMany` pivot are
  checked when the relation is first loaded (see
  **[Relation](/manual/ADI/Databases/SQL/Model/Attributes/overview/#relation)**);
- the table and its columns are checked by the database, which refuses the first query that names
  a wrong one;
- property types meet the values when rows are hydrated and entities saved, as
  [Entity properties](#entity-properties) explains.

## Entity properties

### Types

Hydration casts a scalar value into a `bool`, `int`, `float` or `string` property and leaves every
other value to PHP's own type check, so type `null|T` every property whose column can hold `NULL`:
the rules, the errors they throw and the cases that fail for now are on
**[Rows into properties](/manual/ADI/Databases/SQL/Repository/Hydration/overview/#rows-into-properties)**.

An enum or an `array` property cannot hold a column: no driver decodes a column into one, and every
driver refuses one as a `save()` parameter. Map the stored value, such as the `string` of a JSON
document or of an enum's value, and convert it in your own code.

What each driver returns for each column type is on
**[Type mapping](/manual/ADI/Databases/SQL/Drivers/Types/overview/#results)**, and dates and times have
a section of their own below.

### Construction and defaults

- Each new entity a hydration needs comes from `Model::create()`. It runs the constructor when the
  constructor has no required parameter, once per new object and never for an object the identity
  map hands back. Otherwise it creates the object without calling the constructor: properties keep
  their declared defaults, and a property without one stays uninitialized until a row fills it.
- Constructor-promoted properties are mapped like declared ones, because the attributes on a
  promoted parameter apply to its property.
- The ORM reads a property that is not initialized as `null`. A generated key left uninitialized
  therefore saves as a new row, and any other column it inserts as `NULL`, except a `generated`
  one, which the database fills.
- A generated key must read `null` on a new entity: declare it `null|int $id = null`, or leave it
  uninitialized. With `int $id = 0`, `save()` of a new entity is an `UPDATE` of the row whose key is
  `0`, not an `INSERT` (see
  **[Save entities](/manual/ADI/Databases/SQL/Repository/overview/#save-entities)**).

### Readonly properties

```php
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;

#[Table('codes')]
class Code
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public readonly string $code;

   public function __construct (string $code)
   {
      $this->code = $code;
   }
}

$Codes = $Database->map(Code::class);

$Code = $Codes->hydrate($Database->await($Codes->save(new Code('A-17'))))->entity;

$Code->code; // 'A-17'
```

- Hydration fills a `readonly` property that is not initialized yet. Here the required constructor
  parameter makes `create()` skip the constructor, so a `Code` hydrated from a row gets its `code`
  from that row.
- Once the property holds a value — from a row, or from a constructor without required parameters
  — a later row must agree with it: what hydration keeps, refuses and throws is on
  **[Readonly properties](/manual/ADI/Databases/SQL/Repository/Hydration/overview/#readonly-properties)**.

### Inheritance

A class does not inherit `#[Table]`: an entity that extends another declares its own, or `map()`
throws `ORM entity requires one Table attribute: <class>`. It then maps its own properties and the
`public` and `protected` mapped properties of its parents; a parent's `private` properties are not
mapped. A repository accepts an object of its entity class or of a subclass, and writes only the
columns its own model maps.

## Dates and times

Each driver hands temporal columns back its own way, and PostgreSQL takes them back only as
strings, for now:

| Driver | A `date` or `timestamp` hydrates as | `save()` accepts |
|---|---|---|
| PostgreSQL | `DateTimeImmutable` | A string. A `DateTimeInterface` fails the operation with `PostgreSQL parameter must be scalar or null.` |
| MySQL | `DateTimeImmutable`; a zero date stays a string | A string or a `DateTimeInterface` |
| SQLite | The string that was stored | A string or a `DateTimeInterface` |

Type a temporal property for the drivers it runs on: `null|DateTimeImmutable` on PostgreSQL and
MySQL, `null|string` on SQLite, and `null|DateTimeImmutable|string` for code that runs on all
three. On PostgreSQL, every temporal column `save()` writes must hold a string, also after
`hydrate()` put a `DateTimeImmutable` there, since an UPDATE writes every column the entity was
hydrated with. A column the database fills, such as a creation time, stays out of the writes with
`insert: false, update: false`. With a table whose `created_at` defaults to the current time:

```php
use DateTimeImmutable;

use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;

#[Table('events')]
class Event
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $title = '';

   #[Column('starts_at')]
   public null|DateTimeImmutable|string $StartsAt = null;

   #[Column('created_at', insert: false, update: false)]
   public null|DateTimeImmutable|string $CreatedAt = null;
}

$Events = $Database->map(Event::class);

$Event = new Event;
$Event->title = 'Launch';
$Event->StartsAt = new DateTimeImmutable('2026-11-05 09:30:00')->format('Y-m-d H:i:s');

$Event = $Events->hydrate($Database->await($Events->save($Event)))->entity ?? $Event;

$StartsAt = $Event->StartsAt instanceof DateTimeImmutable
   ? $Event->StartsAt
   : new DateTimeImmutable($Event->StartsAt);

$Event->title = 'Launch day';
$Event->StartsAt = $StartsAt->modify('+1 day')->format('Y-m-d H:i:s');

$Database->await($Events->save($Event));
```

On PostgreSQL, the row the INSERT returns already puts `DateTimeImmutable` objects in `StartsAt`
and `CreatedAt`. On MySQL and SQLite, `StartsAt` keeps the string you assigned, and `CreatedAt`
stays `null` until the next `find()`. Either way, `StartsAt` is normalized to an object to work
with, and formatted back to a string before the next `save()`. Keep dates in one time zone end to
end, as
**[Write portable code](/manual/ADI/Databases/SQL/Drivers/Types/overview/#write-portable-code)**
recommends, and see
**[Dates on PostgreSQL](/manual/ADI/Databases/SQL/Drivers/Types/overview/#dates-on-postgresql)** for
the format each PostgreSQL date and time type keeps.

## Reference

### Model

```php
__construct (
   string $class,
   string $table,
   string $key,
   string $keyProperty,
   bool $generated,
   array $columns,
   array $properties,
   array $definitions,
   array $insertions,
   array $updates,
   array $relations,
   array $relationProperties,
   array $Reflections,
   ReflectionClass $Class
)
```

Builds a model from compiled parts. `Model::reflect()` calls it; applications do not.

```php
static reflect (string $class): self
```

Compiles the mapping of `$class` from its attributes, on every call, with no cache and no
database. Throws `InvalidArgumentException` for a class that breaks a mapping rule (see
[Mapping errors](#mapping-errors)) and `ReflectionException` for a class that does not exist.

```php
create (): object
```

Creates one entity for a hydration: through the constructor when it has no required parameter,
without calling it otherwise.

```php
validate (object $Entity): void
```

Throws `InvalidArgumentException` with `ORM entity does not match model: <class>` unless `$Entity`
is an instance of the mapped class or of a subclass of it. `save()`, `delete()`, `load()` and
`attach()` call it.

```php
identify (string $name): string
```

Returns the column of the property `$name`, or `$name` unchanged when no property of that name is
mapped.

```php
resolve (string $column): string
```

Returns the property of `$column`, or `$column` unchanged when no column of that name is mapped.

```php
read (object $Entity, string $property): mixed
```

Reads a mapped property, a column or a relation property, through reflection, whatever its
visibility; `null` while the property is not initialized. Throws `InvalidArgumentException` with
`ORM property is not mapped: <property>` for any other name.

```php
write (object $Entity, string $property, mixed $value): void
```

Writes a mapped property through reflection, with no ORM conversion: PHP's own coercion still
applies — `'5'` written into an `int` property becomes `5` — and a value PHP refuses throws its
`TypeError`. Throws the same `InvalidArgumentException` as `read()` for a name that is not mapped.

```php
public private(set) string $class
```

The mapped entity class.

```php
public private(set) string $table
```

The table, as `#[Table]` names it.

```php
public private(set) string $key
```

The primary key column.

```php
public private(set) string $keyProperty
```

The property that holds the primary key.

```php
public private(set) bool $generated
```

Whether the database generates the key: `true` for `#[Key]`, `false` for
`#[Key(generated: false)]`. `save()` routes on it.

```php
public private(set) array $columns
```

Column name → property name, for every mapped column, the key included, in the order the
properties were found.

```php
public private(set) array $properties
```

Property name → column name: `$columns` the other way round.

```php
public private(set) array $definitions
```

Column name → the attribute that maps it: a `Key` for the key, a `Column` for every other column.

```php
public private(set) array $insertions
```

Column name → property name, for the columns an INSERT writes.

```php
public private(set) array $updates
```

Column name → property name, for the columns an UPDATE writes. The key is never among them.

```php
public private(set) array $relations
```

Relation name → its `Relation` attribute.

```php
public private(set) array $relationProperties
```

Relation name → the property that holds the related entities.

```php
public private(set) array $Reflections
```

Property name → its `ReflectionProperty`, for every column and relation property.

### Models

`Bootgly\ADI\Databases\SQL\Models` is the cache an `SQL` facade keeps in `$Database->Models`. It has
no constructor of its own.

```php
fetch (string $class): Model
```

Returns the compiled `Model` of `$class`, compiling it with `Model::reflect()` on the first call. A
failed compilation is not stored, so the next call compiles again and throws again.
