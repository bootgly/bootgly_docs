# UDP Client CLI

The UDP Client CLI is Bootgly's low-level client for sending and receiving UDP datagrams. It is useful for custom protocol clients, monitoring flows, test scenarios and lightweight load generation from pure PHP.

## Features

| Feature | Description |
|---|---|
| **UDP datagram client** | Send raw payloads to a UDP server and react to responses with callbacks. |
| **Callback-based flow** | Register hooks for worker startup, connect, disconnect, reads and writes. |
| **Multiple modes** | Run in `MODE_DEFAULT`, `MODE_MONITOR` or `MODE_TEST`. |
| **Embedded mode** | `MODE_EMBEDDED` runs inside another runtime — a server worker, a resolver — with all of its state on the instance, and waits for datagrams without blocking the host's loop. |
| **Multi-worker option** | Start workers when you want concurrency or benchmark-style traffic. |
| **Simple configuration** | Point the client to a target host and port with `configure()`. |
| **Pure PHP** | No cURL or extra network client dependency. |

## Quick Start

A typical UDP client flow is: configure the target, connect, set the outgoing payload and schedule write/read behavior through callbacks.

```php
use Bootgly\WPI\Interfaces\UDP_Client_CLI;
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Configs;
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Events;


$Client = new UDP_Client_CLI;

$Client->configure(
   new Configs(
      host: '127.0.0.1',
      port: 9999
   )
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
| `UDP_Client_CLI::MODE_EMBEDDED` | Runs inside another process's runtime, with its own state — see [Embedded mode](#embedded-mode). |

## Configuration

`configure()` is variadic over **Configs** value objects — one per concern, applied in any order.
The transport lives in `UDP_Client_CLI\Configs`:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | — | Target host or IP address. An IPv6 literal is given bare (`::1`) or bracketed (`[::1]`), with an optional zone id for a link-local address (`fe80::1%eth0`). |
| `port` | `int` | — | Target UDP port. |
| `workers` | `int` | `0` | Number of worker processes to start. |

```php
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Configs;


$Client->configure(
   new Configs(
      host: '127.0.0.1',
      port: 9999,
      workers: 1
   )
);
```

> [!IMPORTANT]
> Every Configs is **named-arguments only**. Its first parameter is a guard slot you never fill, so a positional
> `new Configs('127.0.0.1', 9999)` raises a `TypeError` instead of silently binding the wrong values.

Handing two instances of the same Configs class to one `configure()` call throws an `InvalidArgumentException`, and a
`configure()` that never carried `host` and `port` throws an `ArgumentCountError`.

A `host` that contains `:`, `[`, `]` or `%` must be an IPv6 literal as a whole — bare or bracketed, with an optional zone
id made of letters, digits, `.`, `_` or `-`. Anything else (a port after the brackets, unbalanced brackets, an empty zone
id) throws an `InvalidArgumentException` naming the zone id, so a host string can never override the configured `port`.
The client always dials an IPv6 literal bracketed (`udp://[::1]:9999`).

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

## Embedded mode

`MODE_EMBEDDED` runs the client inside a runtime it does not own — an HTTP server worker, a resolver, a host
application. It never touches the host process: no process state lock, no console commands, no shutdown signal, no
debugging-vars overwrite, no `exit()`. And it shares nothing with other clients: its reactor (`$Reactor`), hooks
(`$Callbacks`), flows (`Connections->$Flows`) and counters live on the instance, so two embedded clients in one process
never see each other's datagrams.

### Wait for a datagram from a request handler

Inside a deferred response, adopt the worker's reactor with `react()`, hand the client the response's wait bridge with
`schedule()`, and wait with `receive()`: the request's Fiber parks until the datagram arrives or the timeout elapses,
while the worker keeps serving every other request.

```php
use Bootgly\WPI\Interfaces\TCP_Server_CLI;
use Bootgly\WPI\Interfaces\UDP_Client_CLI;
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Configs;
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Outcomes;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;


return $Response->defer(function (Response $Response): void {
   $Client = new UDP_Client_CLI(UDP_Client_CLI::MODE_EMBEDDED);
   $Client->react(TCP_Server_CLI::$Event);
   $Client->schedule(fn (mixed $value = null): Response => $Response->wait($value));
   $Client->configure(new Configs(host: '127.0.0.1', port: 9999));

   try {
      $Socket = $Client->connect();
      if ($Socket === false) {
         $Response->JSON->send(['error' => 'unreachable']);
         return;
      }

      // @ Send one datagram on the new flow
      $Flow = $Client->Connections->Flows[(int) $Socket];
      $Flow->output = 'ping';
      $Flow->writing($Socket);

      // @ Wait for the answer (the request's Fiber parks; the worker does not)
      $Outcome = $Flow->receive(2.0);
      $answer = $Outcome === Outcomes::Received ? $Flow->input : null;
   }
   finally {
      $Client->stop();
   }

   $Response->JSON->send(['outcome' => $Outcome->name, 'answer' => $answer]);
});
```

Every `connect()` opens a **new** flow with a fresh source port chosen by the OS — one flow per query is the usual shape
for request/answer protocols. `stop()` closes every flow of the client and returns — call it in a `finally`: a
client dropped without it keeps its sockets open until PHP's cycle collector runs.

### Wait without a server

An embedded client that never called `react()` owns its own reactor, and `receive()` simply blocks the calling code up
to the timeout:

```php
$Client = new UDP_Client_CLI(UDP_Client_CLI::MODE_EMBEDDED);
$Client->configure(new Configs(host: '::1', port: 9999));

try {
   $Socket = $Client->connect() ?: throw new RuntimeException('unreachable');
   $Flow = $Client->Connections->Flows[(int) $Socket];
   $Flow->output = 'ping';
   $Flow->writing($Socket);

   $Outcome = $Flow->receive(0.5); // Outcomes::Received or Outcomes::Expired, …
}
finally {
   $Client->stop();
}
```

### Why a wait ended

`receive()` returns an `Outcomes` case, so the caller decides what comes next by name:

```php
$Outcome = $Flow->receive(1.0);

match ($Outcome) {
   Outcomes::Received => $answer = $Flow->input,  // `''` for a zero-byte datagram
   Outcomes::Expired, Outcomes::Refused => $next = true,  // try another peer
   Outcomes::Closed, Outcomes::Stalled, Outcomes::Rejected => $failed = true,
};
```

A datagram that is not the answer you expect (another query's, or a forged one) is just read and ignored: call
`receive()` again with the time that is left.

### Rules of embedded mode

- `react()` and `schedule()` come before the first `connect()`; `react()` after a flow is open — or from its connect hook — throws a `LogicException`.
- On an adopted reactor, `receive()` only parks: without `schedule()` or outside a Fiber it throws a `LogicException`
  instead of blocking the worker.
- A wait that is cut short — the request is cancelled, the bridge throws — closes its flow on the way out, so no
  descriptor is left behind. A flow closed while a wait is parked on it (`stop()`, `close()`) ends that wait with
  `Outcomes::Closed`.
- Do not also register the flow's socket for `EVENT_READ` on the reactor while you wait on it with `receive()`: the
  wait reads the datagram first, and the persistent reader then reports a failed read.
- An embedded client forks nothing: `workers` above `0`, `Events::WorkerStarted` and `start()` are refused by name.
- Hooks registered with `on()` are this client's own (`$Callbacks`). In embedded mode there is no `$Client->Process`.

## Example with Monitor Mode

```php
use Bootgly\ACI\Events\Timer;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Interfaces\UDP_Client_CLI;
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Configs;
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
         new Configs(
            host: '127.0.0.1',
            port: getenv('PORT') ? (int) getenv('PORT') : 9999,
            workers: 1
         )
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

- `UDP_Client_CLI\Configs` exposes no TLS or DTLS options.
- UDP is datagram-oriented and does not guarantee delivery, ordering or retransmission.
- `MODE_TEST` is useful when you want a lighter runtime for test-oriented flows.
- The legacy modes keep their state process-wide in static properties — `UDP_Client_CLI::$Event`, the `$on*` hooks and the
  registry and counters of `Connections` — shared by every legacy client of the process. They are deprecated: 2.0 keeps
  every client's state on its instance, as `MODE_EMBEDDED` already does.

## Full Example

```php
use Bootgly\ACI\Events\Timer;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Interfaces\UDP_Client_CLI;
use Bootgly\WPI\Interfaces\UDP_Client_CLI\Configs;
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
         new Configs(
            host: '127.0.0.1',
            port: getenv('PORT') ? (int) getenv('PORT') : 9999,
            workers: 1
         )
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

## Reference

### Adopt a host reactor

```php
public function react (Events & Loops & Scheduler $Event): self
```

Adopts a reactor owned by another runtime (a server worker's). `MODE_EMBEDDED` only; must come before any flow is
opened. Afterwards `$owned` is `false`. Throws a `LogicException` in the other modes or once a flow is open.

### Inject the wait bridge

```php
public function schedule (Closure $Wait): self
```

Sets the bridge `receive()` parks through on an adopted reactor: a Closure that receives a `Readiness` and suspends the
calling Fiber on it — inside a deferred response, `fn ($value = null) => $Response->wait($value)`.

### Open a flow

```php
public function connect ()
```

Opens a new socket (a fresh source port) and registers its flow; returns the socket (`resource|false`). In `MODE_EMBEDDED` the flow is
`$Client->Connections->Flows[(int) $Socket]`, and `false` is returned when it cannot be registered; a connect hook
that throws propagates, its socket closed and any reactor interest it armed dropped.

### Wait for a datagram

```php
public function receive (float $timeout): Outcomes
```

On a flow (`Connections\Connection`). Waits up to `$timeout` seconds (finite, `>= 0`; `0` probes once) for one datagram,
then returns why the wait ended; on `Outcomes::Received` the datagram is in `$Flow->input`. Parks the calling Fiber on an
adopted reactor, blocks otherwise. Throws an `InvalidArgumentException` on a negative or non-finite timeout (or one too large for the monotonic clock)
and a
`LogicException` on an adopted reactor without the wait bridge or outside a Fiber.

| `Outcomes` case | Meaning |
|---|---|
| `Received` | A datagram arrived (`input` holds it; `''` for a zero-byte datagram). |
| `Expired` | The timeout elapsed with no datagram. |
| `Refused` | The read failed once the socket became readable — e.g. the peer's port is closed (ICMP). |
| `Closed` | The flow was closed while the wait was in progress. |
| `Stalled` | The wait bridge kept returning without suspending (8 fast wakes in a row). |
| `Rejected` | The reactor could not watch the socket (selector admission). |

### Stop the client

```php
public function stop (): void
```

In `MODE_EMBEDDED`, closes every flow of the client and returns; a disconnect hook that throws does not keep the
others open — the first error is rethrown once all are closed. In the other modes, reports the stopped workers and ends
the process.

### Release a closed flow

```php
public function release (Connection $Connection): void
```

On `Connections`. Removes a closed flow from `$Flows` — only that very flow: another `Connection` over the same socket
never evicts the registered one. Called by the flow's `close()`; for subclasses.

### Embedded state

| Property | Description |
|---|---|
| `$Client->embedded` | `true` in `MODE_EMBEDDED`. |
| `$Client->Reactor` | The reactor in use by this client — its own until `react()`; `null` in the other modes. |
| `$Client->owned` | `false` after `react()`. |
| `$Client->Wait` | The wait bridge set by `schedule()`. |
| `$Client->Callbacks` | This client's hooks, keyed by `Events` value. |
| `$Client->Connections->Flows` | Open flows, keyed by `(int) $Socket`. |
| `$Client->Connections->failures` | Flows that could not be opened. |
| `$Flow->writes`, `$Flow->reads`, `$Flow->errors` | Per-flow counters, always kept in `MODE_EMBEDDED`. |
