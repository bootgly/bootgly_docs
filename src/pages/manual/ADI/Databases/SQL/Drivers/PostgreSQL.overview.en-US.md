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
`secure.mode`: `disable`, `prefer` (the default — fall back to plaintext when refused),
`require`, `verify-ca` and `verify-full` — with `peer` and `cafile` for certificate pinning.
Only `verify-ca` and `verify-full` verify the server certificate — the chain, and with
`verify-full` the peer name too — as libpq's `sslmode` does: `prefer` and `require` encrypt
without verification unless `verify`/`name` opt in, so the shipped defaults reach a server
with a self-signed certificate at the first connection. Unverified TLS defeats passive
eavesdropping only — an active on-path attacker can answer the handshake with its own certificate
and read everything, credentials included — so use `verify-ca`/`verify-full` (or `verify => true`)
on any network you do not trust.
When a server refuses the `SSLRequest` under `prefer` and then asks for a **cleartext** or **MD5**
password, the driver does not send it — an on-path attacker can force that very refusal — and fails
the connection with an error naming `secure.mode => 'disable'`, the declared way to authenticate in
plaintext. SCRAM-SHA-256 never sends the password and proceeds — at an iteration floor of 4096
(PostgreSQL's default and RFC 7677's minimum; a cheaper count is refused the same way, as its proof
would be as crackable offline as an MD5 response, and a repeated or malformed count fails the
connection) — and on any session never above 10,000,000 iterations, which would stall the worker; a
loopback host (`127.0.0.0/8`,
`::1`, `localhost`) is exempt, as no attacker stands between the client and the server there; each
read replica is judged by its own host and mode. Since 1.0.10.
With `cafile` absent, OpenSSL's default trust store applies (`openssl.cafile`,
`SSL_CERT_FILE`/`SSL_CERT_DIR`), so pin `cafile` for a private CA; a `cafile` is only read by
a verifying handshake, so one under `prefer`/`require` without `verify` is refused at config
time, and one that is not a readable file fails the connection before any byte is sent.
Since 1.0.3 — before, every mode but `disable` verified by default.

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
$Running = $Database->query('SELECT pg_sleep(30)');
$Database->advance($Running);

$Database->cancel($Running);
```

Sends a `CancelRequest` through a separate connection using the backend key data —
advisory: the operation still resolves, fails or expires on the main socket.

Only an operation that is actually in flight produces one. A cancel request names a backend,
not a statement, so cancelling an operation that has already finished — or one composed by
`query()` but never advanced — sends nothing at all and withdraws it locally instead.

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

```php
abandon (Operation $Operation): void
```

Reconciles the wire when the Pool finishes an operation from the outside — an elapsed deadline, a
cancel that never reached the server, a transaction teardown — while the backend is still
answering its batch. It counts the readers first: a live sibling in the pipeline (a finished entry
is no reader), or a batch still being written behind it. With one it reconciles as `detach()`
does; with none the session is dropped instead, which is what gives the connection slot back.

```php
detach (Operation $Operation): void
```

Reconciles the wire when a caller stops waiting for an operation (`Pool::withdraw()`: a deferred
response whose wait was refused or interrupted, or whose request Fiber was destroyed). A pipelined
batch always ends in `Sync`, so the backend keeps answering it: the pipeline slot is handed to a
detached stand-in that absorbs the remaining messages up to its `ReadyForQuery`, keeping every
session effect the driver owes itself (statement caching, evictions) while the operation the Pool
took back is never read, written or resolved again. No reader is required. `check()` ignores
stand-ins, so the connection goes back to `idle` — unless other callers still read there — and the
next operation handed to it queues behind them and drains them; `$detached` reports that the
session still owes answers to stand-ins.

Only a batch that cannot be reconciled drops the session: one still being written after a byte was
credited, or over TLS, which may retain an uncredited record. A plaintext batch of which no byte
was written is withdrawn locally instead, and its session is kept.

`check()` also reports a batch another caller is still flushing, so the Pool never lends a
connection in the middle of someone else's write. And while a batch queued behind stand-ins is still
being flushed, the driver reads and absorbs what the stand-ins owe: a backend blocked writing an
answer nobody waits for would otherwise hold both ends until the deadline. What it reads past the
last stand-in answers that batch, and is delivered to it as soon as it is whole on the wire.

```php
reset (): bool
```

Writes the session reset — the simple Query `SELECT pg_advisory_unlock_all(); UNLISTEN *` — behind
everything the session still owes. The Pool asks for it as it returns a tainted session to `idle`,
where nobody else owes work on it. Pipelined bytes wait in the server's receive buffer, so the
backend runs it right after the abandoned statement ends even if nobody reads, and its answer is
absorbed like a stand-in's (`$detached` counts it). A batch holding the write stream is never
interleaved: the reset is refused. One reset still ending the queue covers a repeated request —
nothing was written after it. Returns `false` when it is refused, when the stream takes less than
the whole reset, or when the session is gone, and the Pool then severs the session. Session
variables (`SET`) are not reset.
