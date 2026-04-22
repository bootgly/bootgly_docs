# TCP Client CLI

The TCP Client CLI is Bootgly's low-level outbound TCP client for custom protocols, load generation and event-driven socket workflows. It is the foundation beneath higher-level clients and a practical way to script raw TCP traffic from pure PHP.

## Features

| Feature | Description |
|---|---|
| **Async connect** | Opens sockets with `STREAM_CLIENT_ASYNC_CONNECT` and completes connection flow through the event loop. |
| **Callback-based API** | Exposes hooks for worker boot, connection, disconnection, reads and writes. |
| **Multi-worker mode** | Can fork workers for benchmarking or coordinated outbound load. |
| **Raw package I/O** | Reads and writes raw socket payloads without imposing a protocol format. |
| **SSL/TLS** | Supports TLS through PHP stream context SSL options. |
| **Monitor mode** | Keeps the master process attached while workers run, useful for observation and benchmarks. |
| **Pure PHP** | No cURL or external extension required. |

## Quick Start

For a single TCP connection, configure the client, enqueue bytes on connect, switch to read mode after writing and close when you are done.

```php
use Bootgly\WPI\Interfaces\TCP_Client_CLI;


$Client = new TCP_Client_CLI;

$Client->configure(
	host: '127.0.0.1',
	port: 8080
);

$Client->on(
	connect: function ($Socket, $Connection) {
		$Connection->output = "PING\r\n";

		TCP_Client_CLI::$Event->add(
			$Socket,
			TCP_Client_CLI::$Event::EVENT_WRITE,
			$Connection
		);
	},
	read: function ($Socket, $Connection, $Package) {
		echo $Package->input;
		$Connection->close();
	},
	write: function ($Socket, $Connection, $Package) {
		TCP_Client_CLI::$Event->add(
			$Socket,
			TCP_Client_CLI::$Event::EVENT_READ,
			$Connection
		);
	}
);

$Client->start();
```

The demo project uses monitor mode and a simple HTTP request payload to drive the server for 10 seconds:

```php
$Client->on(
	instance: function ($Client) {
		$Socket = $Client->connect();

		if ($Socket) {
			$Client::$Event->loop();
		}
	},
	connect: function ($Socket, $Connection) {
		$Connection->output = "GET / HTTP/1.1\r\nHost: localhost:8080\r\n\r\n";

		TCP_Client_CLI::$Event->add($Socket, TCP_Client_CLI::$Event::EVENT_WRITE, $Connection);
	}
);
```

## Modes

The constructor accepts one of the client mode constants.

| Mode | Description |
|---|---|
| `TCP_Client_CLI::MODE_DEFAULT` | Single-process mode. Calls `connect()` and enters the event loop automatically when no custom `instance` hook is provided. |
| `TCP_Client_CLI::MODE_MONITOR` | Runs workers and keeps the master process alive in monitor mode until you stop it. |
| `TCP_Client_CLI::MODE_TEST` | Lightweight mode that skips process/commands infrastructure for tests or internal harnesses. |

## Configuration

The `configure()` method accepts the target endpoint and optional concurrency / TLS settings:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | — | Remote host or IP to connect to. |
| `port` | `int` | — | Remote TCP port. |
| `workers` | `int` | `0` | Number of worker processes to fork. |
| `secure` | `?array` | `null` | PHP stream context secure SSL/TLS options for TLS negotiation. |

```php
$Client->configure(
	host: 'secure.example.com',
	port: 443,
	workers: 4,
	secure: [
		'peer_name' => 'secure.example.com',
		'verify_peer' => true,
		'verify_peer_name' => true,
	]
);
```

## Hooks

Register runtime callbacks through `on()`:

```php
$Client->on(
	instance: ?Closure,
	connect: ?Closure,
	disconnect: ?Closure,
	read: ?Closure,
	write: ?Closure,
);
```

### Available Hooks

| Hook | Signature | Purpose |
|---|---|---|
| `instance` | `Closure(TCP_Client_CLI $Client)` | Runs when a worker instance boots, useful for custom connect logic. |
| `connect` | `Closure($Socket, $Connection)` | Runs when the connection object is established and ready. |
| `disconnect` | `Closure($Connection)` | Runs after the socket is closed and removed from the client pool. |
| `write` | `Closure($Socket, $Connection, $Package)` | Runs after data is written, typically to switch the socket into read mode. |
| `read` | `Closure($Socket, $Connection, $Package)` | Runs after inbound data is read. |

> [!IMPORTANT]
> `Connection` inherits the package state, so the same object carries socket metadata plus `output`, `input`, counters and expiration metadata.

## Connection Flow

The client socket lifecycle looks like this:

```text
configure() → start() → connect() → EVENT_CONNECT → onConnect → EVENT_WRITE → onWrite → EVENT_READ → onRead → close()
```

- `connect()` opens the socket with `STREAM_CLIENT_ASYNC_CONNECT | STREAM_CLIENT_CONNECT`.
- If the socket cannot complete immediately, the client schedules a future connect event in the event loop.
- When the connection becomes established, the `connect` hook is called.
- Write and read callbacks are then responsible for advancing the protocol conversation.

## Reading and Writing Raw Data

`TCP_Client_CLI` does not impose framing or message boundaries. You decide what goes into `output` and how `input` is interpreted.

Typical flow:

1. set `$Connection->output`
2. schedule `EVENT_WRITE`
3. in `write`, schedule `EVENT_READ`
4. inspect `$Package->input` in `read`
5. close or continue the conversation

The package layer tracks bytes read/written, read/write counts, transport errors and expiration state.

## SSL/TLS

When `secure` is passed to `configure()`, the client merges those options into the socket context and performs a TLS handshake on the connection.

```php
$Client->configure(
	host: 'secure.example.com',
	port: 443,
	secure: []
);
```

The connection object negotiates TLS with client-side crypto methods for TLS 1.2 / 1.3.

## Multi-worker and Monitoring

When `workers > 0`, the client installs process signals, forks child workers and persists process state for the master process. This is especially useful for benchmarks, repetitive protocol tests or outbound load generation.

Monitor mode keeps the master process attached and logs worker lifecycle until you stop it.

## Runtime Notes

- Default connection expiration is `10` seconds in the connection object.
- The package layer attempts an extra non-blocking `fread()` on TLS sockets to drain any buffered decrypted bytes.
- `MODE_TEST` skips the process/commands infrastructure on purpose.
- The interactive command surface is intentionally minimal compared to `TCP_Server_CLI`.

See [`Connection`](./TCP_Client_CLI/Connection) and [`Packages`](./TCP_Client_CLI/Packages) for the low-level socket and package details.

## Full Example

```php
use function getenv;

use Bootgly\ACI\Events\Timer;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Interfaces\TCP_Client_CLI;


return new Project(
	name: 'Demo TCP Client CLI',
	description: 'Demonstration project for Bootgly TCP Client CLI',
	version: '1.0.0',
	author: 'Bootgly',

	boot: function (array $arguments = [], array $options = []): void
	{
		$Client = new TCP_Client_CLI(TCP_Client_CLI::MODE_MONITOR);
		$Client->configure(
			host: '127.0.0.1',
			port: getenv('PORT') ? (int) getenv('PORT') : 8082,
			workers: 1
		);

		$Client->on(
			instance: function ($Client) {
				$Socket = $Client->connect();

				if ($Socket) {
					$Client::$Event->loop();
				}
			},
			connect: function ($Socket, $Connection) {
				Timer::add(
					interval: 10,
					handler: function ($Connection) {
						$Connection->close();
					},
					args: [$Connection],
					persistent: false
				);

				$Connection->output = "GET / HTTP/1.1\r\nHost: localhost:8080\r\n\r\n";

				TCP_Client_CLI::$Event->add($Socket, TCP_Client_CLI::$Event::EVENT_WRITE, $Connection);
			},
			disconnect: function ($Connection) use ($Client) {
				$Client->log(
					'Connection #' . $Connection->id . ' (' . $Connection->address . ':' . $Connection->port . ')'
					. ' from Worker with PID @_:' . $Client->Process->id . '_@ was closed! @\\;'
				);
			},
			write: function ($Socket, $Connection, $Package) {
				TCP_Client_CLI::$Event->add($Socket, TCP_Client_CLI::$Event::EVENT_READ, $Connection);
			},
			read: null,
		);

		$Client->start();
	}
);
```
