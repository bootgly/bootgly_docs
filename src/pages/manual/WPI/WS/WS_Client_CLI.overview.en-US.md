# WS Client CLI

`Bootgly\WPI\Nodes\WS_Client_CLI` is a native, dependency-free WebSocket client. It runs on the same
event-driven transport as the HTTP Client CLI (`stream_select` loop, TLS via stream context) and is
wire-compatible with the **WS Server CLI** — so talking to a WebSocket endpoint is a handful of
`on()` callbacks, not a new runtime.

It speaks RFC 6455 (handshake, masked text/binary frames, fragmentation, ping/pong) and RFC 7692
(`permessage-deflate`), over `ws://` and `wss://`.

> [!NOTE]
> Per RFC 6455 §5.1 every client frame is **masked** with a fresh random key — `send()` handles that
> for you. Frames from the server are expected **unmasked**; a masked server frame is a protocol
> error and closes the connection.

## Connect to an echo server

The client is driven by callbacks. `connect()` builds the upgrade request, dials the server, and runs
the event loop until the connection closes — so it **blocks**, like running a client app:

```php
use Bootgly\WPI\Nodes\WS_Client_CLI;
use Bootgly\WPI\Nodes\WS_Client_CLI\Events;

$WS = new WS_Client_CLI();
$WS->configure(host: '127.0.0.1', port: 8083);

$WS
   ->on(Events::Connected, function ($Session) {
      $Session->send('hello');           // the 101 was verified
   })
   ->on(Events::MessageReceived, function ($Session, $Message) {
      echo $Message->payload;            // the server's reply
      $Session->close();                 // done — ends the loop
   })
   ->on(Events::Disconnected, function ($Session) {
      // the server (or this client) closed the connection
   });

$WS->connect('/');
```

In a real project this lives inside the project `boot` closure (see `projects/Demo/WS_Client_CLI`).

## Receive and send

`MessageReceived` is given `($Session, $Message)`:

- `$Message->payload` — the full (reassembled, decompressed) message bytes.
- `$Message->binary` — `true` for a binary message, `false` for text.

`$Session` is your handle to the connection. Send text or binary at any time, from any callback:

```php
->on(Events::Connected, function ($Session) {
   $Session->send('a text message');
   $Session->send($bytes, binary: true);            // binary
   $Session->send($big, fragment: 16384);           // split into <=16 KiB frames
})
```

## Subprotocols and headers

Offer subprotocols and add upgrade headers (e.g. `Origin`, `Authorization`) on `connect()`:

```php
$WS->connect(
   '/chat',
   headers: [
      'Origin'        => 'https://app.example',
      'Authorization' => 'Bearer ' . $token,        // handshake auth
   ],
   subprotocols: ['json', 'chat'],
);

// the server's choice, once Connected:
$Session->subprotocol;   // e.g. 'json', or '' if none
```

## Compression (permessage-deflate)

Compression is **on by default**: the client offers `permessage-deflate`, and when the server accepts
it, outbound messages are deflated and inbound ones inflated automatically — your handlers always see
plain bytes. Check what was negotiated with `$Session->Deflator !== null`. Disable the offer with
`compression: false`:

```php
$WS->configure(host: '127.0.0.1', port: 8083, compression: false);
```

## Heartbeat

Set `heartbeatInterval` (seconds) to have the client ping an idle server and reap a peer that misses
the pong. It is `0` (off) by default — the client always answers server pings with a pong regardless:

```php
$WS->configure(host: '127.0.0.1', port: 8083, heartbeatInterval: 20);
```

## Reconnect

Enable `reconnect` to auto re-dial after an **abrupt** drop (a peer reset or transport error with no
WebSocket close frame). Each attempt uses capped exponential backoff — `reconnectDelay` doubling up to
`reconnectMaxDelay` — for up to `reconnectAttempts` tries (`0` = unlimited). A **graceful** close (your
`$Session->close()`, a server close frame, or a protocol fault) does **not** reconnect; the loop ends.

```php
$WS->configure(
   host: '127.0.0.1', port: 8083,
   reconnect: true,
   reconnectAttempts: 0,    // unlimited
   reconnectDelay: 1,       // 1s, 2s, 4s, ... capped at reconnectMaxDelay
   reconnectMaxDelay: 30,
);
```

`Connected` fires again on each successful re-handshake and `Disconnected` on each drop; the backoff
resets after a successful connection.

## Concurrent clients

`connect()` drives **one** connection and blocks. To run **several** clients at once in a single
process — a small pool, or fan-out to multiple endpoints — give each its own `WS_Client_CLI`, `open()`
each (non-blocking), then run the shared loop once with the static `WS_Client_CLI::run()`:

```php
use Bootgly\WPI\Nodes\WS_Client_CLI;
use Bootgly\WPI\Nodes\WS_Client_CLI\Events;

$Clients = [];
foreach (['/rooms/a', '/rooms/b', '/rooms/c'] as $path) {
   $WS = new WS_Client_CLI();
   $WS->configure(host: '127.0.0.1', port: 8083);
   $WS
      ->on(Events::Connected, fn ($Session) => $Session->send('hi'))
      ->on(Events::MessageReceived, function ($Session, $Message) {
         echo $Message->payload;
      });

   $WS->open($path);          // non-blocking: dials, does NOT run the loop
   $Clients[] = $WS;
}

WS_Client_CLI::run();         // one shared loop; returns when the LAST connection closes
```

Each client keeps its own handlers and its own `Session`, so events never cross between connections.
Construct every client and `open()` it **before** calling `run()`.

> [!NOTE]
> `reconnect` applies to the single blocking `connect()` only. In concurrent mode an abrupt drop simply
> removes that client from the shared loop; `run()` returns once the last connection is gone.

## Secure (wss://)

Pass a TLS stream-context array as `secure` to connect over `wss://`. TLS is established before the
WebSocket handshake, so nothing else in your handlers changes:

```php
$WS->configure(
   host: 'example.com',
   port: 443,
   secure: [
      'verify_peer' => true,
      // 'peer_name' is set to host automatically
   ],
);
```

---

## Reference

### Events

```php
use Bootgly\WPI\Nodes\WS_Client_CLI\Events;
```

`Connected`, `MessageReceived`, `Disconnected`. Register each with `on()`. `Connected`/`Disconnected`
receive `($Session)`; `MessageReceived` receives `($Session, $Message)`. `Connected` fires only after
the `101` response is verified (status line + `Sec-WebSocket-Accept`).

### Methods

```php
new WS_Client_CLI ()
```

Create the client.

```php
configure (
   string $host, int $port, int $workers = 0,
   null|array $secure = null,
   int $heartbeatInterval = 0,
   int $maxFrameSize = 1048576,
   int $maxMessageSize = 8388608,
   bool $compression = true,
   bool $reconnect = false,
   int $reconnectAttempts = 0,
   int $reconnectDelay = 1,
   int $reconnectMaxDelay = 30
): self
```

Sets the target and the per-connection policy. `heartbeatInterval` is the client ping cadence in
seconds (`0` disables). `maxFrameSize` (1 MiB) and `maxMessageSize` (8 MiB) cap a single inbound frame
and a reassembled message — exceeding either closes with `1009`. `compression` toggles the
`permessage-deflate` offer. `secure` is a TLS stream-context array for `wss://` (`peer_name` defaults
to `host`). `reconnect` auto re-dials after an abrupt drop with capped exponential backoff
(`reconnectDelay` → `reconnectMaxDelay`, up to `reconnectAttempts`, `0` = unlimited); graceful closes
do not reconnect.

```php
on (Event&BackedEnum $Event, Closure $Callback): self
```

Register one handler for a `WS_Client_CLI\Events` case. Chainable. Registering the same event twice
throws.

```php
connect (string $URI = '/', array $headers = [], array $subprotocols = [])
```

Generate the `Sec-WebSocket-Key`, send the upgrade `GET` (with `$headers` and any offered
`$subprotocols`), then run the event loop until the connection closes. Blocking.

```php
open (string $URI = '/', array $headers = [], array $subprotocols = [])
```

Like `connect()`, but **non-blocking**: dials and returns without running the event loop, so several
clients can be opened and then driven together by `run()`. Reconnect does not apply in this mode.
Returns the socket, or `false` on dial failure.

```php
WS_Client_CLI::run (): void
```

Run the shared event loop until every `open()`ed connection has closed. Static — call it once, after
opening all clients.

```php
Session->send (string $payload, bool $binary = false, int $fragment = 0): bool
```

Send one message — text by default, binary when `$binary` is `true`. Masked automatically; compressed
when the session negotiated `permessage-deflate`. Pass `$fragment` > 0 to split the (post-compression)
payload into frames of at most that many bytes.

```php
Session->ping (string $payload = ''): bool
```

Send a ping control frame; the server's pong clears the liveness timer.

```php
Session->close (int $code = 1000, string $reason = ''): bool
```

Send a close frame and tear the connection down (fires `Disconnected`, ends the loop).

### Session properties

`subprotocol` (negotiated, or `''`), `Deflator` (non-`null` when `permessage-deflate` is active),
`established` (bool), `key` (the sent `Sec-WebSocket-Key`).

### Message properties

`payload` (string — reassembled and decompressed), `binary` (bool), `opcode` (int).
