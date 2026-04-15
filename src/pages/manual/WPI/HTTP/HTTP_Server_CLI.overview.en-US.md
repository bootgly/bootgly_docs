# HTTP Server CLI

The HTTP Server CLI is the native HTTP server of the Bootgly PHP Framework. It is an event-driven, multi-worker server built on top of a non-blocking TCP infrastructure with support for PHP Fibers for asynchronous responses — everything is 100% pure PHP and no extensions.

## Bootstrapping with Projects

In Bootgly, servers are started by Projects — not by framework commands. Each project defines its own boot logic, including server instantiation, configuration, and handler registration.

A project file (e.g. `HTTP_Server_CLI.project.php`) returns a `Project` instance:

```php
// HTTP_Server_CLI.project.php in ./project/HTTP_Server_CLI
use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;


return new Project(
   name: 'HTTP Server CLI',
   description: 'HTTP server demo with routing and catch-all 404',
   version: '0.1.0',
   author: 'Your Name',

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
      $Server->on(
         request: require __DIR__ . '/router/routes.php'
      );
      $Server->start();
   }
);
```

To start the server, run:

```bash
bootgly project Demo start --HTTP_Server_CLI
```

Interactive mode:

```bash
bootgly project Demo start --HTTP_Server_CLI -i
```

Monitor mode:

```bash
bootgly project Demo start --HTTP_Server_CLI -m
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
| `ssl` | `?array` | `null` | SSL stream context options. When provided, the scheme switches to `https://`. |
| `user` | `?string` | `null` | POSIX user name to demote the process to after binding. |
| `group` | `?string` | `null` | POSIX group name to demote the process to after binding. |
| `requestMaxFileSize` | `?int` | `null` | Maximum size (in bytes) for an uploaded file from client. Defaults to `500 MB`. |
| `requestMaxBodySize` | `?int` | `null` | Maximum size (in bytes) for the request body from client. Defaults to `10 MB`. |

```php
$Server->configure(
   host: '0.0.0.0',
   port: 8082,
   workers: 4,
   ssl: null,
   user: null,
   group: null,
   requestMaxFileSize: 500 * 1024 * 1024, // 500 MB (default)
   requestMaxBodySize: 10 * 1024 * 1024,  // 10 MB (default)
);
```

### SSL/TLS

Pass an `ssl` array with PHP stream context options to enable HTTPS. The server automatically switches the scheme to `https://`:

```php
$Server->configure(
   host: '0.0.0.0',
   port: 443,
   workers: 4,
   ssl: [
      'local_cert'  => '/path/to/certificate.pem',
      'local_pk'    => '/path/to/private-key.pem',
      'verify_peer' => false,
   ],
);
```

For local development, Bootgly ships self-signed certificates at `@/certificates/`:

```php
ssl: [
   'local_cert' => BOOTGLY_ROOT_DIR . '@/certificates/localhost.cert.pem',
   'local_pk'   => BOOTGLY_ROOT_DIR . '@/certificates/localhost.key.pem',
   'verify_peer' => false,
],
```

> [!NOTE]
> For production, use certificates from a trusted CA such as Let's Encrypt.

### Privilege Dropping

When binding to privileged ports (< 1024), the process must start as root. Use `user` and `group` to drop to a non-privileged identity immediately after the socket is bound:

```php
$Server->configure(
   host: '0.0.0.0',
   port: 443,
   workers: 4,
   ssl: [ /* ... */ ],
   user: 'www-data',
   group: 'www-data',
);
```

> [!WARNING]
> Both `user` and `group` require the `posix` PHP extension and must be run as root initially.

## Events

The `on()` method registers callbacks for server lifecycle and request handling:

```php
$Server->on(
   request: callable,  // Required — handles each incoming HTTP request
   started: ?callable, // Optional — fires after all workers are up
   stopped: ?callable, // Optional — fires after all workers are stopped
);
```

### `request`

Called by each **worker** process for every incoming HTTP request. Receives the `$Request` and `$Response` objects.

```php
$Server->on(
   request: function ($Request, $Response) {
      return $Response(body: 'Hello, World!');
   }
);
```

For larger applications, load the handler from an external file that returns a callable:

```php
$Server->on(
   request: require __DIR__ . '/router/routes.php'
);
```

> [!IMPORTANT]
> The `request` handler runs inside each **worker** process. State is not shared between workers — use shared memory or external stores (Redis, DB) for inter-worker communication.

### `started`

Fires in the **master** process after all workers have been forked and the server socket is bound. Use it to print startup info, register timers, or set up master-side state.

Available `$Server` properties inside the callback:

| Property | Type | Description |
|---|---|---|
| `$Server->host` | `string` | Bound host address. |
| `$Server->port` | `int` | Bound port number. |
| `$Server->socket` | `string` | Scheme prefix — `http://` or `https://`. |

```php
use const Bootgly\CLI;

$Server->on(
   started: function ($Server) {
      $Output = CLI->Terminal->Output;

      $protocol = $Server->socket ?? 'http://';
      $host     = $Server->host   ?? '0.0.0.0';
      $port     = $Server->port   ?? 0;

      $Output->render('@.;@#green:✓ HTTP Server started@;@.;');
      $Output->render('  Listening on @#cyan:' . $protocol . $host . ':' . $port . '@;@.;');
      $Output->render('  @#green:● Ready for connections@;@..;');
   }
);
```

### `stopped`

Fires in the **master** process after all workers have been terminated. Use it for cleanup or final output.

```php
use const Bootgly\CLI;

$Server->on(
   stopped: function ($Server) {
      $Output = CLI->Terminal->Output;
      $Output->render('@.;@#yellow:■ HTTP Server stopped@;@.;');
   }
);
```

### Full Example

```php
use const Bootgly\CLI;

$Server->on(
   request: fn ($Request, $Response) => $Response(body: 'Hello, World!'),

   started: function ($Server) {
      $Output = CLI->Terminal->Output;

      $protocol = $Server->socket ?? 'http://';
      $host     = $Server->host   ?? '0.0.0.0';
      $port     = $Server->port   ?? 0;

      $Output->render('@.;@#green:✓ HTTP Server started@;@.;');
      $Output->render('  Listening on @#cyan:' . $protocol . $host . ':' . $port . '@;@.;');
      $Output->render('  @#green:● Ready for connections@;@..;');
   },

   stopped: function ($Server) {
      $Output = CLI->Terminal->Output;
      $Output->render('@.;@#yellow:■ HTTP Server stopped@;@.;');
   }
);
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
- **PHP Fibers**: The event loop integrates with PHP Fibers to support deferred (asynchronous) responses. See the `Response->defer()` method for details.

The event loop supports up to approximately 1000 simultaneous file descriptors (the `stream_select()` limit). When Fibers are active, the loop operates in non-blocking mode (polling); otherwise, it blocks until I/O is available, ensuring zero idle CPU usage.
