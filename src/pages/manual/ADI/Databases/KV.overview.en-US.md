# KV database

`Bootgly\ADI\Databases\KV` is the facade an application sends Redis commands through. Its one verb,
`command()`, turns a command name and its arguments into a pending `KV\Operation` on the facade's
connection pool; `await()` drives an operation to its end, and `advance()` lets several commands
share their round trips. Redis is the facade's only driver: it speaks RESP over a pool of its
own, the same kind of non-blocking pool the SQL drivers use.

The connection keys and their defaults are on
**[Database configuration](/manual/ADI/Database/Config/overview/)**, and what the pool does with an
operation — waits, deadlines, cancellation, withdrawal — is on
**[Connection pool](/manual/ADI/Database/Pool/overview/)**. **[Databases](/manual/ADI/Databases/overview/)**
sets `KV` beside `SQL`, and the Redis wire itself — authentication, the database index, TLS — is on
the **[Redis](/manual/ADI/Databases/KV/Drivers/Redis/overview/)** driver page.

`KV` is not a cache. `Bootgly\ABI\Resources\Cache` stores PHP values, with TTLs, tags and an
optional key prefix, through drivers that block — its Redis driver too, with keys of its own:
`timeout` `5.0`, `secure` a boolean, port `6379` by default (see
**[Cache](/guide/cache/overview/)**). The Redis driver of `Bootgly\ACI\Queues` also blocks, and
serves job queues only (see **[Queues](/guide/queues/overview/)**). `KV` sends the commands you
write, as you write them, over the asynchronous pool: no serialization, no key prefix, no default
TTL.

## Open a KV database

Where the code runs decides how it opens the facade:

- **In an `HTTP_Server_CLI` route**, do not build one. Use `$Response->KV`, the response resource the
  project registers with `KV::provide()` (see
  **[Register the KV resource](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#register-the-kv-resource)**):
  it wraps one `KV` per worker and, inside `$Response->defer()`, waits through the `Response`
  instead of blocking the worker — see
  **[Await key-value work](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#await-key-value-work)**.
  The facade's own `await()` never suspends the calling Fiber, so in a route each wait blocks the
  worker, and every request it serves, until Redis answers — inside `$Response->defer()` too.
- **In a project** — its boot function, a console command, a worker or a script running inside it —
  build it from the project's `kv` config scope, as in the first block below (see
  [Configure from the kv scope](#configure-from-the-kv-scope)).
- **Outside a project**, pass the connection as an array, as in the second.

```php
use Bootgly\ADI\Databases\KV;
use Bootgly\API\Environment\Configs\KVConfig;

$KV = new KV(new KVConfig(BOOTGLY_PROJECT->Configs->get('kv'))->configure());
```

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'secure' => ['mode' => 'disable'], // a plaintext Redis is declared, never inferred
]);
```

An array takes the shared connection keys of
**[Keys and defaults](/manual/ADI/Database/Config/overview/#keys-and-defaults)**, whose defaults are
a local PostgreSQL's whatever the facade. So spell out three of them:

- `driver` — `'redis'`, the only name `KV` registers. Without it the config says `pgsql`, and the
  first `command()` throws `InvalidArgumentException` with `Database driver is not registered: pgsql.`
- `port` — without it the driver dials `5432`; with nothing listening there, every command fails
  with `Redis connection failed: 127.0.0.1:5432 refused the connection (ECONNREFUSED).`
- `secure` — without it the mode is `prefer`, which opens every connection with a TLS handshake. A
  plaintext Redis never answers one, so each new connection fails after one second, or half the
  `timeout` when that is shorter, with
  `Redis TLS handshake timed out: the peer did not answer the TLS handshake within 1s — set secure.mode => 'disable' for a plaintext Redis.`
  The modes are on **[TLS](/manual/ADI/Database/Config/overview/#tls)**, and what Redis does with
  each on the **[Redis](/manual/ADI/Databases/KV/Drivers/Redis/overview/)** page.

The facade also reads `host`, `password` (sent with `AUTH`), `database` (a `SELECT` index, sent only
when it is all digits and not `0`), `timeout` (each command's deadline, see [Timeouts](#timeouts))
and `pool.max`; it ignores `username`, `replicas` and `secure.key`. Building the facade validates the
config and opens nothing: the first command dials. Each facade owns its pool, so build one per
process and reuse it.

For now the dial tries only the first address a host name resolves to, so where `localhost`
resolves to `::1` first, a Redis listening on `127.0.0.1` alone refuses `'host' => 'localhost'`
(`Redis connection failed: localhost:6379 refused the connection (ECONNREFUSED).`). Write the IP
address.

## Run commands

```php
$KV->await($KV->command('SET', ['greeting', 'hello']));

$KV->await($KV->command('GET', ['greeting']))->response;      // 'hello'
$KV->await($KV->command('GET', ['missing']))->response;       // null
$KV->await($KV->command('INCRBY', ['visits', 5]))->response;  // 5

$KV->await($KV->command('RPUSH', ['letters', 'a', 'b', 'c']));
$KV->await($KV->command('LRANGE', ['letters', 0, -1]))->response; // ['a', 'b', 'c']

$KV->await($KV->command('HSET', ['user:1', 'name', 'Ada', 'lang', 'en']));
$KV->await($KV->command('HGETALL', ['user:1']))->response;    // ['name', 'Ada', 'lang', 'en']
```

`command()` takes the command name and its arguments, one per array item, and returns a
`KV\Operation` at once. It is already assigned to a pool, but nothing is sent until it is advanced;
`await()` advances it to its end and returns it, and the decoded reply is its `response`. The name
goes to Redis as you write it — `set` works as well as `SET` — and a subcommand is an argument:
`command('CLIENT', ['SETNAME', 'worker-1'])`, where `command('CLIENT SETNAME', ['worker-1'])` fails
with `ERR unknown command 'CLIENT SETNAME', with args beginning with: 'worker-1'`. Redis answers in
the protocol of the connection: RESP2, unless that connection was switched with `HELLO 3`.

### Arguments

Every argument travels as a RESP bulk string, converted from its PHP value:

| PHP value | Sent as |
|---|---|
| `string` | As it is |
| `int` | Its digits |
| `float` | PHP's string conversion, which keeps the `precision` ini setting's digits (`14` by default): `1.5` → `1.5`, `1/3` → `0.33333333333333`, `0.1 + 0.2` → `0.3`, `1e20` → `1.0E+20` |
| `bool` | `true` → `1`; `false` → an empty string |
| `null`, an array, an object | An empty string, without an error — a `Stringable` object too |

Format a float yourself when its digits matter — `sprintf('%.17g', 1/3)` sends
`0.33333333333333331` — and cast an object to string before you pass it: a `SET` given `null`,
`false`, an array or an object stores an empty value.

### Replies

The decoded reply depends on the RESP type Redis answers with:

| Reply | `response` | For example |
|---|---|---|
| Simple string | `string` | `SET` → `'OK'`, `PING` → `'PONG'` |
| Bulk string | `string`; `null` for a missing value | `GET` |
| Integer | `int` | `INCR`, `EXISTS`, `DEL` |
| Array | A list (`array<int,mixed>`), nested arrays included; `null` for a null array | `LRANGE`, `HGETALL`, `BLPOP` after its timeout |
| Error | None: the command fails (see [Errors](#errors)) | `INCR` on a value that is not a number |

An error nested in an array does not fail the command: it stays in the list as a `RuntimeException`
object, which `instanceof RuntimeException` tells apart from the other items. A transaction's `EXEC`
answers that way when one of its queued commands fails, and so does a Lua script that returns
`redis.error_reply()` inside a table: `return {1, redis.error_reply('boom')}` resolves with `1`, then
a `RuntimeException` whose message is `ERR boom`.

RESP2 has only those five types, so a hash comes back as a flat list of fields and values, and a
sorted-set score as a string — `ZSCORE` answers `'1.5'`. A connection switched to RESP3 with
`HELLO 3` — that connection only, see [Connection state](#connection-state) — answers with these
types too:

| RESP3 reply | `response` | For example |
|---|---|---|
| Map | An associative array | `HGETALL` → `['name' => 'Ada', 'lang' => 'en']`; `HELLO 3` itself |
| Set | A list | `SMEMBERS` |
| Double | `float` | `ZSCORE` → `1.5` |
| Boolean | `bool` | A Lua script that returns `true` or `false` after `redis.setresp(3)` |
| Null | `null` | `GET` of a missing key |
| Big number | `string`, so no digit is lost | A Lua script that returns `{big_number = '…'}` |
| Verbatim string | `string`, with its format prefix | `INFO` → `'txt:# Server…'` |

Two RESP3 replies are not fully decoded for now. A double that is `inf`, `-inf` or `nan` reads as
`0.0`, so a member scored `+inf` reads back from `ZSCORE` as `0.0`. A verbatim string keeps its
three-letter format and the colon, so `INFO` and `CLIENT INFO` start with `txt:`. Over RESP2 the
same replies are plain strings: `'inf'`, and `INFO` without a prefix. Pushes Redis sends on its own
over RESP3, such as client-tracking invalidations, answer no command and are dropped; pub/sub is
covered in [Pub/sub and MONITOR](#pubsub-and-monitor).

### Read the outcome

```php
$Operation = $KV->await($KV->command('SET', ['greeting', 'hello']));

$Operation->response;       // 'OK'
$Operation->command;        // 'SET'
$Operation->arguments;      // ['greeting', 'hello']
$Operation->error;          // null
$Operation->Result->status; // 'SET'
```

A key-value operation keeps the `command` and `arguments` it was created with, and the decoded reply
in `response`. Its `Result` carries only `status`, set to the command name as you wrote it; `rows`
and `columns` stay empty. It has no `code` and no `SQL`, and nothing is announced for it: the
`SQL\Events` belong to the SQL facade. The fields every operation shares — `state`, `finished`,
`timeout`, `deadline`, `cancelled`, `revoked` and the rest — are in
**[Operation](/manual/ADI/Database/overview/#operation)**, and `$Operation->Protocol` is the Redis
driver the command ran on.

## Pipeline commands

Redis answers the commands of one connection in the order it received them, so a client can send
several before it reads any reply and pay one round trip for all of them. With the facade, create
the commands, `advance()` each one to write it, then `await()` them in the order you created them:

```php
use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'secure' => ['mode' => 'disable'],
   'pool' => ['max' => 1],
]);

$KV->await($KV->command('PING')); // opens the connection

$Operations = [];
foreach (['ada', 'grace', 'linus'] as $name) {
   $Operations[] = $KV->command('INCR', ["visits:$name"]);
}

foreach ($Operations as $Operation) {
   $KV->advance($Operation);
}

$visits = [];
foreach ($Operations as $Operation) {
   $visits[] = $KV->await($Operation)->response;
}

$visits; // [1, 1, 1]
```

`advance()` moves an operation as far as its socket allows and returns without waiting: on an open
connection it writes the command, which is then `Reading`. With all three written, the first
`await()` reads the replies as they arrive, and each reply resolves the command at the head of the
connection's queue — one read can finish the next commands too. The batch costs about one round
trip, whereas awaiting each command right after creating it costs three.

- `advance()` does not throw for a failed command; `await()` does, so catch per command when one may
  fail. An error reply fails only its own command: the others on the connection still resolve with
  their own replies.
- Await in creation order. `await()` blocks and drives only the command it is given, so awaiting a
  command still parked in `pending` before the ones that hold the connections fails it with
  `Database pool has no capacity for the operation.` (see
  **[Await synchronously](/manual/ADI/Database/Pool/overview/#await-synchronously)**).

Where each command goes is the pool's choice (see
**[Saturation and co-location](/manual/ADI/Database/Pool/overview/#saturation-and-co-location)**):
an idle connection first, then a new one while the pool has fewer than `pool.max` connections, and
only then a connection that is open and ready, round-robin. That decides what a batch costs:

- With `pool.max` `1` and the connection open, as above, the whole batch goes out on one socket.
- With the default `pool.max` `8`, the first command takes the open connection, the next seven each
  dial one more, and only the rest join the open connection. For batches sent from a script, give
  the facade `pool.max` `1`.
- On a cold pool, with nothing open yet, the first `pool.max` commands each dial a connection and the
  rest park in `pending`, where each `await()` that frees a connection promotes the next one: with
  `pool.max` `1`, the batch runs one command at a time. Open the connection first, with one awaited
  command, as above.

## Timeouts, cancel and withdraw

The facade drives each operation through the pool that owns it, so the pool's rules apply — see
**[Set a deadline](/manual/ADI/Database/Pool/overview/#set-a-deadline)**,
**[Cancel a running statement](/manual/ADI/Database/Pool/overview/#cancel-a-running-statement)** and
**[Withdrawn operations](/manual/ADI/Database/Pool/overview/#withdrawn-operations)**. This is what
they mean for Redis.

### Timeouts

```php
use RuntimeException;

use Bootgly\ADI\Databases\KV;

$KV = new KV([
   'driver' => 'redis',
   'host' => '127.0.0.1',
   'port' => 6379,
   'secure' => ['mode' => 'disable'],
   'timeout' => 0.5,
]);

try {
   $KV->await($KV->command('BLPOP', ['jobs', 2]));
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // Database operation timed out after 0.5 seconds.
}
```

`timeout` (seconds, default `30`) is each command's deadline, fixed when `command()` creates it: the
wait for a connection, the dial, TLS, `AUTH` and `SELECT`, and the reply all count against it, and
`0` means none. Every command of a facade gets the same `timeout` — there is no per-command option —
and a blocking command's own timeout does not stretch it: the `BLPOP` above asked to wait two
seconds and failed after half a second.

Redis does not learn that a command expired: it runs it and answers. The driver keeps the expired
command's place in the connection's queue, so that late reply is discarded instead of answering the
next command. When another command still waits for its reply on that connection, the late reply is
read and dropped there, and the connection stays; when none does, the connection is closed — which
also ends a blocking command on Redis — and the next command dials a new one. A command whose
deadline passes while it is still being written never runs, and its connection is closed, as in
[Cancel](#cancel).

### Cancel

The Redis driver has no cancel request — most commands finish as soon as Redis reads them — so
`cancel()` never sends anything:

```php
$KV->await($KV->command('SET', ['greeting', 'hello'])); // the connection is open

$Operation = $KV->command('SET', ['greeting', 'bonjour']);
$KV->advance($Operation); // written

$KV->cancel($Operation);

$Operation->error;     // Database driver does not support cancellation.
$Operation->cancelled; // false
$Operation->revoked;   // true

$KV->await($KV->command('GET', ['greeting']))->response; // 'bonjour'
```

What `cancel()` does depends on where the command is:

| Where the command is | What `cancel()` does |
|---|---|
| Parked in `pending`, with no connection yet | Fails it with `Database operation has no protocol to cancel.` |
| Created, not advanced (`Queued`) | Fails it with `Database operation was cancelled before reaching the server.`; nothing reaches Redis, and the connection stays |
| Dialing, or in its TLS handshake | Fails it with `Database driver does not support cancellation.`; nothing reaches Redis, and the half-open connection is closed |
| Waiting for another command's write to finish | Fails it with `Database driver does not support cancellation.`; nothing of it is sent, and the connection stays |
| Being written | Fails it with `Database driver does not support cancellation.`; it never runs, but the connection is closed: the commands written on it fail with `Redis operation was abandoned while writing its command.`, and the ones waiting to be written with `Redis connection was torn down before the command was sent.` |
| Written | Fails it with `Database driver does not support cancellation.`; it still runs on Redis, and its write lands |

`revoked` becomes `true` every time, and `cancelled` stays `false`. Past `Queued`, the error reads
the same whether the command reached Redis or not. A written command is reconciled like an expired
one: its reply is discarded on a connection another command still reads, and otherwise the
connection is closed — so a cancelled `BLPOP` stops blocking on Redis only when it is alone on its
connection. What each case does on the wire is on the Redis driver page, in
**[Cancellation](/manual/ADI/Databases/KV/Drivers/Redis/overview/#cancellation)** and
**[Abandoned commands](/manual/ADI/Databases/KV/Drivers/Redis/overview/#abandoned-commands)**.

### Withdraw

`withdraw()`, inherited from `Database`, gives commands up locally when their caller stops waiting
(see **[Withdrawn operations](/manual/ADI/Database/Pool/overview/#withdrawn-operations)**). Each one
fails with `Database operation was withdrawn: its caller stopped waiting.` and is marked `revoked`;
one already finished keeps its reply. On Redis:

- A command that was not written at all never runs. Its connection stays, unless it was still
  dialing or in its TLS handshake: that half-open connection is closed.
- A command withdrawn while it is being written never runs either, but the rest of its frame cannot
  be taken back: the connection is closed, the commands written on it fail with
  `Redis operation was abandoned while writing its command.`, and the ones waiting to be written
  with `Redis connection was torn down before the command was sent.`
- A written command still runs on Redis. The SQL drivers keep such a session open for the next
  caller to drain; the Redis driver keeps it only while another command still reads on the
  connection, and otherwise closes it.
- No slot outlives a closed connection: Redis drops a disconnected client's work at once, so the
  pool never counts a withdrawn command against `pool.max` until its deadline (`LINGERING` is
  `false` for key-value drivers).

For now, a connection that keeps a withdrawn command's reply for another command takes no new
command until that one finishes: on a full pool, the next command parks in `pending`, where
`await()` fails it with `Database pool has no capacity for the operation.`, so await the remaining
command first.

## Errors

`await()` throws a `RuntimeException` whose message is the failed operation's `error`, and the
operation keeps it; `command()` throws only the `InvalidArgumentException` of a `driver` no
key-value driver is registered under — for now, only `pool.max` times: each of those calls keeps a
slot of the pool, so the calls after them return an operation parked in `pending`, whose `await()`
fails with `Database pool has no capacity for the operation.`

```php
use RuntimeException;

$KV->await($KV->command('SET', ['greeting', 'hello']));

$Increment = $KV->command('INCR', ['greeting']);

try {
   $KV->await($Increment);
}
catch (RuntimeException $Exception) {
   $Exception->getMessage(); // ERR value is not an integer or out of range
   $Increment->error;        // ERR value is not an integer or out of range
   $Increment->response;     // null
}
```

A Redis error reply starts with an upper-case code — `ERR`, `WRONGTYPE`, `NOSCRIPT`, `NOAUTH` — so
branch on that first word, not on the whole message. It fails only its own command, and the
connection stays. A failure of the connection itself fails every command on it — the one in flight
and the ones pipelined behind it — and closes it: those commands are lost, and the next command
dials a new connection, so the facade keeps working.

| Message | Cause |
|---|---|
| `ERR value is not an integer or out of range` | A Redis error reply; `WRONGTYPE Operation against a key holding the wrong kind of value`, `NOSCRIPT No matching script. Please use EVAL.` and the rest read the same way |
| `Database operation timed out after 0.5 seconds.` | The command's `timeout` elapsed ([Timeouts](#timeouts)) |
| `Redis socket closed.` | Redis closed the connection before the reply arrived — a restart, a `CLIENT KILL`, its idle-client `timeout` |
| `Redis connection was torn down before the command was sent.` | The command was created on a connection that was lost before the command was written |
| `Redis operation was abandoned while writing its command.` | Another command on the connection was given up while it was being written — its deadline passed, or it was cancelled or withdrawn ([Cancel](#cancel), [Withdraw](#withdraw)) |
| `Redis connection failed: 127.0.0.1:6379 refused the connection (ECONNREFUSED).` | Nothing listens on `host`:`port`; the other dial failures are listed in **[Failures](/manual/ADI/Database/overview/#failures)** |
| `Database connection failed: php_network_getaddresses: getaddrinfo for redis.invalid failed: Name or service not known` | The `host` does not resolve |
| `WRONGPASS invalid username-password pair or user is disabled.` | The `password` is wrong |
| `NOAUTH Authentication required.` | Redis requires a password and the config has none |
| `ERR AUTH <password> called without any password configured for the default user. Are you sure your configuration is correct?` | The config has a `password` and Redis requires none |
| `ERR DB index is out of range` | `database` is past the number of databases Redis has |
| `Redis TLS handshake timed out: the peer did not answer the TLS handshake within 1s — set secure.mode => 'disable' for a plaintext Redis.` | `prefer`, the default mode, against a plaintext Redis |
| `Database operation timed out after 30 seconds.` | `require`, `verify-ca` or `verify-full` against a plaintext Redis: the handshake waits for the whole `timeout` |
| `Redis TLS handshake failed: …` | An untrusted certificate, a name mismatch or a TLS alert, followed by the OpenSSL diagnostic (see the **[Redis](/manual/ADI/Databases/KV/Drivers/Redis/overview/)** page) |
| `Database driver does not support cancellation.` | `cancel()` on a command past `Queued` ([Cancel](#cancel)) |
| `Database operation was cancelled before reaching the server.` | `cancel()` on a command not advanced yet |
| `Database operation has no protocol to cancel.` | `cancel()` on a command parked in `pending` |
| `Database operation was withdrawn: its caller stopped waiting.` | `withdraw()` on an unfinished command ([Withdraw](#withdraw)) |
| `Database pool has no capacity for the operation.` | `await()` on a command still parked in `pending` |
| `Database driver is not registered: pgsql.` | Thrown by `command()`, for now by its first `pool.max` calls: the config has no `driver` |

A refused `AUTH` or `SELECT` fails the command it was sent ahead of and closes the connection, like a
lost connection; `NOAUTH` is an ordinary error reply. The pool's own failures are in
**[Pool errors](/manual/ADI/Database/Pool/overview/#errors)**.

## Configure from the kv scope

Console commands, workers and scripts that run inside a project build the facade from the project's
`kv` config scope — the scope the route resource reads too — with the line in
[Open a KV database](#open-a-kv-database). `KVConfig` turns the scope,
`configs/kv/kv.Config.php` (a complete one is in
**[Register the KV resource](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#register-the-kv-resource)**),
into the `Database\Config` the facade takes. `configure()` reads the nodes below and leaves out the
unbound ones, which then take the defaults of
**[Keys and defaults](/manual/ADI/Database/Config/overview/#keys-and-defaults)**:

| Node | Key | When unbound |
|---|---|---|
| `Driver` | `driver` | `'redis'` |
| `Host` | `host` | `'127.0.0.1'` |
| `Port` | `port` | `5432` |
| `Database` | `database` | `'bootgly'`, which selects nothing: database `0` |
| `Password` | `password` | `''`: no `AUTH` |
| `Timeout` | `timeout` | `30.0` |
| `Secure->Mode` | `secure.mode` | `'prefer'` |
| `Secure->Verify` | `secure.verify` | Derived from the mode |
| `Secure->Peer` | `secure.peer` | The `host` |
| `Secure->CAFile` | `secure.cafile` | `''` |
| `Pool->Min` | `pool.min` | `0` |
| `Pool->Max` | `pool.max` | `8` |

- Bind `Port` and `Secure->Mode`: unbound, the project's KV dials `5432` with `prefer`. The sample
  scope binds `Port` to `KV_PORT`, default `6379`, and `Secure->Mode` to `KV_SSLMODE`, default
  `disable`.
- `Driver` defaults to `'redis'` here, and takes no other name — `Redis` included.
- The adapter reads no `Enabled`, `Username`, `Secure->Name` or `Secure->Key` node. `Enabled`
  (`KV_ENABLED`) gates only the route resource, so a console command connects even when it is
  `false`; and `name` follows `verify`, so `KV_SSLVERIFY=true` also checks the certificate name
  against `peer`.
- The project's loader reads the scope's `.env` files with no allowlist, while `KV::provide()`
  accepts only the `KV_*` keys it lists and refuses the whole scope for any other — an unknown
  `KV_TYPO=1` loads in a console command, and makes the route resource throw
  `Enable KV_ENABLED=true in the kv config scope and set KV_HOST and KV_PORT as needed.` Keep
  `configs/kv/.env` to the keys the resource lists.

`KVConfig` throws `InvalidArgumentException`:

| Message | Thrown by | Cause |
|---|---|---|
| `KV config adapter expects the kv scope.` | `new KVConfig()` | A scope other than `kv` |
| `Unsupported KV driver: memcached.` | `configure()` | `Driver` is not `redis` |
| `KV driver config value must be scalar.` | `configure()` | `Driver` is bound to an array or an object |
| `Unsupported database TLS mode: verify_full.` | `configure()` | `Secure->Mode` is not one of the five modes |
| ``Database TLS `verify` must be a boolean.`` | `configure()` | `Secure->Verify` is not boolean-like |
| ``Database TLS cafile requires certificate verification: use mode `verify-ca` or `verify-full`, or set `verify` to true.`` | `configure()` | `Secure->CAFile` under `prefer` or `require` without `Secure->Verify` |

The last three come from `Database\Config`, which `configure()` builds (see
**[TLS](/manual/ADI/Database/Config/overview/#tls)**). The line needs the scope: without
`configs/kv/kv.Config.php`, `get('kv')` returns `null` and `KVConfig` rejects it with a `TypeError`;
a project without a `configs/` directory fails one step earlier, as
**[From the project config](/manual/ADI/Database/Config/overview/#from-the-project-config)**
describes.

## Limitations

The pool hands each command whichever connection it can. Commands are not pinned to a connection,
and each connection serves every other command of the facade — behind `$Response->KV`, every command
of the worker. A command that changes the state of its connection, or holds it, breaks that.

### Transactions

`MULTI` … `EXEC` needs every command on one connection, and nothing keeps them there. On a pool of
several connections:

```php
$Multi = $KV->command('MULTI');
$Set = $KV->command('SET', ['balance', '10']);
$Exec = $KV->command('EXEC');

foreach ([$Multi, $Set, $Exec] as $Operation) {
   $KV->advance($Operation);
}

$KV->await($Multi)->response; // 'OK'
$KV->await($Set)->response;   // 'OK': it ran at once, outside any transaction
$KV->await($Exec);            // throws: ERR EXEC without MULTI
```

The three commands landed on three connections. The `MULTI` connection is then left inside a
transaction, and the next command the pool hands it is answered `'QUEUED'` instead of running.
`WATCH` has the same problem: the keys it watches belong to the connection it landed on. A pool of
one connection keeps the commands together, as long as nothing else uses the facade between them.
Write a multi-step change as a Lua script instead — `EVAL` runs it atomically:

```php
$KV->await($KV->command('EVAL', [
   "redis.call('SET', KEYS[1], ARGV[1]); return redis.call('INCR', KEYS[2])",
   2,
   'profile:42',
   'visits:42',
   'Ada',
]))->response; // 1
```

### Connection state

`SELECT`, `HELLO`, `AUTH`, `CLIENT SETNAME` and `CLIENT TRACKING` sent through `command()` change
only the connection they land on, which then serves other commands in that state, while the other
connections keep theirs. On a pool of two connections, a `SELECT 5` followed by two writes put one of
them in database `5` and the other in database `0`; after `HELLO 3`, the same `HGETALL` answered a
map on that connection and a flat list on the other. Set `database` and `password` in the config
instead: the driver sends `SELECT` and `AUTH` on every connection it opens. Its `AUTH` carries the
password alone, so `username` cannot pick a Redis ACL user: every connection authenticates as
`default`.

### Blocking commands

`BLPOP`, `BRPOP`, `BLMOVE`, `BZPOPMIN`, `XREAD` with `BLOCK` and `WAIT` hold their connection until
Redis answers, and the commands pipelined behind them wait as long: a `GET` behind `BLPOP jobs 1`
resolved after one second. With `pool.max` `1` — the sample scope's `KV_POOL_MAX` — that is every
key-value command of the worker. The wait counts against `timeout` like any reply (see
[Timeouts](#timeouts)).

In a script or a console command, give blocking reads a facade of their own. In a route, a second
facade does not help: its `await()` blocks the worker for the whole wait. There, keep blocking reads
off `$Response->KV`, or raise `KV_POOL_MAX`: the other commands then take a connection of their own
while the pool has one to give — a `GET` beside `BLPOP jobs 1` resolved at once with `pool.max`
`2` — and once it is full they pipeline on whichever connection the pool picks, a blocked one
included.

### Pub/sub and MONITOR

Do not send `SUBSCRIBE`, `PSUBSCRIBE`, `SSUBSCRIBE` or `MONITOR` through `command()`; pub/sub is not
supported through the facade for now. `SUBSCRIBE` resolves with its confirmation —
`['subscribe', 'news', 1]` — and leaves its connection subscribed, back in the pool like any other.
One naming several channels is confirmed once per channel, in either protocol, and the extra
confirmations resolve the commands pipelined behind it: after `SUBSCRIBE a b`, a `PING` behind it
resolved with `['subscribe', 'b', 2]`. Then:

- Over the default RESP2, that connection refuses ordinary commands — a `GET` there fails with
  `ERR Can't execute 'get': only (P|S)SUBSCRIBE / (P|S)UNSUBSCRIBE / PING / QUIT / RESET are allowed in this context`
  — and a message published to the channel arrives as a plain array, taken as the reply of the next
  command on that connection: a `PING` resolved with `['message', 'news', 'hello']`, and its own
  answer went to the command after it.
- Over RESP3, the connection keeps running commands, and the published messages are dropped.

## Reference

### KV

`Bootgly\ADI\Databases\KV` extends `Bootgly\ADI\Database`. Its inherited `Config`, `Pool`, `Pools`,
`Connection` and `drivers` are in the **[DBAL core](/manual/ADI/Database/overview/#database)**
Reference. Its pools build drivers from `Bootgly\ADI\Databases\KV\Drivers`, which registers one,
`redis`; `Bootgly\ADI\Databases\KV\Driver`, the base of key-value drivers, sets `LINGERING` to
`false`.

```php
__construct (array|Config $config = [])
```

Builds the facade from an ADI-native array or a `Bootgly\ADI\Database\Config` — an array becomes
one — and the pool for `driver`. Throws `InvalidArgumentException` for the config's own errors,
such as an unsupported `secure.mode`. It opens no connection, and does not check `driver`: a name no
key-value driver is registered under throws from `command()`.

```php
command (string $command, array $arguments = []): Operation
```

Creates a key-value operation for `$command` and its `$arguments` (`array<int,mixed>`, converted as
[Arguments](#arguments) describes), with the pool's `timeout`, and assigns it to the pool: an idle
connection, a new one under `pool.max`, a ready busy one to pipeline on, or `pending`. Nothing is
sent until it is advanced. Throws `InvalidArgumentException` with
`Database driver is not registered: pgsql.` when no key-value driver is registered under `driver` —
for now, only until those calls have kept `pool.max` slots (see [Errors](#errors)).

```php
advance (Operation $Operation): Operation
```

Moves the operation, through the pool that owns it, as far as its socket allows — dial, TLS,
`AUTH`/`SELECT`, write, read — and returns it, without waiting. It does not throw for a failed
operation: read its `error`.

```php
await (Operation $Operation): Operation
```

Advances the operation, through the pool that owns it, until it finishes, and returns it. Throws a
`RuntimeException` with `$Operation->error` when it fails, and refuses an operation parked in
`pending`. Blocks the process and never suspends a Fiber; see
**[Await synchronously](/manual/ADI/Database/Pool/overview/#await-synchronously)**.

```php
cancel (Operation $Operation): Operation
```

Gives the operation up and returns it, sending nothing to Redis: a parked operation fails with
`Database operation has no protocol to cancel.`, one not advanced yet with
`Database operation was cancelled before reaching the server.`, and any other unfinished one with
`Database driver does not support cancellation.` — a written command still runs, and one being
written closes its connection. Sets `revoked`, never `cancelled`; a finished operation keeps its
reply. See [Cancel](#cancel).

```php
withdraw (Operation ...$Operations): void
```

Inherited from `Database`: withdraws operations locally, sending nothing. See the
**[DBAL core](/manual/ADI/Database/overview/#database)** Reference and [Withdraw](#withdraw).

### KV operation

`Bootgly\ADI\Databases\KV\Operation` extends `Bootgly\ADI\Database\Operation`; the fields it
inherits are in **[Operation](/manual/ADI/Database/overview/#operation)**.

```php
__construct (null|Connection $Connection, string $command, array $arguments = [], float $timeout = 0.0)
```

Creates a pending operation for `$command` and its `$arguments`; a `$timeout` above `0.0` sets its
deadline that many seconds from now. `command()` builds it for you.

```php
public string $command
```

The command name, as it was given.

```php
public array $arguments
```

The arguments (`array<int,mixed>`), as they were given, before their conversion.

```php
public mixed $response = null
```

The decoded reply (see [Replies](#replies)): `null` until the operation resolves, after a failure,
and for a nil reply.

```php
public string $write = ''
```

The encoded command still to be written — on a new connection, preceded by the `AUTH` and `SELECT`
that open it. The driver's working buffer: read it, never write it.

### KVConfig

`Bootgly\API\Environment\Configs\KVConfig` — the adapter from the `kv` config scope to the facade's
config.

```php
__construct (Config $Config)
```

Takes the scope, a `Bootgly\API\Environment\Configs\Config`. Throws `InvalidArgumentException` with
`KV config adapter expects the kv scope.` for any other scope.

```php
configure (): ADIConfig
```

Returns a new `Bootgly\ADI\Database\Config` — imported as `ADIConfig` — built from the bound nodes,
with `driver` `'redis'` when `Driver` is unbound. Throws `InvalidArgumentException` for a driver
other than `redis`, a driver that is not a scalar, and the config's own TLS errors. See
[Configure from the kv scope](#configure-from-the-kv-scope).

```php
public Config $Config
```

The scope the adapter reads.
