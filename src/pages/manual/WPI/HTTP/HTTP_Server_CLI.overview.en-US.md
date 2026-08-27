# HTTP Server CLI

The HTTP Server CLI is the native HTTP server of the Bootgly PHP Framework. It is an event-driven, multi-worker server built on top of a non-blocking TCP infrastructure with support for PHP Fibers for asynchronous responses — everything is 100% pure PHP and no extensions.

## Features

| Feature | Description |
|---|---|
| **Operation Modes** | Daemon (background), Interactive (REPL), Monitor (hot-reload), and Test (automated) |
| **Multi-Worker** | Fork-based workers with `SO_REUSEPORT`; master auto-reforks on unexpected worker death |
| **PHP Fibers** | Deferred async responses via `$Response->defer()`, integrated in the `stream_select` event loop |
| **Event-Driven** | `stream_select`-based event loop; non-blocking I/O, zero idle CPU usage |
| **Routing** | Static and dynamic routes with typed parameter constraints; one-time warmup cache |
| **Middleware** | Per-group pipeline via `intercept()`; onion-model execution order |
| **SSL/TLS** | Full HTTPS via PHP stream context options; bundled self-signed certs for local development |
| **HTTP/2** | Native h2 (TLS-ALPN) and cleartext prior knowledge — HPACK, multiplexing, flow control, rapid-reset protection |
| **Response Compression** | gzip, deflate, and compress via `$Response->compress()` |
| **Chunked Responses** | `Transfer-Encoding: chunked` for streaming responses |
| **Authentication** | HTTP Basic auth challenge via `$Response->authenticate()` |
| **Keep-Alive** | Automatic HTTP/1.1 connection reuse |
| **Request Body Limits** | Configurable limits for multipart fields, file parts, and non-multipart bodies |
| **Privilege Dropping** | POSIX user/group demotion after socket bind for secure privileged-port operation |
| **Project Bootstrapping** | Server lifecycle managed through Bootgly Project files, not framework commands |

## Bootstrapping with Projects

In Bootgly, servers are started by Projects — not by framework commands. Each project defines its own boot logic, including server instantiation, configuration, and handler registration.

A project file (e.g. `HTTP_Server_CLI.Project.php`) returns a `Project` instance:

```php
// HTTP_Server_CLI.Project.php in ./project/HTTP_Server_CLI
use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;


return new Project(
   name: 'HTTP Server CLI',
   description: 'HTTP server demo with routing and catch-all 404',
   version: '0.1.0',
   author: 'Your Name',
   exportable: true,

   boot: function (array $arguments = [], array $options = []): void
   {
      $Server = new HTTP_Server_CLI(Mode: match (true) {
         isSet($options['i']) => Modes::Interactive,
         isSet($options['m']) => Modes::Monitor,
         default              => Modes::Daemon
      });
      $Server->configure(
         host: '0.0.0.0',
         port: 8082,
         workers: 4
      );
      $Server->on(Events::RequestReceived, HTTP_Server_CLI::$Router->load(__DIR__ . '/router'));
      $Server->start();
   }
);
```

To start the server, run:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI start
```

Interactive mode:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI start -i
```

Monitor mode:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI start -m
```

## Operation Modes

The server supports multiple operation modes, selected when constructing the `HTTP_Server_CLI` instance:

| Mode | Description |
|---|---|
| `Modes::Daemon` | Forks to background. The master process becomes a session leader, dispatches signals and reaps workers. Default mode. |
| `Modes::Interactive` | REPL loop accepting CLI commands (`stop`, `help`, `monitor`). |
| `Modes::Monitor` | Hot-reload mode. Checks for file changes every 2 seconds and sends reload signals to workers. Displays a live status dashboard. |
| `Modes::Test` | Creates a TCP client, loads the test suite, sends HTTP requests and asserts responses. Used internally for automated testing. Saves PID state with a `.test` instance qualifier (e.g. `HTTP_Server_CLI.test.json`), so it can coexist with a running production server without PID file conflicts. |

## Configuration

The `configure()` method accepts the following parameters:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | — | Bind address. Use `'0.0.0.0'` to listen on all interfaces. When set to `'0.0.0.0'`, domain defaults to `localhost`. |
| `port` | `int` | — | Listen port. |
| `workers` | `int` | — | Number of forked child processes. Each worker binds its own socket via `SO_REUSEPORT`. |
| `secure` | `?array` | `null` | Secure SSL/TLS stream context options. When provided, the scheme switches to `https://`. |
| `user` | `?string` | `null` | POSIX user name to demote the process to after binding. |
| `group` | `?string` | `null` | POSIX group name to demote the process to after binding. |
| `requestMaxFileSize` | `?int` | `null` | Maximum size in bytes per uploaded file part in multipart requests. Defaults to `500 MB`. |
| `requestMaxBodySize` | `?int` | `null` | Maximum total body size in bytes for non-multipart requests. Defaults to `10 MB`. |
| `requestMaxMultipartFieldSize` | `?int` | `null` | Maximum size in bytes of a single multipart text field value. Defaults to `1 MB`. |
| `requestMaxMultipartHeaderSize` | `?int` | `null` | Maximum size in bytes of the header block of a single multipart part. Defaults to `8 KB`. |
| `requestMaxMultipartFields` | `?int` | `null` | Maximum number of text fields accepted in a multipart request. Defaults to `1024`. |
| `requestMaxMultipartFiles` | `?int` | `null` | Maximum number of file parts accepted in a multipart request. Defaults to `1024`. |
| `maxConnections` | `?int` | `null` | Maximum simultaneously-established connections **per worker**. Connections accepted past this ceiling are immediately shed (accepted, then closed) to bound file-descriptor and memory use under a connection-flood DoS. Defaults to `10000`; `0` disables the limit. Evaluated once per accept — never on the per-request hot path. |
| `maxConnectionsPerIP` | `?int` | `null` | Maximum simultaneously-established connections **from a single peer IP**. Opt-in: defaults to `0` (unlimited), because a reverse proxy collapses every client onto one source IP — enable it only when the peer IP is the real client. |
| `connectionIdleTimeout` | `?int` | `null` | Seconds an established connection may stay silent — no completed write since the previous supervisor tick and no pending work retained on it — before the worker closes it. A parked deferred response counts as pending work, so it is never reaped as idle. Defaults to `15`; `0` disables the reaper. Whole seconds: the supervisor runs on the one-second timer wheel, so a reap lands between `N` and `N+1` seconds after the last activity tick. |
| `deferredTimeout` | `?int\|float` | `null` | Seconds a deferred response (`$Response->defer()`) may stay parked on the reactor before a `Response\Timeout` is delivered at its wait point. Defaults to `0` (unbounded). A per-call `defer($work, timeout:)` takes precedence. A timeout that escapes the work always logs a warning; left unhandled by every `Recovering` middleware too, it answers `503 Service Unavailable`. |

```php
$Server->configure(
   host: '0.0.0.0',
   port: 8082,
   workers: 4,
   secure: null,
   user: null,
   group: null,
   requestMaxFileSize: 500 * 1024 * 1024,         // 500 MB (default) — max size per uploaded file part
   requestMaxBodySize: 10 * 1024 * 1024,          // 10 MB (default) — max total non-multipart body
   requestMaxMultipartFieldSize: 1 * 1024 * 1024, // 1 MB (default) — max size per text field value
   requestMaxMultipartHeaderSize: 8 * 1024,        // 8 KB (default) — max size of a single part's headers
   requestMaxMultipartFields: 1024,                // 1024 (default) — max number of text fields
   requestMaxMultipartFiles: 1024,                 // 1024 (default) — max number of file parts
   maxConnections: 10000,                          // 10000 (default) — global concurrent-connection ceiling per worker (0 = unlimited)
   maxConnectionsPerIP: 0,                          // 0 (default, opt-in) — per-IP concurrent-connection ceiling
   connectionIdleTimeout: 15,                      // 15 (default) — idle reaper in seconds; a parked defer() counts as activity (0 = disabled)
   deferredTimeout: 0,                             // 0 (default, unbounded) — budget in seconds for a parked defer(); the per-call timeout wins
);
```

### Connection limits

`maxConnections` and `maxConnectionsPerIP` protect each worker against a connection-exhaustion
DoS: a client that opens connections up to the operating-system file-descriptor limit can
otherwise exhaust the FDs and per-connection memory of a single-threaded event-loop worker.

The ceiling is checked once per accepted connection (not on the per-request hot path), so it
has no effect on the throughput of established keep-alive connections. When a worker is already
at `maxConnections`, the next connection is accepted and immediately closed.

Leave `maxConnectionsPerIP` at `0` when the server sits behind a reverse proxy or load
balancer — every request then arrives from the proxy's IP, and a per-IP cap would throttle all
legitimate traffic. Enable it (a value comfortably above your real per-client concurrency) only
when clients connect to the server directly.

```php
// Direct-to-internet worker: cap total and per-client concurrency.
$Server->configure(
   host: '0.0.0.0',
   port: 8080,
   workers: 8,
   maxConnections: 20000,    // per worker
   maxConnectionsPerIP: 200, // per source IP (only safe without a fronting proxy)
);
```

#### Protocol rejections

A request the decoder cannot accept (malformed head, oversized headers, unsupported
version, denied `Host`, chunked-framing violations, …) is answered with a bare status
line — `400`, `408`, `413`, `414`, `417`, `431`, `501`, `503` or `505` — and the
connection is closed. The error bytes travel through the same ordered writer as every
other response: if a response body is still being flushed to a slow client, the error
drains **behind** the owed bytes instead of splicing into them, the connection stops
reading further input, and the close happens only after the drain — bounded by the
worker's pending-output budget and the write stall deadline. On HTTP/2 the same
ordering applies to the closing `GOAWAY` frame, so it always lands on a clean frame
boundary.

### Idle connections

Every established connection is supervised by the transport idle reaper. Once per
`connectionIdleTimeout` seconds it asks two questions: did the *server* complete a write since the
previous tick, and does the connection still carry pending work? Either answer renews the lease for
another `connectionIdleTimeout`; the first silent tick after the last activity tick — or after
establishment, for a connection that never wrote — closes it.

Inbound bytes never renew the lease: only a completed server write, retained pending work, or a
protocol that refreshes it itself (SSE heartbeats, the WebSocket supervisor) does. A request body that
takes longer than `connectionIdleTimeout` to arrive is therefore closed mid-upload — raise the knob (or
terminate slow uploads at a proxy) when large bodies are expected over slow links.

**Pending work** is a deferred response parked on the reactor — a `defer()` waiting on a database, an
upstream call or any `$Response->wait()`. It writes nothing while it waits, but its generation is
attached to the connection (see *Teardown ownership* below), so the reaper spares it for as long as it
is parked. The lease is not permanent: once the deferral answers, the connection falls back to the
ordinary keep-alive rule and is reaped after the next silent window.

Two consequences worth knowing:

- The reaper never bounds a deferred response. Use `deferredTimeout` — or the per-call
  `defer($work, timeout:)` — for that; see *Deadlines* under *Deferred Response Lifecycle*. A deferral
  that parks with no deadline of its own (`Readiness::read($socket)` defaults to none) and no budget
  holds its connection and its Fiber until the client leaves — bound it, or rely on `maxConnections`.
- The window is coarse by design: the supervisor runs on the worker's one-second alarm, so a reap lands
  between `N` and `N+1` seconds after the last activity tick (up to `2N` to `2N+1` when the write lands
  right after a tick).

Long-lived protocols behave differently. A WebSocket session **replaces** the reaper with its ping/pong
supervisor right after the upgrade, so `connectionIdleTimeout` no longer applies to it. A Server-Sent
Events stream instead **renews** the lease from its own supervisor, which runs every
`min(10, interval, heartbeat)` seconds and never slower than the connection's own expiration — so a
short `connectionIdleTimeout` only makes that supervisor tick more often. `connectionIdleTimeout: 0`
disables the reaper entirely — only do that behind a proxy that enforces its own idle timeout.

### SSL/TLS

Pass a `secure` array with PHP stream context options to enable HTTPS. The server automatically switches the scheme to `https://`:

```php
$Server->configure(
   host: '0.0.0.0',
   port: 443,
   workers: 4,
   secure: [
      'local_cert'  => '/path/to/certificate.pem',
      'local_pk'    => '/path/to/private-key.pem',
      'verify_peer' => false,
   ],
);
```

For local development, Bootgly ships self-signed certificates at `@/certificates/`:

```php
secure: [
   'local_cert' => BOOTGLY_ROOT_DIR . '@/certificates/localhost.cert.pem',
   'local_pk'   => BOOTGLY_ROOT_DIR . '@/certificates/localhost.key.pem',
   'verify_peer' => false,
],
```

> [!NOTE]
> For production, use certificates from a trusted CA such as Let's Encrypt.

### HTTP/2

The server speaks HTTP/2 natively on the same port and routes. With `secure` set, ALPN
advertises `h2,http/1.1` automatically; in cleartext, clients connect with prior
knowledge — no setup at all (turn HTTP/2 off entirely with `enableHTTP2: false`):

```bash
curl -s --http2-prior-knowledge http://127.0.0.1:8080/ -w '%{http_version}\n'
# 2
```

Handlers don't change — `$Request->protocol` reports `'HTTP/2'`. Negotiation modes,
HPACK, multiplexing, flow control, built-in limits and current caveats are covered in
the **[HTTP/2](/manual/WPI/HTTP/HTTP_Server_CLI/HTTP2/)** page.

### Privilege Dropping

When binding to privileged ports (< 1024), the process must start as root. Use `user` and `group` to drop to a non-privileged identity immediately after the socket is bound:

```php
$Server->configure(
   host: '0.0.0.0',
   port: 443,
   workers: 4,
   secure: [ /* ... */ ],
   user: 'www-data',
   group: 'www-data',
);
```

> [!WARNING]
> Both `user` and `group` require the `posix` PHP extension and must be run as root initially.

## Events

The `on()` method registers callbacks for server lifecycle and request handling:

| Event | Callback | Description |
|---|---|---|
| `Events::RequestReceived` | `callable` | Required — handles each incoming HTTP request. |
| `Events::ServerAdvertised` | `?callable` | Optional — launch banner; fires on the process that owns the terminal (on Daemon mode, the launcher). |
| `Events::ServerStarted` | `?callable` | Optional — fires after all workers are up. |
| `Events::ServerStopped` | `?callable` | Optional — fires after all workers are stopped. |

### `Events::RequestReceived`

Called by each **worker** process for every incoming HTTP request. Receives the `$Request` and `$Response` objects.

```php
$Server->on(
   Events::RequestReceived,
   function ($Request, $Response) {
      return $Response(body: 'Hello, World!');
   }
);
```

For larger applications, load routes from the project's `router/` folder with `Router::load()`:

```php
$Server->on(Events::RequestReceived, HTTP_Server_CLI::$Router->load(__DIR__ . '/router'));
```

> [!IMPORTANT]
> The `Events::RequestReceived` handler runs inside each **worker** process. State is not shared between workers — use shared memory or external stores (Redis, DB) for inter-worker communication.

### Loading routes

`Router::load()` is the canonical way to wire routes. It points at the project's `router/` folder and returns the request handler passed to `Events::RequestReceived`:

```php :filename="HTTP_Server_CLI.Project.php";
$Server->on(Events::RequestReceived, HTTP_Server_CLI::$Router->load(__DIR__ . '/router'));
```

Inside the folder:

- **`router/router.index.php`** — a manifest listing the active route set names. Each name resolves to `router/routes/<Name>.routes.php`. List more than one to compose several sets into a single handler.
- **`router/routes/<Name>.routes.php`** — a route set: a generator-closure `(Request, Response, Router): Generator` that `yield`s its routes.

```php :group="router-load"; :tab="router.index.php"; :breadcrumb="router > router.index.php";
// Manifest of active route set names
return [
   'Database',           // active
   // 'Authentication',  // uncomment to also load (sets are composed in order)
];
```

```php :group="router-load"; :tab="Database.php"; :breadcrumb="router > routes > Database.php";
// A route set (generator-closure)
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;

return static function (Request $Request, Response $Response, Router $Router): Generator {
   yield $Router->route('/users', fn (Request $Request, Response $Response) =>
      $Response->JSON->send(['ok' => true]), GET);
};
```

A single set is returned directly; multiple sets are composed (`yield from` each) into one handler. The folder is also the router home — reserved for a future `router.Config.php` defaults file.

```php
Router::load (string $path): Closure
```

Reads `$path/router.index.php` (a manifest of route set names), resolves each name to `$path/routes/<Name>.routes.php`, and returns a single handler closure (composing multiple sets with `yield from`). Throws `InvalidArgumentException` when the index or a named set is missing, or when a set does not return a `Closure`.

### serverAdvertised

Fires once at launch on the process that **owns the terminal** — on Daemon mode, the launcher (so the banner survives the detach); on the other modes, the master right before its loop. Compose the project's launch banner here and call `advertise()` for the endpoint lines:

```php
use const Bootgly\CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;

$Server->on(
   Events::ServerAdvertised,
   function ($Server) {
      CLI->Terminal->Output->render('@.;@#green:✓ My project started@;@.;');
      $Server->advertise();
   }
);
```

`advertise()` prints the bound endpoint: `Local:` always and `Network:` when the bind covers external interfaces — the machine's first non-loopback IPv4, also exposed as `$Server->network`. It is muted on the Test runner and on fully muted output.

### serverStarted

Fires in the **master** process after all workers have been forked and the server socket is bound. Use it to register timers or set up master-side state. On Daemon mode the master's terminal is already detached — render the launch banner in `serverAdvertised` instead.

Available `$Server` properties inside the callback:

| Property | Type | Description |
|---|---|---|
| `$Server->host` | `string` | Bound host address. |
| `$Server->port` | `int` | Bound port number. |
| `$Server->socket` | `string` | Scheme prefix — `http://` or `https://`. |
| `$Server->network` | `null\|string` | First non-loopback IPv4 of the machine — `null` when none is resolvable. |

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;

$Server->on(
   Events::ServerStarted,
   function ($Server) {
      // Master-side setup — timers, schedulers, registries...
   }
);
```

### serverStopped

Fires in the **master** process after all workers have been terminated. Use it for cleanup or final output.

```php
use const Bootgly\CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;

$Server->on(
   Events::ServerStopped,
   function ($Server) {
      $Output = CLI->Terminal->Output;
      $Output->render('@.;@#yellow:■ HTTP Server stopped@;@.;');
   }
);
```

### Full Example

```php
use const Bootgly\CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;

$Server
   ->on(Events::RequestReceived, fn ($Request, $Response) => $Response(body: 'Hello, World!'))
   ->on(Events::ServerStarted, function ($Server) {
      $Output = CLI->Terminal->Output;

      $protocol = $Server->socket ?? 'http://';
      $host     = $Server->host   ?? '0.0.0.0';
      $port     = $Server->port   ?? 0;

      $Output->render('@.;@#green:✓ HTTP Server started@;@.;');
      $Output->render('  Listening on @#cyan:' . $protocol . $host . ':' . $port . '@;@.;');
      $Output->render('  @#green:● Ready for connections@;@..;');
   })
   ->on(Events::ServerStopped, function ($Server) {
      $Output = CLI->Terminal->Output;
      $Output->render('@.;@#yellow:■ HTTP Server stopped@;@.;');
   });
```

## Server Lifecycle

The server follows a well-defined status lifecycle:

```
Booting → Configuring → Starting → Running → Paused → Stopping
```

- **Booting**: Internal initialization (logger, connections, event loop, process manager).
- **Configuring**: Host, port, workers and SSL are stored.
- **Starting**: SAPI is booted, POSIX signals are installed, workers are forked.
- **Running**: Workers are processing requests in the event loop.
- **Paused**: Server socket is removed from the event loop — no new connections are accepted. Existing connections continue.
- **Stopping**: Workers are terminated, PID/lock files are cleaned up.

## Master/Worker Architecture

The server uses a **multi-process** architecture with `fork()`:

- The **master** process manages the lifecycle: signal handling, worker recovery, and coordination.
- Each **worker** process creates its own server socket using `SO_REUSEPORT`, so they all independently bind to the same port. This avoids contention on a shared socket.
- When a worker dies unexpectedly, the master automatically reforks a replacement at the same index via `SIGCHLD` handling.
- Socket options per worker: `backlog: 102400`, `SO_KEEPALIVE`, `TCP_NODELAY`.

```
Master Process
├── fork() → Worker 1: socket bind → event loop
├── fork() → Worker 2: socket bind → event loop
├── ...
└── fork() → Worker N: socket bind → event loop
```

## Event Loop

Each worker runs a `stream_select()`-based event loop that handles:

- **Incoming connections**: Accepted and registered for read monitoring.
- **Request reading**: Raw TCP data is decoded into HTTP requests.
- **Response writing**: Encoded HTTP responses are written to client sockets.
- **PHP Fibers**: The event loop integrates with PHP Fibers to support deferred (asynchronous) responses. See `$Response->defer()` for details.

The event loop supports up to approximately 1000 simultaneous file descriptors (the `stream_select()` limit). When Fibers are active, the loop operates in non-blocking mode (polling); otherwise, it blocks until I/O is available, ensuring zero idle CPU usage.

## Deferred Response Lifecycle

A deferred response (`$Response->defer()`) outlives the handler that created it: the client can vanish, the worker can shut down, and the connection can be reused for the next request while the deferred work is still parked. Three collaborating pieces make that safe.

Deferred work that calls an upstream through a response resource (`$Response->Upstream->request()`, see [Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/)) parks the same way: the dial, the TLS handshake and the response wait all suspend the Fiber on the worker reactor, so the worker keeps serving its other connections — and when the deferral settles, normally or because the client left, the resource releases every upstream connection it opened.

All three are **pay-for-use**. A synchronous request that nothing observes allocates none of them — no exchange, no token, no weak map.

### The exchange: one request's terminal owner

An `Exchange` is opened only when something observes request admission — booting `Telemetry`, for instance. It reaches its terminal state exactly once, whether the request ended with a response or was cancelled:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Exchange;

$Exchange->observe(static function (Exchange $Exchange, null|int $code): void {
   // $code is the final status code — or null when the exchange was cancelled.
});
```

- **Terminal exactly once.** A re-entrant or repeated finish is a no-op.
- **A late observer still fires**, immediately, with the retained result — registering after the transition is not a silent no-op.
- **Observers are contained.** One that throws cannot suppress another, nor break teardown.
- **The exchange retains only the status code**, never the terminal `Response`. Holding the response would pin its request, body and resources for as long as any listener kept the token.

### Cancellation is not a status

When the transport or the scheduler tears down work before a response became observable, the exchange finishes with `$code === null`.

Bootgly does **not** invent a status class for that case — there is no synthetic `499`. A cancelled exchange closes its core accounting (it counts as a request, its duration is observed, it leaves the in-flight gauge) and contributes nothing to the per-class response counters. See the [Observability](/observability) guide for how that shows up in metrics.

### Scheduler capability

Deferring an **observed** exchange requires the reactor to implement `Bootgly\ACI\Events\Cancelling`, a marker over `Contextualizing` that adds no methods:

```php
use Bootgly\ACI\Events\Cancelling;
use Bootgly\ACI\Events\Contextualizing;

interface Cancelling extends Contextualizing {}
```

The marker exists because an observed exchange must be closed *deterministically* when its work is cancelled — a scheduler that cannot guarantee that would strand in-flight accounting forever. Bootgly's own `Select` reactor implements it, so this only concerns you if you replace the reactor: a custom scheduler implementing `Contextualizing` alone makes an observed `defer()` fail early, before the request is cloned or uploaded files are moved.

The base `Scheduler` contract also carries `interrupt()` — how a deadline reaches a parked Fiber (see *Deadlines* and the Reference). A custom scheduler must implement it.

### Teardown ownership

`Ownership` binds teardown owners to a transport or protocol scope — a connection, an HTTP/2 stream — without adding public methods to those non-final classes:

```php
use Bootgly\WPI\Endpoints\Servers\Ownership;

Ownership::attach($Connection, $Owner);   // $Owner implements Disconnecting
Ownership::detach($Connection, $Owner);   // its work completed normally
Ownership::close($Connection);            // notify every attached owner exactly once
```

- **Exactly once, always.** Attaching to an *already closed* scope notifies the owner immediately, and a second attach of the same owner does nothing — including a re-entrant attach from inside its own `disconnect()`.
- **Closing costs nothing when nobody attached**, which is the common case for every connection and every HTTP/2 stream: the scope keeps a terminal marker and no collections.
- **A closed scope never reopens.** `detach()` on it is ignored, so a late attach can never be notified twice.

### Deadlines

A parked deferral is bounded by a **budget**, in seconds: the server-wide `deferredTimeout` passed to
`configure()` (default `0` = unbounded) or, taking precedence, the per-call `timeout` of `defer()`.
The budget is armed only when the work actually parks, and disarmed the moment its generation settles
— normally, through a nested handoff, or by teardown — so a completed deferral never leaves a stale
deadline behind for the Fiber that will be reused next.

When it elapses, the reactor delivers a `Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Timeout` at
the Fiber's suspension point — **before** the exchange settles. The deferred work sees it exactly like
any other exception thrown from `$Response->wait()` (or from a resource call built on it): its `catch`
and `finally` run, and it may still select its own answer:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Timeout;

yield $Router->route('/report', function ($Request, Response $Response) {
   return $Response->defer(function (Response $Response): void {
      try {
         // 'Upstream' is an HTTP response resource registered in responseResources
         $Upstream = $Response->Upstream->request('GET', '/report');
         $Response->JSON->send(['code' => $Upstream->code]);
      }
      catch (Timeout $Timeout) {
         $Response(code: 504, body: "The upstream took longer than {$Timeout->timeout}s.");
      }
   }, timeout: 2.5);
}, GET);
```

Left unhandled by the work, the `Timeout` is offered to the route's `Recovering` middlewares, then to
the global pipeline's (see *Error Boundaries and Deferred Work* on the
[Middlewares](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares) page); unhandled by them too, it is answered
with a clean `503 Service Unavailable` — the environment's error page, without a throwable trace. A
warning is logged with the request line and the budget either way. The same budget bounds a `Recovering`
middleware that parks inside `recover()` — one budget re-armed for the boundary walk, then the clean `503`.
The exchange finishes with that `503`, so telemetry counts a `5xx` response, not a cancellation. One
budget per generation: a deferral that catches the `Timeout` and parks again is not re-armed.

### When the client leaves

If the connection — or the HTTP/2 stream — closes while the deferral is still parked, its generation
is cancelled and the Fiber is **never resumed**: no `catch` block runs, because nothing is thrown into
it — and no `Recovering` middleware is consulted: nothing was thrown, and nobody is left to answer. The
reactor releases the Fiber at its next safe point instead, outside any queue walk, and PHP
unwinds it — every pending `finally` runs right away, before the worker waits for I/O again. Put the
cleanup that must not wait — releasing a lock, closing a file, returning a pooled handle — in a
`finally`, and keep two rules in mind:

- Do not `wait()` or call a resource from inside that `finally`. `wait()` will not park you there — the
  generation's wait capability is revoked the moment it is cancelled, so it returns the `Response`
  immediately and your code runs on as if it had waited; never use it to detect the unwind. A response
  resource refuses instead: the HTTP resource throws `LogicException` ("must be used inside a live
  deferred context"), which, left uncaught, skips the rest of the block.
- Use the `$Response` handed to your closure, not the ambient `WPI->Response`: the execution-segment
  context is not re-bound during the unwind. The same goes for the request: read the snapshot the
  closure received (its second argument, the same object as `$Response->Request`) — never the route's
  `$Request`, which the server has already scrubbed and reused. After a cancellation the snapshot's
  uploads and fields have already been released too: read what you need before the park.

A `Fiber::getCurrent()` kept in a variable across a `wait()` pins the Fiber to its own stack and
defeats the prompt release — read it, use it, `unset()` it.

### Reference

```php
public function observe (Closure $Observer): bool
```

Registers a terminal observer on an `Exchange`. The closure receives `(Exchange $Exchange, null|int $code)`. Returns `true` when the observer was queued, `false` when the exchange had already finished and the observer ran immediately.

```php
public function check (): bool
```

Whether this exchange has already reached its terminal transition.

```php
public function finish (null|Response $Response): bool
```

Finishes the exchange exactly once, retaining only `$Response->code`. Pass `null` for transport or scheduler cancellation. Returns `false` if it was already terminal.

```php
public static function fetch (object $Owner): null|self
```

The exchange carried by an active `Request` alias or by a retained weak snapshot.

```php
public static function attach (object $Scope, Disconnecting $Owner): void
```

Attaches a teardown owner to a scope. If the scope is already closed, the owner's `disconnect()` is invoked immediately instead — once per owner, ever.

```php
public static function detach (object $Scope, Disconnecting $Owner): void
```

Removes an owner whose work completed normally. Ignored on a closed scope, whose notified identities are retained as terminal markers.

```php
public static function close (object $Scope): void
```

Closes a scope and invokes `disconnect()` on every attached owner exactly once. Re-closing is a no-op.

```php
public static function check (object $Scope): bool
```

Whether a live scope still carries at least one attached owner — the idle reaper's question. `false` for a closed scope, an unknown one, or a storage emptied by `detach()`.

```php
public function defer (Closure $work, int|float $timeout = 0): Response
```

Runs `$work` on a pooled Fiber that may park on the worker reactor. `$timeout` is the budget, in seconds, before a `Response\Timeout` is delivered at its wait point; `0` uses `Response::$deferredTimeout`, where `0` means unbounded.

```php
public function interrupt (Fiber $Fiber, Throwable $Throwable): bool
```

(`Bootgly\ACI\Events\Scheduler`) Delivers `$Throwable` at the suspension point of a Fiber this scheduler parked: the Fiber leaves every wait seat, is resumed with `Fiber::throw()` inside its execution-segment binding, and whatever it suspends with next is queued again — its generation stays untouched. Returns `false` when the Fiber is not parked under this scheduler (running, terminated, detached, or bound to a terminal generation, which is evicted instead).

```php
final class Timeout extends RuntimeException
```

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Timeout` — delivered at a deferred response's suspension point when its budget elapsed. `$timeout` (readonly, seconds) is the budget that elapsed.
