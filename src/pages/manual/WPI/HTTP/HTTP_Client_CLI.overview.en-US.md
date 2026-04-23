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
| **Pipelining** | Queue multiple requests per connection |
| **Batch Mode** | `batch()` + multiple `request()` + `drain()` |
| **Event-Driven** | Async mode via `on()` hooks with per-socket request tracking |
| **SSL/TLS** | Full HTTPS support |
| **Redirects** | Automatic follow up to configurable limit |
| **Timeouts** | Connection and response timeout |
| **Retries** | Automatic retry on failure (idempotent methods) |
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

### Client Properties

| Property | Type | Default | Description |
|---|---|---|---|
| `maxRedirects` | `int` | `10` | Maximum redirects to follow (0 = disabled). |
| `connectTimeout` | `int\|float` | `30` | Connection timeout in seconds. |
| `timeout` | `int\|float` | `30` | Response timeout in seconds. |
| `maxRetries` | `int` | `0` | Maximum retries on failure (0 = disabled). |
| `retryDelay` | `int\|float` | `1.0` | Delay between retries in seconds. |

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

## Retries

Automatic retry on connection or timeout failure for idempotent methods:

```php
$Client->maxRetries = 3;
$Client->retryDelay = 1.0;  // 1 second between retries

$Response = $Client->request(method: 'GET', URI: '/unstable-endpoint');
```

Retry rules:
- Only idempotent methods are retried: GET, HEAD, PUT, DELETE, OPTIONS
- POST/PATCH are only retried if the request was never sent (connection failure)
- A configurable delay (`retryDelay`) is applied between attempts

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
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Request\Response;


$Client = new HTTP_Client_CLI;
$Client->configure(host: '127.0.0.1', port: 8080);

$Client->on(
   responseReceive: function (Request $Request, Response $Response): void {
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
| `workerStarted` | `Closure` | Called on worker instance initialization. |
| `clientConnect` | `Closure($Socket, $Connection)` | Called when a connection is established. |
| `clientDisconnect` | `Closure` | Called when a connection is closed. |
| `responseReceive` | `Closure(Request, Response)` | Called when a complete HTTP response is received. |

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

## Architecture

The HTTP Client CLI is built on top of the TCP Client CLI infrastructure:

| Layer | Component | Lines |
|---|---|---|
| **TCP** | `TCP_Client_CLI` + Connections + Packages | ~1,200 |
| **HTTP** | `HTTP_Client_CLI` + Request + Response + Encoders/Decoders | ~2,500 |
| **Total** | Source code (excluding tests) | **~3,700** |

The same event loop (`Select`) that powers the HTTP Server also powers the HTTP Client. They share the same connection management and non-blocking I/O model.
