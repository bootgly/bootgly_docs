# UDP Server CLI

The UDP Server CLI is Bootgly's low-level server for datagram-based protocols. It lets you bind to a UDP port, register a raw datagram handler and run the server in multi-worker modes that fit development, monitoring and background execution.

## Features

| Feature | Description |
|---|---|
| **Datagram-based server** | Receive raw UDP payloads and return raw payloads back to the sender. |
| **Multi-worker runtime** | Start one or more worker processes to handle traffic. |
| **Operational modes** | Run in `Daemon`, `Interactive`, `Monitor` or `Test` mode. |
| **Simple handler API** | Register a single `on(Closure $package)` callback for received datagrams. |
| **CLI controls** | Use commands such as `status`, `stop`, `pause`, `resume` and `reload` in interactive workflows. |
| **Privilege drop support** | Optionally switch to a lower-privilege POSIX user and group after binding the socket. |
| **Pure PHP** | No external server dependency required. |

## Bootstrapping with Projects

In Bootgly, UDP servers are typically started from a Project. The project creates the server, configures it, registers the datagram handler and then calls `start()`.

```php
use function getenv;
use function shell_exec;

use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\UDP_Server_CLI;


return new Project(
   name: 'Demo UDP Server CLI',
   description: 'Demonstration project for Bootgly UDP Server CLI',
   version: '1.0.0',
   author: 'Bootgly',

   boot: function (array $arguments = [], array $options = []): void
   {
      $Server = new UDP_Server_CLI(Mode: match (true) {
         isset($options['i']) => Modes::Interactive,
         isset($options['m']) => Modes::Monitor,
         default => Modes::Daemon
      });

      $Server->configure(
         host: '0.0.0.0',
         port: getenv('PORT') ? (int) getenv('PORT') : 9999,
         workers: max(1, (int) shell_exec('nproc') ?: 1),
      );

      $Server->on(fn ($input) => $input);

      $Server->start();
   }
);
```

## Quick Start

The minimal public flow is straightforward: configure the socket, register a handler and start the server.

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\UDP_Server_CLI;


$Server = new UDP_Server_CLI(Modes::Monitor);

$Server->configure(
   host: '0.0.0.0',
   port: 9999,
   workers: 1
);

$Server->on(
   package: static fn (string $input): string => $input
);

$Server->start();
```

This example behaves like an echo server: whatever payload the client sends is returned unchanged.

> [!IMPORTANT]
> Keep the handler focused on the datagram payload you want to accept and reply to. The public API is intentionally simple: receive bytes, return bytes.

## Operation Modes

The constructor accepts `Bootgly\API\Endpoints\Server\Modes`.

| Mode | Description |
|---|---|
| `Modes::Daemon` | Runs in the background without an interactive UI. |
| `Modes::Interactive` | Keeps the server attached to the terminal so you can issue commands. |
| `Modes::Monitor` | Shows live runtime status and is convenient during development. |
| `Modes::Test` | Uses a test-oriented server instance for automated flows. |

## Configuration

Use `configure()` to define where the server listens and how many workers it starts.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | — | Address to bind to, such as `0.0.0.0` for all interfaces. |
| `port` | `int` | — | UDP port to listen on. |
| `workers` | `int` | — | Number of worker processes. |
| `user` | `?string` | `null` | Optional POSIX user to switch to after binding. |
| `group` | `?string` | `null` | Optional POSIX group to switch to after binding. |

```php
$Server->configure(
   host: '0.0.0.0',
   port: 9999,
   workers: 4,
   user: 'www-data',
   group: 'www-data'
);
```

### Privilege Dropping

If you bind to a privileged port, you can start as root and drop to a lower-privilege POSIX account after the socket is created.

> [!WARNING]
> `user` and `group` rely on POSIX functions and are only useful on supported systems when the process starts with enough privileges.

## Datagram Handler

Register the receive handler with `on()`:

```php
$Server->on(
   package: function (string $input): string {
      return strtoupper($input);
   }
);
```

This is the main consumer-facing extension point for `UDP_Server_CLI`.

### Handler Contract

| Side | Contract |
|---|---|
| Input | Raw datagram payload received by the server. |
| Output | Raw payload to be sent back as the server response. |
| Execution | Runs in worker processes while the server is active. |

Because UDP is datagram-oriented, design the callback around self-contained messages instead of connection sessions.

## CLI Commands

When running interactively, the server exposes commands such as:

- `status`
- `stop`
- `pause`
- `resume`
- `reload`
- `monitor`
- `stats`
- `connections`
- `help`

These are useful for operating and observing the running server from the terminal.

## Notes for Consumers

- The public `configure()` API does **not** expose SSL/TLS or DTLS options.
- UDP is message-oriented and does not provide the same delivery guarantees as TCP.
- `pause()` and `resume()` are available when you need to temporarily stop and continue the listening flow.

## Full Example

```php
use function getenv;
use function shell_exec;

use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\UDP_Server_CLI;


return new Project(
   name: 'Demo UDP Server CLI',
   description: 'Demonstration project for Bootgly UDP Server CLI',
   version: '1.0.0',
   author: 'Bootgly',

   boot: function (array $arguments = [], array $options = []): void
   {
      $Server = new UDP_Server_CLI(Mode: match (true) {
         isset($options['i']) => Modes::Interactive,
         isset($options['m']) => Modes::Monitor,
         default => Modes::Daemon
      });

      $Server->configure(
         host: '0.0.0.0',
         port: getenv('PORT') ? (int) getenv('PORT') : 9999,
         workers: max(1, (int) shell_exec('nproc') ?: 1),
      );

      $Server->on(fn ($input) => $input);

      $Server->start();
   }
);
```
