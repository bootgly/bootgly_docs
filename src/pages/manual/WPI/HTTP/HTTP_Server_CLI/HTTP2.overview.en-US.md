# HTTP/2

Bootgly's HTTP Server CLI speaks **HTTP/2** (RFC 9113) natively — binary framing, HPACK
header compression (RFC 7541), stream multiplexing and flow control, all implemented as
dependency-free Bootgly components. No extension, no proxy, no third-party package.

Your routes don't change: the same handler serves HTTP/1.1 and HTTP/2 connections. The
protocol is negotiated per connection and multiplexing is handled inside the server — a
handler still sees one `$Request` and returns one `$Response`.

There are two ways a connection becomes HTTP/2:

- **h2 over TLS (ALPN)** — browsers and HTTP clients negotiate `h2` during the TLS
  handshake. Enabled by default as soon as the server is configured with `secure`.
- **h2c prior knowledge** — cleartext HTTP/2: the client opens the connection with the
  HTTP/2 preface (`PRI * HTTP/2.0`). Enabled by default, zero setup. This is what
  `curl --http2-prior-knowledge`, gRPC-style tooling and load testers use.

> The HTTP/1.1 Upgrade path (`Upgrade: h2c` + 101) is **not** implemented — RFC 9113
> deprecated it, and no modern client uses it.

## Serve HTTP/2 in cleartext (h2c)

Nothing to enable. Boot the server as usual:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

$HTTP_Server_CLI = new HTTP_Server_CLI;
$HTTP_Server_CLI->configure(
   host: '0.0.0.0',
   port: 8080,
   workers: 8
);
$HTTP_Server_CLI->on(
   Events::RequestReceived,
   function ($Request, Response $Response): Response {
      return $Response->send("Served over {$Request->protocol}");
   }
);
$HTTP_Server_CLI->start();
```

Verify with curl — the same route answers both protocols:

```bash
# HTTP/2 with prior knowledge (cleartext)
curl -s --http2-prior-knowledge http://127.0.0.1:8080/ -w '\n%{http_version}\n'
# Served over HTTP/2
# 2

# Plain HTTP/1.1 still works on the same port
curl -s http://127.0.0.1:8080/ -w '\n%{http_version}\n'
# Served over HTTP/1.1
# 1.1
```

The switch costs the HTTP/1.1 hot path nothing: the 24-byte preface probe is a single
character comparison on the first read of a connection.

## Serve HTTP/2 over TLS (ALPN)

Pass a `secure` TLS context — ALPN with `h2,http/1.1` is advertised automatically:

```php
$HTTP_Server_CLI->configure(
   host: '0.0.0.0',
   port: 8443,
   workers: 8,
   secure: [
      'local_cert' => '/path/to/cert.pem',
      'local_pk' => '/path/to/key.pem',
   ]
);
```

Browsers and curl negotiate `h2` in the TLS handshake; clients that only offer
`http/1.1` fall back transparently:

```bash
curl -sk --http2 https://127.0.0.1:8443/ -w '\n%{http_version}\n'
# Served over HTTP/2
# 2

curl -sk --http1.1 https://127.0.0.1:8443/ -w '\n%{http_version}\n'
# Served over HTTP/1.1
# 1.1
```

To serve HTTP/1.x only — no `h2` in the ALPN advertisement AND no cleartext prior
knowledge — opt out explicitly:

```php
$HTTP_Server_CLI->configure(
   // ...
   enableHTTP2: false
);
```

## Detect the protocol in a handler

The Request surface is identical across protocols. Two members are HTTP/2-aware:

```php
$HTTP_Server_CLI->on(
   Events::RequestReceived,
   function ($Request, Response $Response): Response {
      if ($Request->protocol === 'HTTP/2') {
         // $Request->stream carries the HTTP/2 stream id (0 on HTTP/1.x)
         $Response->Header->set('X-Stream', (string) $Request->stream);
      }

      return $Response->send('ok');
   }
);
```

Everything else — `$Request->method`, `$Request->URI`, `$Request->queries`, headers,
cookies, sessions, middlewares, the Router — behaves exactly as on HTTP/1.1. The
`:authority` pseudo-header is exposed as the `host` header, and duplicated `cookie`
fields are joined per RFC 9113 §8.2.3.

## Built-in protection

The HTTP/2 decoder enforces RFC 9113 limits per connection, with safe defaults:

- **128 concurrent streams** (`MAX_CONCURRENT_STREAMS`) — excess streams are refused
  without killing the connection.
- **16 KB frames and 16 KB decoded header lists** — larger input is a connection error.
- **Rapid-reset mitigation** (CVE-2023-44487) — more than 64 stream resets inside a
  10-second window closes the connection with `ENHANCE_YOUR_CALM`.
- **Flow control** on both directions — responses larger than the peer's window are
  parked and drained as `WINDOW_UPDATE` credit arrives; request bodies are capped by
  the same `requestMaxBodySize` used for HTTP/1.1 (413 past it).
- Malformed requests (uppercase header names, connection-specific fields, `content-length`
  mismatch) are rejected per stream with `400`/`RST_STREAM` — one bad stream never takes
  down the connection.

## Current limitations

- **No server push** — `PUSH_PROMISE` is never sent (deprecated in practice; Chrome
  removed support). `PRIORITY` frames are accepted and ignored (RFC 9113 deprecated the
  priority tree).
- **Response streaming APIs are HTTP/1.1-oriented**: over HTTP/2, `$Response->upload()`
  file ranges are materialized into DATA frames (up to 16 MiB) and `Transfer-Encoding`
  is stripped — chunked framing does not exist in HTTP/2.
- **Multipart request bodies** over HTTP/2 are buffered in memory (bounded by
  `requestMaxBodySize`) and are not streamed to disk — `$Request->files` streaming
  parity is planned.
- **WebSockets over HTTP/2** (RFC 8441 extended CONNECT) is out of scope — WebSocket
  upgrades stay on HTTP/1.1.

---

## Reference

### `HTTP_Server_CLI->configure()`

```php
public function configure (
   string $host, int $port, int $workers,
   null|array $secure = null,
   null|string $user = null, null|string $group = null,
   null|bool $enableHTTP2 = null,
   /* request/connection limits ... */
): self
```

`enableHTTP2` is the single HTTP/2 switch. `null`/`true` (default) serves HTTP/2 on
both paths: ALPN advertises `h2,http/1.1` whenever `secure` is set, and the cleartext
prior-knowledge preface is accepted. `false` makes the server HTTP/1.x-only — no `h2`
in ALPN and the preface probe is disabled. A custom `alpn_protocols` key inside
`secure` takes precedence over the default advertisement. The resolved value is
exposed as `HTTP_Server_CLI::$enableHTTP2`.

### `Decoders\Decoder_HTTP2` statics

```php
public static int $streams = 128;
```

Advertised and enforced `SETTINGS_MAX_CONCURRENT_STREAMS`. Streams opened past it are
refused with `RST_STREAM(REFUSED_STREAM)`.

```php
public static int $list = 16384;
```

Advertised and enforced `SETTINGS_MAX_HEADER_LIST_SIZE` in octets, measured on the
decoded header list (name + value + 32 per field, per RFC 7541 §4.1).

```php
public static int $resets = 64;
```

Stream resets tolerated inside a 10-second window before the connection is closed with
`GOAWAY(ENHANCE_YOUR_CALM)` — the rapid-reset (CVE-2023-44487) budget.

### `Request` members

```php
public string $protocol;
```

`'HTTP/2'` on HTTP/2 streams; `'HTTP/1.1'` / `'HTTP/1.0'` otherwise.

```php
public int $stream;
```

The HTTP/2 stream id that carried this Request; `0` on HTTP/1.x connections.

### Protocol primitives

The wire-level building blocks live in `Bootgly\WPI\Modules\HTTP2` and are reusable
outside the server: `HTTP2` (frame/flag/settings constants), `Frame::pack()`,
`Settings` (parse/pack of SETTINGS payloads), `HPACK` (full RFC 7541 codec with
Huffman decoding) and `Errors` (RFC 9113 §7 error codes).
