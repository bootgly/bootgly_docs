# HTTP Client CLI

The HTTP Client CLI is the native HTTP client of the Bootgly PHP Framework. It is built on top of the TCP Client CLI infrastructure with a fully event-driven, non-blocking architecture — 100% pure PHP, no cURL, no extensions.

## Features

| Feature | Description |
|---|---|
| **HTTP Methods** | GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS |
| **RFC 9112 Decoding** | Chunked transfer-encoding, content-length, close-delimited |
| **100-Continue** | Two-phase request: headers-first, body on server acceptance |
| **1xx Informational** | Full handling of informational responses (at most 64 before the final one on HTTP/1.1) |
| **Body Encoding** | Raw, JSON, form-urlencoded |
| **Headers** | Multi-value response headers, OWS trimming per RFC 7230 |
| **Keep-Alive** | Automatic connection reuse (`Connection: keep-alive`) |
| **Connection Pool** | Per-origin pool with `min`/`max` bounds, keep-alive reuse, stale re-dial |
| **HTTP/2** | TLS-ALPN negotiation, h2c prior knowledge, multiplexed batch streams |
| **Pipelining** | Queue multiple requests per connection |
| **Batch Mode** | `batch()` + multiple `request()` + `drain()` |
| **Event-Driven** | Async mode via `on()` hooks with per-socket request tracking |
| **SSL/TLS** | Full HTTPS support |
| **Redirects** | Followed up to a configurable limit, under a per-hop destination policy |
| **Timeouts** | Connection and response timeout |
| **Retries** | Exponential backoff with jitter, opt-in HTTP-level retry honoring `Retry-After` |
| **Multi-Worker** | Fork-based load generation for benchmarking |

## Quick Start

### Simple GET Request

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI;
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Configs;


$Client = new HTTP_Client_CLI;
$Client->configure(
   new Configs(host: 'example.com', port: 80)
);

$Response = $Client->request(method: 'GET', URI: '/');

echo $Response->code;   // 200
echo $Response->body;   // '<!doctype html>...'
```

### POST with JSON Body

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI;
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Configs;


$Client = new HTTP_Client_CLI;
$Client->configure(
   new Configs(host: 'api.example.com', port: 443, secure: [])
);

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

`configure()` is variadic over **Configs** value objects — one per concern, applied in any order.
The client configuration lives in `HTTP_Client_CLI\Configs`:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | — | Target host to connect to. |
| `port` | `int` | — | Target port. |
| `workers` | `int` | `0` | Number of worker processes (for benchmarking). |
| `secure` | `null\|array` | `null` | Secure SSL/TLS stream context options. Set to `[]` for default TLS. Auto-sets `peer_name` for hostname verification. |
| `pool` | `null\|array` | `null` | Connection pool bounds: `['min' => N, 'max' => N]`. Defaults: min `0`, max `1`. |
| `enableHTTP2` | `null\|bool` | `null` | HTTP/2 negotiation: `null` = ALPN when `secure` is set; `true` = also h2c on cleartext; `false` = never. |

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Configs;


$Client->configure(
   new Configs(
      host: 'api.example.com',
      port: 443,
      secure: [],
      pool: ['min' => 2, 'max' => 8],
      enableHTTP2: true
   )
);
```

> [!IMPORTANT]
> Every Configs is **named-arguments only**. Its first parameter is a guard slot you never fill, so a positional
> `new Configs('api.example.com', 443)` raises a `TypeError` instead of silently binding the wrong values.

Handing two instances of the same Configs class to one `configure()` call throws an `InvalidArgumentException`, and a
`configure()` that never carried `host` and `port` throws an `ArgumentCountError`.

### Client Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `maxRedirects` | `int` | `10` | Maximum redirects to follow; past it the request fails with `'Too Many Redirects'` (0 = disabled). |
| `Redirection` | `null\|Closure` | `null` | Destination policy asked on every redirect hop (see Redirect Handling). |
| `crossOriginHeaders` | `array` | `['accept', 'accept-encoding', 'accept-language', 'user-agent']` | Request headers a redirect carries to another origin. |
| `allowInsecureRedirect` | `bool` | `false` | Follow a redirect that steps down from `https` to `http`. |
| `connectTimeout` | `int\|float` | `30` | Connection timeout in seconds, per dial attempt. On an adopted reactor the dial and the TLS handshake park instead of blocking the host loop (0 = no timeout). |
| `timeout` | `int\|float` | `30` | Response timeout in seconds. |
| `maxResponseBytes` | `int` | `16777216` | Maximum raw response bytes — headers + body (16 MiB; `0` = unbounded). |
| `maxRetries` | `int` | `0` | Maximum retries on failure (0 = disabled). |
| `retryDelay` | `int\|float` | `1.0` | Base backoff delay in seconds — doubles on each attempt. |
| `retryMaxDelay` | `int\|float` | `30.0` | Backoff delay cap in seconds. |
| `retryTimeout` | `int\|float` | `60.0` | Wall-clock retry campaign budget per request in seconds (0 = unbounded). |
| `retryJitter` | `float` | `0.25` | Proportional jitter fraction applied to each backoff delay. |
| `retryOn` | `array` | `[]` | Opt-in HTTP-level retry status codes (e.g. `[429, 503]`). |
| `enableHTTP2` | `bool\|null` | `null` | HTTP/2 negotiation mode (see the HTTP/2 section). |

```php
$Client = new HTTP_Client_CLI;
$Client->configure(
   new Configs(host: 'api.example.com', port: 443, secure: [])
);

// ? Configure
$Client->maxRedirects = 5;
$Client->timeout = 10;
$Client->maxRetries = 3;
$Client->retryDelay = 0.5;
```

## SSL/TLS (HTTPS)

Enable HTTPS with the `secure` field of the Configs:

```php
// @ Default TLS settings (auto peer_name verification)
$Client->configure(
   new Configs(host: 'secure.example.com', port: 443, secure: [])
);

// @ Custom SSL options
$Client->configure(
   new Configs(host: 'secure.example.com', port: 443, secure: [
      'peer_name' => 'secure.example.com',
      'verify_peer' => true,
      'verify_peer_name' => true,
   ])
);
```

When `secure` is not `null` and `peer_name` is not set, the client automatically uses the `host` parameter for hostname verification.

## Connection Pool

The client keeps a per-origin connection pool in sync/batch modes. Keep-alive connections are parked between requests and transparently reused, instead of dialing a new connection per request:

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI;
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Configs;


$Client = new HTTP_Client_CLI;
$Client->configure(
   new Configs(
      host: 'api.example.com',
      port: 443,
      secure: [],
      pool: ['min' => 2, 'max' => 8]
   )
);

// @ The first request lazily pre-dials the pool up to `min` (2 connections)
$Response1 = $Client->request(method: 'GET', URI: '/users');

// @ Subsequent requests reuse the parked keep-alive connections
$Response2 = $Client->request(method: 'GET', URI: '/posts');
```

Combined with batch mode, `max` bounds the concurrency — overflow requests queue and are promoted as connections free up:

```php
$Client = new HTTP_Client_CLI;
$Client->configure(
   new Configs(host: 'api.example.com', port: 443, secure: [], pool: ['max' => 4])
);

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
- The pool is per-origin by construction: reconfiguring to another host/port retires every pooled connection of the previous origin. When a later `configure()` hands over a Configs without `pool`, the previous bounds are kept.

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

The client speaks HTTP/2 with three negotiation modes, controlled by `enableHTTP2` (a `Configs` field or the public property):

| `enableHTTP2` | Behavior |
|---|---|
| `null` (default) | Offers `h2,http/1.1` via TLS-ALPN when `secure` is set. Cleartext stays HTTP/1.1. |
| `true` | Additionally speaks h2c **prior knowledge** on cleartext connections (explicit opt-in). |
| `false` | Never negotiates HTTP/2. |

### h2 via TLS-ALPN

With TLS, no opt-in is needed — ALPN negotiates the protocol and the client transparently falls back to HTTP/1.1 when the server declines h2:

```php
$Client = new HTTP_Client_CLI;
$Client->configure(
   new Configs(host: 'http2.example.com', port: 443, secure: [])
);
// @ TLS-ALPN offers `h2,http/1.1` — the server picks the protocol

$Response = $Client->request(method: 'GET', URI: '/');

echo $Response->protocol;  // 'HTTP/2' (or 'HTTP/1.1' when the server declined h2)
```

### h2c prior knowledge (cleartext)

```php
$Client = new HTTP_Client_CLI;
$Client->configure(
   new Configs(host: '127.0.0.1', port: 8080, enableHTTP2: true)
);
// @ Cleartext h2c with prior knowledge — no Upgrade handshake

$Response = $Client->request(method: 'GET', URI: '/');

echo $Response->protocol;  // 'HTTP/2'
```

### Disabling HTTP/2

```php
$Client->configure(
   new Configs(host: 'example.com', port: 443, secure: [], enableHTTP2: false)
);
// @ h2 is not offered via ALPN — the connection stays HTTP/1.1
```

### Multiplexing in batch mode

Over HTTP/2, batched requests multiplex as concurrent streams over **one** connection:

```php
$Client = new HTTP_Client_CLI;
$Client->configure(
   new Configs(host: 'http2.example.com', port: 443, secure: [])
);

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

The client follows HTTP redirects (301, 302, 303, 307, 308) up to `maxRedirects`:

```php
$Client->maxRedirects = 5;  // default: 10

$Response = $Client->request(method: 'GET', URI: '/old-page');
// @ Automatically follows Location header
echo $Response->code;  // 200 (from the final destination)
```

### How a Location is resolved

`Location` is resolved against the current request as an RFC 3986 URI-reference: a relative path is
merged and its `.` / `..` segments removed, a network-path reference (`//host/path`) goes to the host
it names, and the scheme is case-insensitive — `HTTPS://` is TLS, never cleartext. Only `http` and
`https` targets are requests. Anything else fails the request with code `0` and status
`'Redirect Refused'` — it is never handed back as if the 3xx were the answer:

- another scheme (`gopher:`, `ftp:`, `file:`, `javascript:` ...) or a scheme without an authority (`https:foo`);
- user information in the authority (`http://user:pass@host/`);
- control bytes, spaces or backslashes, a port outside 1–65535, a malformed host;
- a request-target longer than `HTTP_Client_CLI::TARGET_LIMIT` (8 KiB), however the `Location` got there.

A 3xx without a `Location` is returned as the final response.

### Redirect behavior per RFC 9110

| Status Code | Method Change | Body and its fields |
|---|---|---|
| 301, 302, 303 | Changes to GET (except HEAD) | Dropped (`Content-Type`, `Content-Length`, `Content-Encoding`, `Expect` ...) — every other header stays |
| 307, 308 | Preserved | Preserved |

### Choosing where a redirect may go

Set `Redirection` to a `Closure` that decides every hop — the same origin included — before
anything is sent there. It receives the target's host (lowercased; an IPv6 literal without its
brackets, no trailing dot), its port and whether it is `https`. Return `true` to follow; anything
else, or an exception, fails the request with code `0` and status `'Redirect Refused'`:

```php
$Client->Redirection = static fn (string $host, int $port, bool $secure): bool =>
   $secure && ($host === 'api.example.com' || $host === 'files.example.com');
```

`pin()` installs the policy that keeps the client on the origin it is configured for — the exact
scheme, host and port. It is what the embedded [HTTP response resource](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/) applies by default:

```php
$Client->pin();
```

The policy runs on the client's event loop: keep it to a quick decision, never block or call the
client from it. It judges the host as `Location` names it, before DNS — a name can still resolve to
a private address.

### What a redirect leg carries

Headers belong to the origin that received them. A hop to another origin — a different scheme,
host or port, an `http` → `https` upgrade included — carries only the headers listed in
`crossOriginHeaders` (by default `Accept`, `Accept-Encoding`, `Accept-Language` and `User-Agent`),
plus the fields that describe a body a 307/308 replays. `Authorization`, cookies, API keys and a
`Host` you set stay behind — the new origin gets its own `Host` — and a later hop back to the first
origin does not bring them back. Add a name to carry it:

```php
$Client->crossOriginHeaders[] = 'X-Request-Id';
```

A hop that stays on the same origin keeps every header.

TLS options follow the same rule. The same origin keeps the leg's TLS context. Another origin gets
the options you passed to `configure()` minus those that belong to the origin you configured them
for: the client certificate (`local_cert`, `local_pk`, `passphrase`) is never presented there,
`verify_peer`, `verify_peer_name` and `allow_self_signed` fall back to PHP's secure defaults,
`SNI_server_name` is dropped and `peer_name` names the new host. A CA bundle (`cafile`, `capath`),
`peer_fingerprint` and the cipher list still apply — a pinned fingerprint makes every hop to another
host fail. Like headers, those options do not come back on a later hop to the configured origin: the
client identity is presented only on legs that never left it.

A hop that steps down from `https` to `http` is refused: the request fails with code `0` and status `'Insecure Redirect'`, and nothing is dialed. Since 307 and 308 replay the original body, following such a hop would put it on the wire in the clear. Opt in when you really want it:

```php
$Client->allowInsecureRedirect = true;
```

### When a chain stops

- Past `maxRedirects` the request fails with code `0` and status `'Too Many Redirects'`; the refused
  3xx head stays readable (`$Response->Header->get('Location')`). `maxRedirects = 0` disables
  redirects: every 3xx is returned as the final response.
- `'Redirect Refused'`, `'Too Many Redirects'`, `'Insecure Redirect'` and `'Redirect Failed'` are
  never retried.
- Batch and event-driven modes cannot re-dial: a hop that passes every check above but needs
  another connection (another origin, or a `Connection: close` 3xx) is delivered as the final 3xx.
  A refusal — by the scheme rules, the hop cap, the downgrade rule or `Redirection` — reaches them
  as code `0`, like any other failure.

A redirect chain never re-points the client. Wherever the chain ends — another origin, or a leg that could not be dialed — the host, port, TLS options and worker count you configured are restored and the connection pool is rebuilt for your own origin, so the next request goes where you sent it. A leg that cannot be dialed fails with code `0` and status `'Redirect Failed'`, and it is never retried: retrying would send the redirect target's path to your original host.

## One client, one origin

A client is bound to the origin you give `configure()`, and instances do not interfere: two clients in the same process each keep their own host, port, TLS options and pool. Nothing is process-wide — each instance owns its own reactor, its own `on()` hooks, its own counters and its own pool, so any number of clients can run side by side in one process.

Event-driven mode is per instance too, and it is exclusive with reactor adoption: a client that adopted a host reactor through `react()` cannot enter event-driven mode — `on()` refuses it, and `start()` refuses to run. Event-driven mode owns a loop; an adopted-reactor client borrows one. Pick one ownership model per client.

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

`code === 0` always means no HTTP response was produced, and `status` says why: `'Timeout'`, `'Connection Failed'`, `'Connection Lost'`, `'Connection Closed'`, `'Truncated Response'`, `'Response Too Large'`, `'Request Header Fields Too Large'`, `'Response Header Fields Too Large'` when the response head (status line + header fields) exceeds 64 KiB, `'Invalid Response'` when the head is not valid HTTP/1.x framing or more than 64 interim responses came before the final one (HTTP/1.1), or `'Invalid Chunked Encoding'` when a chunked response's framing is not valid HTTP (a chunk-size line that is not hexadecimal, one too large to be real or longer than 8 KiB, a trailer section past 64 KiB, or chunk data that is not terminated by CRLF as RFC 9112 §7.1 requires).

The client trusts no upstream's framing. A response is `'Invalid Response'` when its status line is not `HTTP/1.x SP 3DIGIT [SP reason]` with a code from 100 to 999 (a missing reason phrase is fine; a code from 600 to 999 is handled like a server error and keeps its value in `code`); when its head carries a bare CR or LF, a field line without a colon, a field name that is not a token (whitespace before the colon, a NUL, a control byte), or a NUL in a field value; when `Content-Length` is not one exact number (a sign, a suffix, an overflow, or repeats that disagree — identical repeats are fine); when `Transfer-Encoding` is empty; or when an HTTP/1.0 response uses `Transfer-Encoding`. A folded header line (obs-fold) is joined with a space before it is read. A response framed by both `Transfer-Encoding` and `Content-Length` is read by `Transfer-Encoding` and its connection is never reused. `Connection` is read as a token list: `Connection: TE, close` or `Connection:close` closes the connection.

Interim (1xx) responses — `100 Continue`, `102 Processing`, `103 Early Hints` — are read and dropped before the final response. On HTTP/1.1, at most `HTTP_Client_CLI::INTERIM_LIMIT` (64) are accepted per response; one more fails the request with `'Invalid Response'`, so an upstream cannot keep streaming interims instead of answering. The count starts again on each redirect leg and each retry. HTTP/2 interims are not counted.

The two timeouts bound different phases. `connectTimeout` bounds each **dial attempt** — the TCP connect and the TLS handshake together; it is spent again on every attempt (a retry, a redirect leg, a replay). `timeout` arms only the **response window**, and only once the connection is up and the request has been dispatched.

That split matters on an adopted reactor (see [Embedded Mode](#embedded-mode)): a peer that accepts the TCP connection but never negotiates keeps the deferred Fiber parked until `connectTimeout` elapses. With `connectTimeout = 0` there is no dial deadline at all, and the Fiber stays parked until the deferral's generation is cancelled.

## Retries & Backoff

Automatic retry on connection or timeout failure, with capped exponential backoff and jitter:

```php
$Client = new HTTP_Client_CLI;
$Client->configure(
   new Configs(host: 'api.example.com', port: 443, secure: [])
);

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
- **Deterministic failures are never retried**: `'Response Too Large'`, `'Response Header Fields Too Large'`, `'Invalid Response'`, `'Invalid Chunked Encoding'`, `'Request Header Fields Too Large'`, `'Insecure Redirect'`, `'Redirect Failed'`, `'Redirect Refused'` and `'Too Many Redirects'` — the same answer would come back. `'Truncated Response'`, `'Connection Lost'` and `'Timeout'` are network failures and follow the rules above.
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
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Configs;
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Events;
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Request\Response;


$Client = new HTTP_Client_CLI;
$Client->configure(
   new Configs(host: '127.0.0.1', port: 8080)
);

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

## Embedded Mode

A client can run **inside** another runtime instead of driving a loop of its own. In embedded mode it adopts the host's reactor — typically an HTTP server worker's — and every wait parks the calling Fiber instead of pumping a private event loop. The worker keeps serving its other connections while the upstream answers.

The hand-rolled recipe, inside a deferred response, is four calls in this order:

```php
use Bootgly\WPI\Interfaces\TCP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Client_CLI;
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Configs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;


return $Response->defer(function (Response $Response) {
   $Client = new HTTP_Client_CLI(HTTP_Client_CLI::MODE_EMBEDDED);
   $Client->react(TCP_Server_CLI::$Event);
   $Client->schedule(fn (mixed $value = null): Response => $Response->wait($value));
   $Client->configure(
      new Configs(host: '127.0.0.1', port: 8080)
   );

   $Upstream = $Client->request(method: 'GET', URI: '/users/1');

   $Response->JSON->send(['code' => $Upstream->code]);
});
```

- `MODE_EMBEDDED` — the client runs inside another process's runtime: no process state lock, no Commands/Terminal, no shutdown signal broadcast and no debugging-vars overwrite. The host owns all of those.
- `react()` — adopt the host's reactor. The client stops owning its loop: `halt()` releases only its own accounting and never destroys the host reactor, and `start()` throws. It must be called before any connection is opened.
- `schedule()` — inject the wait bridge. `$Response->wait()` parks the deferred Fiber on a readiness (or a resource, or `null`), and the client uses that bridge for every wait it would otherwise spend inside a loop.
- `configure()` — the same origin configuration as any other client.

### What parks

`request()` parks the deferred Fiber until the `Response` is complete. `batch()` + `drain()` park it until every batched request settles — `drain()` does not run a loop here, it parks.

The dial parks too: opening the connection parks on write readiness and the TLS handshake parks on read readiness, in 1-second slices bounded by the dial deadline. So an unreachable or silent upstream costs the worker nothing but a dialing socket — the reactor keeps ticking and the other connections keep being served.

### One Fiber owns one client

An embedded client is driven by exactly **one** Fiber. Code running on the reactor stack — a timer callback, another connection's handler — never dials: it enqueues the request and wakes the owner Fiber, which services the queue between parks. Retry campaigns follow the same rule: the backoff timer fires on the host reactor stack and only hands the re-dispatch over; the owner Fiber performs it.

Do not share one embedded client across deferred contexts, and do not call `request()` from a reactor callback.

### Read the request inside the Fiber

Inside the deferred Fiber, read inbound-request state from `WPI->Request` — never from a `$Request` captured by `use ()`:

```php
return $Response->defer(function (Response $Response) {
   $URI = WPI->Request->URI;  // ✅ this deferral's own admitted request
   // ...
});
```

`defer()` clones the admitted request into the deferral and installs it as `WPI->Request` for every execution segment of that Fiber. The live `$Request` object, on the other hand, belongs to whatever exchange the worker is currently decoding — by the time the Fiber resumes it may already carry another, interleaved request.

### Failure, abort and the parked episode

Every failure terminal resolves the parked episode: the Fiber resumes exactly once, with `code === 0` and a named `status` — the same contract the standalone client honors. That includes the two failures unique to this mode:

- An fd-budget rejection by the host reactor (*selector admission*) fails the in-flight set deterministically instead of hanging the Fiber forever.
- Capacity starvation — a whole silent deadline elapsed and the queue still could not be paired with a connection while nothing is in flight — fails the queue loud instead of parking indefinitely.

`abort()` abandons everything at once: queued, in-flight and retrying requests terminalize with code `0` (`'Connection Failed'`, or `'Truncated Response'` once bytes had arrived), and **every** connection is closed — idle keep-alive ones included, because they hold reactor registrations too. The client stays usable and the next `request()` dials afresh, but the pool floor (`pool['min']`) is not re-warmed: warm-up is per configuration, and the pool re-fills on demand up to `pool['max']`. A parked drain episode, if one is open, is woken to observe the quiescence.

`unpark()` is the companion for a context that will **never** resume — an evicted Fiber whose generation was already settled. It retires that episode's notifier. Never call it while the parked Fiber can still resume: the reactor still holds the read end. `$parked` tells you whether an episode is open at all.

### Prefer the response resource

Everything above is what the built-in HTTP response resource already does for you. Register it once and call it from `defer()`:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Configs as ResponseConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\HTTP;


$HTTP_Server_CLI->configure(
   new ServerConfigs(host: '0.0.0.0', port: 8080, workers: 4),
   new ResponseConfigs(Resources: [
      'Upstream' => static fn (object $Context): HTTP => new HTTP(host: 'api.example.com', secure: [])
   ])
);

$Response->defer(function (Response $Response) {
   $Upstream = $Response->Upstream->request(method: 'GET', URI: '/users/1');
   $Response->JSON->send(['code' => $Upstream->code]);
});
```

It wires `MODE_EMBEDDED`, `react()` and `schedule()` for you, and it releases the client when the deferral settles. Reach for the hand-rolled recipe only when you need a client the resource does not give you. See the [Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/) page.

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

| Layer | Component |
|---|---|
| **TCP** | `TCP_Client_CLI` + Connections + Packages |
| **HTTP** | `HTTP_Client_CLI` + Request + Response + Encoders/Decoders |

Each client instance owns a `Select` reactor of its own — the same reactor class that powers the HTTP Server — or adopts a host's through `react()` (see [Embedded Mode](#embedded-mode)). Connection management and the non-blocking I/O model are shared with the server either way.

## Reference

### `Bootgly\WPI\Nodes\HTTP_Client_CLI`

`react()`, `schedule()`, `$Event`, `$owned`, `$Wait` and `MODE_EMBEDDED` are inherited unchanged from [`TCP_Client_CLI`](/manual/WPI/TCP/TCP_Client_CLI/) and are not repeated below.

```php
public function configure (Bootgly\ABI\Configs ...$Configs): self
```

Adopts one Configs per concern — for this client, `HTTP_Client_CLI\Configs` — in any order, and returns the client for chaining. Throws `InvalidArgumentException` on a repeated Configs class in the same call or on a Configs this node does not accept, and `ArgumentCountError` while `host` and `port` have never been set. Reconfiguring retires every pooled connection of the previous origin.

```php
new Bootgly\WPI\Nodes\HTTP_Client_CLI\Configs(/* named arguments only */)
```

The client target and its transport. Named arguments only — the constructor's first slot is the `Bootgly\ABI\Argument` guard, so a positional call raises a `TypeError`. `secure` takes SSL/TLS stream context options (`[]` for defaults; `peer_name` is auto-set from `host`). `pool` takes the connection pool bounds `['min' => N, 'max' => N]` (defaults: min `0`, max `1`); when omitted on a reconfigure, the previous bounds are kept. `enableHTTP2` selects the HTTP/2 negotiation mode (`null` = ALPN when `secure` is set; `true` = also h2c prior knowledge on cleartext; `false` = never); when omitted, the current property value is kept.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | — (required) | Target host to connect to. |
| `port` | `int` | — (required) | Target port. |
| `workers` | `int` | `0` | Number of worker processes to fork (for benchmarking). |
| `secure` | `null\|array` | `null` | Secure SSL/TLS stream context options. |
| `pool` | `null\|array` | `null` | Connection pool bounds: `['min' => N, 'max' => N]`. |
| `enableHTTP2` | `null\|bool` | `null` | HTTP/2 negotiation mode. |

```php
public function request (
   string $method = 'GET',
   string $URI = '/',
   array $headers = [],
   mixed $body = null
): self|Response
```

Sends an HTTP request. `method` must be an HTTP token and `URI` must be origin-form (`/path?query`), or `*` with `OPTIONS`; raw spaces, controls, backslashes and fragments are rejected with `InvalidArgumentException` before any connection opens. In sync mode it blocks until the `Response` is complete (following redirects and running retries). In batch mode it returns a `Response` reference immediately — populated later by `drain()`. In event-driven mode it returns `self`. On an adopted reactor the deferred Fiber parks until the `Response` is complete.

```php
public function batch (): void
```

Enters batch mode: subsequent `request()` calls are deferred until `drain()` is called, enabling concurrent execution. Requests beyond the pool `max` queue and are promoted as capacity frees; over HTTP/2 they multiplex as streams on one connection.

```php
public function drain (): void
```

Runs the event loop until every pending request completes, then leaves batch mode. On an adopted reactor it parks the calling Fiber until every pending request completes instead of running a loop.

```php
public function abort (): void
```

Abandons every queued, in-flight and retrying request and closes every connection — pooled keep-alive ones included. The client stays usable: the next `request()` dials afresh. The pool floor (`pool['min']`) is not re-warmed — warm-up is per configuration, and the pool re-fills on demand up to `pool['max']`. Abandoned requests terminalize with code `0` (`'Connection Failed'`, or `'Truncated Response'` once bytes arrived), and a parked drain episode, if one is open, is woken to observe the quiescence — its notifier is closed by the parked Fiber itself when it resumes; `unpark()` is for one that never will.

```php
public function unpark (): void
```

Retires the parked drain episode of a context that will never resume. The episode notifier is this client's own pair of descriptors, closed by the parked Fiber when it resumes; an evicted Fiber (its generation settled) never does, so the settled path retires the pair itself. Never call it while the parked Fiber can still resume — the reactor still holds the read end.

```php
public function pin (): static
```

Installs a `Redirection` policy that follows a hop only when it keeps the exact scheme, host and port the client is configured for now, and returns the client. The pin does not move when the client is reconfigured later — call `pin()` again; `$Redirection = null` removes it. Throws `LogicException` on a client that was never configured: it has no origin to pin.

```php
public bool $parked { get; }
```

Whether a drain episode is currently parked on this client.

```php
public int $maxRedirects = 10;
```

Maximum redirects to follow per request. Past it the request fails with code `0` and status `'Too Many Redirects'`, never retried. `0` disables redirects: every 3xx is returned as the final response.

```php
public null|Closure $Redirection = null;
```

Destination policy for redirects: `Closure(string $host, int $port, bool $secure): bool`, asked on every hop — the same origin included — with the target's host (lowercased; an IPv6 literal without brackets, no trailing dot). Anything but `true`, or a throw, fails the request with code `0` and status `'Redirect Refused'`. `null` follows every http(s) target.

```php
public array $crossOriginHeaders = ['accept', 'accept-encoding', 'accept-language', 'user-agent'];
```

Request headers a redirect carries to another origin, compared case-insensitively. Every other header you set stays with the origin that received it; a 307/308 that replays the body also carries `Content-Type`, `Content-Length`, `Content-Encoding` and `Content-Language`.

```php
public null|bool $enableHTTP2 = null;
```

HTTP/2 negotiation mode. `null` (default): offer `h2,http/1.1` via TLS-ALPN when `secure` is set — cleartext stays HTTP/1.1. `true`: also speak h2c prior knowledge on cleartext connections. `false`: never negotiate HTTP/2.

```php
public int $maxResponseBytes = 16_777_216;
```

Maximum raw response bytes (headers + body) per request — 16 MiB by default. `0` = unbounded (an explicit opt-out). Exceeding it fails the request with code `0` and status `'Response Too Large'`, and it is never retried. Enforced on both HTTP/1.1 and HTTP/2. On HTTP/1.1, declared sizes fail fast: a `Content-Length` that, with the head, is past the limit, or a chunk whose declared size would push the decoded body past it, fails the request as soon as it is read, before the body is downloaded (HTTP/2 counts the bytes as they arrive). The response head has its own fixed cap of 64 KiB (`'Response Header Fields Too Large'`), whatever this allows.

```php
public const int INTERIM_LIMIT = 64;
```

Maximum interim (1xx) responses accepted before the final one, per HTTP/1.1 response. One more fails the request with code `0` and status `'Invalid Response'`, which is never retried. Counted per redirect leg and per retry; HTTP/2 interims are not counted.

```php
public const int TARGET_LIMIT = 8192;
```

Longest request-target, in bytes, a redirect may produce. A longer one — a hostile `Location`, or relative references compounding hop after hop — fails the request with code `0` and status `'Redirect Refused'`.

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
