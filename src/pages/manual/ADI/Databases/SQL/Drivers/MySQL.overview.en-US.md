# MySQL driver

`Bootgly\ADI\Databases\SQL\Drivers\MySQL` implements the MySQL client protocol natively —
handshake, authentication, TLS, text and binary (prepared) protocols — with zero
dependencies. It speaks to **MySQL 5.7+/8.x** and **MariaDB**.

## Connecting

```php
use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'mysql',
   'host' => '127.0.0.1',
   'port' => 3306,
   'database' => 'app',
   'username' => 'root',
   'password' => 'secret',
]);

$Operation = $Database->await($Database->query('SELECT VERSION() AS version'));
$Operation->Result->cell; // '8.4.2'
```

Operations are asynchronous: `query()` returns a pending `Operation`; `await()` (or the
Fiber scheduler under the HTTP server) drives it to completion.

## Authentication

Both modern plugins are supported end-to-end, including plugin switches requested by the
server:

- `mysql_native_password` — SHA1 challenge-response;
- `caching_sha2_password` (MySQL 8 default) — SHA256 fast path; the **full
  authentication** path (first connection of a user after a server restart) sends the
  password over TLS, or encrypts it with a **pinned server RSA public key** over
  plaintext connections.

> **Security** — over plaintext the driver never requests the RSA key from the server:
> an active MITM could substitute its own key and decrypt the password. The same attacker
> reads it through an unverified TLS handshake (`prefer`/`require` without `verify` — the
> shipped default), so verify the certificate on any untrusted network (see TLS below). Full
> authentication without TLS fails unless you pin the server public key locally:

```php
$Database = new SQL([
   'driver' => 'mysql',
   // ...
   'secure' => [
      'mode' => 'disable',
      // Inline PEM or a file path (docker: /var/lib/mysql/public_key.pem)
      'key' => '/etc/app/mysql-server-public.pem',
   ],
]);
```

In the Demo config the pin binds to the `DB_SERVER_PUBLIC_KEY` environment key. With TLS
active (`secure.mode` ≠ `disable`) no pin is needed. Note that only the *full* path is
affected: the everyday fast path works over plaintext with the regular scramble.

MariaDB's `ed25519` plugin is not supported — the operation fails with a clear message.

## TLS

The `secure.mode` config controls TLS exactly like the PostgreSQL driver: `disable`,
`prefer` (the default — TLS when the server offers it, plaintext when it does not),
`require` (TLS or nothing), `verify-ca` and `verify-full`. Only the two `verify-*` modes
verify the server certificate — `verify-ca` checks the chain, `verify-full` the chain and
the peer name — which is what libpq's and MySQL's own `sslmode` do: `prefer` and `require`
encrypt without checking who signed the certificate, so the shipped defaults reach a stock
`mysql:8` image (TLS on, auto-generated self-signed certificate) at the very first
connection. `verify` opts a `prefer`/`require` connection into chain verification (`name` then
checks the host name too; `name` alone checks only the name, against any certificate). Unverified
TLS defeats passive eavesdropping only: an active on-path attacker can answer the handshake with
its own certificate and read everything, credentials included — on any network you do not trust,
use `verify-ca`/`verify-full` (or `verify => true`). With `cafile` absent, OpenSSL's default trust store applies (`openssl.cafile`,
`SSL_CERT_FILE`/`SSL_CERT_DIR`), so pin `cafile` for a private CA — a `cafile` is only read
by a verifying handshake, so one under `prefer`/`require` without `verify` is refused at
config time, and one that is not a readable file fails the connection before any byte is
sent. For a real deployment, verify:

```php
$Database = new SQL([
   'driver' => 'mysql',
   // ...
   'secure' => ['mode' => 'verify-full', 'cafile' => '/etc/mysql/ca.pem'],
]);
```

> [!NOTE]
> Since 1.0.3, `prefer` and `require` no longer verify the certificate by default — before,
> every mode but `disable` did, and a self-signed server needed `'verify' => false`. A
> `require` block that pinned a `cafile` now needs `verify-ca`/`verify-full` (or
> `'verify' => true`) to keep verifying.

## Prepared statements

Parameterized queries run through the binary protocol (`COM_STMT_PREPARE`/`EXECUTE`) with
a per-connection LRU statement cache (`statements` config key, default `256` — evictions
send `COM_STMT_CLOSE`):

```php
$Row = $Database->await($Database->query(
   'SELECT id, name FROM users WHERE mail = ? AND active = ?',
   ['ada@bootgly.com', true]
));
```

Binds map by PHP type: `int` → BIGINT, `float` → DOUBLE, `bool` → TINYINT, `null` → NULL,
`DateTimeInterface` → formatted string, everything else → string. Results hydrate with
native types; `DECIMAL` stays a string, unsigned `BIGINT` beyond `PHP_INT_MAX` stays an
exact decimal string, `DATE`/`DATETIME`/`TIMESTAMP` become `DateTimeImmutable`.

`statements => 0` disables caching entirely: each parameterized command prepares its own
statement and the driver closes it on the server right after the command completes.

## Generated keys

MySQL has no `RETURNING` — the Query Builder blocks `output()` by design. The generated id
arrives in `Result->inserted`, and the ORM backfills entity keys automatically:

```php
$Insert = $Database->await($Database->query("INSERT INTO users (name) VALUES ('Ada')"));
$Insert->Result->inserted; // LAST_INSERT_ID of the command
```

`inserted` follows the same rule as the row values above: an `int` for every id inside
`PHP_INT_MAX`, and an exact decimal string past it, since a `BIGINT UNSIGNED` key beyond 2^63
does not fit a PHP int. An entity key that must accept those ids is declared
`null|int|string`.

## Transactions

Transactions and savepoints pin one pooled connection — no driver-specific code:

```php
$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Database->await($Transaction->query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 1]));
$Database->await($Transaction->commit());
```

> **Implicit commits** — MySQL commits the open transaction whenever a DDL statement
> (`CREATE`/`ALTER`/`DROP` ...) runs inside it. Schema migrations therefore run outside
> transactions on MySQL; coordination uses `GET_LOCK` advisory locks instead.

## Cancellation

`cancel()` opens a side-channel connection, authenticates and issues
`KILL QUERY {thread}` — advisory, like the PostgreSQL `CancelRequest`: the main operation
still resolves or fails on its own socket. The side channel supports the fast
authentication paths only.

## Reference

```php
query (string $sql, array $parameters = []): Operation
```

Creates one pending operation. Without parameters it uses the text protocol
(`COM_QUERY`); with parameters, the binary prepared-statement protocol.

```php
prepare (Operation $Operation): Operation
```

Builds the wire command for the operation — `COM_QUERY`, a cached `COM_STMT_EXECUTE`, or
`COM_STMT_PREPARE` on a statement-cache miss.

```php
advance (Operation $Operation): Operation
```

Drives the connection state machine: greeting, capability negotiation, TLS, handshake
response, authentication continuations, command write and result-set read.

```php
cancel (Operation $Operation): Operation
```

Kills the in-flight command through a separate authenticated session (`KILL QUERY`).
Requires the greeting thread id; marks the operation `cancelled`.

```php
abandon (Operation $Operation): void
```

Reconciles the wire when the Pool finishes an operation from the outside — an elapsed
deadline — while the server is still answering it. A queued sibling simply leaves the
FIFO; the head is handed to a detached stand-in that drains the answer, so the operation
the Pool took back is never read, written or resolved again. When nothing can be
reconciled — the command is not whole on the wire, or no sibling is left to pump the
answer — the session is dropped instead, which is what gives the connection slot back.

The MySQL protocol is strictly request-response: there is no wire pipelining. Co-located
operations queue in a FIFO where only the head owns the socket — `check()` reports the
busy state to the Pool and `drain()` surfaces operations completed by sibling reads.

On a transport failure (socket write/read error, peer close, framing corruption) the
driver fails every queued operation, resets its session state and disconnects, so the
Pool drops the dead connection instead of keeping it busy.
