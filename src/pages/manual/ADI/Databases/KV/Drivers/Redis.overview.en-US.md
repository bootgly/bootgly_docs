# Redis driver

`Bootgly\ADI\Databases\KV\Drivers\Redis` speaks RESP natively over the asynchronous DBAL pool — a
non-blocking TCP dial, implicit TLS, the `AUTH`/`SELECT` preamble and pipelining — through the shared
`Bootgly\ABI\Data\RESP` codec, with zero dependencies: it does not use `ext-redis`, even when it is
loaded. It is the only driver of the KV facade, registered as `redis`.

This page covers what is particular to Redis. The connection keys, their defaults and the TLS modes
are on **[Database configuration](/manual/ADI/Database/Config/overview/)**; running a command and
reading its reply on **[KV database](/manual/ADI/Databases/KV/overview/)**; waits, deadlines,
cancellation and withdrawal on **[Connection pool](/manual/ADI/Database/Pool/overview/)**; how KV
compares with SQL on **[Databases](/manual/ADI/Databases/overview/)**.

## Connecting

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'secure' => ['mode' => 'disable'], // a plaintext Redis is declared, never inferred
]);

$Operation = $KV->await($KV->command('PING'));
$Operation->response; // 'PONG'
$KV->Pool->created;   // 1
```

An array suits a script outside a project, and it spells out `driver` and `port`, whose defaults are
a local PostgreSQL's (see **[Keys and defaults](/manual/ADI/Database/Config/overview/#keys-and-defaults)**).
In a project, build the facade from the `kv` config scope, and in an `HTTP_Server_CLI` route use
`$Response->KV` — see **[Open a KV database](/manual/ADI/Databases/KV/overview/#open-a-kv-database)**.
Building the facade opens nothing: the first command dials, and each connection of the pool is one
TCP socket to `host`:`port`.

- The TCP dial does not block. `advance()` starts it and returns, and the command moves on once the
  socket has a peer. A dial still in flight when the command's deadline passes fails it with
  `Database operation timed out after 30 seconds.`, the configured `timeout` in place of `30`.
- Once the socket is connected — before any TLS handshake — the driver turns off Nagle's algorithm
  (`TCP_NODELAY`), so a small command goes out at once instead of waiting for the server to
  acknowledge the one before it. That takes `ext-sockets`; without it, the socket keeps the system's
  setting.
- A dial that fails names the endpoint and the cause, as in
  `Redis connection failed: 127.0.0.1:6379 refused the connection (ECONNREFUSED).`; the texts of the
  other causes — a reset, an unreachable host or network, a dial that timed out, a PHP without
  `ext-sockets` — are in **[Failures](/manual/ADI/Database/overview/#failures)**. A failed dial is
  never a TLS refusal, so `prefer` does not downgrade on a closed port. A host name that does not
  resolve fails first, with PHP's own message, whose end comes from the system resolver and varies
  with it:
  `Database connection failed: php_network_getaddresses: getaddrinfo for redis.invalid failed: Name or service not known`,
  and `… failed: No address associated with hostname` for a missing name under a real domain.
- Resolving a host name does block: the `advance()` that starts a dial waits for the system resolver
  — a DNS round trip, or as long as a slow resolver takes — and in a worker, the whole event loop
  waits with it. And for now the dial tries only the first address the name resolves to: where
  `localhost` resolves to `::1` first, a Redis listening on `127.0.0.1` alone refuses it. Write the
  IP address.
- Every command goes out as a RESP2 array of bulk strings, which every Redis accepts. The driver
  never sends `HELLO` — replies are RESP2 unless a connection is switched (see
  [RESP3 and push frames](#resp3-and-push-frames)) — and never `CLIENT SETNAME`, so
  `CLIENT LIST` shows its connections with an empty `name`.

## Authentication and database selection

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'password' => 'secret',
   'database' => '3',
   'secure' => ['mode' => 'disable'],
]);

$Operation = $KV->await($KV->command('CLIENT', ['INFO']));
$Operation->response; // 'id=7 addr=127.0.0.1:41872 laddr=127.0.0.1:6379 fd=8 name= … db=3 … user=default redir=-1 resp=2 …'
```

The first command written on a new connection carries a preamble in the same write: `AUTH` with
`password` when it is not empty, then `SELECT` with `database` when it is all digits and not `0`.
Their replies are read and discarded before the command's own. A connection sends its preamble once;
every connection the pool dials later, or dials again after a dropped session, sends its own.

- `AUTH` carries the password alone, so the connection authenticates as Redis's `default` user. The
  driver does not read `username`: for now no config key authenticates as another ACL user.
- `database` is the index, as `'3'` or `3`. Any other value sends no `SELECT` and leaves the
  connection on database 0: `'0'`, an empty string, and every value that is not all digits — the
  default `'bootgly'`, `' 3'`, `'-1'`. A zero-padded index such as `'03'` is all digits, so it is
  sent as it is, and Redis refuses it with `ERR value is not an integer or out of range`.
- A refused preamble fails the command with the server's reply and drops the session: every command
  pipelined on that connection fails with the same message, and the next command dials again. A
  wrong password fails with `WRONGPASS invalid username-password pair or user is disabled.`, a
  password a server without one refuses with
  `ERR AUTH <password> called without any password configured for the default user. Are you sure your configuration is correct?`,
  and an index the server does not have — `'16'` with the default 16 databases — with
  `ERR DB index is out of range`.
- With `password` empty and a server that requires one, nothing goes out ahead of the command, so
  each command fails on its own with `NOAUTH Authentication required.`, and the connection stays.
- `AUTH`, `SELECT` and `HELLO` sent through `command()` change only the connection that runs them,
  and a connection dialed again comes back with the configured preamble. Set `password` and
  `database` in the config instead (see
  **[Connection state](/manual/ADI/Databases/KV/overview/#connection-state)**).

## TLS

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '10.0.0.15',
   'port' => 6380,
   'password' => getenv('KV_PASS') ?: '',
   'secure' => [
      'mode' => 'verify-full',
      'cafile' => '/run/secrets/redis-ca.pem',
      'peer' => 'redis.internal',
   ],
]);

$KV->await($KV->command('PING'))->response; // 'PONG'
```

Redis TLS is implicit: a TLS port expects a ClientHello as the first byte, with no request in the
protocol before it — PostgreSQL asks first with an `SSLRequest`. `verify-full` checks the chain
against `cafile` and the certificate's name against `peer` — the name it carries, since the host is
an address it does not name — and nothing reaches the server, `AUTH` included, before the handshake
completes. The modes and the `verify`, `name`, `peer` and `cafile` keys work as
**[TLS](/manual/ADI/Database/Config/overview/#tls)** describes. On Redis:

- `disable` sends plaintext, with no handshake attempt and no budget to pay. It is the only mode
  that reaches a plaintext Redis; against a TLS port, the first command fails with
  `Redis socket closed.`
- `require`, `verify-ca` and `verify-full` complete the handshake before the preamble and the first
  command go out. A peer that refuses TLS fails the command with
  `Redis TLS handshake failed: the peer closed the TLS handshake.` — or `reset`, or non-TLS bytes —
  and a silent one is waited for until the command's deadline, so a TLS server that answers late
  still completes the handshake, and one that never answers fails with
  `Database operation timed out after 30 seconds.`
- `prefer`, the default, tries TLS first and goes plaintext only when the peer **explicitly**
  refuses it: it reset (RST) or closed (FIN) the connection during the handshake — on the
  ClientHello or after part of a ServerHello alike — or answered with bytes that are not TLS. The
  driver then dials a new connection in plaintext, so no credential crosses the refused one, and
  records the refusal (see [Read the downgrade](#read-the-downgrade)). So `prefer` does not
  guarantee encryption: a peer that refuses TLS — or an on-path attacker who resets the first
  connection — receives `AUTH` in plaintext on the second. Where plaintext is not acceptable, use
  `require`, `verify-ca` or `verify-full`.
- Silence is not a refusal. A plaintext Redis never answers a ClientHello — it keeps the bytes in
  its query buffer — and a TLS server whose answer is late looks the same, so downgrading on silence
  would send `AUTH` in plaintext to a server that speaks TLS. Under `prefer`, a peer that has not
  answered within the handshake budget fails the command with
  `Redis TLS handshake timed out: the peer did not answer the TLS handshake within 1s — set secure.mode => 'disable' for a plaintext Redis.`
  The budget, `Redis::HANDSHAKE_BUDGET`, is one second, capped at half `timeout`: `0.5s` with
  `timeout` `1.0`, and a full second with `timeout` `0`, which sets no deadline. No other mode has
  one.
- Nothing else downgrades. An untrusted certificate, a name that does not match `peer`, a TLS alert
  or a local error — a `cafile` OpenSSL cannot load — fails the command with
  `Redis TLS handshake failed:` and OpenSSL's diagnostic, under `prefer` too.
- Only `verify-ca` and `verify-full` check the certificate. `prefer` and `require` encrypt without
  checking who answers — `'verify' => true` opts them in — so an active on-path attacker presenting
  any certificate receives `AUTH`. On a network you do not trust, use a `verify-*` mode.
- With `cafile` empty, OpenSSL's default trust store applies — `openssl.cafile` and
  `openssl.capath`, or `SSL_CERT_FILE` and `SSL_CERT_DIR` when set — so a private CA needs `cafile`.
  Only a verifying handshake reads it, so a `cafile` under `prefer` or `require` without `verify` is
  refused when the config is built. One that cannot be read fails the command before any connection
  opens, with `Database TLS cafile is not a readable file: /run/secrets/redis-ca.pem.`, and one that
  holds no certificate — or an `openssl.cafile` that holds none — fails the handshake with
  ``Redis TLS handshake failed: no valid certs found cafile stream: `/run/secrets/redis-ca.pem'``,
  whatever `error_reporting()` masks. Neither falls back to the default store, nor to plaintext.
- The `kv` config scope sets `mode`, `verify`, `peer` and `cafile` from `KV_SSLMODE`,
  `KV_SSLVERIFY`, `KV_SSLPEER` and `KV_SSLCAFILE`. It has no node for `name`, so `KV_SSLVERIFY=true`
  checks the name too; for the chain alone, use `KV_SSLMODE=verify-ca` (see
  **[Configure from the kv scope](/manual/ADI/Databases/KV/overview/#configure-from-the-kv-scope)**).

> [!NOTE]
> Since 1.0.0, `prefer` attempts TLS by default and never downgrades on a silent peer: an undeclared
> plaintext Redis — one not configured with `'secure' => ['mode' => 'disable']` — costs the
> handshake budget on every new connection and fails every command until it is declared, where
> earlier releases fell back to plaintext. Since 1.0.3, `prefer` and `require` no longer verify the
> certificate unless `verify` is set: a `require` connection that pinned a `cafile` is refused when
> its config is built, until it uses `verify-ca`, `verify-full` or `'verify' => true`.

### Trust bound to one socket

The driver records the socket it settled on — the one its handshake encrypted, or the plaintext one
of `disable` or of a `prefer` downgrade — and checks it before every write and every read. A socket
replaced underneath the driver fails the command and drops the session instead of carrying RESP
across: under a strict mode with `Redis strict TLS mode rejected a changed connection generation.` —
or `Redis strict TLS mode requires an encrypted connection.` for a socket that is not encrypted —
and under `prefer` or `disable` with `Redis connection generation changed during command I/O.`

Every new socket starts over: a new handshake or plaintext decision, a new preamble, an empty
decoder. A command half-written on the old socket is never finished on the new one, and no reply
read on the new one resolves a command written on the old one.

### Read the downgrade

```php
use Bootgly\ADI\Databases\KV\Drivers\Redis;

$Operation = $KV->await($KV->command('PING'));

if ($Operation->Protocol instanceof Redis && $Operation->Protocol->downgrade !== '') {
   error_log("Redis connection is not encrypted: {$Operation->Protocol->downgrade}");
}
```

`$Operation->Protocol` is the driver of the connection the command ran on, and its `downgrade`
records the refusal `prefer` downgraded that connection on:

| `downgrade` starts with | The peer |
|---|---|
| `the peer closed the TLS handshake` | Closed the connection during the handshake (FIN) |
| `the peer reset the TLS handshake (` | Reset it (RST); the parentheses quote the system's error, in its locale |
| `the peer answered the TLS handshake with non-TLS bytes (` | Answered with bytes that are not TLS; the parentheses quote OpenSSL, as in `wrong version number` |

It is empty while the connection is encrypted, under `disable`, and before the connection opens, and
it is cleared when the session drops or tries TLS again. It is the only trace of the downgrade:
nothing is logged, since the database layer has no logger. Read it where plaintext matters, or use a
strict mode, which never downgrades.

For now, when the plaintext dial that follows a refusal is itself refused, the command fails naming
only that dial — `Redis connection failed: 127.0.0.1:6379 refused the connection (ECONNREFUSED).` —
and the TLS refusal before it is lost with the session.

## RESP3 and push frames

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'secure' => ['mode' => 'disable'],
   'pool' => ['max' => 1],
]);

$KV->await($KV->command('HELLO', ['3']));

$KV->await($KV->command('SUBSCRIBE', ['news']))->response; // ['subscribe', 'news', 1]

// Another client publishes to news: the message arrives here and is dropped.

$KV->await($KV->command('PING'))->response; // 'PONG'
```

`HELLO 3` switches only the connection it runs on — here the pool's only one — to RESP3; any other
connection, and one dialed again, speaks RESP2. Over RESP3, Redis also sends frames no command asked
for, marked as push frames: pub/sub messages, client-side caching invalidations. The driver keeps
them out of the reply queue, so a push never takes another command's reply:

- the confirmation of a subscribe command — `SUBSCRIBE`, `PSUBSCRIBE`, `SSUBSCRIBE` and their
  `UNSUBSCRIBE` counterparts — answers that command, as a plain array;
- every other push is dropped, and nothing hands it to the application.

RESP3 also changes the replies — a hash as an associative array, a score as a `float` — so the same
command answers in two shapes, depending on the connection the pool hands it (see
**[Replies](/manual/ADI/Databases/KV/overview/#replies)**).

The routing has two gaps for now, which is one reason pub/sub is not supported through `command()`
(see **[Pub/sub and MONITOR](/manual/ADI/Databases/KV/overview/#pubsub-and-monitor)**):

- One confirmation answers one command, but Redis confirms a subscribe command once per channel it
  names: after `SUBSCRIBE a b c`, two commands pipelined behind it resolve with
  `['subscribe', 'b', 2]` and `['subscribe', 'c', 3]`.
- The routing reads the push frame type, which only RESP3 has. Over RESP2, the default, a published
  message is a plain array the driver cannot tell from a reply: on a subscribed connection, it
  resolves the next command — a `PING` reads `['message', 'news', 'hello']` — and every later reply
  there lands one command late.

## Pipelining

Commands on one connection are pipelined: each command goes out as soon as the write before it is
whole, without waiting for any reply, and Redis answers in order, so each reply resolves the oldest
command still waiting on that connection. The pool decides which commands share a connection (see
**[Saturation and co-location](/manual/ADI/Database/Pool/overview/#saturation-and-co-location)**),
and **[Pipeline commands](/manual/ADI/Databases/KV/overview/#pipeline-commands)** shows the facade
recipe.

- An error reply fails only its own command: the connection stays, and the next reply goes to the
  next command.
- A lost transport fails everything on the connection. A peer close — a restart, a `CLIENT KILL`,
  the server's idle-client `timeout` — fails the command being read and every command pipelined
  behind it with `Redis socket closed.`, a write the socket refuses with `Redis socket write failed.`,
  and the session is dropped; the next command dials again, with its handshake and preamble. A frame
  the decoder cannot read — RESP3 attributes (`|`) included — does the same with the decoder's
  message, as in `Unknown RESP type byte: Z`. Those commands may have run: retry only what is safe to
  run twice.
- A command composed on that connection but not written yet fails when it is next advanced, with
  `Redis connection was torn down before the command was sent.`, and is never written to a
  connection dialed since.
- A blocking command holds every command pipelined behind it until it returns: a `PING` behind
  `BLPOP jobs 1` answers after one second (see
  **[Blocking commands](/manual/ADI/Databases/KV/overview/#blocking-commands)**).

### Abandoned commands

A written command the pool gives up on — its deadline passed, or it was cancelled or withdrawn — still
has a reply coming, and the replies stay in order: when another command still reads on the
connection — one being written counts — a stand-in nobody reads takes that slot, the reply is
discarded when it arrives, and the commands behind it get their own. The connection stays, and a
command the pool hands it next waits behind that reply.

With no other reader, the driver drops the session instead, and Redis ends the work of a client that
disconnects: a blocked `BLPOP` is released. A command given up while it is being written always
drops the session — the rest of its frame cannot be taken back — and every command pipelined there
fails with `Redis operation was abandoned while writing its command.`

A dropped session holds no slot past itself: Redis does not keep running a disconnected client's
work, so `LINGERING` is `false` for key-value drivers (see
**[Lingering slots](/manual/ADI/Database/Pool/overview/#lingering-slots)**). For now, withdrawing a
written command while another one still reads on its connection takes that connection out of
co-location until it goes idle: the pool treats it like a SQL session that owes a reset (see
**[Session reset](/manual/ADI/Database/Pool/overview/#session-reset)**), though Redis has none to
write, so on a full pool the next command parks in `pending`: the facade's `await()` fails it at
once with `Database pool has no capacity for the operation.`, while `$Response->KV` keeps waiting
until the command still reading there finishes.

## Cancellation

```php
use RuntimeException;

use Bootgly\ADI\Database\Operation\OperationStates;
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'secure' => ['mode' => 'disable'],
]);

$Waiting = $KV->command('BLPOP', ['jobs', 30]);

while ($Waiting->finished === false && $Waiting->state !== OperationStates::Reading) {
   $KV->advance($Waiting);
   usleep(1000);
}

$KV->cancel($Waiting);

try {
   $KV->await($Waiting);
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // Database driver does not support cancellation.
}

$Waiting->cancelled; // false
$KV->Pool->created;  // 0
```

The driver has no cancel request — most Redis commands finish as soon as Redis reads them, and it
sends neither `CLIENT UNBLOCK` nor `SCRIPT KILL` — so it keeps the inherited `cancel()`, which sends
nothing: it fails the command with `Database driver does not support cancellation.`, and
`cancelled` stays `false`. The pool then abandons the command as it would an expired one (see
[Abandoned commands](#abandoned-commands)). Here the `BLPOP` was alone on its connection, so the
session was dropped, and Redis released the blocked client.

The driver also keeps the inherited `owe()`, which counts every command past `Queued` as sent, so
the pool withdraws locally only a command that was never advanced: it fails with
`Database operation was cancelled before reaching the server.`, and its connection stays. Any later
command fails as above, and its connection fares by how far it got:

- still dialing or in its TLS handshake — the half-open connection is dropped;
- waiting for another command's write to finish — nothing of it was sent, and the connection stays;
- being written, or written — it is abandoned as above.

For now, that message does not tell whether Redis ran the command: one cancelled while dialing, in
its handshake or behind another write never reached the server, yet it fails like one Redis already
received. The facade's side of `cancel()` and `withdraw()` is in
**[Cancel](/manual/ADI/Databases/KV/overview/#cancel)** and
**[Withdraw](/manual/ADI/Databases/KV/overview/#withdraw)**, and the pool's in
**[Cancel a running statement](/manual/ADI/Database/Pool/overview/#cancel-a-running-statement)**.

## Errors

A Redis error reply keeps its text in the operation's `error` — `ERR …`, `WRONGTYPE …` — and fails
only its command; deadlines, cancellation and the pool's refusals are in
**[Errors](/manual/ADI/Databases/KV/overview/#errors)**. The failures that come from the driver, or
from the preamble it sends:

| Message | Cause |
| --- | --- |
| `Redis connection failed: 127.0.0.1:6379 refused the connection (ECONNREFUSED).` | Nothing listens on `host`:`port`; the other dial failures are in **[Failures](/manual/ADI/Database/overview/#failures)** |
| `Database connection failed: php_network_getaddresses: getaddrinfo for redis.invalid failed: Name or service not known` | The `host` does not resolve; the text after `failed:` comes from the system resolver (see [Connecting](#connecting)) |
| `WRONGPASS invalid username-password pair or user is disabled.` | The server refused the `AUTH` preamble |
| `ERR AUTH <password> called without any password configured for the default user. Are you sure your configuration is correct?` | `password` is set, and the server has none |
| `ERR DB index is out of range` | The server refused the `SELECT` preamble |
| `NOAUTH Authentication required.` | `password` is empty, and the server requires one: an error reply, the connection stays |
| `Redis TLS handshake timed out: the peer did not answer the TLS handshake within 1s — set secure.mode => 'disable' for a plaintext Redis.` | `prefer` against a peer silent past the handshake budget, such as a plaintext Redis |
| `Redis TLS handshake failed: the peer closed the TLS handshake.` | A strict mode against a peer that refused TLS; a reset or non-TLS bytes read as in [Read the downgrade](#read-the-downgrade) |
| ``Redis plaintext fallback failed after the TLS refusal `the peer closed the TLS handshake`: …`` | `prefer` dialed again in plaintext after a TLS refusal, and that dial failed before it started — the host no longer resolved, for example; the message ends with the dial's own error |
| ``Redis TLS handshake failed: stream_socket_enable_crypto(): Peer certificate subjectAltName did not match expected name `127.0.0.1'`` | `name` is on, and the certificate does not name `peer` |
| `Redis TLS handshake failed: stream_socket_enable_crypto(): SSL operation failed with code 1. OpenSSL Error messages: error:0A000086:SSL routines::certificate verify failed` | `verify` is on, and the chain does not lead to a CA the trust store holds |
| ``Redis TLS handshake failed: no valid certs found cafile stream: `/run/secrets/redis-ca.pem'`` | The `cafile` holds no certificate |
| `Redis socket closed.` | The peer closed the connection — or a TLS port got a `disable` connection |
| `Redis socket write failed.` | The socket refused a write |
| `Unknown RESP type byte: Z` | A frame the decoder cannot read |
| `Redis operation was abandoned while writing its command.` | Another command on the connection was given up while it was being written, and the session with it |
| `Redis connection was torn down before the command was sent.` | The command was composed on a session that dropped before it was written |
| `Redis strict TLS mode rejected a changed connection generation.` | The socket of a strict-mode connection was replaced |
| `Redis connection generation changed during command I/O.` | The socket of a `prefer` or `disable` connection was replaced |
| `Database driver does not support cancellation.` | `cancel()` of a command past `Queued` |

Each of these failures ends the session — every command pipelined on it fails with the same
message, and the next command dials again — and so do the rarer `Redis socket read failed.`,
`Redis socket closed during write.` and `Redis socket is not available.` The exceptions: `NOAUTH` is
a plain error reply that leaves the connection up; a host that does not resolve, and a command
composed on a session already gone, fail on their own, with no session left to end; and a cancelled
command's connection fares as [Cancellation](#cancellation) describes. The OpenSSL diagnostics are
quoted as PHP raises them, with a line break before `error:`.

## Reference

`$Operation->Protocol` is the driver of the connection a command runs on. The pool calls its
methods; an application reads its properties. `DatabaseOperation`, and `Operation` in the methods
inherited from `Bootgly\ADI\Database\Driver`, is `Bootgly\ADI\Database\Operation`: the driver works
with its subclass `Bootgly\ADI\Databases\KV\Operation` and fails any other with
`Redis requires a KV operation.`

```php
public const float HANDSHAKE_BUDGET = 1.0;
```

Seconds a peer gets to answer the ClientHello under `prefer`, capped at half `timeout` — a full
second when `timeout` is `0`. Past it the command fails naming `disable`; the strict modes never use
it.

```php
public const bool LINGERING = false;
```

Inherited from `Bootgly\ADI\Databases\KV\Driver`: Redis drops a disconnected client's work at once,
so the pool counts no slot past a dropped session.

```php
__construct (Config $Config, Connection $Connection)
```

Builds the driver for one pooled connection, with its own RESP encoder and decoder; the pool does,
through the KV driver registry. Given a connection that already holds a socket, it takes that socket
as its current one — as encrypted when it carries TLS.

```php
command (string $command, array $arguments = []): Operation
```

Creates a `KV\Operation` on the driver's connection, with the config's `timeout`, and prepares it.
The facade's `command()` does not call it: it creates the operation itself and hands it to the
pool, which prepares it on the connection it assigns.

```php
prepare (DatabaseOperation $Operation): DatabaseOperation
```

Binds the operation to this driver and its connection, encodes the command and its arguments as one
RESP array, and leaves it `Queued`. An `int` argument is written as it is, any other scalar is cast
to a string — a `float` with PHP's `precision` setting, 14 significant digits by default, for now —
and `null`, an array or an object becomes an empty string (see
**[Arguments](/manual/ADI/Databases/KV/overview/#arguments)**). Fails an operation that is not a
`KV\Operation` with `Redis requires a KV operation.`

```php
advance (DatabaseOperation $Operation): DatabaseOperation
```

Drives the connection state machine: the dial, `TCP_NODELAY`, the TLS handshake and `prefer`'s
plaintext dial, the preamble, the command write and the reply read. Returns as soon as the socket
is not ready, with the readiness to wait on recorded in the operation.

```php
owe (Operation $Operation): bool
```

Inherited default: `true` for every operation past `Queued`. The pool asks it before a cancel and
withdraws locally only what it is `false` for — on Redis, a command never advanced.

```php
cancel (Operation $Operation): Operation
```

Inherited default: fails the operation with `Database driver does not support cancellation.` and
sends nothing. The pool then abandons it.

```php
abandon (DatabaseOperation $Operation): void
```

Reconciles the wire when the pool finishes a command from outside — an elapsed deadline, a cancel, a
withdrawal. A command not in the reply queue is left alone, unless it is the one being written,
which drops the session. A queued one hands its slot to a stand-in that absorbs the reply when
another command still reads on the connection, a command being written included; with none, the
session is dropped.

```php
detach (Operation $Operation): void
```

Inherited default: calls `abandon()`, so a withdrawal reconciles the wire as an expired command
does, and a withdrawn command with no other reader drops its session.

```php
reset (): bool
```

Inherited default: returns `true` and writes nothing, so the pool's session reset sends nothing to
Redis.

```php
check (): bool
```

Whether the connection still owes work to a caller, so the pool must not lend it yet: a command
still being written, or an unfinished command in the reply queue. Stand-ins do not count.

```php
drain (): array
```

Returns the operations that finished while the driver read or tore the session down on behalf of
another one — pipelined siblings resolved in the same read, or failed with the session — and forgets
them, so the pool can release their slots.

```php
sever (DatabaseOperation $Operation, string $error): void
```

Ends the session: fails the operation and every command the session still owes with `$error`, and
disconnects. The pool calls it when it cannot leave a session as it is.

```php
public Encoder $Encoder;
```

The `Bootgly\ABI\Data\RESP\Encoder` that writes each command as a RESP array of bulk strings.

```php
public Decoder $Decoder;
```

The `Bootgly\ABI\Data\RESP\Decoder` that reads this connection's replies, RESP2 and RESP3. It keeps
an incomplete frame until the rest arrives, and is emptied for every new socket.

```php
public private(set) string $downgrade = '';
```

The TLS refusal this connection downgraded to plaintext on under `prefer`; empty otherwise (see
[Read the downgrade](#read-the-downgrade)).

```php
public bool $detached { get; }
```

Whether the session still owes replies to stand-ins.
