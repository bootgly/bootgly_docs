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

## Start an echo server

The server is driven by callbacks. `MessageReceived` receives the decoded `Message`; **return a
string** and it is framed straight back to the sender:

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Nodes\WS_Server_CLI;
use Bootgly\WPI\Nodes\WS_Server_CLI\Events;

$WS = new WS_Server_CLI(Mode: Modes::Foreground);
$WS->configure(host: '0.0.0.0', port: 8083, workers: 1);

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
$WS->configure(host: '0.0.0.0', port: 8083, workers: 1, heartbeatInterval: 20);
```

Set `heartbeatInterval: 0` to disable server pings and rely on `idleTimeout` instead.

## Secure (wss://)

Pass a TLS stream-context array as `secure` to serve `wss://`. TLS is terminated by the transport
before the WebSocket handshake, so nothing else in your handlers changes:

```php
$WS->configure(
   host: '0.0.0.0',
   port: 8443,
   workers: 1,
   secure: [
      'local_cert' => '/path/to/cert.pem',
      'local_pk'   => '/path/to/key.pem',
   ],
);
```

Clients then connect with `new WebSocket('wss://host:8443')`.

---

## Reference

### Events

```php
use Bootgly\WPI\Nodes\WS_Server_CLI\Events;
```

`Connected`, `MessageReceived`, `Disconnected`, `ServerStarted`, `ServerStopped`. Register each with
`on()`. `Connected`/`Disconnected` receive `($Session)`; `MessageReceived` receives
`($Session, $Message)`; `ServerStarted`/`ServerStopped` receive `($Server)`.

### Methods

```php
new WS_Server_CLI (Modes $Mode = Modes::Daemon)
```

Create the server. `Mode` is one of `Foreground`, `Daemon`, `Interactive`, `Monitor`, `Test`
(`Bootgly\API\Endpoints\Server\Modes`).

```php
configure (
   string $host, int $port, int $workers,
   null|array $secure = null,
   null|string $user = null, null|string $group = null,
   int $heartbeatInterval = 30,
   null|int $idleTimeout = null,
   int $maxFrameSize = 1048576,
   int $maxMessageSize = 8388608,
   array $subprotocols = [],
   bool $compression = true,
   array $guards = [],
   null|int $maxConnections = null,
   null|int $maxConnectionsPerIP = null
): self
```

Binds host/port and sets the per-connection policy. `heartbeatInterval` is the server ping cadence
in seconds (`0` disables). `idleTimeout` reaps silent peers when heartbeat is off. `maxFrameSize`
(1 MiB) and `maxMessageSize` (8 MiB) cap a single frame and a reassembled message — exceeding
either closes with `1009`. `subprotocols` is the server's ordered preference list. `compression`
toggles `permessage-deflate`. `guards` is a list of handshake auth guards. `secure` is a TLS
stream-context array for `wss://`.

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
