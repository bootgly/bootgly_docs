# TCP Server CLI

The TCP Server CLI is the low-level TCP server foundation of the Bootgly PHP Framework. It exposes a non-blocking, multi-worker server runtime for custom protocols, raw socket services and higher-level layers built on top of TCP — including Bootgly's own HTTP server stack.

## Features

| Feature | Description |
|---|---|
| **Multi-worker runtime** | Forks multiple workers so each process can accept and handle connections independently. |
| **Non-blocking sockets** | Uses a `stream_select()`-driven event loop for read, write and accept operations. |
| **Operation modes** | Supports `Daemon`, `Interactive`, `Monitor` and `Test` modes. |
| **Raw package handler** | Register a single `on(Closure $package)` callback that receives raw input and returns raw output. |
| **Signals and control** | Pause, resume, reload, stop, inspect connections and view stats with POSIX signals and CLI commands. |
| **SSL/TLS** | Accept encrypted connections through PHP stream context SSL options. |
| **Worker recovery** | In master mode, crashed workers are automatically reforked via `SIGCHLD`. |
| **Privilege dropping** | Bind as root when necessary, then demote to a less privileged POSIX user/group. |
| **Connection stats** | Tracks reads, writes, bytes transferred, errors and active connection metadata. |

## Bootstrapping with Projects

In Bootgly, servers are usually started by Projects. A project file instantiates the server, configures its socket and registers the package handler before calling `start()`.

```php
use function getenv;

use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\TCP_Server_CLI;


return new Project(
	name: 'Demo TCP Server CLI',
	description: 'Demonstration project for Bootgly TCP Server CLI',
	version: '1.0.0',
	author: 'Bootgly',

	boot: function (array $arguments = [], array $options = []): void
	{
		$Server = new TCP_Server_CLI(Mode: match (true) {
			isset($options['i']) => Modes::Interactive,
			isset($options['m']) => Modes::Monitor,
			default => Modes::Daemon
		});

		$Server->configure(
			host: '0.0.0.0',
			port: getenv('PORT') ? (int) getenv('PORT') : 8080,
			workers: 12
		);

		$Server->on(
			package: (require __DIR__ . '/../Demo/TCP_Server_CLI/TCP_Server_CLI.SAPI.php')['on.Package.Receive']
		);

		$Server->start();
	}
);
```

## Quick Start

The smallest public contract is simple: configure a listening socket, register a package callback, then return a string to be written back to the peer.

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\TCP_Server_CLI;


$Server = new TCP_Server_CLI(Modes::Monitor);

$Server->configure(
	host: '0.0.0.0',
	port: 8080,
	workers: 4
);

$Server->on(
	package: static function (string $input): string {
		return "PONG\r\n";
	}
);

$Server->start();
```

The demo project returns a raw HTTP response from the TCP layer directly:

```php
return [
	'on.Package.Receive' => static function ($input) {
		return <<<HTTP_RAW
		HTTP/1.1 200 OK
		Server: Bootgly
		Content-Type: text/plain; charset=UTF-8
		Content-Length: 13

		Hello, World!
		HTTP_RAW;
	}
];
```

> [!IMPORTANT]
> By default, `TCP_Server_CLI` works with raw bytes / strings. Protocol framing, parsing and response shaping are application concerns unless you plug in an encoder/decoder layer on top.

## Operation Modes

The constructor accepts a `Bootgly\API\Endpoints\Server\Modes` enum.

| Mode | Description |
|---|---|
| `Modes::Daemon` | Forks the server to the background and keeps the master process alive without a UI. |
| `Modes::Interactive` | Runs a REPL-like CLI loop with commands such as `status`, `stop`, `pause` and `reload`. |
| `Modes::Monitor` | Displays a live status screen and performs hot-reload checks against the server application layer. |
| `Modes::Test` | Uses a separate process-state instance intended for automated server testing. |

## Configuration

The `configure()` method stores the runtime socket settings before startup:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | — | Host or IP to bind the listening socket to. |
| `port` | `int` | — | TCP port to listen on. |
| `workers` | `int` | — | Number of child processes to fork. |
| `secure` | `?array` | `null` | PHP stream context secure SSL/TLS options for TLS sockets. |
| `user` | `?string` | `null` | POSIX user to switch to after binding the socket. |
| `group` | `?string` | `null` | POSIX group to switch to after binding the socket. |

```php
$Server->configure(
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
);
```

### SSL/TLS

When `secure` is not empty, the server stores the secure SSL/TLS stream context and performs a TLS handshake for each accepted connection. The main listening socket keeps crypto disabled; the handshake happens on each client connection object.

> [!NOTE]
> The handshake is performed during connection setup. If you expect a high volume of TLS traffic, benchmark the handshake cost for your workload.

### Privilege Dropping

If you bind to privileged ports, you can start as root and then demote the process after the server socket is created:

```php
$Server->configure(
	host: '0.0.0.0',
	port: 443,
	workers: 4,
	secure: [/* ... */],
	user: 'www-data',
	group: 'www-data'
);
```

Bootgly resolves the target UID/GID, initializes supplementary groups and then applies `setgid()` / `setuid()` in that order.

## Package Handler

`TCP_Server_CLI` exposes one public handler registration method:

```php
$Server->on(
	package: function (string $input): string {
		return strtoupper($input);
	}
);
```

The callback is stored as the server-side package handler and is executed by worker processes when incoming data is ready to be handled.

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
| `SIGTSTP`, `pause` | Pause workers or switch from Monitor to Interactive mode. |
| `SIGCONT`, `resume` | Resume paused workers. |
| `SIGUSR2`, `reload` | Reload application state in workers. |
| `SIGIOT`, `connections` | Print connection information. |
| `SIGIO`, `stats` | Print connection and traffic statistics. |
| `status` | Render an overview of server state in the terminal. |
| `monitor` | Enter live monitor mode. |
| `check jit`, `error on/off`, `test` | Operational and debugging utilities. |

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

- The **master** process installs signals, stores process state, monitors workers and reforks a replacement if one crashes.
- Each **worker** creates its own server socket with `SO_REUSEPORT`, then enters the shared `Select` event loop.
- Accepted sockets are wrapped in connection objects that track remote peer info, timers, writes and connection status.

Socket options configured by default include:

- `backlog: 102400`
- `so_reuseport: true`
- `ipv6_v6only: false`
- `SO_KEEPALIVE`
- `TCP_NODELAY`

## Event Loop and Connections

Each worker adds the main listening socket to the event loop with an accept/connect event. Accepted peers are then monitored for reads and writes.

At the connection layer, Bootgly tracks:

- remote IP and port
- connection start time and last usage timestamp
- TLS handshake state
- write counters and global read/write stats
- expiration timers (default: `15` seconds)
- optional blacklist checks

See [`Connection`](./TCP_Server_CLI/Connection) and [`Packages`](./TCP_Server_CLI/Packages) for the lower-level details.

## Full Example

```php
use function getenv;

use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\TCP_Server_CLI;


return new Project(
	name: 'Demo TCP Server CLI',
	description: 'Demonstration project for Bootgly TCP Server CLI',
	version: '1.0.0',
	author: 'Bootgly',

	boot: function (array $arguments = [], array $options = []): void
	{
		$Server = new TCP_Server_CLI(Mode: match (true) {
			isset($options['i']) => Modes::Interactive,
			isset($options['m']) => Modes::Monitor,
			default => Modes::Daemon
		});

		$Server->configure(
			host: '0.0.0.0',
			port: getenv('PORT') ? (int) getenv('PORT') : 8080,
			workers: 12
		);

		$Server->on(
			package: (require __DIR__ . '/../Demo/TCP_Server_CLI/TCP_Server_CLI.SAPI.php')['on.Package.Receive']
		);

		$Server->start();
	}
);
```
