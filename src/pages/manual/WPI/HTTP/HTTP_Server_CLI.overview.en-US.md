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

A project file (e.g. `HTTP_Server_CLI.project.php`) returns a `Project` instance:

```php
// HTTP_Server_CLI.project.php in ./project/HTTP_Server_CLI
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

```php :filename="HTTP_Server_CLI.project.php";
$Server->on(Events::RequestReceived, HTTP_Server_CLI::$Router->load(__DIR__ . '/router'));
```

Inside the folder:

- **`router/router.index.php`** — a manifest listing the active route set names. Each name resolves to `router/routes/<Name>.php`. List more than one to compose several sets into a single handler.
- **`router/routes/<Name>.php`** — a route set: a generator-closure `(Request, Response, Router): Generator` that `yield`s its routes.

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

A single set is returned directly; multiple sets are composed (`yield from` each) into one handler. The folder is also the router home — reserved for a future `router.config.php` defaults file.

```php
Router::load (string $path): Closure
```

Reads `$path/router.index.php` (a manifest of route set names), resolves each name to `$path/routes/<Name>.php`, and returns a single handler closure (composing multiple sets with `yield from`). Throws `InvalidArgumentException` when the index or a named set is missing, or when a set does not return a `Closure`.

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
Booting → Configuring → Starting → Running → Pausing / Paused → Stopping
```

- **Booting**: Internal initialization (logger, connections, event loop, process manager).
- **Configuring**: Host, port, workers and SSL are stored.
- **Starting**: SAPI is booted, POSIX signals are installed, workers are forked.
- **Running**: Workers are processing requests in the event loop.
- **Pausing / Paused**: Server socket is removed from the event loop — no new connections are accepted. Existing connections continue.
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
