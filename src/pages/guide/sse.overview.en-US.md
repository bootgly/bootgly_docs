# Server-Sent Events (SSE)

Bootgly streams live server push to browsers over plain HTTP with the `SSE` response
resource — the `text/event-stream` protocol consumed natively by `EventSource`. No
WebSocket handshake, no client library: one long-lived response, events whenever the
server has something to say, automatic client reconnection with resume.

It works on HTTP/1.1 (chunked stream on a dedicated connection) and HTTP/2 (a sustained
stream — the connection keeps serving other requests) with the same API.

## Open a stream

Grab the `SSE` resource from the Response inside any route handler, configure it and call
`open()`. The head goes out immediately; the connection stays open for push:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\SSE;

$Router->route('/events', function (Request $Request, Response $Response): Response {
   $SSE = $Response->SSE;
   $SSE->heartbeat = 15;   // keep-alive comment after 15s of silence
   $SSE->retry = 3000;     // client reconnection delay (ms)

   $SSE->open(
      Tick: static function (SSE $SSE): void {
         $SSE->send(data: ['time' => date('H:i:s')], event: 'tick');
      },
      interval: 1           // run the Tick every second
   );

   return $Response;
}, GET);
```

The `Tick` closure is driven by the server's timer — one call every `interval` seconds
until the stream ends. You can also send events directly after `open()` (or from anywhere
you keep the `$SSE` handle) — `send()` writes straight to the client:

```php
$SSE->open();
$SSE->send('deploy started', event: 'status', id: '1');
$SSE->send(['progress' => 42], event: 'status', id: '2');
$SSE->close();
```

Non-string data is JSON-encoded automatically. Multi-line strings become one `data:` line
per line, exactly as the spec expects.

## Consume with EventSource

The browser side is three lines — reconnection, `Last-Event-ID` and retry backoff are
built into `EventSource`:

```js
const source = new EventSource('/events');

source.addEventListener('tick', (event) => {
   console.log(JSON.parse(event.data));
});
```

Or watch the raw stream with curl:

```bash
curl -N http://localhost:8082/events
```

```text
retry: 3000

event: tick
data: {"time":"14:07:31"}

: ← keep-alive comment after 15s of silence
```

## Resume with Last-Event-ID

When the connection drops, `EventSource` reconnects automatically and resends the last
event id it saw in a `Last-Event-ID` header. The resource exposes it as `$SSE->last` —
use it to resume the stream instead of starting over:

```php
$Router->route('/events', function (Request $Request, Response $Response): Response {
   $SSE = $Response->SSE;

   $count = (int) $SSE->last;   // '' on a first connection

   $SSE->open(
      Tick: static function (SSE $SSE) use (&$count): void {
         $count++;
         $SSE->send(data: "message #{$count}", id: (string) $count);
      },
      interval: 2
   );

   return $Response;
}, GET);
```

Set `id:` on every event you may want to resume from — the framework only transports the
header; what "resuming" means (an offset, a database cursor, a queue position) is your
application's call.

## React to disconnects

Pass a `Close` hook to `open()` — it runs exactly once when the stream ends, on any path:
a graceful `close()`, the client going away, or the connection dropping:

```php
$SSE->open(
   Tick: static function (SSE $SSE): void {
      $SSE->send(['tick' => time()]);
   },
   interval: 1,
   Close: static function (SSE $SSE): void {
      // unregister from your userland registry, release resources...
   }
);
```

A failed write tears the stream down immediately; a silent peer is detected by the
supervisor within one cadence (a few seconds). The keep-alive heartbeat (`heartbeat`,
default 15s) keeps intermediaries — nginx, load balancers — from reaping an idle stream;
set `0` to disable it.

## Push from elsewhere in the worker

`send()` is not confined to the `Tick` — keep the handle and push when something happens
(another request's handler, a timer, a queue consumer in the same worker):

```php
// a userland registry of open streams (per worker)
$Streams = [];

$Router->route('/events', function (Request $Request, Response $Response) use (&$Streams): Response {
   $SSE = $Response->SSE;
   $Streams[] = $SSE->open(Close: static function (SSE $SSE) use (&$Streams): void {
      $Streams = array_filter($Streams, static fn (SSE $Open): bool => $Open !== $SSE);
   });

   return $Response;
}, GET);

$Router->route('/notify', function (Request $Request, Response $Response) use (&$Streams): Response {
   foreach ($Streams as $SSE) {
      $SSE->send($Request->input, event: 'notice');
   }

   return $Response->send('delivered to ' . count($Streams) . ' stream(s)');
}, POST);
```

Cross-worker fan-out (broadcasting to streams held by other worker processes) is not
built in yet — scale reads with one worker per stream-heavy port, or relay through your
own pub/sub for now.

## What v1 does not do

- **Cross-worker broadcast** — same-worker push only (see above).
- **Event replay storage** — `Last-Event-ID` is exposed; persistence is userland.
- **Compression on streams** — event frames go out uncompressed.
- **Middleware post-processing** — the head is on the wire when `open()` returns; set
  CORS or custom headers on the Response *before* calling `open()`.

## Reference

```php
public function open (null|Closure $Tick = null, int $interval = 1, null|Closure $Close = null): self
```

Opens the event stream: writes the `text/event-stream` head (preserving headers already
set on the Response), marks the Response deferred and installs the supervisor. `$Tick`
runs every `$interval` seconds (whole seconds — the server timer granularity); `$Close`
runs exactly once on teardown. Idempotent: a second call returns the same resource
untouched. On HTTP/1.0 requests it refuses with `505` (interim/unbounded streams are
HTTP/1.1+).

```php
public function send (mixed $data, null|string $event = null, null|string $id = null): bool
```

Sends one event. Non-string `$data` is JSON-encoded; multi-line data becomes one `data:`
line per line. `$event` names the event type (`addEventListener` on the client); `$id`
sets the client's `Last-Event-ID`. Returns `false` once the stream is closed or the
transport is gone.

```php
public function ping (string $comment = ''): bool
```

Sends one comment line (`: <comment>`) — invisible to `EventSource`, it only keeps the
connection warm. The supervisor calls it automatically per the `heartbeat` config.

```php
public function close (): void
```

Ends the stream gracefully: the HTTP/1.1 connection sends its terminal chunk and closes;
the HTTP/2 stream ends with `END_STREAM` while the connection keeps serving other
streams. Fires the `Close` hook.

```php
public function disconnect (): void
```

Teardown only — no wire writes. Invoked automatically on any connection-close path;
idempotent. Prefer `close()` for a graceful end.

### Configuration properties

```php
public int $heartbeat = 15;
```

Seconds of write silence before a keep-alive comment goes out. `0` disables the
heartbeat.

```php
public int $retry = 0;
```

Client reconnection delay in milliseconds, sent once right after `open()` as a `retry:`
field. `0` omits it (browsers then use their own default, usually ~3s).

```php
public private(set) string $last;
```

The `Last-Event-ID` request header — the client's resume point; empty string on a first
connection.

```php
public private(set) bool $opened;
public private(set) bool $closed;
```

Stream state, readable at any time.
