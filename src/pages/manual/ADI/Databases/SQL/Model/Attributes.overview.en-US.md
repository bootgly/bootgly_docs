# ORM attributes

ORM attributes live in `Bootgly\ADI\Databases\SQL\Model`.

## Table

`Table` maps one class to one SQL table.

```php
use Bootgly\ADI\Databases\SQL\Model\Table;

#[Table('users')]
class User
{
}
```

Each entity must have exactly one `Table` attribute.

## Key

`Key` maps the primary key property. Generated keys are the default.

```php
use Bootgly\ADI\Databases\SQL\Model\Key;

#[Key]
public null|int $id = null;
```

For application-assigned keys, disable generation:

```php
#[Key(generated: false)]
public string $id = '';
```

## Column

`Column` maps a persistent property. When no name is passed, the property name is used as the SQL column.

```php
use DateTimeImmutable;

use Bootgly\ADI\Databases\SQL\Model\Column;

#[Column]
public string $email = '';

#[Column('created_at', insert: false, update: false, generated: true, nullable: true)]
public null|DateTimeImmutable $CreatedAt = null;
```

Options:

- `name` - SQL column name, or `null` to use the property name.
- `insert` - include the column in `INSERT` statements.
- `update` - include the column in `UPDATE` statements.
- `generated` - allow missing result columns during hydration and skip null generated values on insert.
- `nullable` - allow missing or null values when hydrating.

## Relation

`Relation` defines metadata for explicit/deferred, eager and lazy relation loading. Mark a relation lazy with `lazy: true` when its property uses a lazy wrapper.

```php
use Bootgly\ADI\Databases\SQL\Model\Auxiliaries\Relations;
use Bootgly\ADI\Databases\SQL\Model\Relation;

/** @var array<int,Post> */
#[Relation(Relations::HasMany, Post::class, 'id', 'user')]
public array $Posts = [];

#[Relation(Relations::BelongsTo, User::class, 'user', 'id', name: 'author')]
public null|User $Author = null;
```

The relation stores its target class, local key, foreign key and optional pivot table fields. `Repository::load()`, `Selection::load()` and lazy wrappers use this metadata to create batched relation operations.
