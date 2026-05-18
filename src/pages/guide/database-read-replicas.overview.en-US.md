# Database read replicas

Read replicas let Bootgly send safe read queries to replica pools while keeping writes on the
primary database. This is useful when a worker handles many read-heavy HTTP requests and the
primary should stay focused on writes, locks and transactions.

Bootgly keeps one routing path inside `SQL::query()`: each query is normalized, classified as
read or write, then assigned to the primary pool or one of the replica pools.

## Configure replicas

In code, pass a `routing.sticky` window and a `replicas` list to `SQL`:

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'host' => 'primary.db.local',
   'routing' => [
      'sticky' => 5.0,
   ],
   'replicas' => [
      [
         'host' => 'replica-1.db.local',
         'pool' => [
            'min' => 0,
            'max' => 8,
         ],
      ],
      [
         'host' => 'replica-2.db.local',
         'statements' => 128,
      ],
   ],
]);
```

Replica configs inherit the primary connection fields unless a replica overrides them. Set a
replica `host` to enable that endpoint. Optional fields include `driver`, `port`, `database`,
`username`, `password`, `timeout`, `secure`, `pool` and `statements`.

`routing.sticky` is the best-effort read-after-write window in seconds. After a write, reads
inside the same logical scope stay on primary until the window expires.

## Project config

The demo HTTP project exposes the same options through `configs/database/database.config.php`.
Add `Routing->Sticky` and one or more `Replicas` nodes under the selected connection:

```php
use Bootgly\ADI\Databases\SQL\Config as ADIConfig;
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;

return new Config(scope: 'database')
   ->Default->bind(key: 'DB_CONNECTION', default: ADIConfig::DEFAULT_DRIVER)
   ->Connections
      ->PostgreSQL
         ->Host->bind(key: 'DB_HOST', default: ADIConfig::DEFAULT_HOST)
         ->Routing
            ->Sticky->bind(key: 'DB_ROUTING_STICKY', default: ADIConfig::DEFAULT_ROUTING_STICKY, cast: Types::Float)
            ->up()
         ->Replicas
            ->Replica1
               ->Host->bind(key: 'DB_REPLICA_1_HOST', default: null)
               ->Port->bind(key: 'DB_REPLICA_1_PORT', default: null, cast: Types::Integer)
               ->Database->bind(key: 'DB_REPLICA_1_NAME', default: null)
               ->Username->bind(key: 'DB_REPLICA_1_USER', default: null)
               ->Password->bind(key: 'DB_REPLICA_1_PASS', default: null)
               ->Timeout->bind(key: 'DB_REPLICA_1_TIMEOUT', default: null, cast: Types::Float)
               ->Statements->bind(key: 'DB_REPLICA_1_STATEMENTS', default: null, cast: Types::Integer);
```

When using `DatabaseConfig`, the API adapter maps `Routing->Sticky` to `routing.sticky` and
each enabled replica node to the ADI-native `replicas` list.

The demo project accepts `DB_ROUTING_STICKY` and the following keys for `Replica1` and
`Replica2`:

```text
DB_REPLICA_1_HOST
DB_REPLICA_1_PORT
DB_REPLICA_1_NAME
DB_REPLICA_1_USER
DB_REPLICA_1_PASS
DB_REPLICA_1_TIMEOUT
DB_REPLICA_1_STATEMENTS
DB_REPLICA_1_SSLMODE
DB_REPLICA_1_SSLVERIFY
DB_REPLICA_1_SSLPEER
DB_REPLICA_1_SSLCAFILE
DB_REPLICA_1_POOL_MIN
DB_REPLICA_1_POOL_MAX
```

Use the same suffixes for `DB_REPLICA_2_*`. A replica without `*_HOST` is ignored.

## Routing rules

Builder queries are the most precise path. `Builder::compile()` marks a query as readable only
when it is a plain `SELECT` without a lock. `SELECT ... FOR UPDATE` and other locking reads go
to primary.

Raw SQL uses a conservative classifier:

- `SELECT`, `SHOW` and non-analyzing `EXPLAIN` can use replicas.
- Read-only `WITH ... SELECT` CTEs can use replicas.
- `INSERT`, `UPDATE`, `DELETE`, `MERGE`, DDL and unknown statements go to primary.
- `EXPLAIN ANALYZE` goes to primary because it executes the query.

Writes, DDL, transactions and locked builders always use the primary pool.

## Read-after-write scope

Bootgly tracks read-after-write stickiness with a logical scope object. In WPI, the built-in
Database Response Resource binds that scope to the current response request lifecycle, so normal
and deferred response work share the same stickiness scope without leaking it to later keep-alive
requests.

When using `SQL` directly across Fibers, pass the same scope object to related writes and reads:

```php
use stdClass;

$Scope = new stdClass;

$Database->query('UPDATE users SET name = $1 WHERE id = $2', ['Ada', 7], $Scope);
$Read = $Database->query('SELECT name FROM users WHERE id = $1', [7], $Scope);
```

The sticky window is timing-based. It is not a causal LSN or GTID wait. If your application needs
strict replica freshness, keep that read on primary or add a database-specific causal wait before
reading from replicas.

## Failover and quarantine

Replica reads fall back to primary once when the replica operation fails. Connection,
handshake and socket-establishment failures count against the replica pool health. Query timeouts
fall back but do not quarantine the replica.

After `Pool::DEFAULT_FAILURES` consecutive health-affecting failures, the replica is skipped
until its jittered retry window expires or the pool recovers after a successful operation.

## Next references

- **[Database DBAL](/guide/database-dbal/overview/)** - register the Database Response Resource in HTTP projects.
- **[Database queries](/guide/database-queries/overview/)** - build read and write statements.
- **[Database transactions](/guide/database-transactions/overview/)** - pin writes to one primary connection.
