# HTTP Client CLI

The HTTP Client CLI is the native HTTP client of the Bootgly PHP Framework. It is built on top of the TCP Client CLI infrastructure with a fully event-driven, non-blocking architecture — 100% pure PHP, no cURL, no extensions.

## Features

| Feature | Description |
|---|---|
| **HTTP Methods** | GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS |
| **RFC 9112 Decoding** | Chunked transfer-encoding, content-length, close-delimited |
| **100-Continue** | Two-phase request: headers-first, body on server acceptance |
| **1xx Informational** | Full handling of informational responses |
| **Body Encoding** | Raw, JSON, form-urlencoded |
| **Headers** | Multi-value response headers, OWS trimming per RFC 7230 |
| **Keep-Alive** | Automatic connection reuse (`Connection: keep-alive`) |
| **Connection Pool** | Per-origin pool with `min`/`max` bounds, keep-alive reuse, stale re-dial |
| **HTTP/2** | TLS-ALPN negotiation, h2c prior knowledge, multiplexed batch streams |
| **Pipelining** | Queue multiple requests per connection |
| **Batch Mode** | `batch()` + multiple `request()` + `drain()` |
| **Event-Driven** | Async mode via `on()` hooks with per-socket request tracking |
| **SSL/TLS** | Full HTTPS support |
| **Redirects** | Automatic follow up to configurable limit |
| **Timeouts** | Connection and response timeout |
| **Retries** | Exponential backoff with jitter, opt-in HTTP-level retry honoring `Retry-After` |
| **Multi-Worker** | Fork-based load generation for benchmarking |

## Quick Start

### Simple GET Request

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI;


$Client = new HTTP_Client_CLI;
$Client->configure(host: 'example.com', port: 80);

$Response = $Client->request(method: 'GET', URI: '/');

echo $Response->code;   // 200
echo $Response->body;   // '<!doctype html>...'
```

### POST with JSON Body

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI;


$Client = new HTTP_Client_CLI;
$Client->configure(host: 'api.example.com', port: 443, secure: []);

$Response = $Client->request(
   method: 'POST',
   URI: '/users',
   headers: ['Accept' => 'application/json'],
   body: ['name' => 'Bootgly', 'role' => 'framework']
);

echo $Response->code;                       // 201
$data = $Response->Body->decode('json');     // ['id' => 1, ...]
```

### POST with Form Data

```php
$Response = $Client->request(
   method: 'POST',
   URI: '/login',
   headers: ['Content-Type' => 'application/x-www-form-urlencoded'],
   body: 'username=admin&password=secret'
);
```

## Configuration

The `configure()` method accepts the following parameters:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | — | Target host to connect to. |
| `port` | `int` | — | Target port. |
| `workers` | `int` | `0` | Number of worker processes (for benchmarking). |
| `secure` | `array\|null` | `null` | Secure SSL/TLS stream context options. Set to `[]` for default TLS. Auto-sets `peer_name` for hostname verification. |
| `pool` | `array\|null` | `null` | Connection pool bounds: `['min' => N, 'max' => N]`. Defaults: min `0`, max `1`. |
| `enableHTTP2` | `bool\|null` | `null` | HTTP/2 negotiation: `null` = ALPN when `secure` is set; `true` = also h2c on cleartext; `false` = never. |

### Client Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `maxRedirects` | `int` | `10` | Maximum redirects to follow (0 = disabled). |
| `connectTimeout` | `int\|float` | `30` | Connection timeout in seconds. |
| `timeout` | `int\|float` | `30` | Response timeout in seconds. |
| `maxResponseBytes` | `int` | `0` | Maximum raw response bytes — headers + body (0 = unbounded). |
| `maxRetries` | `int` | `0` | Maximum retries on failure (0 = disabled). |
| `retryDelay` | `int\|float` | `1.0` | Base backoff delay in seconds — doubles on each attempt. |
| `retryMaxDelay` | `int\|float` | `30.0` | Backoff delay cap in seconds. |
| `retryTimeout` | `int\|float` | `60.0` | Wall-clock retry campaign budget per request in seconds (0 = unbounded). |
| `retryJitter` | `float` | `0.25` | Proportional jitter fraction applied to each backoff delay. |
| `retryOn` | `array` | `[]` | Opt-in HTTP-level retry status codes (e.g. `[429, 503]`). |
| `enableHTTP2` | `bool\|null` | `null` | HTTP/2 negotiation mode (see the HTTP/2 section). |

```php
$Client = new HTTP_Client_CLI;
$Client->configure(host: 'api.example.com', port: 443, secure: []);

// ? Configure
$Client->maxRedirects = 5;
$Client->timeout = 10;
$Client->maxRetries = 3;
$Client->retryDelay = 0.5;
```

## SSL/TLS (HTTPS)

Enable HTTPS by passing the `secure` parameter to `configure()`:

```php
// @ Default TLS settings (auto peer_name verification)
$Client->configure(host: 'secure.example.com', port: 443, secure: []);

// @ Custom SSL options
$Client->configure(host: 'secure.example.com', port: 443, secure: [
   'peer_name' => 'secure.example.com',
   'verify_peer' => true,
   'verify_peer_name' => true,
]);
```

When `secure` is not `null` and `peer_name` is not set, the client automatically uses the `host` parameter for hostname verification.

## Connection Pool

The client keeps a per-origin connection pool in sync/batch modes. Keep-alive connections are parked between requests and transparently reused, instead of dialing a new connection per request:

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI;


$Client = new HTTP_Client_CLI;
$Client->configure(
   host: 'api.example.com',
   port: 443,
   secure: [],
   pool: ['min' => 2, 'max' => 8]
);

// @ The first request lazily pre-dials the pool up to `min` (2 connections)
$Response1 = $Client->request(method: 'GET', URI: '/users');

// @ Subsequent requests reuse the parked keep-alive connections
$Response2 = $Client->request(method: 'GET', URI: '/posts');
```

Combined with batch mode, `max` bounds the concurrency — overflow requests queue and are promoted as connections free up:

```php
$Client = new HTTP_Client_CLI;
$Client->configure(host: 'api.example.com', port: 443, secure: [], pool: ['max' => 4]);

$Client->batch();

$Responses = [];
for ($id = 1; $id <= 10; $id++) {
   $Responses[] = $Client->request(method: 'GET', URI: "/users/{$id}");
}

$Client->drain();
// @ 10 requests over at most 4 connections — the overflow queued and promoted
```

Pool rules:

- Defaults are `min` = `0`, `max` = `1`; `max` is capped at 1000 (the Select event backend limit) and `min` is clamped to `max`.
- `min` pre-dials lazily on the first request — warm connections park idle in the pool.
- A keep-alive response releases its connection back to the pool; a `Connection: close` response drops it.
- Stale parked connections are handled transparently: a non-consuming liveness probe discards dead sockets on acquire, and a request dispatched on a reused connection that dies before **any** response byte arrives is replayed once on a fresh connection (any method — it was provably never processed — and it does not consume `maxRetries`).
- The pool is per-origin by construction: reconfiguring to another host/port retires every pooled connection of the previous origin. When `configure()` is called again without a `pool` argument, the previous bounds are kept.

Idle connections can be aged out with the pool `expiration` (seconds; `0` = never evict):

```php
$Client->Pool->expiration = 60;  // evict connections parked for more than 60s
```

The pool state is publicly readable for observability:

```php
echo $Client->Pool->created;       // live pooled connections
echo count($Client->Pool->idle);   // parked connections
echo count($Client->Pool->busy);   // in-flight connections
```

## HTTP/2

The client speaks HTTP/2 with three negotiation modes, controlled by `enableHTTP2` (`configure()` parameter or public property):

| `enableHTTP2` | Behavior |
|---|---|
| `null` (default) | Offers `h2,http/1.1` via TLS-ALPN when `secure` is set. Cleartext stays HTTP/1.1. |
| `true` | Additionally speaks h2c **prior knowledge** on cleartext connections (explicit opt-in). |
| `false` | Never negotiates HTTP/2. |

### h2 via TLS-ALPN

With TLS, no opt-in is needed — ALPN negotiates the protocol and the client transparently falls back to HTTP/1.1 when the server declines h2:

```php
$Client = new HTTP_Client_CLI;
$Client->configure(host: 'http2.example.com', port: 443, secure: []);
// @ TLS-ALPN offers `h2,http/1.1` — the server picks the protocol

$Response = $Client->request(method: 'GET', URI: '/');

echo $Response->protocol;  // 'HTTP/2' (or 'HTTP/1.1' when the server declined h2)
```

### h2c prior knowledge (cleartext)

```php
$Client = new HTTP_Client_CLI;
$Client->configure(host: '127.0.0.1', port: 8080, enableHTTP2: true);
// @ Cleartext h2c with prior knowledge — no Upgrade handshake

$Response = $Client->request(method: 'GET', URI: '/');

echo $Response->protocol;  // 'HTTP/2'
```

### Disabling HTTP/2

```php
$Client->configure(host: 'example.com', port: 443, secure: [], enableHTTP2: false);
// @ h2 is not offered via ALPN — the connection stays HTTP/1.1
```

### Multiplexing in batch mode

Over HTTP/2, batched requests multiplex as concurrent streams over **one** connection:

```php
$Client = new HTTP_Client_CLI;
$Client->configure(host: 'http2.example.com', port: 443, secure: []);

$Client->batch();

$R1 = $Client->request(method: 'GET', URI: '/a');
$R2 = $Client->request(method: 'GET', URI: '/b');
$R3 = $Client->request(method: 'GET', URI: '/c');

$Client->drain();
// @ All three requests ran as streams on a single h2 connection
```

HTTP/2 notes:

- `$Response->protocol` reports `'HTTP/2'`; `$Response->status` is empty — HTTP/2 has no reason-phrase, use `$Response->code`.
- Redirects, timeouts and `maxResponseBytes` work over h2 exactly as over HTTP/1.1.
- `Expect: 100-continue` is HTTP/1.1-only: connection-specific headers are stripped on h2 (RFC 9113 §8.2.2) and the body is sent immediately.
- The pool co-locates extra acquisitions on multiplexing-capable connections before dialing new ones — an h2 connection advertises its stream capacity to the pool.

## Redirect Handling

The client automatically follows HTTP redirects (301, 302, 303, 307, 308) up to `maxRedirects`:

```php
$Client->maxRedirects = 5;  // default: 10

$Response = $Client->request(method: 'GET', URI: '/old-page');
// @ Automatically follows Location header
echo $Response->code;  // 200 (from the final destination)
```

### Redirect behavior per RFC 7231

| Status Code | Method Change | Body Preserved |
|---|---|---|
| 301, 302, 303 | Changes to GET (except HEAD) | No (body cleared) |
| 307, 308 | Preserved | Yes |

## Timeouts

```php
// ? Connection timeout
$Client->connectTimeout = 5;  // 5 seconds

// ? Response timeout
$Client->timeout = 10;        // 10 seconds

$Response = $Client->request(method: 'GET', URI: '/slow-endpoint');

if ($Response->code === 0) {
   echo $Response->status;  // 'Timeout'
}
```

## Retries & Backoff

Automatic retry on connection or timeout failure, with capped exponential backoff and jitter:

```php
$Client = new HTTP_Client_CLI;
$Client->configure(host: 'api.example.com', port: 443, secure: []);

$Client->maxRetries = 3;        // 0 = disabled (default)
$Client->retryDelay = 0.5;      // base delay: ~0.5s, ~1s, ~2s, ...
$Client->retryMaxDelay = 10.0;  // backoff cap in seconds
$Client->retryTimeout = 30.0;   // wall-clock budget for the whole retry campaign
$Client->retryJitter = 0.25;    // proportional jitter fraction (0 = no jitter)

$Response = $Client->request(method: 'GET', URI: '/unstable-endpoint');
```

### HTTP-level retry (`retryOn`)

Retrying on response status codes is opt-in via `retryOn`, honoring the `Retry-After` response header:

```php
$Client->maxRetries = 5;        // also budgets HTTP-level retries
$Client->retryOn = [429, 503];  // retry these status codes

$Response = $Client->request(
   method: 'POST',
   URI: '/jobs',
   body: ['task' => 'render']
);
// @ On 429/503 the client waits (backoff or Retry-After, whichever is
//   larger) and retries — up to maxRetries times
```

Retry rules:

- **Backoff**: `retryDelay` doubles on each attempt, capped at `retryMaxDelay`, plus a proportional jitter of up to `retryJitter` × delay.
- **Campaign budget**: `retryTimeout` (default `60.0`; `0` = unbounded) is a wall-clock budget per request — a retry whose wait would exceed it is vetoed and the request stays failed.
- **Network-failure retries** (connection refused/reset, timeout) apply to idempotent methods only: GET, HEAD, PUT, DELETE, OPTIONS. Non-idempotent methods (POST, PATCH) are only retried when the request was provably never sent.
- **HTTP-level retries** (`retryOn`) are server-solicited and apply to **any** method. `Retry-After` is honored in both delta-seconds and HTTP-date forms, clamped to 300 seconds (`MAX_RETRY_AFTER`); it can extend the computed backoff wait, never shorten it.
- `retryOn` requires `maxRetries > 0` — the same budget caps both retry kinds.
- Backoff is **scheduled on the event loop** — waiting for the next attempt never blocks the process.

## Batch Mode

Send multiple concurrent requests:

```php
$Client->batch();

$Response1 = $Client->request(method: 'GET', URI: '/users');
$Response2 = $Client->request(method: 'GET', URI: '/posts');
$Response3 = $Client->request(method: 'GET', URI: '/comments');

$Client->drain();

// @ All responses are now populated
echo $Response1->code;  // 200
echo $Response2->code;  // 200
echo $Response3->code;  // 200
```

## Event-Driven Mode

Register hooks for fully async operation:

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI;
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Events;
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Request\Response;


$Client = new HTTP_Client_CLI;
$Client->configure(host: '127.0.0.1', port: 8080);

$Client->on(
   Events::ResponseReceive,
   function (Request $Request, Response $Response): void {
      echo "Status: {$Response->code}\n";
      echo "Body: {$Response->body}\n";
   }
);

$Client->request(method: 'GET', URI: '/');
$Client->start();
```

### Available Hooks

| Hook | Signature | Description |
|---|---|---|
| `Events::WorkerStarted` | `Closure(HTTP_Client_CLI $Client)` | Called on worker instance initialization. |
| `Events::ClientConnect` | `Closure($Socket, $Connection)` | Called when a connection is established. |
| `Events::ClientDisconnect` | `Closure($Connection)` | Called when a connection is closed. |
| `Events::DataRead` | `Closure($Socket, $Connection)` | Called after raw response data is read. |
| `Events::DataWrite` | `Closure($Socket, $Connection)` | Called after request data is written. |
| `Events::ResponseReceive` | `Closure(Request, Response)` | Called when a complete HTTP response is received. |

## 100-Continue Support

The client automatically handles `Expect: 100-continue` for large request bodies:

```php
$Response = $Client->request(
   method: 'POST',
   URI: '/upload',
   headers: ['Expect' => '100-continue'],
   body: $largePayload
);
// @ Headers are sent first.
// @ Body is sent only after server responds with 100 Continue.
```

`Expect: 100-continue` is HTTP/1.1-only — on HTTP/2 connections the header is stripped (connection-specific fields are forbidden by RFC 9113 §8.2.2) and the body is sent immediately.

## Architecture

The HTTP Client CLI is built on top of the TCP Client CLI infrastructure:

| Layer | Component | Lines |
|---|---|---|
| **TCP** | `TCP_Client_CLI` + Connections + Packages | ~1,200 |
| **HTTP** | `HTTP_Client_CLI` + Request + Response + Encoders/Decoders | ~2,500 |
| **Total** | Source code (excluding tests) | **~3,700** |

The same event loop (`Select`) that powers the HTTP Server also powers the HTTP Client. They share the same connection management and non-blocking I/O model.

## Reference

### `Bootgly\WPI\Nodes\HTTP_Client_CLI`

```php
public function configure (
   string $host,
   int $port,
   int $workers = 0,
   null|array $secure = null,
   null|array $pool = null,
   null|bool $enableHTTP2 = null
): self
```

Configures the client target. `secure` takes SSL/TLS stream context options (`[]` for defaults; `peer_name` is auto-set from `host`). `pool` takes the connection pool bounds `['min' => N, 'max' => N]` (defaults: min `0`, max `1`); when omitted on a reconfigure, the previous bounds are kept. `enableHTTP2` selects the HTTP/2 negotiation mode (`null` = ALPN when `secure` is set; `true` = also h2c prior knowledge on cleartext; `false` = never); when omitted, the current property value is kept. Reconfiguring retires every pooled connection of the previous origin.

```php
public function request (
   string $method = 'GET',
   string $URI = '/',
   array $headers = [],
   mixed $body = null
): self|Response
```

Sends an HTTP request. In sync mode it blocks until the `Response` is complete (following redirects and running retries). In batch mode it returns a `Response` reference immediately — populated later by `drain()`. In event-driven mode it returns `self`.

```php
public function batch (): void
```

Enters batch mode: subsequent `request()` calls are deferred until `drain()` is called, enabling concurrent execution. Requests beyond the pool `max` queue and are promoted as capacity frees; over HTTP/2 they multiplex as streams on one connection.

```php
public function drain (): void
```

Runs the event loop until every pending request completes, then leaves batch mode.

```php
public null|bool $enableHTTP2 = null;
```

HTTP/2 negotiation mode. `null` (default): offer `h2,http/1.1` via TLS-ALPN when `secure` is set — cleartext stays HTTP/1.1. `true`: also speak h2c prior knowledge on cleartext connections. `false`: never negotiate HTTP/2.

```php
public int $maxResponseBytes = 0;
```

Maximum raw response bytes (headers + body). `0` = unbounded. Exceeding it fails the request with code `0` and status `'Response Too Large'`. Enforced on both HTTP/1.1 and HTTP/2.

```php
public int $maxRetries = 0;
```

Maximum number of retries per request (`0` = disabled). Budgets both network-failure retries and HTTP-level (`retryOn`) retries.

```php
public int|float $retryDelay = 1.0;
```

Base backoff delay in seconds — doubles on each retry attempt.

```php
public int|float $retryMaxDelay = 30.0;
```

Backoff delay cap in seconds.

```php
public int|float $retryTimeout = 60.0;
```

Wall-clock retry campaign budget per request, in seconds (`0` = unbounded). A retry whose wait would exceed the budget is vetoed.

```php
public float $retryJitter = 0.25;
```

Proportional jitter fraction applied to each backoff delay (`0` = no jitter).

```php
public array $retryOn = [];
```

Opt-in HTTP-level retry status codes (e.g. `[429, 503]`). Requires `maxRetries > 0`. Honors the `Retry-After` response header and applies to any method.

```php
public const int MAX_RETRY_AFTER = 300;
```

Clamp, in seconds, applied to the `Retry-After` response header (both delta-seconds and HTTP-date forms).

```php
public protected(set) Pool $Pool;
```

The per-origin connection pool (sync/batch modes). Publicly readable for configuration (`expiration`) and observability.

### `Bootgly\WPI\Interfaces\TCP_Client_CLI\Pool`

```php
public int $min;
```

Pool floor — connections pre-dialed lazily on the first request. Default `0`.

```php
public int $max;
```

Pool ceiling — the maximum number of live pooled connections. Default `1`, capped at `1000` (Select event backend limit). `min` is clamped to `max`.

```php
public int|float $expiration = 0;
```

Idle eviction age in seconds (`0` = never evict). Idle connections parked longer than this are closed on the next acquisition.

```php
public protected(set) array $idle = [];
```

Parked connections, keyed by socket ID.

```php
public protected(set) array $busy = [];
```

In-flight connections, keyed by socket ID.

```php
public private(set) int $created = 0;
```

Live pooled connections (attached minus dropped).
