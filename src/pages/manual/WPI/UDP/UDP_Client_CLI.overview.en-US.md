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


$Client = new UDP_Client_CLI;

$Client->configure(
   host: '127.0.0.1',
   port: 9999
);

$Client->on(
   clientConnect: function ($Socket, $Connection) {
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

```php
$Client->on(
   workerStarted: ?Closure,
   clientConnect: ?Closure,
   clientDisconnect: ?Closure,
   datagramRead: ?Closure,
   datagramWrite: ?Closure,
);
```

### Available Hooks

| Hook | Signature | Purpose |
|---|---|---|
| `workerStarted` | `Closure($Client)` | Runs when a worker instance starts. |
| `clientConnect` | `Closure($Socket, $Connection)` | Runs when the client socket is ready to use. |
| `clientDisconnect` | `Closure($Connection)` | Runs when the client socket is closed. |
| `datagramRead` | `Closure($Socket, $Connection)` | Runs after a datagram is read. |
| `datagramWrite` | `Closure($Socket, $Connection)` | Runs after or around datagram write flow, depending on your callback logic. |

This is the main public integration surface of `UDP_Client_CLI`.

## Typical Flow

A consumer-facing mental model for the client is:

1. create the client
2. call `configure()`
3. register hooks with `on()`
4. call `connect()` directly or let your `workerStarted` hook do it
5. set `$Connection->output`
6. call `start()` and let the callbacks drive the traffic

The demo project uses exactly this pattern with monitor mode and a timer-based shutdown.

## Example with Monitor Mode

```php
use function getenv;

use Bootgly\ACI\Events\Timer;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Interfaces\UDP_Client_CLI;


return new Project(
   name: 'Demo UDP Client CLI',
   description: 'Demonstration project for Bootgly UDP Client CLI',
   version: '1.0.0',
   author: 'Bootgly',

   boot: function (array $arguments = [], array $options = []): void
   {
      $Client = new UDP_Client_CLI(UDP_Client_CLI::MODE_MONITOR);
      $Client->configure(
         host: '127.0.0.1',
         port: getenv('PORT') ? (int) getenv('PORT') : 9999,
         workers: 1
      );

      $Client->on(
         workerStarted: function ($Client) {
            $Socket = $Client->connect();
            if ($Socket) {
               $Client::$Event->loop();
            }
         },
         clientConnect: function ($Socket, $Connection) {
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
         },
         clientDisconnect: function ($Connection) use ($Client) {
            $Client->log(
               'Connection #' . $Connection->id . ' (' . $Connection->address . ':' . $Connection->port . ')'
               . ' from Worker with PID @_:' . $Client->Process->id . '_@ was closed! @\;'
            );
         },
         datagramWrite: function ($Socket, $Connection) {
            UDP_Client_CLI::$Event->add($Socket, UDP_Client_CLI::$Event::EVENT_WRITE, $Connection);
         },
         datagramRead: null,
      );

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
use function getenv;

use Bootgly\ACI\Events\Timer;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Interfaces\UDP_Client_CLI;


return new Project(
   name: 'Demo UDP Client CLI',
   description: 'Demonstration project for Bootgly UDP Client CLI',
   version: '1.0.0',
   author: 'Bootgly',

   boot: function (array $arguments = [], array $options = []): void
   {
      $Client = new UDP_Client_CLI(UDP_Client_CLI::MODE_MONITOR);
      $Client->configure(
         host: '127.0.0.1',
         port: getenv('PORT') ? (int) getenv('PORT') : 9999,
         workers: 1
      );

      $Client->on(
         workerStarted: function ($Client) {
            $Socket = $Client->connect();
            if ($Socket) {
               $Client::$Event->loop();
            }
         },
         clientConnect: function ($Socket, $Connection) {
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
         },
         clientDisconnect: function ($Connection) use ($Client) {
            $Client->log(
               'Connection #' . $Connection->id . ' (' . $Connection->address . ':' . $Connection->port . ')'
               . ' from Worker with PID @_:' . $Client->Process->id . '_@ was closed! @\;'
            );
         },
         datagramWrite: function ($Socket, $Connection) {
            UDP_Client_CLI::$Event->add($Socket, UDP_Client_CLI::$Event::EVENT_WRITE, $Connection);
         },
         datagramRead: null,
      );

      $Client->start();
   }
);
```
