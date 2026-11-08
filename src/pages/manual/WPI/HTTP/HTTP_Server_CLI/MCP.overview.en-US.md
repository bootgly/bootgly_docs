# MCP over HTTP

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\MCP` puts an **[MCP server](/manual/API/RPC/MCP/overview/)**
on one route of the HTTP server, speaking the Model Context Protocol's **Streamable HTTP**
transport: the client posts JSON-RPC messages, gets JSON (or an event stream) back, keeps a
session through the `Mcp-Session-Id` header, may listen on a `GET` stream and ends the session
with `DELETE`. Sessions, header rules, `Accept` negotiation and the `Origin` check are handled
for you; your code only writes the tools.

## Serve MCP on a route

Build the server core with your tools, wrap it in the transport, and route `GET`, `POST` and
`DELETE` of one path to it:

```php
use Bootgly\API\RPC;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\MCP;

return static function (Request $Request, Response $Response, Router $Router): Generator
{
   $Server = new RPC\MCP(
      name: 'Weather',
      version: '1.0.0',
      Lister: fn (): array => [
         [
            'name' => 'forecast',
            'description' => "Tomorrow's forecast for a city.",
            'inputSchema' => [
               'type' => 'object',
               'properties' => ['city' => ['type' => 'string']],
               'required' => ['city']
            ]
         ]
      ],
      Caller: fn (string $name, array $arguments): array => [
         'content' => [['type' => 'text', 'text' => "Sunny in {$arguments['city']}, 24 °C."]],
         'isError' => false
      ]
   );

   yield $Router->route('/mcp', new MCP($Server), [GET, POST, DELETE]);
};
```

The core and the transport are built once per worker and serve every client of it. Point an
MCP client at `http://localhost:8080/mcp` (Streamable HTTP) and it can list and call
`forecast`.

The class is named `MCP`, like the server core. Import the core's namespace instead of its
class — `use Bootgly\API\RPC;` and `new RPC\MCP(…)` — and both names stay free of aliases.

## A session, step by step

`initialize` opens the session: the answer carries a fresh `Mcp-Session-Id`, which the client
sends on every later request.

```bash
curl -i http://localhost:8080/mcp \
   -H 'Content-Type: application/json' \
   -H 'Accept: application/json, text/event-stream' \
   -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
# HTTP/1.1 200 OK
# Mcp-Session-Id: 4f0c5b8e2d7a91c3e6b0a4d2f8c1e937
# Content-Type: application/json
# …
# {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"Weather","version":"1.0.0"}}}
```

Then the client confirms it is ready — a notification, so the answer is `202 Accepted` with no
body — and works with the tools:

```bash
curl -i http://localhost:8080/mcp \
   -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
   -H 'Mcp-Session-Id: 4f0c5b8e2d7a91c3e6b0a4d2f8c1e937' -H 'MCP-Protocol-Version: 2025-06-18' \
   -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'
# HTTP/1.1 202 Accepted

curl http://localhost:8080/mcp \
   -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
   -H 'Mcp-Session-Id: 4f0c5b8e2d7a91c3e6b0a4d2f8c1e937' -H 'MCP-Protocol-Version: 2025-06-18' \
   -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"forecast","arguments":{"city":"Lisbon"}}}'
# {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"Sunny in Lisbon, 24 °C."}],"isError":false}}
```

Finally it ends the session:

```bash
curl -i -X DELETE http://localhost:8080/mcp -H 'Mcp-Session-Id: 4f0c5b8e2d7a91c3e6b0a4d2f8c1e937'
# HTTP/1.1 204 No Content
```

## Sessions

- The id is 128 random bits (32 lowercase hex characters), issued only by a successful
  `initialize`. An id the client sends on `initialize` is ignored — never adopted.
- Every other request must carry it: without it the answer is `400`; with an id that is
  malformed, unknown, ended, expired or opened by another principal (see below), `404`. A
  client that gets `404` starts over with `initialize`.
- `MCP-Protocol-Version`, when the client sends it, must equal the revision agreed at
  `initialize`; any other value is `400`. A client that does not send it (revision
  `2025-03-26`) is served.
- A session expires after `TTL` seconds without a request (`3600` by default); each request
  renews it, and an open listening stream counts as one: while it is open the session does not
  expire. While `GET` streams are enabled (`streams` above `0`), each renewal grants at least
  15 seconds — a stream's lease — however short the `TTL`. Until its first request after
  `initialize` a session is provisional and lasts `TTL` seconds, 60 at most, so sessions a
  client opens and never uses leave the store within a minute.

Sessions live in an ABI **[Cache](/guide/cache/overview/)**. By default it is a 1 MiB
shared-memory segment of their own on the host (the `shared` driver, keys prefixed `mcp:`) —
never the segment other caches such as RateLimit share — so a session opened on one worker is
resumed on any other worker of the same host. When the workers span several hosts,
give the transport a Cache they all reach:

```php
use Bootgly\ABI\Resources\Cache;

$MCP = new MCP(
   $Server,
   Cache: new Cache(['driver' => 'redis', 'host' => '10.0.0.5', 'prefix' => 'mcp:']),
   TTL: 900
);
```

The shared-memory segment has a fixed size (1 MiB, about 3,500 sessions), and `initialize` is
the one request that needs no session. A store that cannot hold one more session answers
`initialize` with `503`. Sweeping expired sessions out of a full store holds its lock — and
stalls every worker that reads the store meanwhile — so a store is swept by one worker at a
time, at most once every 4 to 5 seconds, and `initialize` is served again once a sweep frees
room. Open streams are kept inside the session records and never add an entry to the store. A client that
keeps sending unused `initialize` calls can keep the store full, and new sessions refused, for
as long as it keeps going: on an endpoint open to untrusted clients, put an authentication guard
and a **[RateLimit](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/overview/)** in front of the
route. A client allowed 60 requests a minute holds at most about 60 sessions it never uses, so
about 60 such clients fill the store. A session that is used lives for the whole `TTL`, so size
`TTL` to how long your clients really stay idle. For more sessions, give the transport a Redis
Cache rather than a larger shared segment: the sweep's cost grows with the square of the
segment's size. A segment keeps the size it was created with until it is removed (`ipcrm`) or
the host reboots.

## Who is calling

Put an authentication guard in front of the route. The transport binds each session to the
principal that opened it — `$Request->identity`, as the guard exposed it — so a session id
alone cannot be replayed by another user: a request for that session from anyone else is
`404`.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Bearer;

$Guard = new Authentication(new Authenticating(
   new Bearer(Resolver: fn (string $token): null|string => Tokens::find($token)?->user)
));

yield $Router->route('/mcp', new MCP($Server), [GET, POST, DELETE], middlewares: [$Guard]);
```

The principal is compared by fingerprint (SHA-256): an `API\Security\Identity` by its `id`, a
string or integer identity by its value, any other value by its serialized form, and no
identity as the anonymous principal.

Each call reaches your closures with the **`Request`** as its context — the last argument of
the `Lister`, the `Caller` and the others — so a tool can read who is calling:

```php
use Bootgly\API\Security\Identity;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;

$Server = new RPC\MCP(
   name: 'Orders',
   version: '1.0.0',
   Lister: fn (Request $Request): array => $Request->identity instanceof Identity
      && $Request->identity->check('orders:write') ? [/* … */] : [],
   Caller: function (string $name, array $arguments, Request $Request): array {
      // ? Check the caller again on every call
      // …
   }
);
```

The call runs as **[deferred work](/manual/WPI/HTTP/HTTP_Server_CLI/Response/overview/)**: a tool
may await asynchronous I/O — a database pool, an HTTP client — without blocking the worker.
The `Request` it receives is that work's snapshot.

To let a browser client (or the MCP Inspector) read the session and challenge headers, add the
`CORS` middleware with `Mcp-Session-Id` exposed, as in
**[Protecting an MCP endpoint](/manual/WPI/HTTP/HTTP_Server_CLI/Authentication/overview/)**.

## Answers: JSON or a stream

A `POST` must be `Content-Type: application/json` (`415` otherwise) and fit in `body` bytes
(`1048576` by default; `413` otherwise). The answer form follows the client's `Accept`:

| `Accept` | Answer |
|---|---|
| `application/json` (or `*/*`, or no `Accept`) | `200`, `Content-Type: application/json` |
| `text/event-stream` | `200`, one `message` event carrying the answer, then the stream ends |
| both | the one the client prefers (`q`), the first listed on a tie |
| neither | `406` |

A body of notifications only is answered `202 Accepted` with no body. Over HTTP/1.0 an answer
cannot be streamed: it is JSON when the client accepts JSON, and `406` otherwise.

## The listening stream

`GET` with `Accept: text/event-stream` and the session id opens the session's listening stream:
a `text/event-stream` that stays open, kept alive by heartbeat comments. The server core sends
no server-initiated messages, so the stream carries nothing else today; it closes when the
client leaves or within about five seconds after the session ends.

One session may hold `streams` streams open at once (`1` by default), counted across workers; one
more is `409 Conflict`. A slot is held on a 15-second lease that the open stream renews, so a
stream cut off without closing (a worker killed, the server restarted, a client gone silent)
frees its slot within 15 seconds. The slots live in the session record, so a store too full to
hold one more slot is swept the same way, and answers `GET` with `503` while no sweep frees room. With `streams: 0` the endpoint is JSON-only and answers `GET`
with `405`; a `GET` over HTTP/1.0 is `505`, since that version cannot hold a stream open.

## Browsers and DNS rebinding

A malicious web page can make a visitor's browser send requests to a server on their machine or
network — by rebinding its own domain name to `127.0.0.1`, for instance. Browsers always send an
`Origin` header on those `POST` and `DELETE` requests, so the transport checks it on every
request:

- an `Origin` that is in `origins` is served;
- any other `Origin` — including `null` and the server's own `Host` — is refused with `403`;
- a request with no `Origin` is served: it comes from a non-browser client (an IDE, a CLI, an
  SDK), and a `GET` still needs a session id.

`origins` is an explicit allowlist of serialized origins, `scheme://host[:port]`; it is never
derived from the request, because a rebinding page's `Origin` matches the `Host` it targets.
Leave it empty when no browser should call the endpoint:

```php
$MCP = new MCP($Server, origins: ['https://app.example.com', 'http://localhost:6274']);
```

For a server that only local clients use, also bind it to `127.0.0.1` instead of `0.0.0.0`, and
list the names it answers to in
**[`Request::$allowedHosts`](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/)**.

## Refusals

Every refusal carries a JSON-RPC error without an `id`, with code `-32000` and a message that
names the reason:

```json
{"jsonrpc":"2.0","id":null,"error":{"code":-32000,"message":"Bad Request: Mcp-Session-Id header is required"}}
```

| Status | When |
|---|---|
| `400` | No `Mcp-Session-Id` after `initialize`; `MCP-Protocol-Version` other than the agreed revision |
| `403` | An `Origin` outside `origins` |
| `404` | A malformed, unknown, ended or expired session — or another principal's |
| `405` | A method other than `GET`, `POST`, `DELETE`; `GET` with `streams: 0` (`Allow` lists the methods) |
| `406` | An `Accept` that excludes both answer forms (`POST`) or the event stream (`GET`); a `POST` over HTTP/1.0 that accepts only a stream |
| `409` | One more listening stream than `streams` |
| `413` | A body larger than `body` |
| `415` | A `POST` body that is not `application/json` |
| `503` | The session store cannot hold a new session (`initialize`) or a new stream slot (`GET`) |

## Reference

```php
public function __construct (
   RPC\MCP $Server,
   array $origins = [],
   null|Cache $Cache = null,
   int $TTL = 3600,
   int $body = 1_048_576,
   int $streams = 1
)
```

Creates the transport for one server core. `$origins` are the browser origins allowed to call
(`scheme://host[:port]`, normalized to lowercase without a trailing slash); `$Cache` is the
session store (by default a `shared` Cache on a 1 MiB segment of its own, keys prefixed `mcp:`);
`$TTL` the seconds a session survives without a request (an open listening stream counts as one;
each renewal grants at least 15 while `GET` streams are enabled; a session not resumed yet lasts
at most 60); `$body` the largest request body in bytes;
`$streams` the listening streams one session may hold open (`0` disables `GET`). Throws
`InvalidArgumentException` for an origin with a path, a wildcard or no scheme, for a `$TTL` or
`$body` below `1`, and for a negative `$streams`.

```php
public function __invoke (Request $Request, Response $Response): Response
```

Answers one request to the endpoint — the transport is the route handler itself. `POST` runs the
message through the server core as deferred work; `GET` opens the listening stream; `DELETE`
ends the session.

```php
public private(set) RPC\MCP $Server;
```

The server core this endpoint drives.

```php
public private(set) array $origins;
```

The allowed browser origins, normalized.

```php
public private(set) int $TTL;
```

Seconds a session survives without a request — an open listening stream counts as one; each
renewal grants at least 15 while `GET` streams are enabled.

```php
public private(set) int $body;
```

The largest request body accepted, in bytes.

```php
public private(set) int $streams;
```

Listening streams one session may hold open at once.

```php
public const int TRANSPORT_ERROR = -32000;
```

The JSON-RPC error code of every transport refusal.
