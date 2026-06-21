# Queues

The HTTP Server CLI runs on a non-blocking `stream_select` event loop, so a request handler must
never do slow, blocking work inline — it would stall every other connection on that worker. The
queue is how you offload that work: a handler **enqueues a job and returns immediately**, while a
separate `bootgly queue run` worker process does the heavy lifting later.

```
request ──► route handler ──► Queues::dispatch(Handler, payload) ──► response (now)
                                            │
                                      queue store (File / Redis)
                                            │
                          bootgly queue run ─┴─► Handler->handle($Job)   (another process)
```

> [!IMPORTANT]
> From inside the HTTP server, **only enqueue** — a fast local write (File) or a single Redis
> round-trip. Never run the blocking consume loop (`reserve()` / `queue run`) on the event loop.
> That loop belongs to the dedicated worker process.

## Configure the messenger in the project boot

The `Bootgly\WPI\Queues` facade wraps the `ACI/Queues` contract. Boot it once in your project's
`boot` closure, before `start()`, so every worker shares it:

```php
use Bootgly\WPI\Queues;

// inside Project boot:
Queues::boot(['driver' => 'file']);   // or 'redis' (+ host/port) for cross-host workers
```

## Enqueue from a route handler

`Queues::dispatch()` builds the job and enqueues it, returning the `Job` (with its id) without
blocking:

```php
use Bootgly\WPI\Queues;

yield $Router->route('/email/:to', function (Request $Request, Response $Response) {
   $Job = Queues::dispatch(SendEmail::class, [
      'to' => $this->Params->to,
   ], 'emails');

   return $Response->JSON->send(['queued' => true, 'job' => $Job->id]);
}, GET);
```

The handler (`SendEmail`) implements `Bootgly\ACI\Queues\Handler` and runs later in the worker —
not in this request. The payload must be serializable (scalars/arrays), never a Closure.

## Inspect a queue from a route

```php
yield $Router->route('/queue', function (Request $Request, Response $Response) {
   $ready = Queues::$Messenger->Queues->fetch('emails')->count();

   return $Response->JSON->send(['queue' => 'emails', 'ready' => $ready]);
}, GET);
```

## Run the worker

The worker is a **separate process** from the server:

```bash
cd <your-project>
bootgly queue run emails        # drains the 'emails' queue until SIGTERM/SIGINT
```

Because the worker does not boot the web project, it cannot autoload the project's handler
classes. Put a `queues.php` in the project root that `require`s them and returns the queue config
— `queue run` reads `queues.php` from the current directory:

```php
// queues.php
require_once __DIR__ . '/SendEmail.php';   // make the handler loadable in the worker

return ['driver' => 'file'];               // must match what the server enqueues with
```

Run several workers (even across hosts on Redis) for more throughput — each job is claimed
atomically, so it is never processed twice.

## Working example

A complete, runnable project lives at `projects/Demo/Queue-HTTP_Server_CLI/`:
`GET /email/:to` enqueues a job and responds instantly; `bootgly queue run emails` processes it
and appends proof to `workdata/queue-demo.log`. See its `README.md` for the full run.

## See also

- **[Queues](/guide/queues/overview/)** — the full queue API, drivers, retry/backoff, events and security.
- **[Router](/manual/WPI/HTTP/HTTP_Server_CLI/Router/overview/)** — declaring the routes that enqueue.
- **[Response](/manual/WPI/HTTP/HTTP_Server_CLI/Response/overview/)** — sending the immediate reply.
