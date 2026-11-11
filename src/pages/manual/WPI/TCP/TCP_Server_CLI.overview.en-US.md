# TCP Server CLI

The TCP Server CLI is the low-level TCP server foundation of the Bootgly PHP Framework. It exposes a non-blocking, multi-worker server runtime for custom protocols, raw socket services and higher-level layers built on top of TCP — including Bootgly's own HTTP server stack.

## Features

| Feature | Description |
|---|---|
| **Multi-worker runtime** | Forks multiple workers so each process can accept and handle connections independently. |
| **Non-blocking sockets** | Uses a `stream_select()`-driven event loop for read, write and accept operations. |
| **Operation modes** | Supports `Daemon`, `Interactive`, `Monitor` and `Test` modes. |
| **Raw package handler** | Register a single `on(Events::DataReceive, Closure $Callback)` callback that receives raw input and returns raw output. |
| **Signals and control** | Pause, resume, reload, stop, inspect connections and view stats with POSIX signals and CLI commands. |
| **SSL/TLS** | Accept encrypted connections through PHP stream context SSL options. |
| **Worker recovery** | The master reforks a worker that dies from its own loop (never inside the `SIGCHLD` handler). A slot whose workers die before entering their event loop three times in a row (a boot that always fails) is reforked after 0.5 s, doubling up to 5 s, while a worker that served is always reforked at once. A waiting slot keeps its share of the listening socket, so about one in N new connections waits for its next attempt. A refused fork (a process limit reached) keeps the master and the slot and is retried every second. |
| **Worker recycling** | A worker past `maxRequests` dispatches (each worker within ±`jitter`) or past `maxMemory` bytes is replaced at once — its replacement accepts on the same listener while it drains like a reload, one draining worker per slot (the slot's next recycle waits for it), killed past its deadline — logged as a recycle, never as a crash, never backed off. |
| **Privilege dropping** | Bind as root when necessary, then demote to a less privileged POSIX user/group. |
| **Connection stats** | Tracks reads, writes, bytes transferred, errors and active connection metadata. |

## Bootstrapping with Projects

In Bootgly, servers are usually started by Projects. A project file instantiates the server, configures its socket and registers the package handler before calling `start()`.

```php
use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\TCP_Server_CLI;
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Configs;
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Events;


return new Project(
	name: 'Demo TCP Server CLI',
	description: 'Demonstration project for Bootgly TCP Server CLI',
	version: '1.0.0',
	author: 'Bootgly',
	exportable: true,

	boot: function (array $arguments = [], array $options = []): void
	{
		$Server = new TCP_Server_CLI(Mode: match (true) {
			isset($options['f']) => Modes::Foreground,
			isset($options['i']) => Modes::Interactive,
			isset($options['m']) => Modes::Monitor,
			default => Modes::Daemon
		});

		$Server->configure(
			new Configs(
				host: '0.0.0.0',
				port: getenv('PORT') ? (int) getenv('PORT') : 8080,
				workers: 12
			)
		);

		$Server->on(
			Events::DataReceive,
			static fn ($input) => "HTTP/1.1 200 OK\r\nServer: Bootgly\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Length: 13\r\n\r\nHello, World!"
		);

		$Server->start();
	}
);
```

## Quick Start

The smallest public contract is simple: configure a listening socket, register a data callback, then return a string to be written back to the peer.

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\TCP_Server_CLI;
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Configs;
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Events;


$Server = new TCP_Server_CLI(Modes::Monitor);

$Server->configure(
	new Configs(
		host: '0.0.0.0',
		port: 8080,
		workers: 4
	)
);

$Server->on(
	Events::DataReceive,
	static function (string $input): string {
		return "PONG\r\n";
	}
);

$Server->start();
```

The demo project returns a raw HTTP response from the TCP layer directly:

```php
return static function ($input) {
	return <<<HTTP_RAW
	HTTP/1.1 200 OK
	Server: Bootgly
	Content-Type: text/plain; charset=UTF-8
	Content-Length: 13

	Hello, World!
	HTTP_RAW;
};
```

> [!IMPORTANT]
> By default, `TCP_Server_CLI` works with raw bytes / strings. Protocol framing, parsing and response shaping are application concerns unless you plug in an encoder/decoder layer on top.

## Operation Modes

The constructor accepts a `Bootgly\API\Endpoints\Server\Modes` enum.

| Mode | Description |
|---|---|
| `Modes::Daemon` | Forks the server to the background and keeps the master process alive without a UI. When `Logger::$Sinks` is unset, it installs the default file sink (`storage/logs/{channel}.log`) so a daemon is never logless; a sink registered before `start()` takes its place. |
| `Modes::Interactive` | Runs a REPL-like CLI loop with commands such as `status`, `stop`, `pause` and `reload`. The prompt does not block supervision: workers are reforked and signals handled while you type (on libedit, an unfinished ESC, ^V or ^R holds timed reforks until the next key). Ctrl-D on an empty line stops the server; a non-terminal stdin (a pipe, `/dev/null`) is read line by line, and once it ends the master keeps supervising until it is stopped. |
| `Modes::Monitor` | Displays a live status screen and performs hot-reload checks against the server application layer. |
| `Modes::Test` | Uses a separate process-state instance intended for automated server testing. |

In every mode but Test, the master also publishes a per-instance **live-log tap** — a unix socket
beside the PID files that [`bootgly logs -f`](/guide/logs/overview/) attaches to. Attaching arms
`Logger::$Tap` in the master and every worker; detaching disarms it, so an unwatched server pays
nothing. Every record the master and its workers write carries the bound port as its `instance`
field (stamped in every mode, Test included), so `bootgly logs --instance=<port>` isolates one
server on the backlog as well as live.

## Configuration

`configure()` is variadic over **Configs** value objects — one per concern, applied in any order before startup.
The transport lives in `TCP_Server_CLI\Configs`:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | — | Host or IP to bind the listening socket to. |
| `port` | `int` | — | TCP port to listen on. |
| `workers` | `int` | — | Number of child processes to fork. |
| `secure` | `null\|array` | `null` | PHP stream context secure SSL/TLS options for TLS sockets. |
| `user` | `null\|string` | `null` | POSIX user to switch to after binding the socket. |
| `group` | `null\|string` | `null` | POSIX group to switch to after binding the socket. |
| `maxRequests` | `int` | `0` (= off) | Dispatches after which a worker is recycled — for this server, accepted connections. See [Worker recycling](#worker-recycling). |
| `jitter` | `float` | `0.1` | Spread of each worker's own limit around `maxRequests`, a fraction from `0` to `1` (`0.1` = ±10%). |
| `maxMemory` | `int\|string` | `0` (= off) | Real memory (`memory_get_usage(true)`) past which a worker is recycled: bytes, or a size string such as `'512M'` (read by `Bytes::parse()`). It must stay below `memory_limit` — `start()` refuses one no worker can honor (see [Worker recycling](#worker-recycling)). |

```php
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Configs;


$Server->configure(
	new Configs(
		host: '0.0.0.0',
		port: 443,
		workers: 8,
		secure: [
			'local_cert'  => BOOTGLY_ROOT_DIR . '@/certificates/localhost.cert.pem',
			'local_pk'    => BOOTGLY_ROOT_DIR . '@/certificates/localhost.key.pem',
			'verify_peer' => false,
		],
		user: 'www-data',
		group: 'www-data'
	)
);
```

> [!IMPORTANT]
> Every Configs is **named-arguments only**. Its first parameter is a guard slot you never fill, so a positional
> `new Configs('0.0.0.0', 443, 8)` raises a `TypeError` instead of silently binding the wrong values.

Handing two instances of the same Configs class to one `configure()` call throws an `InvalidArgumentException`, and a
`configure()` that never carried `host`, `port` and `workers` throws an `ArgumentCountError`.

### SSL/TLS

When `secure` is not empty, the server stores the secure SSL/TLS stream context and performs a TLS handshake for each accepted connection. The main listening socket keeps crypto disabled; the handshake happens on each client connection object.

> [!NOTE]
> The handshake is performed during connection setup. If you expect a high volume of TLS traffic, benchmark the handshake cost for your workload.

### Privilege Dropping

If you bind to privileged ports, you can start as root and then demote the process after the server socket is created:

```php
$Server->configure(
	new Configs(
		host: '0.0.0.0',
		port: 443,
		workers: 4,
		secure: [/* ... */],
		user: 'www-data',
		group: 'www-data'
	)
);
```

Bootgly resolves the target UID/GID, initializes supplementary groups and then applies `setgid()` / `setuid()` in that order.

The workers run as that user from their first request on, so what they write under the storage directory must already be theirs. Before forking, a root launch with a `user` prepares the storage directories the node's workers write — for `HTTP_Server_CLI`, `storage/sessions` (the session key and records, owner-only); for every node, the workers' own cache tree `storage/cache-<uid>` (compiled templates, default file caches), whose problems are only warned about — the workers then cache in a private temporary directory:

| Found | What happens |
| --- | --- |
| Missing | Created with the node's mode (`0700` for both) and handed to the `user`. |
| Already the `user`'s, not group- or world-writable beyond that mode | Used as is — never chowned again. |
| A directory of another owner | The server does not start: it logs `Server not started: storage/<name> is not <user>'s …` with the `chown -R` to run, and exits with status 1. |
| The `user`'s, but group/world-writable | The server does not start, naming the `chmod` to run. |
| A symbolic link, or not a directory | The server does not start: a worker's directory is never a target somebody chose. |

`storage/cache` is not handed over: root-run code — a CLI command, the test runner — reads what it holds. An ancestor of a worker directory that another account could replace — a link, owned by neither root nor the `user`, or group/world-writable without the sticky bit — is reported in a warning naming the ancestor, the cause and its remedy (the default session store refuses such a path; the workers' caches move to a private temporary directory), once per directory, but does not stop the server. For `cache-<uid>`, a link that belongs to root or the `user` is not itself reported: the cache resolves its storage root, so the warning checks where the link leads instead.

The master demotes right after forking; each worker demotes once its listener is in place. The master waits until it can signal every worker (up to 5 seconds) before `start()` goes on, so a command or a stop sent right after the server starts reaches every worker.

### Worker recycling

A worker can be replaced on purpose, to bound what it accumulates over a long life — a leak, an
ever-growing cache, a fragmented heap. Two triggers, both off by default:

```php
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Configs;


$Server->configure(
	new Configs(
		host: '0.0.0.0',
		port: 8080,
		workers: 4,
		maxRequests: 5_000, // recycle a worker after about 5 000 connections...
		jitter: 0.1,        // ...each worker at its own limit, within ±10% (the default)
		maxMemory: '96M'    // ...or once its real memory passes 96 MiB
	)
);
```

`maxMemory` must stay below PHP's `memory_limit` (`128M` by default): past that limit a worker dies
with a fatal error before it could recycle. Raise `memory_limit` to use a larger ceiling.

**What counts is the node's dispatch.** This server counts every connection it accepts — raw TCP
has no request boundary. The [HTTP server](/manual/WPI/HTTP/HTTP_Server_CLI/overview/#worker-recycling)
counts requests instead (each request a keep-alive connection carries), and the
[WebSocket server](/manual/WPI/WS/WS_Server_CLI/overview/) counts connections. One counter lives in the
transport; a node that counts something else calls `TCP_Server_CLI::count()` once per dispatch and
declares it in `DISPATCH`.

**Each worker draws its own limit** when it boots: the `maxRequests ± jitter` range is cut into one
band per worker and each worker draws inside its own, so workers never recycle together; a
replacement draws again. **`maxMemory`** is compared with `memory_get_usage(true)` at every dispatch —
for this server, when a connection is accepted: a long-lived connection that grows the worker's memory
triggers nothing until the next one arrives. `0` turns a trigger off; a negative value, a `jitter` outside `0`–`1` or a size that does not parse
throws `InvalidArgumentException` when the Configs is built.

When a trigger fires, **the old worker and its replacement overlap**: the worker tells the master at
once, and the master forks the replacement on the slot's own pre-bound listener right away — the slot
never goes without a worker accepting. The old worker meanwhile **drains like a reload drain**: it
leaves the accept set, serves the connections it holds until they close (at most `drainTimeout`,
30 s, when the rest are closed) and exits with status `TCP_Server_CLI::RECYCLE` (75). The master
reaps it as the recycled worker it already replaced — no second fork:

```text
NOTICE: Worker (PID: 50609) recycling: 4877 connections reached its limit of 4877; draining...
NOTICE: Worker #2 (PID: 50609) recycling, forking its replacement...
NOTICE: Worker #2 recovered (new PID: 51400)
NOTICE: Worker #2 (PID: 50609) recycled.
```

How soon the master hears the announcement depends on the mode: in Foreground and Daemon mode it
wakes on it at once, in Monitor mode within its 30 ms turn, and in Interactive mode — whose prompt
cannot wait on it — within 50 ms while recycling is on. A worker that exits before the master heard it
(one with nothing left to drain, say) is reaped first and logged
`Worker #2 (PID: 50609) recycled, reforking...` instead — a recycle all the same, reforked at once.
Inside a node's startup barrier
(the [HTTP server's Auto-TLS startup](/manual/WPI/HTTP/HTTP_Server_CLI/overview/#worker-recycling)),
the replacement waits for startup to complete.

What the old worker hands back early belongs to the node: the [HTTP server](/manual/WPI/HTTP/HTTP_Server_CLI/overview/#worker-recycling)
closes its idle keep-alive connections at once and sends HTTP/2 a GOAWAY, the
[WebSocket server](/manual/WPI/WS/WS_Server_CLI/overview/) closes its sessions with `1001 Going Away`.
Raw TCP cannot tell an idle stream from one about to speak, so this server keeps every connection until
its peer closes it or `drainTimeout` ends the drain — new connections reach the replacement meanwhile.

**A recycle never multiplies the processes, nor cuts a drain short.** A slot drains one worker at a
time: a replacement forked while its slot's previous worker still drains — a slow download, a stream, a
client that keeps a connection open — that reaches its own limit meanwhile **holds its recycle**. It
serves on, still accepting, past `maxRequests` (and past `maxMemory`: a ceiling can be exceeded for up to
one drain), until the master tells it the old worker is gone; it then recycles at once, and says so. The
old worker's in-flight work keeps its whole `drainTimeout`:

```text
NOTICE: Worker #2 (PID: 50609) recycled.
NOTICE: Worker (PID: 51400) held its recycle while its slot's previous worker drained; recycling now.
NOTICE: Worker (PID: 51400) recycling: 4919 connections reached its limit of 4919; draining...
```

The worker reads the master's go once a second. A retiree still draining `drainTimeout` + 5 s after its
recycle began is killed, as a reload bounds its own drain — a handler that blocks (a sleep, a call
without a timeout) keeps the retiree's own drain timer from ever firing — and that lets its slot's next
worker recycle too. So a server never runs more than 2 × `workers` worker processes, and a client that
pins a retiree only delays its slot's next recycle, by one drain at most:

```text
WARNING: Worker #2 (PID: 50609) killed, still draining past its deadline (drainTimeout + 5 s); its replacement serves the slot.
```

A retiree is still one of the server's processes: commands, `logs -f`, `stats` and `connections` reach
it, `status` counts it (`+1 retiring`), `stop` — and `project stop`, should the master not answer — ends
it, and the persisted state lists it under `retirees` until it is gone. A pause leaves it alone (it
accepts nothing already), and a replacement forked while the server is paused boots paused, until
`resume` — switching between the Monitor and Interactive consoles keeps the server paused.

A recycle is never logged as a crash and never extends the crash backoff of its slot — it ends a
crash streak, as any worker that served does. The proof is the announcement, not the exit status: a
worker that exits with 75 without having announced a recycle (at boot, say) is a crash like any other,
backed off if it keeps dying before serving. A recycle replaces one worker forked from the running
master; code changes still need `reload`. A `Modes::Test` server never recycles, since its master
never reforks.

**A memory ceiling no worker can honor is refused.** `start()` exits with
`Server not started: maxMemory (…) …` when `maxMemory` is not above the memory a worker starts with
(every worker would recycle at its first dispatch, and every replacement after it), or not below
`memory_limit` (PHP's fatal error would come first). A `reload` never takes a serving instance down for
it — its old workers are drained already: the fresh master logs `Reloaded without a memory ceiling: …`
and serves on with the ceiling off until the next start. A worker whose own boot — a `Worker::Boot`
listener, say — takes it past `maxMemory` serves on with its memory ceiling off and logs an error
saying so: never a fork per dispatch. And a worker whose announcement channel the master could not
create (it ran out of descriptors) cannot announce a recycle, nor hear the master's go: it logs a
warning and does not recycle, rather than drain with no replacement.

## Data Handler

`TCP_Server_CLI` exposes one public handler registration method:

```php
$Server->on(
	Events::DataReceive,
	function (string $input): string {
		return strtoupper($input);
	}
);
```

The callback is stored as the server-side data handler and is executed by worker processes when incoming data is ready to be handled.

### Input and Output Contract

| Side | Default contract |
|---|---|
| Input | Raw bytes read from the client socket. |
| Output | Raw bytes written back to the same socket. |
| Execution context | Runs inside the worker process handling the connection. |

If a decoder/encoder layer is installed, that layer may preprocess input or shape output before the handler is involved. For the public API, though, the safe mental model is still “raw input in, raw output out”.

## Server Lifecycle

The runtime status follows the server enum lifecycle:

```text
Booting → Configuring → Starting → Running → Paused → Stopping
```

- **Booting** initializes logger, connections, event loop and process state.
- **Configuring** stores host, port, worker and SSL settings.
- **Starting** boots the application handler, installs signals and forks workers.
- **Running** accepts connections and drives the event loop.
- **Paused** temporarily removes the listening socket from the worker event loop.
- **Stopping** terminates workers and cleans process state files.

## Signals and CLI Commands

The server master process listens for a rich control surface.

| Signal / command | Effect |
|---|---|
| `SIGINT`, `SIGTERM`, `stop` | Stop the server and terminate workers. |
| Ctrl-D (Interactive) | On an empty line, stops the server like `stop`. |
| `SIGTSTP`, `pause` | Interactive mode only — `Daemon` and `Foreground` ignore `SIGTSTP`. Pause serving: workers leave the accept set while the master keeps supervising (crashed workers are still reforked) and the console stays interactive. `bootgly project show` reports the instance as `paused`. In Monitor mode, SIGTSTP switches to Interactive instead. |
| `SIGCONT`, `resume` | Resume a paused server: workers re-join the accept set and the status returns to Running. A worker whose listener cannot re-enter its selector (the entries are taken by dependency waits) logs a critical message, stays Paused and retries every second until it gets back in — it never reports Running while accepting nothing. A `pause` cancels a pending retry and the worker stays Paused; a successful `resume` cancels it too. |
| `SIGUSR2`, `reload` | Reload application state in workers. |
| `SIGIOT`, `connections` | Print connection information. |
| `SIGIO`, `stats` | Print connection and traffic statistics; `stats reset` zeroes them. |
| `status` | Render an overview of server state in the terminal. |
| `monitor` | Enter live monitor mode. |
| `check jit`, `error on/off` | Operational and debugging utilities. |

> [!NOTE]
> Interactive commands are primarily master-process features. Workers keep focusing on I/O and connection handling.

## Master / Worker Architecture

The server uses a classic fork-based architecture:

```text
Master process
├── Worker #1 → bind socket → event loop
├── Worker #2 → bind socket → event loop
├── …
└── Worker #N → bind socket → event loop
```

- The **master** process installs signals, stores process state, monitors workers and reforks a replacement if one crashes — backing off a slot whose workers keep dying at boot — or recycles — forking the replacement as soon as the worker announces the recycle, while the old one drains (one retiree per slot: the slot's next recycle waits for it, and it is killed past its deadline) — logged as a recycle. A reload whose relay fork is refused is aborted, and the server keeps serving.
- Each **worker** creates its own server socket with `SO_REUSEPORT`, then enters the shared `Select` event loop. The worker hands the server's signals to that loop, which runs their handlers between callbacks (see [Select](/manual/WPI/Events/Select/overview/)).
- Accepted sockets are wrapped in connection objects that track remote peer info, timers, writes and connection status.

Socket options configured by default include:

- `backlog: 102400`
- `so_reuseport: true`
- `ipv6_v6only: false`
- `SO_KEEPALIVE`
- `TCP_NODELAY`

## Event Loop and Connections

Each worker adds the main listening socket to the event loop with an accept/connect event. Accepted peers are then monitored for reads and writes.

The selector admits `1000` entries per descriptor table (`Select::CAPACITY`), shared by client sockets and the worker's own dependency I/O — deferred database/KV waits, the embedded HTTP client. `TCP_Server_CLI::$headroom` (default `32`; the HTTP and WebSocket servers expose it as `headroom:` in their Configs) keeps that many entries free by shedding clients once a worker holds `1000 − headroom` connections, before `$maxConnections` when that is higher. The worker's listener takes one of those entries (a WebSocket worker's broadcast relay one more), so size it to at least the sum of the `pool.max` of the worker's resources plus one for the listener (plus one for the relay); `0` disables it, and it is clamped so a worker always admits clients. A descriptor closed while still registered — a dependency session torn down while another Fiber awaits its socket — is dropped from the selector and its waiters are resumed to observe the close, instead of failing the worker.

At the connection layer, Bootgly tracks:

- remote IP and port
- connection start time and last usage timestamp
- TLS handshake state
- write counters and global read/write stats
- idle expiration timers, seeded from `TCP_Server_CLI::$connectionIdleTimeout` (default `15` seconds; the HTTP server exposes it as `new HTTP_Server_CLI\Configs(connectionIdleTimeout: ...)`) — pending deferred work counts as activity
- optional blacklist checks

Output a peer has not read yet stays in memory until the socket drains, charged at what PHP's allocator spends to keep it (a string over about 680 KiB is charged a whole 2 MiB chunk), against two ceilings: `TCP_Server_CLI::$maxPendingBytes` (12 MiB) per connection and `TCP_Server_CLI::$maxWorkerPendingBytes` (64 MiB) per worker — the worker memory budget the HTTP and WebSocket servers also charge their request bodies, unfinished messages and route cache to. A write that does not fit drops that connection. At start the worker budget is lowered to half of `memory_limit`, with a warning, when it is larger; `memory_limit = -1` keeps it.

See `Connection` and `Packages` for the lower-level details.

## Full Example

```php
use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\TCP_Server_CLI;
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Configs;
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Events;


return new Project(
	name: 'Demo TCP Server CLI',
	description: 'Demonstration project for Bootgly TCP Server CLI',
	version: '1.0.0',
	author: 'Bootgly',
	exportable: true,

	boot: function (array $arguments = [], array $options = []): void
	{
		$Server = new TCP_Server_CLI(Mode: match (true) {
			isset($options['f']) => Modes::Foreground,
			isset($options['i']) => Modes::Interactive,
			isset($options['m']) => Modes::Monitor,
			default => Modes::Daemon
		});

		$Server->configure(
			new Configs(
				host: '0.0.0.0',
				port: getenv('PORT') ? (int) getenv('PORT') : 8080,
				workers: 12
			)
		);

		$Server->on(
			Events::DataReceive,
			static fn ($input) => "HTTP/1.1 200 OK\r\nServer: Bootgly\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Length: 13\r\n\r\nHello, World!"
		);

		$Server->start();
	}
);
```
