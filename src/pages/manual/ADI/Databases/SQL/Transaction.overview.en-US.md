# Transactions

`Bootgly\ADI\Databases\SQL\Transaction` pins SQL operations to one pooled connection. Use
it through `SQL::begin()` when several statements must commit or roll back together.

> Looking for the practical flow first? Start with the
> **[Database transactions](/guide/database-transactions/overview/)** guide.

## Lifecycle

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL;

$Transaction = $Database->begin();
$Database->Pool->wait($Transaction->Operation);

$Database->Pool->wait($Transaction->query('SELECT 1'));
$Database->Pool->wait($Transaction->commit());
```

`SQL::begin()` constructs the transaction and immediately assigns a `BEGIN` operation to
the pool. Wait for `$Transaction->Operation` before sending the first transactional query.

## State

- `Database` — the SQL facade that created the transaction.
- `Operation` — the latest transaction operation (`BEGIN`, query, savepoint, commit or
  rollback).
- `Connection` — the pool connection pinned to the transaction after `BEGIN` is assigned.
- `depth` — current nesting depth; `0` means the outer transaction is closed.

The transaction accepts a new operation only when the previous one is finished. If another
operation is still active, methods return a failed `Operation` instead of touching the pool.

## Querying

`Transaction` implements the same query surface used by the SQL facade:

```php
query (string|Builder|Query $query, array $parameters = []): Operation
```

Runs raw SQL, a Query Builder, or a compiled `Query` on the pinned connection.

```php
table (BackedEnum|Stringable|Builder|Query $Table, null|BackedEnum|Stringable $Alias = null): Builder
```

Starts a Query Builder with the database dialect. Pass the built statement back to
`query()`.

## Commit and rollback

```php
commit (): Operation
```

Commits the outer transaction when `depth === 1`. When `depth > 1`, it releases the current
savepoint instead.

```php
rollback (null|string $name = null): Operation
```

With no name, rolls back the current savepoint when nested, or the outer transaction when
not nested. With a name, rolls back to that savepoint.

Both methods fail without touching the pool when the transaction is inactive.

## Savepoints

```php
begin (): Operation
```

Starts the outer transaction again when `depth <= 0`; otherwise creates a nested savepoint.

```php
save (null|string $name = null): Operation
```

Creates a savepoint and increments `depth`. Without a name, Bootgly generates
`bootgly_0`, `bootgly_1`, and so on.

```php
release (null|string $name = null): Operation
```

Releases the current savepoint or a named savepoint and decrements `depth`.

Savepoint identifiers are quoted by the active SQL dialect. Missing savepoints and inactive
transactions return failed operations.

## Reference

- **[Database transactions](/guide/database-transactions/overview/)** — practical flow,
  rollback pattern and savepoint examples.
- **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — statements accepted
  by `Transaction::query()`.
- **[Query dialects](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)** — placeholder
  and quoting differences for compiled statements.
