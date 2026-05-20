# ORM Model

`Bootgly\ADI\Databases\SQL\Model` is the compiled metadata for one ORM entity class. It is built from PHP attributes and cached by `Models` on the SQL facade.

The model stores:

- entity class name and table name
- primary key column and property
- column-to-property mappings
- insertable and updatable columns
- relation definitions
- reflection handles used by the hydrator

Applications normally do not instantiate `Model` directly. Call `SQL::map(Entity::class)` or `Transaction::map(Entity::class)` and the repository fetches cached metadata through `Models`.

```php
$Users = $Database->map(User::class);

$Model = $Users->Model;

echo $Model->table;
echo $Model->key;
```

## Reflection and cache

The first call to `Models::fetch()` reflects the entity class. Later calls reuse the compiled metadata on the same `SQL` instance.

```php
$Models = $Database->Models;

$UserModel = $Models->fetch(User::class);
$SameModel = $Models->fetch(User::class);
```

Only metadata is cached. Repositories are lightweight contexts and should be created per use, request or transaction.

## Entity construction

During hydration, `Model::create()` creates one entity instance. If the entity has no required constructor parameters, the constructor runs. If it has required parameters, Bootgly creates the instance without calling the constructor, then writes mapped properties by reflection.

Keep mapped entity properties explicit and typed. For object-valued columns, type the property with the object actually returned by the driver. PostgreSQL timestamps are returned as `DateTimeImmutable`.

## Reference

- **[Attributes](/manual/ADI/Databases/SQL/Model/Attributes/overview/)** - `Table`, `Key`, `Column` and `Relation`.
- **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)** - operations built from model metadata.
- **[Database ORM](/guide/database-orm/overview/)** - end-to-end usage.
