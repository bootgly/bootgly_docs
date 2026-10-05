# WS Server CLI

`Bootgly\WPI\Nodes\WS_Server_CLI` is a native, dependency-free WebSocket server. It runs on the
same event-driven, multi-worker transport as the HTTP Server CLI (RFC 6455 framing, `stream_select`
loop, backpressure-aware writes) — so a real-time app is a handful of `on()` callbacks, not a new
runtime.

It speaks RFC 6455 (handshake, text/binary messages, fragmentation, ping/pong) and RFC 7692
(`permessage-deflate` compression), with rooms for broadcasting and an optional handshake
authentication step. The deeper features have their own pages: **Channels**, **Compression** and
**Authentication**.

> [!NOTE]
> `broadcast()` fans out **across workers**: each `SO_REUSEPORT` worker keeps its own connection set,
> and a per-worker datagram relay (built before fork) republishes the frame to peer workers, so every
> member receives it no matter which worker holds the connection — no sticky load balancer needed.
> Cross-worker envelopes are capped at 64 KiB per frame: a larger broadcast still reaches every
> member on the local worker, but peer workers are skipped.

## Start an echo server

The server is driven by callbacks. `MessageReceived` receives the decoded `Message`; **return a
string** and it is framed straight back to the sender:

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Nodes\WS_Server_CLI;
use Bootgly\WPI\Nodes\WS_Server_CLI\Events;

$WS = new WS_Server_CLI(Mode: Modes::Foreground);
$WS->configure(new WS_Server_CLI\Configs(host: '0.0.0.0', port: 8083, workers: 1));

$WS
   ->on(Events::Connected, function ($Session) {
      // a client finished the handshake
   })
   ->on(Events::MessageReceived, function ($Session, $Message) {
      return "echo: {$Message->payload}";   // text reply, framed for you
   })
   ->on(Events::Disconnected, function ($Session) {
      // the client (or the server) closed the connection
   });

$WS->start();
```

> [!IMPORTANT]
> `configure()` is variadic over **Configs** value objects — one per concern, applied in any order.
> Every Configs is **named-arguments only**: its first parameter is a guard slot you never fill, so a
> positional `new WS_Server_CLI\Configs('0.0.0.0', 8083, 1)` raises a `TypeError`. Handing two instances
> of the same Configs class to one `configure()` call throws an `InvalidArgumentException`, and a
> `configure()` that never carried `host`, `port` and `workers` throws an `ArgumentCountError`.

Connect from a browser to confirm:

```js
const ws = new WebSocket('ws://127.0.0.1:8083');
ws.onopen = () => ws.send('hello');
ws.onmessage = (e) => console.log(e.data);   // "echo: hello"
```

In a real project this lives inside the project `boot` closure and is launched with
`bootgly project <Project> start` (see `projects/Demo/WS_Server_CLI`).

## Receive and reply

The `MessageReceived` handler is given `($Session, $Message)`:

- `$Message->payload` — the full (reassembled, decompressed) message bytes.
- `$Message->binary` — `true` for a binary message, `false` for text.

Returning a `string` sends one text frame back. To reply with **binary**, or to send more than
one frame, call `$Session->send()` yourself and return nothing:

```php
->on(Events::MessageReceived, function ($Session, $Message) {
   $Session->send($Message->payload, binary: true);   // echo as binary
   $Session->send('and a follow-up');
})
```

## Send anytime

`$Session` is your handle to one client. Hold a reference to it (e.g. in a presence map keyed by
`$Session->id`) and push to it whenever you like — server-initiated frames go through the same
backpressure-aware writer:

```php
$Session->send('a server push');
$Session->close(1000, 'bye');   // close code + optional reason
```

## Ping / pong heartbeat

The server keeps connections alive with its own supervisor. With `heartbeatInterval` (seconds,
default `30`), an idle peer is pinged; a peer that misses the pong — or whose socket closes — is
reaped and fires `Disconnected`. Inbound client pings are answered with a pong automatically; your
handler never sees control frames.

```php
$WS->configure(
   new WS_Server_CLI\Configs(host: '0.0.0.0', port: 8083, workers: 1, heartbeatInterval: 20)
);
```

Set `heartbeatInterval: 0` to disable server pings and rely on `idleTimeout` instead.

Bytes in flight count as activity, so a peer that keeps sending is never pinged. What bounds a
message that never finishes is `maxMessageWallTime` (seconds, default `60`, at least `1`): from the
first byte the server holds of an unfinished message — a frame that spans reads, or a fragmented
message still waiting for its final frame — to that final frame. Past it the session is closed with
`1008`. The supervisor checks it on its own tick — `heartbeatInterval`, or with the heartbeat off the
shorter of `idleTimeout` (30 s when unset) and `maxMessageWallTime` — so the close lands up to one tick
late. At the
default, an 8 MiB message must arrive at roughly 140 KiB/s or faster; raise the value for slower
senders.

```php
$WS->configure(
   new WS_Server_CLI\Configs(host: '0.0.0.0', port: 8083, workers: 1, maxMessageWallTime: 120)
);
```

## Secure (wss://)

Pass a TLS stream-context array as `secure` to serve `wss://`. TLS is terminated by the transport
before the WebSocket handshake, so nothing else in your handlers changes:

```php
$WS->configure(
   new WS_Server_CLI\Configs(
      host: '0.0.0.0',
      port: 8443,
      workers: 1,
      secure: [
         'local_cert' => '/path/to/cert.pem',
         'local_pk'   => '/path/to/key.pem',
      ]
   )
);
```

Clients then connect with `new WebSocket('wss://host:8443')`.

---

## Reference

### Events

```php
use Bootgly\WPI\Nodes\WS_Server_CLI\Events;
```

`Connected`, `MessageReceived`, `Disconnected`, `ServerAdvertised`, `ServerStarted`, `ServerStopped`.
Register each with `on()`. `Connected`/`Disconnected` receive `($Session)`; `MessageReceived` receives
`($Session, $Message)`; `ServerAdvertised`/`ServerStarted`/`ServerStopped` receive `($Server)` —
`ServerAdvertised` fires on the process that owns the terminal (on Daemon mode, the launcher):
compose the launch banner there and call `$Server->advertise()` for the endpoint lines.

### Methods

```php
new WS_Server_CLI (Modes $Mode = Modes::Daemon)
```

Create the server. `Mode` is one of `Foreground`, `Daemon`, `Interactive`, `Monitor`, `Test`
(`Bootgly\API\Endpoints\Server\Modes`).

```php
configure (Configuring ...$Configs): self
```

Apply one **Configs** value object per concern, in any order — for the WebSocket server that is
`WS_Server_CLI\Configs` (`Configuring` is `Bootgly\ABI\Configs`). Chainable. The same Configs class
twice in one call throws an `InvalidArgumentException`; a server that never received `host`, `port`
and `workers` throws an `ArgumentCountError`.

```php
new WS_Server_CLI\Configs (
   Argument $Named = Argument::Undefined, // guard slot — never pass it
   null|string $host = null, null|int $port = null, null|int $workers = null,
   null|array $secure = null,
   null|string $user = null, null|string $group = null,
   int $heartbeatInterval = 30,
   null|int $idleTimeout = null,
   int $maxFrameSize = 1048576,
   int $maxMessageSize = 8388608,
   int $maxMessageWallTime = 60,
   array $subprotocols = [],
   bool $compression = true,
   array $Guards = [],
   null|int $maxConnections = null,
   null|int $maxConnectionsPerIP = null,
   null|int $headroom = null,
   null|int $maxWorkerPendingBytes = null,
   null|Closure $Fallback = null
)
```

Binds host/port and sets the per-connection policy — **named arguments only** (a guard slot precedes
every parameter, so a positional call raises a `TypeError`). `heartbeatInterval` is the server ping
cadence in seconds (`0` disables). `idleTimeout` reaps silent peers when heartbeat is off.
`maxFrameSize` (1 MiB) and `maxMessageSize` (8 MiB) cap a single frame and a reassembled message —
exceeding either closes with `1009`. `maxMessageWallTime` (60 s) bounds how long an unfinished
message may stay held — past it the session closes with `1008` (see *Ping / pong heartbeat*).
`subprotocols` is the server's ordered preference list.
`compression` toggles `permessage-deflate`. `Guards` is a list of handshake auth guards.
`maxConnections` / `maxConnectionsPerIP` cap established connections per worker and per client IP.
`headroom` (default `32`) is the number of selector entries each worker keeps free for its own
dependency I/O by shedding clients earlier: the selector admits `1000` entries, so clients stop at
`1000 − headroom` (968 by default) even when `maxConnections` is higher. The listener takes one of
the reserved entries and, with more than one worker, the broadcast relay another, so size it to at
least the sum of the `pool.max` of the worker's resources plus one for each of them; `0` disables it.
`maxWorkerPendingBytes` is the worker's memory budget for bytes held between reads (`null` keeps the
transport default, 64 MiB). Pending output and inbound holds — partial frames and unfinished
messages — share it, and inbound holds take at most half, so output always keeps room. An inbound
hold is charged at what PHP's allocator spends to keep it (a held string just over 1 MiB costs a
whole 2 MiB chunk), not at its length. When an inbound hold does not fit, the session holding the
most inbound bytes is closed with `1009` while it holds more than the asking session would hold after
this read; otherwise the asking session is. A refused output reservation drops that connection. The budget bounds bytes held between
reads, not message size: a frame or final fragment that completes within one read and the inflated
payload of a compressed message are not charged — `maxFrameSize` and `maxMessageSize` cap those.
Pending output is charged at its length, and PHP can spend up to about twice that to keep it, so keep
`memory_limit` above about twice the budget plus `maxMessageSize`, about five times `maxFrameSize`
(decode copies) and the application's own heap — at the defaults about 150 MiB plus the application:
raise `memory_limit` (256M) or lower the budget (32 MiB under 128M). Directly reachable servers (no
proxy in front) should also set `maxConnectionsPerIP`.
`Fallback` answers plain (non-upgrade) HTTP requests — e.g. serving the client page on the same
port. `secure` is a TLS stream-context array for `wss://`.

`host`, `port` and `workers` carry a `null` default only because the guard slot precedes them — PHP forbids a required parameter after an optional one. They are mandatory all the same: omitting one throws an `ArgumentCountError`.

```php
on (Event&BackedEnum $Event, Closure $Callback): self
```

Register one handler for a `WS_Server_CLI\Events` case. Chainable. Registering the same event twice
throws.

```php
start (): bool
```

Boot, fork the workers and enter the event loop. Blocking in `Foreground`/`Monitor`; detaches in
`Daemon`.

```php
Session->send (string $payload, bool $binary = false, int $fragment = 0): bool
```

Send one message to this client — text by default, binary when `$binary` is `true`. Compressed
automatically when the session negotiated `permessage-deflate`. Pass `$fragment` > 0 to split the
(post-compression) payload into frames of at most that many bytes — a lead frame followed by
continuation frames — instead of a single frame.

```php
Session->ping (string $payload = ''): bool
```

Send a ping control frame; the client's pong clears the liveness timer.

```php
Session->close (int $code = 1000, string $reason = ''): bool
```

Send a close frame and tear the connection down (fires `Disconnected`).

### Session properties

`id` (int, the connection id), `ip`, `port`, `subprotocol` (negotiated, or `''`), `identity` (set by
an auth guard, or `null`). Room helpers (`join`/`leave`/`broadcast`) are documented on the
**Channels** page.

### Message properties

`payload` (string — reassembled and decompressed), `binary` (bool), `opcode` (int).
