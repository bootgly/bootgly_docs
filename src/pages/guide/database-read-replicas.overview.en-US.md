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
replica `host` to enable that endpoint: a replica without one is dropped. Optional fields include
`driver`, `port`, `database`, `username`, `password`, `timeout`, `secure`, `pool` and
`statements` (see **[Keys and defaults](/manual/ADI/Database/Config/overview/#keys-and-defaults)**).
Each replica is opened as a pool of its own, listed in `$Database->ReplicaPools`.

A replica that declares `secure.mode` re-derives `secure.verify` and `secure.name` from that
mode — the same rule the primary follows: `prefer`/`require` unverified, `verify-ca`/`verify-full`
verifying — so restate `verify` on the replica to keep a primary's explicit opt-in. A replica that
declares neither `mode` nor `verify` inherits the primary's resolved flags. A `cafile` is inherited
only by a replica that verifies; one the replica declares itself under an unverified mode is
refused at config time. Whatever its mode, a replica's `secure.peer` defaults to its own `host`,
never to the primary's `peer`. Since 1.0.3 — before, a replica inherited the primary's flags whatever its
own mode said. A PostgreSQL replica reached under `prefer` that refuses TLS and asks for a cleartext
or MD5 password (or SCRAM below 4096 iterations) is refused on its own host and mode (loopback exempt), and the read falls back to
the primary.

`routing.sticky` is the best-effort read-after-write window in seconds (default `5.0`; `0` turns
it off). After a write, reads inside the same logical scope stay on primary until the window
expires (see [Read-after-write scope](#read-after-write-scope)).

## Project config

The demo HTTP project exposes the same options through `configs/database/database.Config.php`.
Add `Routing->Sticky` and one or more `Replicas` nodes under the selected connection:

```php
use Bootgly\ADI\Databases\SQL\Config as ADIConfig;
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;

return new Config(scope: 'database')
   ->Enabled->bind(key: 'DB_ENABLED', default: true, cast: Types::Boolean)
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
each enabled replica node to the ADI-native `replicas` list. The HTTP Database Response Resource
also needs the `Enabled` node to hold `true` (see
**[Configure the database](/guide/database-dbal/overview/#configure-the-database)** for the whole
scope).

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

The adapter reads as many replica nodes as the scope declares, but under the HTTP resource a
`.env` file can set only the keys of replicas 1 and 2: a `DB_REPLICA_3_HOST` line there makes the
scope fail to load (see
**[Keys a .env file may set](/guide/database-dbal/overview/#keys-a-env-file-may-set)**). A third
replica needs a node of its own in `database.Config.php`, with its values from the process
environment or from literal defaults.

## Routing rules

Builder queries are the most precise path. `Builder::compile()` marks a query as readable only
when it is a plain `SELECT` without a lock. `SELECT ... FOR UPDATE` and other locking reads go
to primary.

Raw SQL uses a conservative classifier, which reads the statement's first keyword:

- `SELECT`, `SHOW` and non-analyzing `EXPLAIN` can use replicas.
- Read-only `WITH ... SELECT` CTEs can use replicas. A `WITH` statement that contains `ALTER`,
  `CREATE`, `DELETE`, `DROP`, `INSERT`, `MERGE`, `TRUNCATE` or `UPDATE` anywhere — even inside a
  string literal — goes to primary.
- `INSERT`, `UPDATE`, `DELETE`, `MERGE`, DDL and unknown statements go to primary.
- `EXPLAIN ANALYZE` goes to primary because it executes the query.
- A statement that starts with a comment or a parenthesis goes to primary: its first word is not a
  keyword the classifier knows.

Past the first keyword, the classifier only looks for those write words in a `WITH` and for
`ANALYZE` after `EXPLAIN`. A `SELECT` that calls a function that writes — PostgreSQL's
`nextval()`, for example — therefore counts as a read, and for now so does a raw
`SELECT ... FOR UPDATE`: lock through the builder's `lock()`, or inside a transaction.

A `Query` you build yourself is never classified like a raw string: its `reading` flag decides, and
it defaults to `false`.

```php
use Bootgly\ADI\Databases\SQL\Builder\Query;

$Report = new Query('/* report */ SELECT count(*) AS total FROM users', [], reading: true);
$Sequence = new Query("SELECT nextval('orders_id_seq') AS id");

$Count = $Database->await($Database->query($Report));
$Next = $Database->await($Database->query($Sequence));
```

`$Report` can go to a replica although its text starts with a comment. `$Sequence` goes to primary
although its text starts with `SELECT`, because a `Query` without `reading: true` is a write.
Every statement treated as a write — raw, built or hand-built — also marks the read-after-write
scope.

Writes, DDL, transactions and locked builders always use the primary pool. Reads go round-robin
to the replicas whose pool is healthy — to the primary when none is, or while the read's scope is
inside its sticky window.

### Security verdicts

The SQL-backed security stores do not make authentication or revocation
decisions from potentially stale replicas. `Users` credential lookups,
`Tokens` action-token lookups and `Trust` trusted-device lookups are forced to
the primary. This includes a remember-token rotation verdict: replica lag must
not turn the current validator into a false theft incident or revive a token
already revoked on primary.

These forced reads use a transient routing scope. They do not start or extend
read-after-write stickiness for unrelated queries later in the same worker.
When a security store is backed by a `Transaction`, the transaction remains
pinned to its primary connection and obtains the verdict on that connection.
MySQL and PostgreSQL use `SELECT ... FOR UPDATE`: MySQL reads the latest row,
while PostgreSQL Read Committed reads the current row and Repeatable Read or
Serializable can reject a row changed after the snapshot with SQLSTATE `40001`.
That rejection is fail-closed; roll back and retry the entire transaction.

SQLite does not support `FOR UPDATE`. The stores first execute a zero-row DML
barrier on the same transaction, which reserves the writer before the SELECT or
fails closed with `database is locked` when a WAL snapshot is already stale.
The barrier and row locks remain until commit/rollback and read-only
transactions cannot acquire them. Keep these transactions short and handle
database rollback/retry. The constructor signatures and public store APIs do
not change.

## Read-after-write scope

Bootgly tracks read-after-write stickiness with a logical scope object. A write marks its scope
with the time `query()` issued it, and while that mark is younger than `routing.sticky`, reads in
the same scope go to the primary:

```php
$Database->await($Database->query('UPDATE users SET name = $1 WHERE id = $2', ['Ada', 7]));

$Read = $Database->await($Database->query('SELECT name FROM users WHERE id = $1', [7]));
$Read->Pool === $Database->Pool; // true
```

Without a `$Scope` argument, the scope is the current Fiber, or the `SQL` instance itself when the
code runs outside any Fiber. A script or a command therefore has one scope for all of its queries:
after any write, every read of that instance stays on the primary for the window. Inside Fibers,
each Fiber is its own scope, so a write in one Fiber does not pin the reads of another.

In WPI, the built-in Database Response Resource binds that scope to the current response request
lifecycle, so normal and deferred response work share the same stickiness scope without leaking it
to later keep-alive requests.

When using `SQL` directly across Fibers, pass the same scope object to related writes and reads:

```php
use stdClass;

$Scope = new stdClass;

$Database->await($Database->query('UPDATE users SET name = $1 WHERE id = $2', ['Ada', 7], $Scope));
$Read = $Database->await($Database->query('SELECT name FROM users WHERE id = $1', [7], $Scope));
```

Any object can be a scope — a job, a message, a request. The facade holds it weakly: once nothing
else references the object, its mark is gone with it.

When the write happened where this facade could not see it — through another `SQL` instance,
another process or service, or a statement the classifier counts as a read — mark the scope
yourself with `touch()`:

```php
$Database->touch($Scope);

$Read = $Database->await($Database->query('SELECT name FROM users WHERE id = $1', [7], $Scope));
$Read->Pool === $Database->Pool; // true
```

`touch()` without an argument marks the default scope: the current Fiber, else the facade. Writes
through a transaction mark the scope too, as soon as they are composed (see
**[Read-after-write scope](/manual/ADI/Databases/SQL/Transaction/overview/#read-after-write-scope)**
on the Transactions page).

The sticky window is timing-based. It is not a causal LSN or GTID wait. If your application needs
strict replica freshness, keep that read on primary or add a database-specific causal wait before
reading from replicas.

## Failover and quarantine

A replica read that fails is re-run once on the primary, with a fresh deadline of the replica's
`timeout`, whatever the cause: a refused dial, a TLS or authentication failure, a lost session, a
timeout or a plain SQL error. The operation then reports `fallback` as `true`. A read you cancelled
or withdrew is never re-run.

Only connection-level failures count against the replica pool's health; a SQL error or a timeout
does not. After `Pool::DEFAULT_FAILURES` consecutive ones, the replica pool closes for a jittered
retry window and reads skip it, to another healthy replica or to the primary. A read that succeeds
on the replica clears the count. The numbers, and what a replica that accepts connections but never
answers costs, are in **[Replica health](/manual/ADI/Database/Pool/overview/#replica-health)**.

Each replica pool reports its own state:

```php
foreach ($Database->ReplicaPools as $index => $Replica) {
   echo "replica {$index}: ", $Replica->healthy ? 'healthy' : 'closed', " ({$Replica->failures} failures)\n";
}
```

## Next references

- **[Database DBAL](/guide/database-dbal/overview/)** - register the Database Response Resource in HTTP projects.
- **[Database queries](/guide/database-queries/overview/)** - build read and write statements.
- **[Database transactions](/guide/database-transactions/overview/)** - pin writes to one primary connection.
- **[Connection pool](/manual/ADI/Database/Pool/overview/)** - the replica pools, their deadlines and their health.