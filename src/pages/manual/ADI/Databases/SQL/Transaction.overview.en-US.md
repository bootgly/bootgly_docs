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

That wait is not a formality. `depth` becomes `1` the moment the `BEGIN` is composed, well
before any server sees it, so a transaction object exists whether or not the statement ever
succeeds. If the `BEGIN` fails, the transaction is dead and says so: `query()`, `commit()` and
`rollback()` all return a failed `Operation` reading *"SQL transaction is not active."* Without
that, work would run on a connection where no transaction was ever opened — committed by
autocommit and surviving the rollback you asked for.

## State

- `Database` — the SQL facade that created the transaction.
- `Operation` — the latest transaction operation (`BEGIN`, query, savepoint, commit or
  rollback).
- `Connection` — the pool connection pinned to the transaction after `BEGIN` is assigned.
- `depth` — current nesting depth; `0` means the outer transaction is closed.

The transaction accepts a new operation only when the previous one is finished. If another
operation is still active, methods return a failed `Operation` instead of touching the pool.
That refusal is durable: the refused operation never becomes the tracked one, so every later
call is refused too for as long as the same statement is still in flight.

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
savepoint instead. `commit()` is refused while a statement is still in flight: committing
behind an un-awaited write would report success for work the server may have rejected or
discarded, so await the write first.

```php
rollback (null|string $name = null): Operation
```

With no name, rolls back the current savepoint when nested, or the outer transaction when
not nested. With a name, rolls back to that savepoint.

Rolling back the outer transaction is the one call that runs even with a statement still
outstanding — a teardown that refused would strand the pinned connection and leave the server
session open inside the transaction. The outstanding statement is discarded: it fails with
`SQL transaction statement was discarded by the rollback.` and its buffered command is dropped
with it, so it can never reach the wire afterwards and run outside the transaction that was
meant to contain it. A savepoint rollback is an ordinary statement and is refused like any
other.

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

Releases the current savepoint, or a named one.

A **named** teardown reaches further than one level, because that is what the server does.
`ROLLBACK TO SAVEPOINT x` destroys every savepoint established after `x` and keeps `x` itself;
`RELEASE SAVEPOINT x` destroys `x` along with them. So after
`save('outer'); save('inner'); rollback('outer')` only `outer` is still live, and `depth` is
its level rather than one less than before. Naming a savepoint below the top is exactly the
case to reach for it — the unnamed forms already handle the top of the stack.

If a name appears twice, both engines resolve it to the most recent one, and so does Bootgly.

Savepoint identifiers are quoted by the active SQL dialect. Missing savepoints and inactive
transactions return failed operations — including a name an earlier teardown already
destroyed.

## Reference

- **[Database transactions](/guide/database-transactions/overview/)** — practical flow,
  rollback pattern and savepoint examples.
- **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — statements accepted
  by `Transaction::query()`.
- **[Query dialects](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)** — placeholder
  and quoting differences for compiled statements.
