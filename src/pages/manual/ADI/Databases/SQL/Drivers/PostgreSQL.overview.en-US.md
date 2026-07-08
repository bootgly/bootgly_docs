# PostgreSQL driver

`Bootgly\ADI\Databases\SQL\Drivers\PostgreSQL` implements PostgreSQL Protocol 3.0
natively — startup, authentication, TLS, simple and extended query protocols, pipelining
and cancellation — with zero dependencies. It is the default Bootgly driver.

## Connecting

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'postgres',
   'password' => 'secret',
]);

$Operation = $Database->await($Database->query('SELECT version() AS version'));
$Operation->Result->cell;
```

Operations are asynchronous: `query()` returns a pending `Operation` driven by `await()`
or by the Fiber scheduler under the HTTP server.

## Authentication and TLS

Supported authentication methods: **cleartext**, **MD5** and **SCRAM-SHA-256** (channel
binding is not negotiated). TLS is negotiated through `SSLRequest` and controlled by
`secure.mode`: `disable`, `prefer` (fall back to plaintext when refused), `require`,
`verify-ca` and `verify-full` — with `peer` and `cafile` for certificate pinning.

## Prepared statements

Parameterized queries use the extended protocol (`Parse`/`Bind`/`Describe`/`Execute`/
`Sync`) with a per-connection LRU statement cache (`statements` config key, default
`256`). Statements are named `bootgly_{sha1(sql)}` and evicted with `Close`:

```php
$Row = $Database->await($Database->query(
   'SELECT id, name FROM users WHERE mail = $1 AND active = $2',
   ['ada@bootgly.com', true]
));
```

The PostgreSQL dialect uses `$1..$n` placeholders. Results hydrate by type OID: booleans,
integers, floats, `bytea` and temporal types become native PHP values
(`DateTimeImmutable` for dates/timestamps); `numeric` stays a string.

## Generated keys

The dialect supports `RETURNING` — the ORM appends it to mutations automatically and
hydrates saved entities from the returned rows:

```php
$Saved = $Repository->hydrate(
   $Database->await($Repository->save($User))
)->entity;
```

## Pipelining

Co-located operations pipeline on one connection: multiple in-flight commands share the
socket and resolve in FIFO order as backend messages arrive. The Pool co-locates
operations onto busy connections automatically when the pool is at capacity.

On a transport failure (socket write/read error, peer close, framing corruption) the
driver fails every pipelined operation, resets its session state and disconnects, so the
Pool drops the dead connection instead of keeping it busy.

## Cancellation

```php
$Database->cancel($Operation);
```

Sends a `CancelRequest` through a separate connection using the backend key data —
advisory: the operation still resolves, fails or expires on the main socket.

## Reference

```php
query (string $sql, array $parameters = []): Operation
```

Creates one pending operation. Without parameters it uses the simple query protocol;
with parameters, the extended protocol with the statement cache.

```php
prepare (Operation $Operation): Operation
```

Builds the wire messages for the operation — `Query`, or
`Parse + Describe + Bind + Execute + Sync` with cache-aware reuse.

```php
advance (Operation $Operation): Operation
```

Drives the connection state machine: connect, SSL negotiation, startup, authentication,
command write and backend message read.

```php
cancel (Operation $Operation): Operation
```

Sends the advisory `CancelRequest` side-channel packet. Requires `BackendKeyData` from the
connection startup; marks the operation `cancelled`.
