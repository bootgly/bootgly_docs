# Defining tables

Inside `$Schema->create(...)` and `$Schema->alter(...)` you get a `$Table` to describe your
columns. This page is a cookbook: find what you need, copy it.

Every column is `$Table->add('name', Types::Something)` plus optional modifiers.

- **Methods chain** (`->limit()`, `->constrain()`, …) — they return the column.
- **`nullable` and `default` are properties** — you *assign* them. An assignment ends the
  statement, so it comes **last** (or capture the column in a variable):

  ```php
  $Table->add('active', Types::Boolean)->default = true;     // ok: assignment last
  $Table->add('bio', Types::Text)->nullable = true;          // ok

  $Email = $Table->add('email', Types::String)->limit(190);  // capture, then assign
  $Email->nullable = true;
  ```

**Columns are `NOT NULL` by default.** Set `->nullable = true` to allow `NULL`.

## The columns you need most

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Defaults;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Types;

$Schema->create('users', function (Blueprint $Table): void {
   // Auto-incrementing primary key
   $Table->add('id', Types::BigInteger)->generate()->constrain(Keys::Primary);

   // Text with a length limit, must be unique
   $Table->add('email', Types::String)->limit(190)->constrain(Keys::Unique);

   // Free text, optional (allows NULL)
   $Table->add('bio', Types::Text)->nullable = true;

   // Boolean with a default
   $Table->add('active', Types::Boolean)->default = true;

   // Money / fixed decimal: 10 digits, 2 after the point, default 0
   $Table->add('balance', Types::Decimal)->size(10, 2)->default = 0;

   // Timestamp defaulting to "now"
   $Table->add('created_at', Types::Timestamp)->default = new Expression('CURRENT_TIMESTAMP');
});
```

`default` accepts a literal (`bool`/`int`/`float`/`string`), a `Stringable`, or an
`Expression` for raw SQL. Anything else throws
`InvalidArgumentException: Schema column default must be scalar, Stringable or Expression.`

### Linking to another table (foreign key)

```php
$Table->add('team_id', Types::BigInteger)->reference('teams', 'id');
// team_id must match an id in the teams table
```

Want delete/update behavior? Use the table-level form and chain the rules:

```php
$Table->reference('team_id', 'teams', 'id')
   ->delete(References::Cascade)    // delete the team → delete its rows
   ->update(References::Restrict);  // block changing a referenced id
```

The constraint is auto-named `<table>_<column>_<targetTable>_fk` (e.g.
`users_team_id_teams_fk`), truncated to the engine identifier limit. Pass `name:` to
override.

### Picking a column type

| You want… | Use |
|-----------|-----|
| Whole number id / counter | `Types::BigInteger`, `Types::Integer` |
| Short text (names, emails) | `Types::String` + `->limit(n)` |
| Long text | `Types::Text` |
| True / false | `Types::Boolean` |
| Money / exact decimal | `Types::Decimal` + `->size(p, s)` |
| Fractional number | `Types::Float` |
| Date / time | `Types::Date`, `Types::Time`, `Types::Timestamp` |
| JSON document | `Types::Json`, `Types::JsonB` |
| UUID | `Types::Uuid` |

If you don't pass a type, you get `Types::Text`.

## Changing a table later

In an `alter`, `add()` adds new columns; `change()` edits an **existing** one. `change()`
still receives the target type, but default/nullability-only changes don't force a type
clause. Set `nullable`/`default` on the returned change object; assign `Defaults::None` to
drop an existing default:

```php
$Schema->alter('users', function (Blueprint $Table): void {
   $Table->add('phone', Types::String)->limit(20)->nullable = true; // new column

   $Email = $Table->change('email', Types::String)->limit(320);
   $Email->nullable = false;                                          // SET NOT NULL

   $Active = $Table->change('active', Types::Boolean);
   $Active->nullable = true;                                          // DROP NOT NULL
   $Active->default  = false;                                         // SET DEFAULT

   $Table->change('created_at', Types::Timestamp)->default = Defaults::None; // DROP DEFAULT

   $Table->rename('bio', 'profile');                                  // rename a column
   $Table->remove('legacy');                                          // drop a column
});
```

> Some of these depend on the database engine. PostgreSQL does all of them; MySQL and
> SQLite have limits — see **[Dialects](/manual/ADI/Databases/SQL/Schema/Dialects/overview/)**.
> When an engine can't do an action, it errors instead of producing broken SQL.

## Tip: typed names with enums

Names accept a string, but also a backed enum — handy to avoid typos across migrations:

```php
enum Tables: string  { case Users = 'users'; }
enum Columns: string { case Id = 'id'; case Email = 'email'; }

$Schema->create(Tables::Users, function (Blueprint $Table): void {
   $Table->add(Columns::Id, Types::BigInteger)->generate()->constrain(Keys::Primary);
   $Table->add(Columns::Email, Types::String)->limit(190)->constrain(Keys::Unique);
});
```

## Reference

### Blueprint methods

```php
add (BackedEnum|Stringable|string $Column, Types $Type = Types::Text): Column
```
Define a new column; returns the `Column` to modify.

```php
remove (BackedEnum|Stringable|string $Column): self
```
ALTER only — drop an existing column.

```php
change (BackedEnum|Stringable|string $Column, Types $Type): Change
```
ALTER only — change an existing column; returns the `Change`. A plain `change()` emits a
type change; `limit()`, `size()` and `cast()` keep the type action enabled; assigning only
`nullable`, `default`, or `Defaults::None` changes only that attribute.

```php
rename (BackedEnum|Stringable|string $From, BackedEnum|Stringable|string $To): self
```
ALTER only — rename an existing column.

```php
index (BackedEnum|Stringable|string|array $Columns, null|string $name = null, bool $unique = false): Index
```
Define an index over one or more columns.

```php
reference (BackedEnum|Stringable|string $Column, BackedEnum|Stringable|string $Table, BackedEnum|Stringable|string $Reference = 'id', null|string $name = null): Reference
```
Add a table-level foreign key; returns the `Reference` for `->delete()`/`->update()`.

### Column — properties

```php
public bool $nullable = false;
```
`true` allows `NULL`; default `false` means `NOT NULL`. Assign it (`$Column->nullable = true`).

```php
public null|bool|float|int|string|Stringable|Defaults $default;
```
Hooked property. **Set:** `$Column->default = …`. **Clear pending default on a new
column:** `$Column->default = Defaults::None`. **Drop an existing default in `change()`:**
`$Change->default = Defaults::None`. Invalid types throw `InvalidArgumentException`.

### Column — methods

```php
limit (int $length): self
```
String length where the dialect supports it.

```php
size (int $precision, int $scale = 0): self
```
Numeric precision/scale.

```php
generate (): self
```
Identity / `AUTO_INCREMENT` / `AUTOINCREMENT`.

```php
constrain (Keys $Key): self
```
`Keys::Primary` or `Keys::Unique`.

```php
check (string|Expression $expression): self
```
Add a `CHECK` expression.

```php
reference (BackedEnum|Stringable|string $Table, BackedEnum|Stringable|string $Column = 'id', null|string $name = null): self
```
Inline foreign key on this column.

### Change — extra members (ALTER)

`Change` shares `nullable`/`default` with `Column` but `nullable` is tri-state:

```php
public null|bool $nullable = null;
```
`null` = leave unchanged, `true` = allow `NULL` (`DROP NOT NULL`), `false` = require a
value (`SET NOT NULL`).

```php
cast (string|Expression $expression): self
```
PostgreSQL `USING` expression for the type conversion:

```php
$Table->change('legacy_id', Types::BigInteger)->cast(new Expression('legacy_id::bigint'));
// ALTER COLUMN "legacy_id" TYPE BIGINT USING legacy_id::bigint
```

Engines without `Capabilities::AlterColumnUsing` (MySQL, SQLite) reject the cast.

### Auxiliary enums

Namespace `Bootgly\ADI\Databases\SQL\Schema\Auxiliaries`:

| Enum | Cases |
|------|-------|
| `Types` | `BigInteger`, `Boolean`, `Date`, `Decimal`, `Float`, `Integer`, `Json`, `JsonB`, `String`, `Text`, `Time`, `Timestamp`, `Uuid` |
| `Keys` | `Primary`, `Unique` |
| `References` | `Cascade`, `NoAction`, `Restrict`, `SetDefault`, `SetNull` |
| `Defaults` | `None` |
| `Directions` | `Up`, `Down` |
| `Capabilities` | `AddConstraint`, `AlterColumnDefault`, `AlterColumnNullability`, `AlterColumnType`, `AlterColumnUsing`, `DropColumn`, `DropConstraint`, `MultiActionAlter`, `RenameColumn` |
