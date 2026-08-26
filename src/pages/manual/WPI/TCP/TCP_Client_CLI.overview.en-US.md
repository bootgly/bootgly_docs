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
use Bootgly\WPI\Interfaces\TCP_Client_CLI\Events;


$Client = new TCP_Client_CLI;

$Client->configure(
	host: '127.0.0.1',
	port: 8080
);

$Client
	->on(Events::ClientConnect, function ($Socket, $Connection) {
		$Connection->output = "PING\r\n";

		$Connection->Client->Event->add(
			$Socket,
			$Connection->Client->Event::EVENT_WRITE,
			$Connection
		);
	})
	->on(Events::DataRead, function ($Socket, $Connection, $Package) {
		echo $Package->input;
		$Connection->close();
	})
	->on(Events::DataWrite, function ($Socket, $Connection, $Package) {
		$Connection->Client->Event->add(
			$Socket,
			$Connection->Client->Event::EVENT_READ,
			$Connection
		);
	});

$Client->start();
```

The demo project uses monitor mode and a simple HTTP request payload to drive the server for 10 seconds:

```php
$Client
	->on(Events::WorkerStarted, function ($Client) {
		$Socket = $Client->connect();

		if ($Socket) {
			$Client->Event->loop();
		}
	})
	->on(Events::ClientConnect, function ($Socket, $Connection) {
		$Connection->output = "GET / HTTP/1.1\r\nHost: localhost:8080\r\n\r\n";

		$Connection->Client->Event->add($Socket, $Connection->Client->Event::EVENT_WRITE, $Connection);
	});
```

## Modes

The constructor accepts one of the client mode constants.

| Mode | Description |
|---|---|
| `TCP_Client_CLI::MODE_DEFAULT` | Single-process mode. Calls `connect()` and enters the event loop automatically when no custom `Events::WorkerStarted` hook is provided. |
| `TCP_Client_CLI::MODE_MONITOR` | Runs workers and keeps the master process alive in monitor mode until you stop it. |
| `TCP_Client_CLI::MODE_TEST` | Lightweight mode that skips process/commands infrastructure for tests or internal harnesses. |
| `TCP_Client_CLI::MODE_EMBEDDED` | Library mode for a client that lives inside another process — typically an HTTP server worker. It skips the process/commands infrastructure like `MODE_TEST` and additionally leaves the global debugging `Vars` untouched: the host process owns all of that. Pair it with `react()` to run on the host's reactor. |

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

| Event | Signature | Purpose |
|---|---|---|
| `Events::WorkerStarted` | `Closure(TCP_Client_CLI $Client)` | Runs when a worker instance boots, useful for custom connect logic. |
| `Events::ClientConnect` | `Closure($Socket, $Connection)` | Runs when the connection object is established and ready. |
| `Events::ClientDisconnect` | `Closure($Connection)` | Runs after the socket is closed and removed from the client pool. |
| `Events::DataWrite` | `Closure($Socket, $Connection, $Package)` | Runs after data is written, typically to switch the socket into read mode. |
| `Events::DataRead` | `Closure($Socket, $Connection, $Package)` | Runs after inbound data is read. |

> [!IMPORTANT]
> `Connection` inherits the package state, so the same object carries socket metadata plus `output`, `input`, counters and expiration metadata.

## Reactor adoption

Every client instance owns its own `Select` reactor, built in the constructor over its own `Connections` and readable as `$Client->Event`. That is the default: the client drives its own event loop and `start()` runs it.

A client embedded in another runtime must not do that — a second loop inside a process that already has one never gets to run. `react()` hands the client the reactor that runtime already owns:

```php
$Client->react($Event);
```

From that call on the client is *adopted*:

- `$Client->owned` becomes `false`.
- `start()` throws a `LogicException`. Event-driven mode owns the reactor by definition, so the two ownership models are exclusive.
- `halt()` never destroys the loop; it releases only this client's own accounting.

Adoption must come before any connection is opened — calling `react()` afterwards throws a `LogicException`.

### The wait bridge

An adopted client must not block either: a blocking `stream_select()` inside a worker freezes every other connection that worker serves. `schedule()` installs the bridge that turns those blocking waits into parks:

```php
$Client->schedule(function (mixed $value = null): void {
	Fiber::suspend($value);
});
```

The bridge is a closure that receives a `Readiness` — or a raw resource, or `null` — and suspends the calling Fiber on it. The host is then responsible for resuming that Fiber once the readiness arrives, which on the reactor side is `schedule (Fiber $Fiber, mixed $value = null, int $flag = self::SCHEDULE_READ): bool`. It is the same contract the HTTP server's response resources use.

With a bridge installed, and only while the call runs on a Fiber, the two blocking waits of a dial become parks:

- **`connect()` parks on write readiness.** One non-blocking probe comes first, so a dial that resolved immediately never pays a reactor round trip. Then finite 1 s slices: every slice re-proves the dial deadline — `connectTimeout`, narrowed by `$deadline` and `$monotonicDeadline` when those are set — on both the wall and the monotonic clock, and every wake re-probes the socket without blocking.
- **The TLS handshake parks on read readiness**, in the same 1 s slices against the same two deadlines, between `stream_socket_enable_crypto()` attempts.

Failure stays deterministic — the client never spins:

| Situation | Result |
|---|---|
| The bridge stops suspending | A tripwire counts 8 consecutive waits that returned in under 100 µs with the socket still not ready, then fails the dial (or the handshake) and logs it. |
| The reactor rejects the socket | A `selector admission` rejection — the fd budget is exhausted — fails the dial (or the handshake) deterministically and logs it. |
| The bridge raises anything else | The exception propagates to the caller. In the handshake it is rethrown after the connection is closed, never laundered into a TLS failure. |
| The Fiber is unwound mid-dial | The socket is closed in a `finally`. It is registered in no reactor yet, so nothing else would close it. |

Adoption and the bridge are the mechanism, not the everyday API. The ready-made forms are [`HTTP_Client_CLI`](../HTTP/HTTP_Client_CLI) in embedded mode and the HTTP response resource reached as `$Response->Upstream`, both of which wire `react()` and `schedule()` for you — see their own pages. Reach for `TCP_Client_CLI` directly only when you are embedding a raw TCP protocol into a host runtime.

```php
use Fiber;

use Bootgly\WPI\Interfaces\TCP_Client_CLI;


// $Event is the host runtime's reactor; this code runs on a Fiber it drives.
$Client = new TCP_Client_CLI(TCP_Client_CLI::MODE_EMBEDDED);

$Client
	->react($Event)
	->schedule(function (mixed $value = null): void {
		// A Readiness, a resource or null: hand it to the host and suspend
		// until the reactor resumes this Fiber.
		Fiber::suspend($value);
	})
	->configure(
		host: '127.0.0.1',
		port: 8080
	);

$Socket = $Client->connect();
```

## Connection Flow

### Self-driving client

The default lifecycle, where the client owns and runs the loop:

```text
configure() → start() → connect() → EVENT_CONNECT → Events::ClientConnect → EVENT_WRITE → Events::DataWrite → EVENT_READ → Events::DataRead → close()
```

- `connect()` opens the socket with `STREAM_CLIENT_ASYNC_CONNECT | STREAM_CLIENT_CONNECT`.
- If the socket cannot complete immediately, the client schedules a future connect event in the event loop, bounded by the dial deadline.
- When the connection becomes established, the `Events::ClientConnect` hook is called.
- Write and read callbacks are then responsible for advancing the protocol conversation.

### Adopted client

With a host reactor and a wait bridge, the dial is a park instead of a scheduled connect event:

```text
configure() → react() → schedule() → connect() → park on write readiness → [TLS: park on read readiness] → Events::ClientConnect → EVENT_WRITE → Events::DataWrite → EVENT_READ → Events::DataRead → close()
```

- `start()` is never called — the host process already runs the loop.
- No `EVENT_CONNECT` is armed: the calling Fiber parks on write readiness and resumes when the reactor signals it.
- With `secure` configured, the handshake then parks on read readiness between negotiation attempts.
- From the established connection on, nothing changes: the same hooks fire, on the host's loop.

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

> [!WARNING]
> **Breaking change in v1.0.0-beta.5.** The reactor, the transport hooks and the counters are per instance now. The former static `TCP_Client_CLI::$Event` no longer exists — read `$Client->Event`, or `$Connection->Client->Event` from inside a hook. Code that referenced the static must be updated. In exchange, two clients in the same process no longer share (or clobber) a loop, callbacks or stats.

See [`Connection`](./TCP_Client_CLI/Connection) and [`Packages`](./TCP_Client_CLI/Packages) for the low-level socket and package details.

## Full Example

```php
use function getenv;

use Bootgly\ACI\Events\Timer;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Interfaces\TCP_Client_CLI;
use Bootgly\WPI\Interfaces\TCP_Client_CLI\Events;


return new Project(
	name: 'Demo TCP Client CLI',
	description: 'Demonstration project for Bootgly TCP Client CLI',
	version: '1.0.0',
	author: 'Bootgly',
	exportable: true,

	boot: function (array $arguments = [], array $options = []): void
	{
		$Client = new TCP_Client_CLI(TCP_Client_CLI::MODE_MONITOR);
		$Client->configure(
			host: '127.0.0.1',
			port: getenv('PORT') ? (int) getenv('PORT') : 8082,
			workers: 1
		);

		$Client
			->on(Events::WorkerStarted, function ($Client) {
				$Socket = $Client->connect();

				if ($Socket) {
					$Client->Event->loop();
				}
			})
			->on(Events::ClientConnect, function ($Socket, $Connection) {
				Timer::add(
					interval: 10,
					handler: function ($Connection) {
						$Connection->close();
					},
					args: [$Connection],
					persistent: false
				);

				$Connection->output = "GET / HTTP/1.1\r\nHost: localhost:8080\r\n\r\n";

				$Connection->Client->Event->add($Socket, $Connection->Client->Event::EVENT_WRITE, $Connection);
			})
			->on(Events::ClientDisconnect, function ($Connection) use ($Client) {
				$Client->Logger->log(
					'Connection #' . $Connection->id . ' (' . $Connection->address . ':' . $Connection->port . ')'
					. ' from Worker with PID @_:' . $Client->Process->id . '_@ was closed! @\\;'
				);
			})
			->on(Events::DataWrite, function ($Socket, $Connection, $Package) {
				$Connection->Client->Event->add($Socket, $Connection->Client->Event::EVENT_READ, $Connection);
			});

		$Client->start();
	}
);
```

## Reference

```php
public const int MODE_EMBEDDED = 4;
```

Embedded/library mode, passed to the constructor: `new TCP_Client_CLI(TCP_Client_CLI::MODE_EMBEDDED)`. The client runs inside another process's runtime, so it takes no `Process` state lock, builds no `Commands`/Terminal surface, broadcasts no shutdown `SIGINT` and does not overwrite the debugging `Vars` — the host owns all of that.

```php
public protected(set) Events & Loops & Scheduler $Event;
```

The reactor in use by this instance. Every client constructs its own `Select` over its `Connections`, and keeps it unless `react()` replaces it. Public to read, writable only from inside the class.

```php
public protected(set) bool $owned = true;
```

Whether this client still owns — and may destroy — its reactor. `react()` sets it to `false`; from then on `halt()` leaves the loop alone and `start()` refuses to run.

```php
public private(set) null|Closure $Wait = null;
```

The parking bridge installed by `schedule()`, or `null` when none was installed. It is honored only on an adopted reactor, and only from inside a Fiber.

```php
public function react (Events & Loops & Scheduler $Event): self
```

Adopt a reactor already owned by another runtime. Sets `$owned` to `false` and returns the client for chaining. Throws `LogicException` when a connection is already open — adoption must precede any socket registration.

```php
public function schedule (Closure $Wait): self
```

Install the wait bridge used by the parking waits of an adopted client. `$Wait` receives a `Readiness` (or a resource, or `null`) and must suspend the calling Fiber on it. Returns the client for chaining.
