# HTTP Server CLI

The HTTP Server CLI is the native HTTP server of the Bootgly PHP Framework. It is an event-driven, multi-worker server built on top of a non-blocking TCP infrastructure with support for PHP Fibers for asynchronous responses — everything is 100% pure PHP and no extensions.

## Features

| Feature | Description |
|---|---|
| **Operation Modes** | Daemon (background), Foreground, Interactive (REPL), Monitor (live log viewer), and Test (automated) |
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
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
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
         new ServerConfigs(
            host: '0.0.0.0',
            port: 8082,
            workers: 4
         )
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
| `Modes::Foreground` | Stays attached to the terminal, with the server logs (and anything a handler `echo`es) printed in front of you. |
| `Modes::Interactive` | REPL loop accepting CLI commands (`stop`, `help`, `monitor`). |
| `Modes::Monitor` | Full-screen live log viewer: master and worker records stream into a filterable view. It does **not** watch files — ship code changes with `project reload` (see [Reload](/guide/reload/overview/)). |
| `Modes::Test` | Creates a TCP client, loads the test suite, sends HTTP requests and asserts responses. Used internally for automated testing. Saves PID state with a `.test` instance qualifier (e.g. `HTTP_Server_CLI.test.json`), so it can coexist with a running production server without PID file conflicts. |

## Configuration

`configure()` takes **Configs** — one typed value object per concern, in any order:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Configs as RequestConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Configs as ResponseConfigs;

$Server->configure(
   new ServerConfigs(
      host: '0.0.0.0',
      port: 8082,
      workers: 4
   ),
   new RequestConfigs(
      maxBodySize: 32 * 1024 * 1024  // 32 MB — accept larger non-multipart bodies
   ),
   new ResponseConfigs(
      deferredTimeout: 2.5           // seconds — bound every parked defer()
   )
);
```

Three concerns, three classes:

| Configs | Owns |
|---|---|
| `HTTP_Server_CLI\Configs` | The server itself: bind address, workers, TLS (manual or Auto-TLS), privilege dropping, HTTP/2, health endpoint, connection caps. |
| `Request\Configs` | Inbound limits: body, multipart and upload ceilings. |
| `Response\Configs` | Outbound: named response resources and the deferred budget. |

Only `host`, `port` and `workers` are required — every other field of every Configs is optional
and keeps the framework default when omitted. The full field list of each class is in the
[Reference](#reference) at the end of this page.

The call itself enforces five rules:

- **Order is irrelevant.** `configure(new ResponseConfigs(...), new ServerConfigs(...))` is the same call as the reverse — each Configs is matched by type, never by position.
- **One instance per class, per call.** Passing two `Request\Configs` in the same `configure()` throws `InvalidArgumentException` (`... received two ... instances.`) instead of letting the second silently win.
- **The first `configure()` must carry the server Configs.** `host`, `port` and `workers` have no defaults, so a first call that never sets them throws `ArgumentCountError`. Once they are set, a later pre-start call may refine a single concern on its own — `configure(new ResponseConfigs(deferredTimeout: 5))` is a valid follow-up. An empty `configure()` is rejected too.
- **Each node takes its own Configs, by exact class.** An `HTTP_Server_CLI` accepts `HTTP_Server_CLI\Configs`, `Request\Configs` and `Response\Configs` — nothing else, not even the parent `TCP_Server_CLI\Configs` (which carries the socket but no HTTP policy: scheme, ALPN, safe TLS defaults) or a subclass of an accepted Configs (whose extra fields the server could not read). Anything else throws `InvalidArgumentException` instead of being half-applied.
- **The set is checked before any of it is applied.** Those set-level rules are decided over the whole argument list first, so a call rejected on any of them leaves every process-global limit, budget and cap exactly as it was. What a single Configs *carries* is validated by its own constructor wherever it can be — an invalid response factory, or a `secure` context alongside `AutoTLS`, throws at `new`. A few checks can only run against live state while the call is applying (the Auto-TLS runtime preconditions; a resource name a response property already owns): those throw with the Configs before them already applied.

`configure()` is a **pre-start** contract: after the server crosses its start boundary the call is
refused with a logged error, and reconfiguration goes through a [reload](/guide/reload)
(`bootgly project <name> reload`), which re-executes the project and its `configure()`.

### Named arguments only

Every Configs constructor opens with a guard slot — `Bootgly\ABI\Argument $Named` — that a named
call never fills:

```php
new ServerConfigs(host: '0.0.0.0', port: 8080, workers: 4); // ✅
new ServerConfigs('0.0.0.0', 8080, 4);                      // ❌ TypeError
```

A positional call binds `'0.0.0.0'` to `$Named`, which is typed as the `Argument` enum, so PHP
raises a `TypeError` before the object exists — and static analysis flags it in your editor. That
guard is why the API reads the way it does: fields can be added, reordered or retired without any
existing call silently rebinding a value that was passed by position.

### Defaults

Nothing has to be passed to get the framework defaults; this is what they are, written out:

```php
$Server->configure(
   new ServerConfigs(
      host: '0.0.0.0',
      port: 8082,
      workers: 4,
      secure: null,                    // null — plain HTTP; an array (or AutoTLS:) switches to https://
      user: null,                      // null — no privilege dropping
      group: null,
      enableHTTP2: true,               // true (default) — h2 over ALPN and h2c prior knowledge
      health: null,                    // null — the built-in health endpoint is opt-in
      maxConnections: 10000,           // 10000 (default) — concurrent-connection ceiling per worker (0 = unlimited)
      maxConnectionsPerIP: 0,          // 0 (default, opt-in) — per-IP concurrent-connection ceiling
      headroom: 32,                    // 32 (default) — selector entries kept for the worker's own dependency I/O (0 = disabled)
      connectionIdleTimeout: 15        // 15 (default) — idle reaper in seconds; a parked defer() counts as activity (0 = disabled)
   ),
   new RequestConfigs(
      maxFileSize: 500 * 1024 * 1024,         // 500 MB (default) — max size per uploaded file part
      maxBodySize: 10 * 1024 * 1024,          // 10 MB (default) — max total non-multipart body
      maxMultipartFieldSize: 1 * 1024 * 1024, // 1 MB (default) — max size per text field value
      maxMultipartHeaderSize: 8 * 1024,       // 8 KB (default) — max size of a single part's headers
      maxMultipartFields: 1024,               // 1024 (default) — max number of text fields
      maxMultipartFiles: 1024,                // 1024 (default) — max number of file parts
      downloadsMaxBytesOnDisk: 8 * 1024 * 1024 * 1024 // 8 GB (default) — aggregate spooled-upload ceiling
   ),
   new ResponseConfigs(
      Resources: null,                 // null (default) — no project response resources registered
      deferredTimeout: 0               // 0 (default, unbounded) — budget in seconds for a parked defer(); the per-call timeout wins
   )
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

`headroom` (default `32`) keeps part of each worker's selector free for the worker's own
dependency I/O — deferred responses awaiting their database or KV pools, the embedded HTTP
client — by shedding clients earlier. The selector admits `1000` entries per table and client
sockets share them, so a worker stops admitting clients at `1000 − headroom` (968 by default);
the effective per-worker ceiling is the smaller of that and `maxConnections`. Without the
reserve, a flood of idle connections leaves every dependency wait refused. The worker's own
listener takes one of the reserved entries, so the default leaves 31 for dependency waits: size
it to at least the sum of the `pool.max` of the worker's resources plus one for the listener;
`0` disables it, and it is clamped so a worker always admits clients.

```php
// Direct-to-internet worker: cap total and per-client concurrency.
$Server->configure(
   new ServerConfigs(
      host: '0.0.0.0',
      port: 8080,
      workers: 8,
      maxConnections: 900,      // per worker (the selector already stops clients at 1000 − headroom)
      maxConnectionsPerIP: 200, // per source IP (only safe without a fronting proxy)
      headroom: 64              // per worker: the listener + up to 63 pooled DB/KV/HTTP-client connections
   )
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

- The reaper never bounds a deferred response. Use `Response\Configs(deferredTimeout:)` — or the per-call
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

Pass a `secure` array of PHP stream context options on the server Configs to enable HTTPS. The server automatically switches the scheme to `https://`:

```php
$Server->configure(
   new ServerConfigs(
      host: '0.0.0.0',
      port: 443,
      workers: 4,
      secure: [
         'local_cert'  => '/path/to/certificate.pem',
         'local_pk'    => '/path/to/private-key.pem',
         'verify_peer' => false,
      ]
   )
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

For a certificate the server obtains and renews by itself, pass an `AutoTLS` instance in the
`AutoTLS:` parameter instead of the `secure:` array — see the [Auto-TLS](/guide/auto-tls) guide:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\AutoTLS;

$Server->configure(
   new ServerConfigs(
      host: '0.0.0.0',
      port: 443,
      workers: 4,
      AutoTLS: new AutoTLS(
         domains: ['example.com'],
         email: 'admin@example.com'
      ),
      user: 'www-data',
      group: 'www-data'
   )
);
```

`secure:` and `AutoTLS:` are mutually exclusive — one certificate source, never two. Passing both
throws `InvalidArgumentException` at construction.

### HTTP/2

The server speaks HTTP/2 natively on the same port and routes. With `secure` set, ALPN
advertises `h2,http/1.1` automatically; in cleartext, clients connect with prior
knowledge — no setup at all (turn HTTP/2 off entirely with `enableHTTP2: false` on the server
Configs):

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
   new ServerConfigs(
      host: '0.0.0.0',
      port: 443,
      workers: 4,
      secure: [ /* ... */ ],
      user: 'www-data',
      group: 'www-data'
   )
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
   ->on(Events::ServerAdvertised, function ($Server) {
      $Output = CLI->Terminal->Output;

      $Output->render('@.;@#green:✓ HTTP Server started@;@.;');
      $Server->advertise();
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
- **Configuring**: The Configs handed to `configure()` are adopted — host, port, workers, TLS, request limits, response resources.
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

The event loop admits up to 1000 descriptors per selector table **per worker** (bounded by `stream_select()`), shared by client sockets and the worker's own dependency waits, so total capacity grows with the worker count. Clients stop at `1000 − headroom` — about 968 by default — which keeps the rest free for the worker's listener (one entry) and for deferred database, KV and HTTP-client I/O. `maxConnections`, `maxConnectionsPerIP` and `headroom` ([Connection limits](#connection-limits)) cap admission per worker. When Fibers are active, the loop operates in non-blocking mode (polling); otherwise, it blocks until I/O is available, ensuring zero idle CPU usage.

## Process Model

Every worker boots your project once — routes, classes, objects — and then serves request after
request from its event loop. Nothing is torn down between requests. If you come from PHP-FPM,
that is the one idea that changes how you write code; if you come from Swoole, Workerman or
RoadRunner, it is the model you already know, with the differences listed in
[Coming from Swoole](#coming-from-swoole).

### What survives between requests

Global variables, static properties, `static` variables inside functions and closures, and every
object created while the routes were registered live as long as the worker — they are **not**
reset when a request ends:

```php
yield $Router->route('/count', function (Request $Request, Response $Response) {
   static $count = 0; // lives as long as the worker
   $count++;

   return $Response(body: 'pid=' . getmypid() . " count={$count}");
}, GET);
```

Two things follow from it:

- **Never keep per-request data in them.** A value you put in a static or a global is still
  there — with the previous request's content — when the next request arrives.
- **Keep in-process caches bounded.** Anything that only grows (an array cache without eviction,
  a list you append to per request) grows for the whole life of the worker. There is no
  automatic worker recycling (no *max requests* option) yet; [`reload`](/guide/reload/overview/)
  restarts every worker gracefully.

Use this to your advantage for things that are expensive to build and safe to share: parsed
configuration, compiled templates, prepared statements, connection pools.

### Workers do not share memory

Each worker is a separate process with its own copy of everything above. With `workers: 2`, the
`/count` route counts per worker:

```text
pid=50609 count=1
pid=50608 count=1
pid=50609 count=2
```

State that must be the same for every worker belongs outside the process — the
[Cache](/guide/cache/overview/) `shared` driver (System V shared memory, same host), `apcu`,
Redis or the database:

```php
use Bootgly\ABI\Resources\Cache;

$Visits = new Cache(['driver' => 'shared', 'prefix' => 'visits:']);

yield $Router->route('/visits', function (Request $Request, Response $Response) use ($Visits) {
   return $Response(body: (string) $Visits->increment('home')); // 1, 2, 3... across workers
}, GET);
```

### Read the request from `$Request`, answer through `$Response`

PHP's request superglobals are not populated: `$_GET`, `$_POST`, `$_COOKIE`, `$_FILES` and
`$_REQUEST` stay empty, and `$_SERVER` describes the CLI process, not the request. The
functions that write to the SAPI do not reach the client either. Use the objects every handler
receives:

| Instead of | Use |
| --- | --- |
| `$_GET['page']` | `$Request->queries['page']` |
| `$_POST['name']` | `$Request->fields['name']` |
| `$_FILES['avatar']` | `$Request->files['avatar']` |
| `$_COOKIE['theme']` | `$Request->Cookies->get('theme')` |
| `$_SERVER['REQUEST_METHOD']`, `$_SERVER['REQUEST_URI']` | `$Request->method`, `$Request->URI` |
| `$_SERVER['REMOTE_ADDR']` | `$Request->address` |
| `$_SERVER['HTTP_X_TOKEN']`, `getallheaders()` | `$Request->Header->get('X-Token')` |
| `session_start()`, `$_SESSION` | `$Request->Session` |
| `header('X-Frame-Options: DENY')` | `$Response->Header->set('X-Frame-Options', 'DENY')` |
| `setcookie('theme', 'dark')` | `$Response->Header->Cookies->append(new Cookie('theme', 'dark'))` |
| `echo`, `print` | `return $Response(body: '...')` |
| `exit`, `die` | `return $Response` |

`Cookie` is `Bootgly\WPI\Modules\HTTP\Server\Response\Raw\Header\Cookie`. Output written with
`echo` goes to the worker's standard output — your terminal in foreground mode, nowhere in
daemon mode — never to the client. See [Request](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/)
and [Response](/manual/WPI/HTTP/HTTP_Server_CLI/Response/overview/) for the full API.

### `exit()` ends the worker

`exit()` and `die()` terminate the worker process itself. The client gets an empty reply, every
other connection that worker held is dropped, and the master forks a replacement — which starts
with fresh state:

```text
WARNING: Worker #1 (PID: 50609) crashed, reforking...
NOTICE: Worker #1 recovered (new PID: 51400)
```

Return a response instead; to stop early, return it from wherever you are.

### One request at a time per worker

A synchronous handler runs from start to finish before its worker reads the next request.
Nothing else runs in that worker in the middle of your handler, so a global you set at the top
of a handler is still yours at the bottom.

The flip side: **a blocking call blocks every connection of that worker.** With one worker, a
route that spends 1.5 s in a CPU loop made a trivial route on another connection wait 1.2 s.
`sleep()`, a blocking HTTP client (`file_get_contents('https://...')`, curl), PDO and any other
synchronous I/O have the same effect — and `sleep()` is also cut short by the worker's own timer
signal, so it is not even a reliable delay.

Bootgly is pure PHP: it cannot turn PHP's blocking functions into non-blocking ones behind your
back. Use the clients that park on the event loop instead:

- **SQL** — the [ADI Database](/guide/database-dbal/overview/) PostgreSQL and MySQL drivers.
- **Redis** — the KV driver described in [Cache](/guide/cache/overview/) (the Cache `redis`
  driver itself is blocking).
- **HTTP** — the upstream client in [Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/).

Spread CPU-heavy work across workers, or move it to a [queue](/guide/queues/overview/).
[Performance](/guide/performance/overview/) covers worker and pool sizing.

### Deferred work interleaves at `wait()`

`$Response->defer()` runs your work in a Fiber. Every `$Response->wait()` hands the worker back
to the event loop, and other requests run until the Fiber resumes. This is the only place where
two requests interleave inside one worker — and there, shared state is shared:

```php
yield $Router->route('/hello', function (Request $Request, Response $Response) {
   $name = (string) ($Request->queries['name'] ?? '');

   return $Response->defer(function (Response $Response) use ($name): void {
      $GLOBALS['name'] = $name; // ❌ one global per worker, shared by every request

      $until = microtime(true) + 1;
      while (microtime(true) < $until) {
         $Response->wait(); // other requests run here
      }

      $Response->send("Hello, {$name}! (the global now says {$GLOBALS['name']})\n");
   });
}, GET);
```

Two overlapping requests on the same worker, `?name=alice` then `?name=bob`, answer:

```text
Hello, bob! (the global now says bob)
Hello, alice! (the global now says bob)
```

Keep everything a deferral needs in local variables or in the closure's `use` list — `$name`
above stays correct. Read the request through the closure's parameters, never through a copy of
the route's `$Request`/`$Response` kept aside: the rules are in
[Deferred Responses](/manual/WPI/HTTP/HTTP_Server_CLI/Response/overview/).

### Code changes need a reload

A worker loads your code once. Editing a file changes nothing until the workers are replaced:
run [`project reload`](/guide/reload/overview/) — graceful, in-flight requests finish. No mode
watches the disk for you yet. A reload also resets every in-process state described above.

### Coming from Swoole

The rules are mostly the ones you already follow: globals persist per worker, workers do not
share memory, superglobals are empty, `exit()` kills the worker. What differs:

- **No implicit concurrency.** Swoole can hook blocking functions into coroutines, so any I/O
  call may switch to another request mid-handler. Bootgly never switches implicitly: requests
  interleave only at an explicit `wait()` inside `defer()`.
- **No hooks for blocking functions.** The price of the above — PDO, curl and `sleep()` block the
  worker. Use the native async clients listed earlier.
- **`Swoole\Table` → Cache `shared`.** Cross-worker state on one host is the `shared` Cache
  driver; across hosts, Redis or the database.
- **`max_request` → not yet.** Workers are not recycled automatically; watch memory and use
  `reload`.
- **`sendfile` → streamed.** See [Static Files](#static-files).

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

Bootgly does **not** invent a status class for that case — there is no synthetic `499`. A cancelled exchange closes its core accounting (it counts as a request, its duration is observed, it leaves the in-flight gauge) and contributes nothing to the per-class response counters. See the [Observability](/guide/observability) guide for how that shows up in metrics.

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

A parked deferral is bounded by a **budget**, in seconds: the server-wide `deferredTimeout` of
`Response\Configs` (default `0` = unbounded) or, taking precedence, the per-call `timeout` of `defer()`.
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
         // 'Upstream' is an HTTP response resource registered in Response\Configs(Resources:)
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

## Static Files

Bootgly serves files itself — no Nginx or Apache in front. There are two paths, one per job:

- **`Statics`** (Web platform) for the assets your pages load: stylesheets, scripts, images,
  fonts. Served inline, with the right media type and a browser cache policy.
- **`$Response->upload()`** for downloads and large files: streamed from disk in slices, never
  loaded whole into memory, with byte ranges, over HTTP/1.1 and HTTP/2.

Neither uses the `sendfile(2)` system call. [Why, and what that means](#why-there-is-no-sendfile)
is explained below.

### Serve your site's assets

Put the files in the project's `statics/` folder and register one catch-all route for them:

```text
projects/Blog/
├── router/routes/Blog.routes.php
└── statics/
    ├── app.css
    └── logo.png
```

```php
use Web\App\Statics;

yield $Router->route('/statics/:file*', new Statics, GET);
```

Pages reference them by URL:

```html
<link rel="stylesheet" href="/statics/app.css">
<img src="/statics/logo.png" alt="Logo">
```

The response carries the media type mapped from the extension and a cache policy for the
browser:

```text
HTTP/1.1 200 OK
Content-Type: text/css; charset=UTF-8
Cache-Control: public, max-age=3600
Content-Length: 4400
```

`Statics` maps 25 common extensions — CSS, JavaScript, JSON and source maps, HTML, SVG and the
usual image, font, video, PDF and WebAssembly formats. An unknown extension is sent as
`application/octet-stream`. A path that leaves the `statics/` folder (`../`, encoded or not) or
names a missing file answers `404`.

The constructor takes the folder, the route parameter and the `Cache-Control` value. For
fingerprinted file names (`app.3f9a1c.css`) that never change, let browsers keep them for a year:

```php
yield $Router->route('/statics/:file*', new Statics(cache: 'public, max-age=31536000, immutable'), GET);
```

### Revalidate and compress

Add the [`ETag` and `Compression`](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/overview/)
middlewares to the route. `ETag` goes first — outermost — so the tag describes the compressed
bytes that actually go on the wire:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Compression;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\ETag;
use Web\App\Statics;

yield $Router->route('/statics/:file*', new Statics, GET, middlewares: [new ETag, new Compression]);
```

The first request gets the gzipped body and a tag; a browser that sends the tag back gets an
empty `304`:

```text
HTTP/1.1 200 OK
Content-Encoding: gzip
ETag: W/"f060e02266f84f8e"
Content-Length: 73

HTTP/1.1 304 Not Modified
ETag: W/"f060e02266f84f8e"
```

### Keep `Statics` for web assets

`Statics` reads the whole file into memory on every request. That is the right trade for
stylesheets, scripts, icons and fonts — small files, served often, that the browser then
caches. It is the wrong one for video, large PDFs or downloads of many megabytes: stream those
with `upload()`, as shown next, or serve them from a CDN.

### Send downloads and large files

`$Response->upload()` streams a file from the project directory:

```php
yield $Router->route('/reports/latest', function (Request $Request, Response $Response) {
   return $Response->upload('storage/files/report.pdf');
}, GET);
```

- The file is read in **slices** — up to 1 MiB at a time on HTTP/1.1, sized by the stream's
  flow-control window on HTTP/2 — and written as the connection accepts them. When the client is
  slow, the rest waits for the next writable event: the worker keeps serving its other
  connections meanwhile.
- `Range` requests are answered with `206 Partial Content`, including multi-range
  `multipart/byteranges`, on HTTP/1.1 and HTTP/2.
- The path is confined to the project directory; anything outside answers `403`.

`upload()` writes **download** headers: `Content-Type: application/octet-stream`,
`Content-Disposition: attachment` and `Cache-Control: no-cache, must-revalidate`, so the browser
saves the file instead of showing it.

### Stream a large file the browser displays

For a video, a large PDF or anything else the page should show, call `upload()` and then replace
the headers it wrote — they are serialized only after the handler returns. The file is still
streamed, with ranges:

```php
yield $Router->route('/media/intro.mp4', function (Request $Request, Response $Response) {
   $Response->upload('storage/media/intro.mp4');

   // ? Only a single-body answer (the whole file or one range) carries these headers
   if ($Response->Header->get('Content-Disposition') !== '') {
      $Response->Header->set('Content-Type', 'video/mp4');
      $Response->Header->set('Content-Disposition', 'inline');
      $Response->Header->set('Cache-Control', 'public, max-age=3600');
   }

   return $Response;
}, GET);
```

Keep the `Content-Disposition` check: a request for several ranges at once is answered as
`multipart/byteranges`, whose `Content-Type` must not be replaced, and error answers (`403`,
`416`) set neither header. The
[Response manual](/manual/WPI/HTTP/HTTP_Server_CLI/Response/#send-file-contents-inline) covers
this recipe, offsets, ranges and the file identity checks.

### Why there is no `sendfile`

Nginx (with `sendfile on`) and Swoole's `$response->sendfile()` ask the kernel to copy a file
straight to the socket with `sendfile(2)`, without the bytes passing through the application.
PHP exposes no `sendfile()` function, and Bootgly needs no extension, so every byte it serves
goes through PHP: read a slice, write it to the non-blocking socket. The same path carries TLS
(which encrypts in PHP's OpenSSL layer anyway) and HTTP/2 framing.

In practice:

- **Application assets and downloads** — serve them from Bootgly as shown above.
- **Heavy static traffic** — large media, many megabytes per page, high request volume — put a
  CDN or a reverse proxy (Nginx, Caddy) in front and let it serve or cache those files. Your
  Bootgly workers then spend their time on application requests.

### The route response cache is not for assets

The [route response cache](/manual/WPI/HTTP/HTTP_Server_CLI/Router/overview/)
(`cache: ['TTL' => 60]`) replays prebuilt responses from memory, but it steps aside in exactly the
situations assets live in: a request that carries a `Cookie` (a browser sends its session cookie
with every asset request of your site), a request that came through a proxy
(`X-Forwarded-*`), a route that has middlewares (so not together with `ETag`), and any server
with a global middleware. For assets, rely on `Cache-Control` and a CDN instead.

### Without the Web platform

`Statics` ships with the Web platform. A project that uses only the HTTP Server serves its
assets with the recipe above — `upload()` plus the inline headers, with the `Content-Type` of
each file — or with `upload()` alone for downloads.

The full `upload()` signature is in the [Response](/manual/WPI/HTTP/HTTP_Server_CLI/Response/overview/)
manual; the `Statics` constructor is in the [Web App](/manual/Web/App/overview/) manual.

## Reference

### `HTTP_Server_CLI->configure()`

```php
public function configure (Bootgly\ABI\Configs ...$Configs): self
```

Adopts one Configs per concern — `HTTP_Server_CLI\Configs`, `Request\Configs`, `Response\Configs` — in any order, and returns the server for chaining. Throws `InvalidArgumentException` on a repeated Configs class in the same call or on a Configs this node does not accept, and `ArgumentCountError` while `host`, `port` and `workers` have never been set. After the server crossed its pre-start boundary the call is refused with a logged error and changes nothing.

Which Configs a node accepts is not guesswork: every node declares it in two class constants,
`TRANSPORT` (the Configs carrying the socket) and `CONFIGS` (every Configs class it applies).

```php
protected const string TRANSPORT = HTTP_Server_CLI\Configs::class;
protected const array CONFIGS = [
   HTTP_Server_CLI\Configs::class,
   Request\Configs::class,
   Response\Configs::class
];
```

Subclassing a node means re-declaring both — a subclass that adds its own Configs but inherits
the parent's constants would accept the parent's Configs and configure only what the parent knows.

### `HTTP_Server_CLI\Configs`

```php
new Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs(/* named arguments only */)
```

The server itself. Named arguments only — the constructor's first slot is the `Bootgly\ABI\Argument` guard, so a positional call raises a `TypeError`.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | — (required) | Bind address. Use `'0.0.0.0'` to listen on all interfaces. When set to `'0.0.0.0'`, domain defaults to `localhost`. |
| `port` | `int` | — (required) | Listen port. |
| `workers` | `int` | — (required) | Number of forked child processes. Each worker binds its own socket via `SO_REUSEPORT`. |
| `secure` | `null\|array` | `null` | Secure SSL/TLS stream context options. When provided, the scheme switches to `https://`. Mutually exclusive with `AutoTLS`. |
| `user` | `null\|string` | `null` | POSIX user name to demote the process to after binding. |
| `group` | `null\|string` | `null` | POSIX group name to demote the process to after binding. |
| `AutoTLS` | `null\|AutoTLS` | `null` | Managed certificate lifecycle (ACME): bootstrap, background issuance, hot swap and renewal. Mutually exclusive with `secure` — passing both throws `InvalidArgumentException`. See the [Auto-TLS](/guide/auto-tls) guide. |
| `enableHTTP2` | `null\|bool` | `null` (= enabled) | `false` serves HTTP/1.x only — no `h2` in the ALPN advertisement and no cleartext prior-knowledge preface probe. See the [HTTP/2](/manual/WPI/HTTP/HTTP_Server_CLI/HTTP2/) page. |
| `health` | `null\|string` | `null` | Built-in health-check endpoint path (e.g. `'/health'`). GET/HEAD requests to that exact path are answered before the middleware pipeline, so no user middleware can break a probe. `null` keeps it off. |
| `maxConnections` | `null\|int` | `null` (= `10000`) | Maximum simultaneously-established connections **per worker**. Connections accepted past this ceiling are immediately shed (accepted, then closed) to bound file-descriptor and memory use under a connection-flood DoS. `0` disables the limit. Evaluated once per accept — never on the per-request hot path. |
| `maxConnectionsPerIP` | `null\|int` | `null` (= `0`) | Maximum simultaneously-established connections **from a single peer IP**. Opt-in: `0` means unlimited, because a reverse proxy collapses every client onto one source IP — enable it only when the peer IP is the real client. |
| `headroom` | `null\|int` | `null` (= `32`) | Selector entries each worker keeps free for its own dependency I/O (deferred DB/KV waits, the embedded HTTP client) by shedding clients earlier: once a worker holds `1000 − headroom` connections, the next one is accepted and immediately closed, so the effective ceiling is the smaller of that and `maxConnections`. The listener takes one of these entries, so size it to at least the sum of the `pool.max` of the worker's resources plus one. `0` disables it; it is clamped so a worker always admits clients. Sets `TCP_Server_CLI::$headroom`. |
| `connectionIdleTimeout` | `null\|int` | `null` (= `15`) | Seconds an established connection may stay silent — no completed write since the previous supervisor tick and no pending work retained on it — before the worker closes it. A parked deferred response counts as pending work, so it is never reaped as idle. `0` disables the reaper. Whole seconds: the supervisor runs on the one-second timer wheel, so a reap lands between `N` and `N+1` seconds after the last activity tick. |

### `Request\Configs`

```php
new Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Configs(/* named arguments only */)
```

Inbound limits. Every parameter is optional; `null` keeps the framework default.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `maxFileSize` | `null\|int` | `null` (= `500 MB`) | Maximum size in bytes per uploaded file part in multipart requests. |
| `maxBodySize` | `null\|int` | `null` (= `10 MB`) | Maximum total body size in bytes for non-multipart requests. |
| `maxMultipartFieldSize` | `null\|int` | `null` (= `1 MB`) | Maximum size in bytes of a single multipart text field value. |
| `maxMultipartHeaderSize` | `null\|int` | `null` (= `8 KB`) | Maximum size in bytes of the header block of a single multipart part. |
| `maxMultipartFields` | `null\|int` | `null` (= `1024`) | Maximum number of text fields accepted in a multipart request. |
| `maxMultipartFiles` | `null\|int` | `null` (= `1024`) | Maximum number of file parts accepted in a multipart request. |
| `downloadsMaxBytesOnDisk` | `null\|int` | `null` (= `8 GB`) | Aggregate ceiling, across every worker, for the bytes spooled uploads may keep on disk at once. |

### `Response\Configs`

```php
new Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Configs(/* named arguments only */)
```

Outbound configuration. Every parameter is optional; `null` keeps the framework default.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `Resources` | `null\|array<string,Closure>` | `null` | Project response resource factories, by name — each a `Closure(object): Response\Resource` built lazily on first read (`$Response->Database`, `$Response->Upstream`, …). See [Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/). |
| `deferredTimeout` | `null\|int\|float` | `null` (= `0`, unbounded) | Seconds a deferred response (`$Response->defer()`) may stay parked on the reactor before a `Response\Timeout` is delivered at its wait point. A per-call `defer($work, timeout:)` takes precedence. A timeout that escapes the work always logs a warning; left unhandled by every `Recovering` middleware too, it answers `503 Service Unavailable`. |

### Deferred response

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
