# Error handling

Bootgly answers failures according to the **deployment environment**: in development an
uncaught exception renders a built-in, self-contained **debug page** (navigable stack frames,
source excerpts, arguments and request context — or a JSON payload for API clients); in
production the client gets a **clean error page** that never leaks internals, and the
throwable is **reported** — to the `exceptions` log channel, to the Observability metrics and
to any reporter you register. No third-party package involved.

> [!NOTE]
> Everything here is active by default. The only thing you choose is the environment — and
> when unset, Bootgly **fails safe to `production`**.

## Set the environment

The switch is the `BOOTGLY_ENVIRONMENT` environment variable, read once at boot into the
`BOOTGLY_ENVIRONMENT` constant. Recognized values: `development`, `staging`, `test`,
`production` (anything else falls back to `production`; `staging` behaves like `production`):

```bash :toolbar="true";
BOOTGLY_ENVIRONMENT=development bootgly project start Demo/HTTP_Server_CLI -f
```

Try it with the Demo project — the `/error` route throws on purpose:

```bash
curl http://127.0.0.1:8082/error                                  # debug page (HTML)
curl -H 'Accept: application/json' http://127.0.0.1:8082/error    # JSON payload
```

## The debug page (development)

With `BOOTGLY_ENVIRONMENT=development`, an exception that escapes a route handler answers the
request with status `500` and the built-in debug page: a frame sidebar (click a frame to
inspect it), a ±8-line source excerpt with the failing line marked, bounded argument previews,
the chained `getPrevious()` throwables, and a **Context** section with the sanitized request
data (`authorization` and `cookie` header values are masked). The page is a single
self-contained HTML document — inline CSS/JS, no external assets.

API clients negotiate: when the request prefers `application/json` (via the `Accept` header),
the same failure answers as JSON instead:

```json
{
   "error": "RuntimeException",
   "message": "Demo exception: this route always throws.",
   "file": "projects/Demo/HTTP_Server_CLI/router/routes/Errors.php",
   "line": 29,
   "trace": [ { "index": "1", "file": "…", "line": "…", "call": "…" } ]
}
```

## Production error pages

In `production` (and `staging`) nothing internal leaves the server. A request that fails
answers `500` with, in order of preference:

1. **Your project page** — create `views/errors/500.template.php` in the project and it is
   rendered through the template engine (the same convention serves any status code the
   framework answers with, e.g. `errors/503.template.php`):

```html
<!-- views/errors/500.template.php -->
<h1>Something went wrong</h1>
<p>Our team was notified.</p>
```

2. **The built-in clean page** — a minimal, dependency-free status page (code + status
   message only).

JSON clients receive a status-only payload — `{"error": "Internal Server Error"}` — never the
message or the trace.

> [!IMPORTANT]
> The `Test` environment (used by Bootgly's own E2E harness) keeps the legacy byte-exact
> bodies, so wire-exact test specifications stay stable.

## Report exceptions

Rendering is what the *client* sees; **reporting** is what *you* see. Every throwable that
reaches the framework's handlers is dispatched — exactly once per throwable instance — to the
registered reporters:

- **Log channel** — the HTTP Server registers an `exceptions` Logger channel (skipped in the
  Test environment). With the Demo's file sink, failures land in
  `storage/logs/exceptions.log` as JSON lines with class, file, line, method, URI and peer.
- **Observability** — when `Observability::$Instance` is configured (e.g. by a `/metrics`
  route), an `exceptions_total` counter increments per reported throwable.
- **Your own reporter** — push a closure; it receives the throwable and a context array.
  A reporter that throws is swallowed (it can never cascade into the error path):

```php
use Bootgly\ABI\Debugging\Data\Throwables;

Throwables::$reporters[] = static function (Throwable $Throwable, array $context): void {
   // e.g. forward to Sentry-like ingestion, emit an event, page someone…
};
```

To bridge into the event bus, emit from a reporter (the Debugging layer itself stays
event-free by design):

```php
use Bootgly\ABI\Events\Emitter;
use Bootgly\ABI\Debugging\Data\Throwables;

Throwables::$reporters[] = static function (Throwable $Throwable, array $context): void {
   Emitter::$Instance->emit(App\Events::Failed, $Throwable, $context);
};
```

## CLI behavior

Uncaught throwables in console scripts and commands render the ANSI report (class, message,
highlighted source excerpt, backtrace) and the process now exits with status **255** — so
`&&` chains, cron jobs and CI pipelines see the failure (before v0.23 the process exited `0`).
Opt out with `Throwables::$exit = false`.

Fatal errors (out-of-memory, parse errors in includes) bypass PHP's error handlers entirely —
Bootgly synthesizes them at shutdown into an `ErrorException` report, so they are rendered and
reported like everything else.

## Reference

```php
const BOOTGLY_ENVIRONMENT;
```

Boot-time constant with the resolved environment name: `development`, `staging`, `test` or
`production` (the fail-safe default). Source: the `BOOTGLY_ENVIRONMENT` environment variable.

```php
Environments::fetch (string $name): self
```

Maps an environment name to the `Bootgly\API\Environments` enum case; unrecognized names map
to `Environments::Production`.

```php
Throwables::render (Throwable $Throwable, null|int $target = null): string
```

Renders the throwable report as a string. Targets: `Debugging::TARGET_CLI` (ANSI) and
`Debugging::TARGET_HTML` (escaped HTML block). `null` picks by SAPI (`cli` → CLI, else HTML).

```php
Throwables::report (Throwable $Throwable): void
```

Renders with the default target and echoes.

```php
Throwables::notify (Throwable $Throwable, array $context = []): void
```

Dispatches the throwable to every registered reporter — once per throwable instance
(deduplicated via `WeakMap`), each reporter isolated by its own `try/catch`.

```php
Throwables::$reporters
```

`array<int,Closure(Throwable,array<string,mixed>):void>` — the reporter seam. Push closures at
boot; higher layers (ACI Observability, the HTTP Server log channel) push theirs automatically.

```php
Throwables::$exit
```

`bool` (default `true`) — whether an *uncaught* throwable terminates the process with exit
status `255` after being collected and reported.

```php
Throwables::$verbosity
```

`int` (default `3`) — report detail: `1` class+message, `2` + file and source excerpt,
`3` + backtrace.

```php
Page::render (Throwable $Throwable, array $context = []): string
```

Builds the self-contained debug page document (`Bootgly\ABI\Debugging\Page`). `$context`
sections (e.g. request data) are rendered as key/value tables. Stateless and fully escaped.

```php
Catcher::respond (null|Request $Request, Response $Response, null|Throwable $Throwable = null, int $code = 500): Response
```

WPI-side error responder (`Bootgly\WPI\Nodes\HTTP_Server_CLI\Encoders\Catcher`) used by the
HTTP dispatch pipeline: reports the throwable and returns the environment-appropriate error
Response (debug page / JSON in development; custom project page, clean page or status-only
JSON in production; legacy bodies in Test). `Catcher::$Environment` is a one-shot override
consumed by the next call — useful in E2E specifications.

```php
Shutdown::collect (null|array $error = null): bool
```

Collects the last fatal error (`E_ERROR`, `E_PARSE`, `E_CORE_ERROR`, `E_COMPILE_ERROR`) from
`error_get_last()` — or from the injected `$error`, for tests. `Shutdown::debug()` synthesizes
the collected fatal into an `ErrorException`, reports and renders it.
