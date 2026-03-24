# HTTP Server CLI

The HTTP Server CLI is the native HTTP server of the Bootgly PHP Framework. It is an event-driven, multi-worker server built on top of a non-blocking TCP infrastructure with support for PHP Fibers for asynchronous responses — everything is 100% pure PHP and no extensions.

## Bootstrapping with Projects

In Bootgly, servers are started by Projects — not by framework commands. Each project defines its own boot logic, including server instantiation, configuration, and handler registration.

A project file (e.g. `HTTP_Server_CLI.project.php`) returns a `Project` instance:

```php
// HTTP_Server_CLI.project.php in ./project/HTTP_Server_CLI
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Endpoints\Servers\Modes;
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
      $Server->handle(require __DIR__ . '/router/routes.php');
      $Server->start();
   }
);
```

To start the server, run:

```bash
bootgly project run HTTP_Server_CLI
```

## Operation Modes

The server supports multiple operation modes, selected when constructing the `HTTP_Server_CLI` instance:

| Mode | Description |
|---|---|
| `Modes::Daemon` | Forks to background. The master process becomes a session leader, dispatches signals and reaps workers. Default mode. |
| `Modes::Interactive` | REPL loop accepting CLI commands (`stop`, `help`, `monitor`). |
| `Modes::Monitor` | Hot-reload mode. Checks for file changes every 2 seconds and sends reload signals to workers. Displays a live status dashboard. |
| `Modes::Test` | Creates a TCP client, loads the test suite, sends HTTP requests and asserts responses. Used internally for automated testing. |

## Configuration

The `configure()` method accepts the following parameters:

| Parameter | Type | Description |
|---|---|---|
| `host` | `string` | Bind address. Use `'0.0.0.0'` to listen on all interfaces. When set to `'0.0.0.0'`, domain defaults to `localhost`. |
| `port` | `int` | Listen port. |
| `workers` | `int` | Number of forked child processes. Each worker binds its own socket via `SO_REUSEPORT`. |
| `ssl` | `?array` | SSL stream context options. When provided, the scheme switches to `https://`. |

```php
$Server->configure(
   host: '0.0.0.0',
   port: 8082,
   workers: 4,
   ssl: null
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
