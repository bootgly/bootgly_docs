# PostgreSQL driver

`Bootgly\ADI\Databases\SQL\Drivers\PostgreSQL` implements PostgreSQL Protocol 3.0
natively — startup, authentication, TLS, simple and extended query protocols, pipelining
and cancellation — with zero dependencies. It is the default Bootgly driver.

This page covers what is particular to PostgreSQL. The connection keys, their defaults and the TLS
modes are on **[Database configuration](/manual/ADI/Database/Config/overview/)**; running a query and
reading its outcome on **[SQL database](/manual/ADI/Databases/SQL/overview/)**; waits, deadlines,
cancellation and withdrawal on **[Connection pool](/manual/ADI/Database/Pool/overview/)**.

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

$Operation = $Database->await($Database->query(
   "SELECT current_setting('server_version') AS version, current_setting('application_name') AS application"
));
$Operation->Result->row; // ['version' => '18.6 (Debian 18.6-1.pgdg13+2)', 'application' => 'Bootgly']
```

An array suits a script outside a project. In a project, build the facade from the `database`
config scope, and in an `HTTP_Server_CLI` route use `$Response->Database` — see
**[Open a database](/manual/ADI/Databases/SQL/overview/#open-a-database)**. `query()` returns a
pending `Operation`, and `await()` drives it to its end and returns it.

Every session starts with `client_encoding` set to `UTF8` and `application_name` set to `Bootgly`,
the name `pg_stat_activity` shows for it. Neither can be configured for now.

## Authentication and TLS

The driver answers the authentication method the server asks for: **cleartext**, **MD5** or
**SCRAM-SHA-256**. Channel binding is not negotiated, so a server that offers only
`SCRAM-SHA-256-PLUS` fails the connection with `PostgreSQL SCRAM-SHA-256 mechanism is not available.`
Any other method — Kerberos, GSSAPI, SSPI — fails it with
`PostgreSQL authentication method is not supported: 7.`, where the number is the method code the
server sent.

TLS is negotiated with an `SSLRequest`, before the startup message. The modes and the `verify`,
`name`, `peer` and `cafile` keys work as **[TLS](/manual/ADI/Database/Config/overview/#tls)**
describes: `peer` is the name the certificate must carry, also sent as SNI, and only `cafile` pins
the CA that must have signed it. On PostgreSQL:

- `disable` sends no `SSLRequest`.
- A server that refuses TLS answers the request with `N`. Under `prefer` the session goes on in
  plaintext; under `require`, `verify-ca` and `verify-full` the connection fails with
  `PostgreSQL server refused required TLS.`
- A handshake that fails after the server accepted — a certificate the checks reject included —
  fails the connection under every mode, with `PostgreSQL TLS handshake failed:` and the OpenSSL
  diagnostic. The driver never retries in plaintext.

When a server refuses the `SSLRequest` under `prefer` and then asks for a **cleartext** or **MD5**
password, the driver does not send it — an on-path attacker can force that very refusal — and fails
the connection with an error naming `secure.mode => 'disable'`, the declared way to authenticate in
plaintext. SCRAM-SHA-256 never sends the password and proceeds — at an iteration floor of 4096
(PostgreSQL's default and RFC 7677's minimum; a cheaper count is refused the same way, as its proof
would be as crackable offline as an MD5 response, and a repeated or malformed count fails the
connection) — and on any session never above 10,000,000 iterations, which would stall the worker. A
loopback host (`127.0.0.0/8`, `::1`, `localhost`) is exempt, as no attacker stands between the
client and the server there; each read replica is judged by its own host and mode. Since 1.0.10.

## Parameters

Placeholders are numbered — `$1`, `$2` … — and the values bind in array order:

```php
$Database->await($Database->query(
   'CREATE TABLE events (id int PRIMARY KEY, title text, starts timestamptz, score float8, archived bool)'
));

$Database->await($Database->query(
   'INSERT INTO events (id, title, starts, score, archived) VALUES ($1, $2, $3, $4, $5)',
   [1, 'Launch', '2026-11-05 09:30:00-03:00', 9.5, false]
));

$Operation = $Database->await($Database->query('SELECT title, score FROM events WHERE id = $1', [1]));
$Operation->Result->row; // ['title' => 'Launch', 'score' => 9.5]
```

Keys are ignored — only the order counts, so `['b' => 2, 'a' => 1]` binds `2` to `$1`. A missing
value fails with
`bind message supplies 1 parameters, but prepared statement "bootgly_…" requires 2` (`08P01`). A
surplus `int`, `bool` or `float` is accepted and left unused; a surplus string or `null` fails with
`could not determine data type of parameter $2` (`42P18`), since nothing in the SQL gives it a type.
Each value gives its placeholder a type when the statement is parsed:

| PHP value | Placeholder type |
| --- | --- |
| `int` | `integer`, or `bigint` when the value does not fit `integer` |
| `bool` | `boolean` |
| `float` | `double precision` |
| `string` | none: the server infers it |
| `null` | none, unless the SQL casts the placeholder: `$1::int` |

A string or a `null` has no type of its own, so the server infers one from where the placeholder
stands — the column it is compared with or stored in, an operator, a `$N::type` cast. `'1'` matches
an `integer` column; `'abc'` fails there with `invalid input syntax for type integer: "abc"`
(`22P02`). An `int` does not adapt the same way: compared with a `text` column, it fails with
`operator does not exist: text = integer` (`42883`) — bind a string, or cast the placeholder:
`$1::text`. Where nothing gives a string or a `null` a type — a bare `$1 IS NULL`, or a function that
accepts any type, such as `jsonb_build_object()` — the statement fails with
`could not determine data type of parameter $1` (`42P18`). Cast the placeholder:

```php
$Operation = $Database->await($Database->query(
   "SELECT jsonb_build_object('note', $1::text) AS doc",
   [null]
));
$Operation->Result->cell; // '{"note": null}'
```

`DateTimeInterface` values, arrays and objects — `Stringable` ones included — are refused: `query()`
fails the operation with `PostgreSQL parameter must be scalar or null.` before anything is sent, and
`await()` throws it. Format a date first, keeping its offset (`P`): without one, a `timestamptz`
reads the text in the session's time zone and stores another instant.

```php
use DateTimeImmutable;
use RuntimeException;

$Starts = new DateTimeImmutable('2026-11-05 09:30:00-03:00');

try {
   $Database->await($Database->query('UPDATE events SET starts = $1 WHERE id = $2', [$Starts, 1]));
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // PostgreSQL parameter must be scalar or null.
}

$Database->await($Database->query(
   'UPDATE events SET starts = $1 WHERE id = $2',
   [$Starts->format('Y-m-d H:i:s.uP'), 1]
));
```

Date and time columns still come back as `DateTimeImmutable` (see [Results](#results)), so a value
read from one must be formatted before it is bound again. For the same reason, an ORM entity with a
writable `DateTimeImmutable` column fails on `save()` with the same message for now. MySQL and SQLite
bind a date as it is; **[SQL types](/manual/ADI/Databases/SQL/Drivers/Types/overview/)** compares the
three drivers.

## Prepared statements

A query with parameters runs through the extended protocol (`Parse`/`Bind`/`Describe`/`Execute`/
`Sync`), and each connection keeps an LRU cache of the statements it parsed (`statements` config
key, default `256`). On a `users` table:

```php
$Database->await($Database->query(
   'CREATE TABLE users (id serial PRIMARY KEY, name text NOT NULL, mail text, active bool)'
));

$Database->await($Database->query(
   "INSERT INTO users (name, mail, active) VALUES ('Ada', 'ada@bootgly.com', true)"
));

$Operation = $Database->await($Database->query(
   'SELECT id, name FROM users WHERE mail = $1 AND active = $2',
   ['ada@bootgly.com', true]
));
$Operation->Result->row; // ['id' => 1, 'name' => 'Ada']
```

A statement is named `bootgly_` followed by the SHA-1 of its SQL and of the types its parameters
declared (see [Parameters](#parameters)); `$Operation->statement` holds the name. The same SQL is
therefore parsed once per type signature: `SELECT $1::int8` bound with `1` (`integer`) and with
`5000000000` (`bigint`) makes two statements and takes two cache entries.

- The first run of a statement sends every value as text. Later runs send only
  `Bind`/`Execute`/`Sync`, and once the server has described the parameters, a boolean, a `smallint`
  or `integer` value and a float travel in binary when the PHP value fits the type the server
  reported; everything else stays text.
- Past the cap, the least recently used statement is evicted; its `Close` goes out ahead of the
  next command the connection writes.
- `statements => 0` turns the cache off: each parameterized command parses a statement of its own,
  closed ahead of the next command the connection writes.

A query without parameters goes out as one simple `Query` message and prepares nothing.

## Results

Rows come back as text and are cast by column type:

- `boolean` → `bool`; `smallint`, `integer` and `bigint` → `int`; `real` and `double precision` →
  `float`;
- `numeric` → `string`, so no digit is lost;
- `bytea` → the raw bytes, as a `string`;
- `date`, `time`, `timetz`, `timestamp` and `timestamptz` → `DateTimeImmutable` — a `time` or
  `timetz` dated today; a value PHP cannot parse, such as `infinity`, stays a string;
- any other type, such as `json`, `jsonb`, `uuid`, `interval`, `money` or an array → the server's
  text, as `'{1,2}'` for an `int[]`.

For now, a `real` or `double precision` that holds `NaN`, `Infinity` or `-Infinity` reads back as
`0.0`, with no error, although a bound `NAN`, `INF` or `-INF` is stored as it is. Select such a
column as text too, and convert it in PHP:

```php
$Database->await($Database->query('UPDATE events SET score = $1 WHERE id = $2', [INF, 1]));

$Operation = $Database->await($Database->query(
   'SELECT score, score::text AS score_text FROM events WHERE id = $1',
   [1]
));
$Operation->Result->row; // ['score' => 0.0, 'score_text' => 'Infinity']
```

**[SQL types](/manual/ADI/Databases/SQL/Drivers/Types/overview/)** puts these casts side by side with
MySQL's and SQLite's.

## Generated keys

The dialect supports `RETURNING`: the ORM appends it to the `INSERT` of a new entity and writes the
returned key back into that entity when you hydrate the operation. With the `User` entity of
**[Repositories](/manual/ADI/Databases/SQL/overview/#repositories)**, on the `users` table above:

```php
$Users = $Database->map(User::class);

$User = new User;
$User->name = 'Grace';

$Saved = $Users->hydrate($Database->await($Users->save($User)))->entity;

$Saved === $User; // true
$User->id;        // 2
```

`Result->inserted` stays `0` on PostgreSQL: read generated keys through `RETURNING`.

## Pipelining

Co-located operations pipeline on one connection: multiple in-flight commands share the
socket and resolve in FIFO order as backend messages arrive. The Pool co-locates
operations onto busy connections automatically when the pool is at capacity (see
**[Saturation and co-location](/manual/ADI/Database/Pool/overview/#saturation-and-co-location)**).

On a transport failure (socket write/read error, peer close, framing corruption) the
driver fails every pipelined operation, resets its session state and disconnects, so the
Pool drops the dead connection instead of keeping it busy.

## Cancellation

A cancel reaches the server only once the statement is there. On a pool that has not opened its
connection yet, advance the operation until it is `Reading` — its statement written — and cancel it
then:

```php
use RuntimeException;

use Bootgly\ADI\Database\Operation\OperationStates;

$Running = $Database->query('SELECT pg_sleep(30)');

while ($Running->finished === false && $Running->state !== OperationStates::Reading) {
   $Database->advance($Running);
   usleep(1000);
}

$Database->cancel($Running);

try {
   $Database->await($Running);
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // canceling statement due to user request
   $Running->code;           // 57014
}
```

`cancel()` opens a second TCP connection to the same `host` and `port` and writes a
`CancelRequest` carrying the process id and secret key the server gave the session at startup
(`BackendKeyData`), then closes it and sets `cancelled`. The request is advisory: the operation still
resolves, fails or expires on its own connection — here the server stops `pg_sleep()` with SQLSTATE
`57014`.

- The request names the session, not a statement, so it goes out only for the batch the backend is
  executing: the first one in the pipeline it has not answered yet. Before choosing, `cancel()`
  reads the answers that already arrived, up to 1 MiB, so a batch answered by then finishes with its
  own result and nothing is sent.
- A batch pipelined behind another one — another caller's, or a stand-in still draining a withdrawn
  statement — cannot be stopped without stopping that one, and a batch partly written must be
  written to its end, or the session dies with every caller on it. `cancel()` returns either one
  untouched, `cancelled` still `false`; it runs to completion, and you still await it.
- A batch not on the server yet — not written, parked behind another batch still being written, or
  composed on a connection still dialing or authenticating — is withdrawn locally by the pool with
  `Database operation was cancelled before reaching the server.`, and a connection still in its
  startup is dropped. A single `advance()` on a cold pool only starts the dial, so a cancel right
  after it withdraws the operation.
- The side channel's connect blocks the worker, for at most `timeout` (see
  **[Timeout](/manual/ADI/Database/Config/overview/#timeout)**). When it cannot connect, the
  operation fails with `PostgreSQL cancel connection failed: Connection refused.` — the reason
  varies — while the statement keeps running on the server.
- The side channel is always plaintext, whatever `secure.mode` says, `verify-full` included. It
  carries no credentials, but the process id and secret key it sends are all anyone needs to cancel
  that session's statements.

What the pool does with an operation that has not reached the server, one that already finished, or
a cancel that cannot be sent is on
**[Cancel a running statement](/manual/ADI/Database/Pool/overview/#cancel-a-running-statement)**.

> [!WARNING]
> For now, the read that comes before the request stops at 1 MiB, so it never reads a streaming
> result to its end, and it does not run at all while another batch is still being written. A batch
> whose answer arrived but was not read by then still looks running: its `CancelRequest` stops the
> batch the backend runs next — another caller's, which fails with
> `canceling statement due to user request` — while the batch you cancelled completes with its rows,
> and `cancelled` reads `true`.

## Limits

- **One statement per query.** Without parameters, `query()` sends its SQL as one simple query, and
  the server runs every `;`-separated statement in it inside one implicit transaction: an error in
  any of them rolls the others back and fails the operation. For now, their results are not kept
  apart. The rows of every statement land in one `Result`, with the `columns`, `status` and
  `affected` of the last one, so `INSERT INTO t VALUES (1); INSERT INTO t VALUES (2), (3)` reports
  `INSERT 0 2` after writing three rows. With parameters, the server refuses a second statement:
  `cannot insert multiple commands into a prepared statement` (`42601`). The three drivers are
  compared in **[SQL Drivers](/manual/ADI/Databases/SQL/Drivers/overview/)**.
- **Notices accumulate.** The driver keeps every notice and warning the server sends on a
  connection — a `RAISE NOTICE`, the `already exists, skipping` of a `CREATE TABLE IF NOT EXISTS` —
  for the connection's life, and nothing releases them for now. SQL that raises notices on a hot path
  makes a long-lived worker's memory grow until `memory_limit` ends the process. Have the server stop
  sending them to the application's role, for the sessions opened afterwards:
  `ALTER ROLE app SET client_min_messages = warning;`

## Errors

A server error keeps its primary message in `error` and its SQLSTATE in `code` (see
**[Read the outcome](/manual/ADI/Databases/SQL/overview/#read-the-outcome)**). The driver's own
failures carry no `code`:

| Message | Cause |
| --- | --- |
| `PostgreSQL connection failed: 127.0.0.1:5432 refused the connection (ECONNREFUSED).` | Nothing listens on `host`:`port` |
| `PostgreSQL connection failed: 127.0.0.1:5432 closed the connection during SSL negotiation; the server may still be starting.` | The peer hung up before answering the `SSLRequest` |
| `PostgreSQL server refused required TLS.` | The server refused TLS under `require`, `verify-ca` or `verify-full` |
| `PostgreSQL TLS handshake failed: …` | The handshake or a certificate check failed |
| `PostgreSQL server 10.0.0.12:5432 declined TLS and then requested cleartext password authentication: …` | A downgrade under `prefer`, on a non-loopback host; an `MD5` request reads the same, with `MD5` in place of `cleartext` |
| `PostgreSQL server 10.0.0.12:5432 declined TLS and then requested SCRAM with 1000 iterations (below 4096): …` | The same downgrade, with a SCRAM iteration count below 4096 |
| `PostgreSQL SCRAM-SHA-256 mechanism is not available.` | The server offers only `SCRAM-SHA-256-PLUS` |
| `PostgreSQL authentication method is not supported: 7.` | Kerberos, GSSAPI, SSPI or another method |
| `PostgreSQL SASL server signature is invalid.` | The server's final SCRAM message does not prove it knows the password |
| `PostgreSQL parameter must be scalar or null.` | A `DateTimeInterface`, array or object parameter |
| `PostgreSQL cancellation requires BackendKeyData.` | `cancel()` on a running statement of a session that never sent the driver its keys |
| `PostgreSQL cancel connection failed: Connection refused.` | The cancel side channel could not connect |
| `PostgreSQL cancel request write failed.` | The side channel took less than the whole `CancelRequest` |

## Reference

The driver of an operation's connection is `$Operation->Protocol`. The Pool calls its methods; an
application reads its properties.

```php
query (string $sql, array $parameters = []): Operation
```

Creates one pending operation. Without parameters it uses the simple query protocol;
with parameters, the extended protocol with the statement cache.

```php
prepare (Operation $Operation): Operation
```

Builds the wire messages for the operation — `Query` without parameters;
`Parse + Describe + Bind + Describe + Execute + Sync` on a cache miss; `Bind + Execute + Sync` on a
hit, with a `Describe` before `Execute` while the result layout is not known yet. Fails the
operation with `PostgreSQL parameter must be scalar or null.` for a parameter it cannot send.

```php
advance (Operation $Operation): Operation
```

Drives the connection state machine: connect, SSL negotiation, startup, authentication,
command write and backend message read.

```php
owe (Operation $Operation): bool
```

Whether the server owes the operation an answer, which the Pool asks before it sends a cancel:
`true` once its batch is whole on the wire — it is then in the pipeline — and for the batch holding
the write stream once part of it is out, whose remainder must follow: after a credited byte, or from
the start over TLS, where a record may already hold some. A batch not written yet or parked behind
another writer, and a session still in its startup, are owed nothing: the Pool withdraws them
locally.

```php
cancel (Operation $Operation): Operation
```

Writes the advisory `CancelRequest` through a plaintext side channel for the batch the backend is
executing — the first in the pipeline it has not answered — and marks the operation `cancelled`
once it is sent. Unless another batch is still being written, it first reads what already arrived,
up to 1 MiB, so a batch answered by then finishes with its own result and nothing is sent. Any other
batch — pipelined behind another, or still being written — is returned untouched, with `cancelled`
`false`. Fails the operation with `PostgreSQL cancellation requires BackendKeyData.` when the
session never sent the driver its keys, and with `PostgreSQL cancel connection failed: <reason>.` or
`PostgreSQL cancel request write failed.` when the side channel breaks.

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
response whose wait was refused or interrupted, or whose request Fiber was destroyed), and when
`Pool::cancel()` withdraws one the server owes nothing (`owe()`). A pipelined batch always ends in
`Sync`, so the backend keeps answering it: the pipeline slot is handed to a detached stand-in that
absorbs the remaining messages up to its `ReadyForQuery`, keeping every session effect the driver
owes itself (statement caching, evictions) while the operation the Pool took back is never read,
written or resolved again. No reader is required. `check()` ignores stand-ins, so the connection
goes back to `idle` — unless other callers still read there — and the next operation handed to it
queues behind them and drains them; `$detached` reports that the session still owes answers to
stand-ins.

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

```php
check (): bool
```

Whether the driver still owes work to a caller, so the Pool must not lend the connection yet: an
unfinished operation in the pipeline that somebody waits for, or a batch another caller is still
flushing. Detached stand-ins do not count.

```php
drain (): array
```

Returns the operations that finished while the driver read on behalf of another one — pipelined
siblings answered in the same read — and forgets them, so the Pool can release their slots.

```php
sever (Operation $Operation, string $error): void
```

Ends the session: fails every operation it still owes with `$error` and disconnects. The Pool
calls it when a statement it retired left the server in a state nobody can resolve, such as a
transaction teardown that never arrived.

```php
public private(set) array $parameters
```

The run-time parameters the server reported for the session (`ParameterStatus`), by name —
`server_version`, `TimeZone`, `client_encoding`, `application_name` and the rest the server sends.

```php
public private(set) int $backendProcess
```

The process id of the session's backend, as `pg_backend_pid()` returns it; `0` until startup
delivered it.

```php
public bool $detached { get; }
```

Whether the session still owes answers to detached stand-ins, a pending session reset included.
