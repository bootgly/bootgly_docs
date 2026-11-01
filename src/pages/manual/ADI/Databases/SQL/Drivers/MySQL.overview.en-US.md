# MySQL driver

`Bootgly\ADI\Databases\SQL\Drivers\MySQL` implements the MySQL client protocol natively —
handshake, authentication, TLS, text and binary (prepared) protocols — with zero
dependencies. It speaks to **MySQL 5.7+/8.x** and **MariaDB**.

This page covers what is particular to MySQL. The connection keys, their defaults and the TLS modes
are on **[Database configuration](/manual/ADI/Database/Config/overview/)**; running a query and
reading its outcome on **[SQL database](/manual/ADI/Databases/SQL/overview/)**; waits, deadlines,
cancellation and withdrawal on **[Connection pool](/manual/ADI/Database/Pool/overview/)**.

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
$Operation->Result->cell; // '8.4.11'
```

The array sets `port` and `username` because the defaults are a local PostgreSQL's whatever the
`driver` — left out, they dial `127.0.0.1:5432` as `postgres` (see
**[Keys and defaults](/manual/ADI/Database/Config/overview/#keys-and-defaults)**). An array suits a
script outside a project. In a project, build the facade from the `database` config scope, and in
an `HTTP_Server_CLI` route use `$Response->Database` — see
**[Open a database](/manual/ADI/Databases/SQL/overview/#open-a-database)**. `query()` returns a
pending `Operation`, and `await()` drives it to its end and returns it.

Every session uses the `utf8mb4` character set with the `utf8mb4_general_ci` collation (what
`@@collation_connection` reports), which cannot be configured for now.

## Authentication

The driver supports the two password plugins, including a plugin switch requested by the server:

- `mysql_native_password` — SHA1 challenge-response;
- `caching_sha2_password` (the MySQL 8 default) — the SHA256 fast path while the server has the
  user's password cached; otherwise the **full authentication** path — the first connection of a
  user after a server restart or a `FLUSH PRIVILEGES` — sends the password over TLS, or encrypts it
  with a **pinned server RSA public key** over plaintext.

Any other plugin — `sha256_password`, `mysql_clear_password`, MariaDB's `ed25519` — fails the
connection with `MySQL authentication plugin is not supported: sha256_password.`, naming the
plugin. An empty `password` skips that check: the driver then answers any plugin with an empty
response and leaves the verdict to the server, so a passwordless `sha256_password` account
connects.

> **Security** — over plaintext the driver never requests the RSA key from the server:
> an active MITM could substitute its own key and decrypt the password. The same attacker
> reads it through an unverified TLS handshake (`prefer`/`require` without `verify` — the
> shipped default), so verify the certificate on any untrusted network (see [TLS](#tls)). Full
> authentication without TLS fails with
> ``MySQL caching_sha2_password full authentication over plaintext requires TLS or a pinned server public key (secure `key`).``
> unless you pin the server public key locally:

```php
$Database = new SQL([
   'driver' => 'mysql',
   'host' => '127.0.0.1',
   'port' => 3306,
   'database' => 'app',
   'username' => 'root',
   'password' => 'secret',
   'secure' => [
      'mode' => 'disable',
      'key' => '/etc/app/mysql-server-public.pem',
   ],
]);
```

`key` takes a file path, a `file://` URL or the PEM text itself; one that cannot be loaded fails
the connection with `MySQL server RSA public key is invalid.` A stock `mysql:8` image keeps the key
in `/var/lib/mysql/public_key.pem`, and `SHOW STATUS LIKE 'Caching_sha2_password_rsa_public_key'`
returns it over a connection you trust.

In the Demo config the pin binds to the `DB_SERVER_PUBLIC_KEY` environment key. For HTTP routes
that use `Database::provide()`, that key cannot currently come from a `.env` file: it is not among
the `.env` keys `provide()` accepts, so in `configs/database/.env` it makes the scope fail to load
with the `Enable DB_ENABLED=true…` error. Set it in the process environment, write the key as the
literal `default:` of `Secure->Key` in `database.Config.php`, or build the resource with a factory
of your own (scripts and `bootgly project … migrate` / `seed` read it from `.env` fine; see
**[Keys a `.env` file may set](/guide/database-dbal/overview/#keys-a-env-file-may-set)**). With TLS
active (`secure.mode` ≠ `disable`) no pin is needed. Note that only the *full* path is
affected: the everyday fast path works over plaintext with the regular scramble.

## TLS

The server's greeting says whether it offers TLS, and the driver switches to TLS before it
authenticates. The modes and the `verify`, `name`, `peer` and `cafile` keys work as
**[TLS](/manual/ADI/Database/Config/overview/#tls)** describes; on MySQL:

- `disable` never asks for TLS.
- A greeting that does not offer TLS is a refusal. Under `prefer` the session goes on in plaintext;
  under `require`, `verify-ca` and `verify-full` the connection fails with
  `MySQL server refused required TLS.`
- A handshake that fails — a certificate the checks reject included — fails the connection under
  every mode, with `MySQL TLS handshake failed:` and the OpenSSL diagnostic. The driver never falls
  back to plaintext.

A stock `mysql:8` image offers TLS with certificates it generates itself, so `prefer` and `require`
reach it at the first connection. To verify it, copy its CA out of the container
(`/var/lib/mysql/ca.pem`) and pin it:

```php
$Database = new SQL([
   'driver' => 'mysql',
   'host' => '127.0.0.1',
   'port' => 3306,
   'database' => 'app',
   'username' => 'root',
   'password' => 'secret',
   'secure' => ['mode' => 'verify-ca', 'cafile' => '/etc/app/mysql-ca.pem'],
]);
```

`verify-full` also checks the name, and the generated server certificate carries
`MySQL_Server_<version>_Auto_Generated_Server_Certificate`, not your host — on MySQL 8.4.11 the
handshake fails with
``MySQL TLS handshake failed: stream_socket_enable_crypto(): Peer certificate CN=`MySQL_Server_8.4.11_Auto_Generated_Server_Certificate' did not match expected CN=`127.0.0.1'``.
Give the server a certificate for its host name, or set that name as `peer`.

## Parameters

Placeholders are `?`, and the values bind in array order — keys are ignored:

```php
use DateTimeImmutable;

$Database->await($Database->query(
   'CREATE TABLE events (id INT PRIMARY KEY, title VARCHAR(100), starts DATETIME(6), score DOUBLE, archived BOOLEAN)'
));

$Database->await($Database->query(
   'INSERT INTO events (id, title, starts, score, archived) VALUES (?, ?, ?, ?, ?)',
   [1, 'Launch', new DateTimeImmutable('2026-11-05 09:30:00.123456'), 9.5, false]
));

$Operation = $Database->await($Database->query('SELECT title, score, archived FROM events WHERE id = ?', [1]));
$Operation->Result->row; // ['title' => 'Launch', 'score' => 9.5, 'archived' => 0]
```

Each value is bound with the type its PHP type maps to:

| PHP value | Bound as |
| --- | --- |
| `int` | `BIGINT` |
| `float` | `DOUBLE` |
| `bool` | `TINYINT`: `1` or `0` |
| `null` | `NULL` |
| `string` | `VAR_STRING` |
| `DateTimeInterface` | `VAR_STRING`, formatted `Y-m-d H:i:s.u` in the object's own time zone — the offset is dropped |

An array, or an object that is not a `DateTimeInterface` — a `Stringable` one included — fails the
operation with `MySQL cannot bind the parameter at position 1.`, counting positions from `0`;
`await()` throws it, and the connection stays usable — also when the command was composed while
the `COM_STMT_PREPARE` of the same SQL was still in flight, and binds its values only once it
reaches the head of the queue.
**[SQL types](/manual/ADI/Databases/SQL/Drivers/Types/overview/)** compares these bindings with
PostgreSQL's and SQLite's.

Pass exactly one value per placeholder. The driver checks the count against the placeholders the
server declared when it prepared the statement, and fails the operation before the statement runs,
with no server error code (`code` is `null`): `SELECT ? AS a, ? AS b` bound with `[1, 2, 3]` fails
with `MySQL statement expects 2 parameters, 3 given.`, and bound with `[5]` with
`MySQL statement expects 2 parameters, 1 given.` Values for SQL with no placeholder fail the same
way (`expects 0 parameters`). The statement stays cached: it is valid, only the call is wrong.

## Prepared statements

A query with parameters runs through the binary protocol: `COM_STMT_PREPARE` once, then
`COM_STMT_EXECUTE` on every run, with a per-connection LRU statement cache keyed by the SQL text
(`statements` config key, default `256`). On a `users` table:

```php
$Database->await($Database->query(
   'CREATE TABLE users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(100) NOT NULL, mail VARCHAR(100), active BOOLEAN)'
));

$Database->await($Database->query(
   "INSERT INTO users (name, mail, active) VALUES ('Ada', 'ada@bootgly.com', TRUE)"
));

$Operation = $Database->await($Database->query(
   'SELECT id, name FROM users WHERE mail = ? AND active = ?',
   ['ada@bootgly.com', true]
));
$Operation->Result->row; // ['id' => 1, 'name' => 'Ada']
```

- Past the cap, the least recently used statement is evicted; its `COM_STMT_CLOSE` goes out ahead
  of the next command the connection writes.
- `statements => 0` turns the cache off: each parameterized command prepares a statement of its
  own, closed ahead of the next command the connection writes.

A query without parameters goes out as one `COM_QUERY` and prepares nothing.

## Results

A query without parameters reads its rows in the text protocol, one with parameters in the binary
protocol; both are cast by column type:

- `TINYINT` — `BOOLEAN` included —, `SMALLINT`, `MEDIUMINT`, `INT`, `BIGINT` and `YEAR` → `int`; a
  `BIGINT UNSIGNED` past `PHP_INT_MAX` → an exact decimal `string`;
- `FLOAT` and `DOUBLE` → `float`; `DECIMAL` → `string`, so no digit is lost;
- `DATE`, `DATETIME` and `TIMESTAMP` → `DateTimeImmutable`; a zero date (`0000-00-00`) stays a
  string;
- `TIME` → `string`, since a duration can pass 24 hours (`'838:59:59'`);
- any other type, such as `JSON`, `ENUM`, `SET` or text → a `string`; `BIT` and `BLOB` → the raw
  bytes.

A `BOOLEAN` therefore reads back as `1` or `0`, not as `true` or `false`. A `FLOAT`, which MySQL
stores in single precision, reads `1.1` in the text protocol and `1.100000023841858` in the binary
one. **[SQL types](/manual/ADI/Databases/SQL/Drivers/Types/overview/)** puts these casts side by side
with PostgreSQL's and SQLite's.

## Generated keys

MySQL has no `RETURNING` — the Query Builder blocks `output()` by design. The generated id
arrives in `Result->inserted`, and the ORM backfills entity keys automatically. On the `users` table
above:

```php
$Insert = $Database->await($Database->query("INSERT INTO users (name) VALUES ('Grace')"));
$Insert->Result->inserted; // 2
```

`inserted` is the `AUTO_INCREMENT` value the statement generated — the first one, for a multi-row
`INSERT`. It follows the same rule as the row values above: an `int` for every id inside
`PHP_INT_MAX`, and an exact decimal string past it, since a `BIGINT UNSIGNED` key beyond 2^63
does not fit a PHP int. An entity key that must accept those ids is declared
`null|int|string`.

## Transactions

Transactions and savepoints pin one pooled connection — no driver-specific code:

```php
$Database->await($Database->query('CREATE TABLE accounts (id INT PRIMARY KEY, balance INT)'));
$Database->await($Database->query('INSERT INTO accounts (id, balance) VALUES (1, 500)'));

$Transaction = $Database->begin();
$Database->await($Transaction->Operation);

$Database->await($Transaction->query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [100, 1]));
$Database->await($Transaction->commit());
```

> **Implicit commits** — MySQL commits the open transaction whenever a DDL statement
> (`CREATE`/`ALTER`/`DROP` ...) runs inside it. Schema migrations therefore run outside
> transactions on MySQL; coordination uses `GET_LOCK` advisory locks instead.

## Command queue

The MySQL protocol is strictly request-response: there is no wire pipelining. Co-located
operations queue in a FIFO where only the head owns the socket, and the next command is written
once the head has its answer — `check()` reports the busy state to the Pool and `drain()` surfaces
operations completed by sibling reads.

On a transport failure (socket write/read error, peer close, framing corruption) the
driver fails every queued operation, resets its session state and disconnects, so the
Pool drops the dead connection instead of keeping it busy.

## Cancellation

A cancel reaches the server only once the statement is there. On a pool that has not opened its
connection yet, advance the operation until it is `Reading` — its command written — and cancel it
then:

```php
use Bootgly\ADI\Database\Operation\OperationStates;

$Running = $Database->query('SELECT SLEEP(30) AS slept');

while ($Running->finished === false && $Running->state !== OperationStates::Reading) {
   $Database->advance($Running);
   usleep(1000);
}

$Database->cancel($Running);

$Database->await($Running)->Result->row; // ['slept' => 1]
```

`cancel()` opens a second connection to the same `host` and `port`, authenticates it as the same
user, sends `KILL QUERY` with the thread id the server's greeting gave the session and reads the
answer, then closes that connection; `cancelled` is set once the server accepts the kill. The kill
is advisory: the operation still resolves or fails on its own connection. A function can just
return early — `SLEEP()` returns `1`, as above — and the operation finishes normally; a statement
interrupted while it reads or computes rows fails instead, with
`1317: Query execution was interrupted` (`code` `1317`).

- The kill goes out only for the command the session is executing: the head of the queue, whole on
  the wire. Anything else is not on the server yet, and the pool withdraws it locally with
  `Database operation was cancelled before reaching the server.`: a command queued behind another
  one, which just leaves the queue; an operation still dialing or authenticating, which takes its
  half-open connection with it; and a parameterized command while only its `COM_STMT_PREPARE` is
  out. That one already reads `Reading`, since the driver writes its `COM_STMT_EXECUTE` only once
  the prepare is answered, and it is never executed. A single `advance()` on a cold pool only
  starts the dial, so a cancel right after it withdraws the operation.
- A command still being written is left running: the rest of it must follow, or the session dies
  with every command queued on it. So is a command whose kill the server refuses — with
  `Unknown thread id`, say, from a server that no longer knows the session. Either way `cancel()`
  returns the operation untouched, `cancelled` still `false`, and you still await it.
- The side channel is one more session on the server while it lasts, so it counts against
  `max_connections`. Its connect, reads and writes block the worker, the connect for at most
  `timeout` (see **[Timeout](/manual/ADI/Database/Config/overview/#timeout)**). When it cannot
  connect, the operation fails with `MySQL cancel connection failed: Connection refused.` — the
  reason varies — while the statement keeps running on the server.
- The side channel ignores `secure` and always runs in plaintext, so it supports only the fast
  authentication paths. A user whose password the server no longer has cached fails it with
  `MySQL cancel requires fast authentication on the side channel.`, and a user created with
  `REQUIRE SSL` with `MySQL cancel authentication rejected.`; in both cases the statement keeps
  running.

What the pool does with an operation that has not reached the server, one that already finished, or
a cancel that cannot be sent is on
**[Cancel a running statement](/manual/ADI/Database/Pool/overview/#cancel-a-running-statement)**.

> [!WARNING]
> For now, a kill that lands while the server is still sending a result's column definitions fails
> the operation with a driver error that starts with `MySQL length-encoded string overruns the packet:`
> instead of `1317`, and drops the session along with every command queued on it.

## Limits

- **One statement per query.** The driver does not enable multi-statements, so a string with two
  statements — `SELECT 1 AS a; SELECT 2 AS b` — fails before any of it runs:
  `1064: You have an error in your SQL syntax; …`.
- **Stored procedures.** `CALL` returns the procedure's first result set and drains the others, so
  the session stays usable.
- **No `LOAD DATA LOCAL INFILE`.** The driver does not offer local files, so the server refuses the
  statement — `3948: Loading local data is disabled; this must be enabled on both the client and server sides`,
  even with `local_infile` on — and the session stays usable. A server that asks for a file anyway
  gets the session closed: the statement, and every command queued behind it, fails with
  `MySQL LOCAL INFILE requests are not supported.`
- **Changed rows.** `affected` counts the rows a statement changed, not the rows it matched: an
  `UPDATE` that writes a value a row already holds counts `0` for it.

The three drivers are compared in **[SQL Drivers](/manual/ADI/Databases/SQL/Drivers/overview/)**.

## Errors

A server error reaches `error` as `<errno>: <message>` and `code` as the errno (see
**[Read the outcome](/manual/ADI/Databases/SQL/overview/#read-the-outcome)**) — the error the
server sends in place of its greeting included, such as `1040: Too many connections`. The driver's
own failures carry no `code`:

| Message | Cause |
| --- | --- |
| `MySQL connection failed: 127.0.0.1:3306 refused the connection (ECONNREFUSED).` | Nothing listens on `host`:`port` |
| `MySQL server does not support protocol 4.1.` | The server predates the 4.1 protocol |
| `MySQL server refused required TLS.` | The greeting offers no TLS under `require`, `verify-ca` or `verify-full` |
| `MySQL TLS handshake failed: …` | The handshake or a certificate check failed |
| `MySQL authentication plugin is not supported: sha256_password.` | The account uses another plugin, and `password` is not empty |
| ``MySQL caching_sha2_password full authentication over plaintext requires TLS or a pinned server public key (secure `key`).`` | Full authentication without TLS or a pinned `key` |
| `MySQL server RSA public key is invalid.` | The pinned `key` cannot be loaded |
| `MySQL cannot bind the parameter at position 1.` | An array or object parameter |
| `MySQL LOCAL INFILE requests are not supported.` | The server asked for a local file |
| `MySQL cancellation requires the greeting thread id.` | `cancel()` on a running command of a session whose greeting the driver never read |
| `MySQL cancel connection failed: Connection refused.` | The cancel side channel could not connect |
| `MySQL cancel requires fast authentication on the side channel.` | The side channel needs full authentication |
| `MySQL cancel authentication rejected.` | The server refused the side channel's login |

## Reference

The driver of an operation's connection is `$Operation->Protocol`. The Pool calls its methods; an
application reads its properties.

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
owe (Operation $Operation): bool
```

Whether the server owes the operation an answer, which the Pool asks before it sends a cancel. Only
the head of the queue writes, so it is `true` for the head once its command is whole on the wire —
for a parameterized command on a statement-cache miss, once its `COM_STMT_EXECUTE` is, not just the
`COM_STMT_PREPARE` before it — and for a head partly written, whose remainder must follow. A command
queued behind the head, and a session still in its handshake, are owed nothing: the Pool withdraws
them locally.

```php
cancel (Operation $Operation): Operation
```

Kills the command the session is executing — the head, whole on the wire (`owe()`) — through a
separate, plaintext session (`KILL QUERY`), and marks the operation `cancelled` once the server
answers the kill with OK. Any other operation, and one whose kill the server refuses, is returned
untouched, with `cancelled` `false`. Fails the operation with
`MySQL cancellation requires the greeting thread id.` when the driver never read the session's
greeting, and with one of the `MySQL cancel …` messages above when the side channel cannot connect
or log in.

```php
abandon (Operation $Operation): void
```

Reconciles the wire when the Pool finishes an operation from the outside — an elapsed
deadline, a cancel that never reached the server, a transaction teardown — while the server
is still answering it. Draining needs a reader, so the session is kept only while a live
sibling is queued behind the head to pump the answer (and a sibling leaving the FIFO behind a
stand-in head keeps it only while another sibling stays behind that head). With none, the
session is dropped instead, which is what gives the connection slot back. Every other case
reconciles as `detach()` does.

```php
detach (Operation $Operation): void
```

Reconciles the wire when a caller stops waiting for an operation (`Pool::withdraw()`: a
deferred response whose wait was refused or interrupted, or whose request Fiber was
destroyed), and when `Pool::cancel()` withdraws one the server owes nothing (`owe()`). A
queued sibling simply leaves the FIFO; the head is handed to a detached stand-in that drains
the answer — for a head with only its `COM_STMT_PREPARE` out, the prepare-OK, and its
`COM_STMT_EXECUTE` is never written — so the operation the Pool took back is never read, written
or resolved again. No reader is required: `check()` ignores a stand-in head, so the
connection goes back to `idle` — unless other callers still read there — and the next
operation handed to it queues behind the stand-in and pumps it; `$detached` reports that
the session still owes the stand-in's answer. Only a command that never made it whole onto
the wire drops the session.

```php
reset (): bool
```

Writes the session reset `DO RELEASE_ALL_LOCKS()`, which releases every named lock (`GET_LOCK`)
the session holds. The Pool asks for it as it returns a tainted session to `idle`, where nobody else
owes work on it. The server reads it once it finishes the response in progress, even if nobody
reads, and its OK — or the ERR of a server without that function — is absorbed like a stand-in's
before any queued command is written (`$detached` counts it). It sits behind a head whose command is
whole on the wire and ahead of every command not written yet. A command half on the wire is never
interleaved: the reset is refused. A reset still owed covers every later request: only the head
writes, and a queued command becomes the head only once the reset is drained, so whatever is queued
behind it never reached the server. Returns `false` when it is refused, when the stream takes less
than the whole reset, or when the session is gone, and the Pool then severs the session. Session
variables (`SET`) are not reset.

```php
check (): bool
```

Whether the driver still owes work to a caller, so the Pool must not lend the connection yet: a
queued or in-flight command somebody waits for. A stand-in head and a pending session reset do not
count.

```php
drain (): array
```

Returns the operations that finished while the driver read on behalf of another one — queued
siblings answered while the head was pumped — and forgets them, so the Pool can release their
slots.

```php
sever (Operation $Operation, string $error): void
```

Ends the session: fails every operation it still owes with `$error` and disconnects. The Pool
calls it when a statement it retired left the server in a state nobody can resolve, such as a
transaction teardown that never arrived.

```php
public private(set) int $thread
```

The session's thread id, from the server's greeting — what `CONNECTION_ID()` returns and what
`KILL QUERY` names; `0` until the greeting arrived.

```php
public private(set) string $version
```

The server version the greeting announced, such as `8.4.11`.

```php
public private(set) string $plugin
```

The authentication plugin of the session: the one the greeting proposed, or the one the server
switched to.

```php
public bool $detached { get; }
```

Whether the session still owes the answer of a detached stand-in head, or of a session reset
written behind it.
