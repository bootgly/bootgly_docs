# UDP Server CLI

The UDP Server CLI is Bootgly's low-level server for datagram-based protocols. It lets you bind to a UDP port, register a raw datagram handler and run the server in multi-worker modes that fit development, monitoring and background execution.

## Features

| Feature | Description |
|---|---|
| **Datagram-based server** | Receive raw UDP payloads and return raw payloads back to the sender. |
| **Multi-worker runtime** | Start one or more worker processes to handle traffic. |
| **Operational modes** | Run in `Daemon`, `Interactive`, `Monitor` or `Test` mode. |
| **Simple handler API** | Register a single `on(Events::DatagramReceive, Closure $Callback)` callback for received datagrams. |
| **Bounded peer state** | Apply per-worker global/per-IP retention ceilings, idle expiry and a finite dispatch batch before peer state can exhaust the worker. |
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
use Bootgly\WPI\Interfaces\UDP_Server_CLI\Configs;
use Bootgly\WPI\Interfaces\UDP_Server_CLI\Events;


return new Project(
   name: 'Demo UDP Server CLI',
   description: 'Demonstration project for Bootgly UDP Server CLI',
   version: '1.0.0',
   author: 'Bootgly',
   exportable: true,

   boot: function (array $arguments = [], array $options = []): void
   {
      $Server = new UDP_Server_CLI(Mode: match (true) {
         isset($options['i']) => Modes::Interactive,
         isset($options['m']) => Modes::Monitor,
         default => Modes::Daemon
      });

      $Server->configure(
         new Configs(
            host: '0.0.0.0',
            port: getenv('PORT') ? (int) getenv('PORT') : 9999,
            workers: max(1, (int) shell_exec('nproc') ?: 1)
         )
      );

      $Server->on(Events::DatagramReceive, fn ($input) => $input);

      $Server->start();
   }
);
```

## Quick Start

The minimal public flow is straightforward: configure the socket, register a handler and start the server.

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\UDP_Server_CLI;
use Bootgly\WPI\Interfaces\UDP_Server_CLI\Configs;
use Bootgly\WPI\Interfaces\UDP_Server_CLI\Events;


$Server = new UDP_Server_CLI(Modes::Monitor);

$Server->configure(
   new Configs(
      host: '0.0.0.0',
      port: 9999,
      workers: 1
   )
);

$Server->on(
   Events::DatagramReceive,
   static fn (string $input): string => $input
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

`configure()` is variadic over **Configs** value objects — one per concern, applied in any order before
startup. The transport lives in `UDP_Server_CLI\Configs`:

Configuration is a pre-start operation. Calls made after the server reaches `Starting`, `Running`,
`Paused` or `Stopping` are rejected without changing status, transport, admission policy or the
Router already registered in the event loop; use `reload()` for a live replacement. `start()` also
fails closed until one complete, validated transport `Configs` has been committed.

The same value object defines immutable peer-protection boundaries for the configured server.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | — | Address to bind to, such as `0.0.0.0` for all interfaces. |
| `port` | `int` | — | UDP port to listen on. |
| `workers` | `int` | — | Number of worker processes. |
| `user` | `null\|string` | `null` | Optional POSIX user to switch to after binding. |
| `group` | `null\|string` | `null` | Optional POSIX group to switch to after binding. |
| `maxConnections` | `int` | `1024` | Maximum retained `ip:port` peers per worker; `0` disables the global ceiling. |
| `maxConnectionsPerIP` | `int` | `256` | Maximum retained peers from one canonical source IP, per worker; `0` disables the per-IP ceiling. |
| `connectionIdleTimeout` | `int` | `30` | Idle-peer lifetime in seconds; `0` disables idle expiry. |
| `maxDatagramsPerTick` | `int` | `64` | Datagram count handled in one read-ready turn before yielding; must be at least `1`. |

```php
use Bootgly\WPI\Interfaces\UDP_Server_CLI\Configs;


$Server->configure(
   new Configs(
      host: '0.0.0.0',
      port: 9999,
      workers: 4,
      user: 'www-data',
      group: 'www-data',
      maxConnections: 1024,
      maxConnectionsPerIP: 256,
      connectionIdleTimeout: 30,
      maxDatagramsPerTick: 64,
   )
);
```

> [!IMPORTANT]
> Every Configs is **named-arguments only**. Its first parameter is a guard slot you never fill, so a positional
> `new Configs('0.0.0.0', 9999, 4)` raises a `TypeError` instead of silently binding the wrong values.

Handing two instances of the same Configs class to one `configure()` call throws an `InvalidArgumentException`, and a
`configure()` that never carried `host`, `port` and `workers` throws an `ArgumentCountError`.

Negative ceilings or idle timeouts, and a dispatch batch below one, throw an
`InvalidArgumentException` while constructing `Configs`.

### Bounding retained peers

`UDP_Server_CLI` retains one lightweight `Connection` state per source `ip:port`, not a
transport connection. Admission checks run before that state is allocated. The global and
per-IP ceilings are **per worker** because `SO_REUSEPORT` gives every worker its own socket,
registry and timer state. With four workers and `maxConnections: 1024`, the deployment can
therefore retain at most 4096 peer states.

The per-IP default limits ordinary source-port churn, while the global ceiling remains the
authoritative memory bound when source addresses are spoofed. Raise `maxConnectionsPerIP`
for a trusted NAT that legitimately represents many active UDP clients. Do not set
`maxConnections` to `0` on an untrusted listener unless an equivalent external memory bound
exists. Disabling `connectionIdleTimeout` also lets one burst occupy finite slots until those
peers close or the worker restarts. Use any `0` opt-out only behind equivalent protection.

Once either ceiling is full, a datagram from a new peer is dropped without a response or
peer allocation. A peer already in the registry continues to be handled at the ceiling.
The source IP is the direct address observed on the UDP socket; there is no proxy-header
equivalent at this transport layer.

One central supervisor per worker expires peers after `connectionIdleTimeout`; receiving a
new datagram refreshes that peer even when stats collection is disabled. The finite
`maxDatagramsPerTick` batch then yields to timers, signals and other ready descriptors during
continuous traffic. The supervisor's nominal interval is no longer than five seconds. An idle peer expires on
the first nominal pass after its timeout while the event loop remains responsive; blocking
application or decoder code can delay that cooperative pass. The batch is a scheduling
fairness bound, not a traffic rate limit.

Each admission stores its server's immutable idle-timeout snapshot. The most recently
constructed manager is the sole admission authority for the process-local registry; replacing
it invalidates older Routers before cleanup callbacks run. The shared supervisor selects the
shortest positive snapshot still represented in its private ledger. Connection I/O authority is
also process-local and is revoked before terminal cleanup. Changing legacy public status or
payload properties cannot restore it after close.

Managed admission is represented by a private `Lease` tied to the actual lifetime of the exact
`Connection` object. Closing removes the peer from active routing, but its global and per-IP slot
is released only after that object is truly dead. Any strong owner&mdash;including a Timer, Reset
observer, callback, application property or executing stack frame&mdash;naturally keeps both the
object and its admission charge alive. The implementation does not inspect object graphs or
classify callback payloads to predict that ownership.

When PHP finalizes the weak-map key, the Lease queues its tokenized release with a
`WeakReference`. Queue draining releases the token only when the reference is still empty. If a
destructor resurrects the `Connection`, its slot stays charged and the queued entry is retained
until a later drain observes the object's actual death. Manager construction, admission,
sweeping, routing and the manager's explicit peer-close path all provide drain boundaries.
Each drain consumes one stable queue snapshot; entries created re-entrantly are preserved for the
next drain. Released callback captures and bounded cyclic collection are finalized while the
lifecycle guard is still active. If cyclic collection cannot quiesce in eight passes, direct
construction remains fail-closed until a later drain completes it. Every drain and terminal scrub
also blocks re-entrant manager construction. A stable terminal peer that is still owned remains
represented by the single supervisor even when idle expiry is disabled, so an otherwise
unreachable PHP cycle is collected on a later bounded sweep.

While live, each UDP `Connection` exposes the established public self-view. After terminal
cleanup, `close()` breaks its backed self-view so an ordinary shell can finalize promptly.
Bootgly still enables PHP's cyclic garbage collector before construction, even when the
process started with `zend.enable_gc=0`, because application owners and re-entrant cleanup
can form independent cycles that must not accumulate across churn waves.

Closing remains terminal even though legacy public status and payload properties stay
mutable. Terminal cleanup reads and clears backed compatibility properties without invoking
their hooks; a virtual override is an opaque application-owned view and is not trusted as
framework state. Cleanup gives re-entrant application destructors a bounded 32-pass budget. A
peer that does not stabilize remains privately retained and charged while the supervisor retries,
so application code cannot force an early slot release. Application destructors should not
mutate a closing connection. Authority is indexed by the immutable peer key in process-keyed,
fixed weak buckets. Before granting a managed object, admission uses its shared finite budget to
revoke every pre-authorized direct generation with that exact key, then revalidates the manager,
key, blacklist and both ceilings after those cleanup callbacks. Exhaustion or re-entrant
occupation rejects the outer admission without overwriting accounting. Terminal close likewise
revokes every authorized same-key generation it observes; a foreign object stored under the
wrong public key loses only that alias and keeps its own peer authority.

Authority grant and ledger publication run as one process-local transaction. A re-entrant
`accept()`, manager `close()` or idle sweep during that transaction fails closed; a later datagram
is the natural retry. If application cleanup interrupts publication, rollback rebuilds the
per-IP, timeout and quarantine counters from the authoritative peer tuples and reconciles the
supervisor before admission resumes. This prevents an asynchronous callback or signal from
interleaving the final ceiling check with ledger commit.

Network sends and terminal rejections use the readonly `Connection::$id` captured by the
constructor. Mutating or hooking the legacy public `peer` field cannot retarget an authorized
datagram.

Cloned and unserialized `Connection` shells never receive the constructor-seeded process-local
authority or a managed Lease. They are inert for application I/O. Closing one marks only that
shell terminal: it cannot cancel timer identifiers copied from another object or mutate the
managed admission ledgers.

Manager replacement clears the public compatibility mirror with finite work. If that bounded
clear is exhausted while an exact previous manager is still live, Bootgly restores that precise
manager/identity pair and rejects the replacement. Without a live predecessor, the first manager
remains authoritative but fail-closed and leaves the final mirror generation untouched. That
generation is neither trusted as authority nor parked as a substitute manager. Manager
construction is itself transactional: cleanup callbacks cannot construct a nested manager, and
an unexpected failure restores the exact prior live authority pair.

The central supervisor covers peers admitted by `UDP_Server_CLI`. Extensions that construct
the internal `Connection` class directly remain outside admission accounting and keep their
legacy per-object expiry timer only while connection stats are enabled. Timer setup uses immutable
constructor input and raw backed storage, so property hooks cannot orphan a timer. A direct object
created during manager construction, admission, withdrawal, Lease draining, terminal cleanup, or
while its exact peer key is reserved starts without I/O authority. A later managed admission also
revokes pre-existing direct authority for that key before it commits. Direct construction does not
create the managed admission Lease described above; outside those guarded boundaries its cleanup
and lifetime remain separate from the server's global and per-IP ledgers.

### Privilege Dropping

If you bind to a privileged port, you can start as root and drop to a lower-privilege POSIX account after the socket is created.

> [!WARNING]
> `user` and `group` rely on POSIX functions and are only useful on supported systems when the process starts with enough privileges.

## Datagram Handler

Register the receive handler with `on()`:

```php
$Server->on(
   Events::DatagramReceive,
   function (string $input): string {
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

- `UDP_Server_CLI\Configs` does **not** expose SSL/TLS or DTLS options.
- UDP is message-oriented and does not provide the same delivery guarantees as TCP.
- This server handles raw UDP; it does not implement QUIC or HTTP/3. Its admission caps,
  dispatch fairness and lifetime authority are reusable foundations, but QUIC additionally needs
  connection IDs, migration, anti-amplification, TLS 1.3, streams and congestion control.
- `pause()` and `resume()` are available when you need to temporarily stop and continue the listening flow.

## Full Example

```php
use function getenv;
use function shell_exec;

use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Interfaces\UDP_Server_CLI;
use Bootgly\WPI\Interfaces\UDP_Server_CLI\Configs;
use Bootgly\WPI\Interfaces\UDP_Server_CLI\Events;


return new Project(
   name: 'Demo UDP Server CLI',
   description: 'Demonstration project for Bootgly UDP Server CLI',
   version: '1.0.0',
   author: 'Bootgly',
   exportable: true,

   boot: function (array $arguments = [], array $options = []): void
   {
      $Server = new UDP_Server_CLI(Mode: match (true) {
         isset($options['i']) => Modes::Interactive,
         isset($options['m']) => Modes::Monitor,
         default => Modes::Daemon
      });

      $Server->configure(
         new Configs(
            host: '0.0.0.0',
            port: getenv('PORT') ? (int) getenv('PORT') : 9999,
            workers: max(1, (int) shell_exec('nproc') ?: 1)
         )
      );

      $Server->on(Events::DatagramReceive, fn ($input) => $input);

      $Server->start();
   }
);
```

## Reference

### `UDP_Server_CLI`

```php
public function __construct (
   Modes $Mode = Modes::Monitor
)
```

Creates the UDP server shell in the selected operational mode.

```php
public function configure (Configuring ...$Configs): self
```

Applies each configuration concern atomically before startup. A running server rejects
reconfiguration without mutating its active transport, policy or Router.

### `UDP_Server_CLI\Configs`

```php
public function __construct (
   Argument $Named = Argument::Undefined,
   null|string $host = null,
   null|int $port = null,
   null|int $workers = null,
   null|string $user = null,
   null|string $group = null,
   int $maxConnections = 1024,
   int $maxConnectionsPerIP = 256,
   int $connectionIdleTimeout = 30,
   int $maxDatagramsPerTick = 64
)
```

Creates the transport configuration and fixes worker-local peer-retention boundaries for
that server. Global, per-IP and idle values of `0` explicitly disable that boundary.
