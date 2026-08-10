# UDP Client CLI

The UDP Client CLI is Bootgly's low-level client for sending and receiving UDP datagrams. It is useful for custom protocol clients, monitoring flows, test scenarios and lightweight load generation from pure PHP.

## Features

| Feature | Description |
|---|---|
| **UDP datagram client** | Send raw payloads to a UDP server and react to responses with callbacks. |
| **Callback-based flow** | Register hooks for worker startup, connect, disconnect, reads and writes. |
| **Multiple modes** | Run in `MODE_DEFAULT`, `MODE_MONITOR` or `MODE_TEST`. |
| **Multi-worker option** | Start workers when you want concurrency or benchmark-style traffic. |
| **Simple configuration** | Point the client to a target host and port with `configure()`. |
| **Pure PHP** | No cURL or extra network client dependency. |

## Quick Start

A typical UDP client flow is: configure the target, connect, set the outgoing payload and schedule write/read behavior through callbacks.

```php
use Bootgly\WPI\Interfaces\UDP_Client_CLI;
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Events;


$Client = new UDP_Client_CLI;

$Client->configure(
   host: '127.0.0.1',
   port: 9999
);

$Client->on(
   Events::ClientConnect,
   function ($Socket, $Connection) {
      $Connection->output = 'Hello, Bootgly UDP!';

      UDP_Client_CLI::$Event->add(
         $Socket,
         UDP_Client_CLI::$Event::EVENT_WRITE,
         $Connection
      );
   }
);

$Client->start();
```

## Modes

The constructor accepts one of the client mode constants.

| Mode | Description |
|---|---|
| `UDP_Client_CLI::MODE_DEFAULT` | Runs in the default single-process flow. |
| `UDP_Client_CLI::MODE_MONITOR` | Keeps the client attached for monitored execution. |
| `UDP_Client_CLI::MODE_TEST` | Uses a lighter test-oriented setup. |

## Configuration

Use `configure()` to define the remote endpoint and optional worker count.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | — | Target host or IP address. |
| `port` | `int` | — | Target UDP port. |
| `workers` | `int` | `0` | Number of worker processes to start. |

```php
$Client->configure(
   host: '127.0.0.1',
   port: 9999,
   workers: 1
);
```

## Callbacks

Register runtime callbacks with `on()`:

### Available Hooks

| Event | Signature | Purpose |
|---|---|---|
| `Events::WorkerStarted` | `Closure($Client)` | Runs when a worker instance starts. |
| `Events::ClientConnect` | `Closure($Socket, $Connection)` | Runs when the client socket is ready to use. |
| `Events::ClientDisconnect` | `Closure($Connection)` | Runs when the client socket is closed. |
| `Events::DatagramRead` | `Closure($Socket, $Connection)` | Runs after a datagram is read. |
| `Events::DatagramWrite` | `Closure($Socket, $Connection)` | Runs once per delivered datagram, after the one-shot `EVENT_WRITE` registration is dropped. Re-arm here only after queueing a new `output`. |

This is the main public integration surface of `UDP_Client_CLI`.

## Typical Flow

A consumer-facing mental model for the client is:

1. create the client
2. call `configure()`
3. register hooks with `on()`
4. call `connect()` directly or let your `Events::WorkerStarted` hook do it
5. set `$Connection->output`
6. call `start()` and let the callbacks drive the traffic

The `EVENT_WRITE` registration is **one-shot**: arm it *after* setting
`$Connection->output`, and one arm delivers exactly one datagram — the registration is
dropped automatically once the datagram is sent (or when a write wakeup finds nothing
queued). To send again, queue a new `output` and re-arm. After each delivered datagram,
`$Connection->written` holds the sent length in bytes.

The demo project uses exactly this pattern with monitor mode and a timer-based shutdown.

## Example with Monitor Mode

```php
use const PHP_EOL;
use function getenv;

use Bootgly\ACI\Events\Timer;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Interfaces\UDP_Client_CLI;
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Events;


return new Project(
   name: 'Demo UDP Client CLI',
   description: 'Demonstration project for Bootgly UDP Client CLI',
   version: '1.0.0',
   author: 'Bootgly',
   exportable: true,

   boot: function (array $arguments = [], array $options = []): void
   {
      $Client = new UDP_Client_CLI(UDP_Client_CLI::MODE_MONITOR);
      $Client->configure(
         host: '127.0.0.1',
         port: getenv('PORT') ? (int) getenv('PORT') : 9999,
         workers: 1
      );

      $Client
         ->on(Events::WorkerStarted, function ($Client) {
            $Socket = $Client->connect();
            if ($Socket) {
               $Client::$Event->loop();
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

            $Connection->output = 'Hello, Bootgly UDP!';
            UDP_Client_CLI::$Event->add($Socket, UDP_Client_CLI::$Event::EVENT_WRITE, $Connection);
         })
         ->on(Events::ClientDisconnect, function ($Connection) use ($Client) {
            $Client->Logger->log(
               info: "Connection #{$Connection->id} ({$Connection->address}:{$Connection->port})"
               . " from Worker with PID {$Client->Process->id} was closed!" . PHP_EOL
            );
         })
         ->on(Events::DatagramWrite, function ($Socket, $Connection) use ($Client) {
            // The EVENT_WRITE registration is one-shot: it was already
            // dropped — re-arm only after queueing a new `output`.
            $Client->Logger->log(
               info: "Sent {$Connection->written} bytes." . PHP_EOL
            );
         });

      $Client->start();
   }
);
```

## Commands and Operation

The interactive command surface of the client is intentionally small.

- `quit`
- `clear`
- `help`

For many use cases, the most important controls are your callbacks, your worker count and the selected mode.

## Notes for Consumers

- The public `configure()` API does not expose TLS or DTLS options.
- UDP is datagram-oriented and does not guarantee delivery, ordering or retransmission.
- `MODE_TEST` is useful when you want a lighter runtime for test-oriented flows.

## Full Example

```php
use const PHP_EOL;
use function getenv;

use Bootgly\ACI\Events\Timer;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Interfaces\UDP_Client_CLI;
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Events;


return new Project(
   name: 'Demo UDP Client CLI',
   description: 'Demonstration project for Bootgly UDP Client CLI',
   version: '1.0.0',
   author: 'Bootgly',
   exportable: true,

   boot: function (array $arguments = [], array $options = []): void
   {
      $Client = new UDP_Client_CLI(UDP_Client_CLI::MODE_MONITOR);
      $Client->configure(
         host: '127.0.0.1',
         port: getenv('PORT') ? (int) getenv('PORT') : 9999,
         workers: 1
      );

      $Client
         ->on(Events::WorkerStarted, function ($Client) {
            $Socket = $Client->connect();
            if ($Socket) {
               $Client::$Event->loop();
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

            $Connection->output = 'Hello, Bootgly UDP!';
            UDP_Client_CLI::$Event->add($Socket, UDP_Client_CLI::$Event::EVENT_WRITE, $Connection);
         })
         ->on(Events::ClientDisconnect, function ($Connection) use ($Client) {
            $Client->Logger->log(
               info: "Connection #{$Connection->id} ({$Connection->address}:{$Connection->port})"
               . " from Worker with PID {$Client->Process->id} was closed!" . PHP_EOL
            );
         })
         ->on(Events::DatagramWrite, function ($Socket, $Connection) use ($Client) {
            // The EVENT_WRITE registration is one-shot: it was already
            // dropped — re-arm only after queueing a new `output`.
            $Client->Logger->log(
               info: "Sent {$Connection->written} bytes." . PHP_EOL
            );
         });

      $Client->start();
   }
);
```
