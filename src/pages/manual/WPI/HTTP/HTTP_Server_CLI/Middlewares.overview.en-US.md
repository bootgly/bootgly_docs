# HTTP Server CLI — Middlewares

Middlewares in the HTTP Server CLI follow an **onion pipeline** pattern. Each middleware wraps the next, allowing logic to run before (pre-processing) and after (post-processing) the request handler.

## Registration Scopes

Middlewares can be registered at three levels:

### Global (SAPI)

Applied to **every** request processed by the server:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\API\Workables\Server as SAPI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\CORS;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Compression;

SAPI::$Middlewares->prepend(new CORS);       // Add to the beginning
SAPI::$Middlewares->append(new Compression); // Add to the end
SAPI::$Middlewares->pipe(new CORS, new Compression); // Add multiple at once
```

### Route Group

Applied to all routes defined after `intercept()`, scoped to the current Router context:

```php
$Router->intercept(
   new CORS,
   new RateLimit(limit: 100, window: 60, scope: 'public-api')
);

yield $Router->route('/api/:*', function ($Request, $Response) use ($Router) {
   // All routes inside this group inherit CORS + RateLimit
   yield $Router->route('/users', function ($Request, $Response) {
      return $Response->JSON->send(['users' => []]);
   }, GET);
}, GET);
```

### Route Level

Applied to a single specific route:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RateLimit;

yield $Router->route('/login', function ($Request, $Response) {
   // ...
}, POST, middlewares: [new RateLimit(limit: 5, window: 60, scope: 'auth-login')]);
```

When both group and route-level middlewares are present, they are **merged** — group middlewares execute first, then route-level ones, forming a single onion pipeline around the handler.

## Registration Methods

| Method | Description |
|---|---|
| `prepend(Middleware $Middleware)` | Add a middleware to the **beginning** of the pipeline |
| `append(Middleware $Middleware)` | Add a middleware to the **end** of the pipeline |
| `pipe(Middleware ...$middlewares)` | Add one or more middlewares to the end at once |

## Error Boundaries and Deferred Work

A middleware that wraps `$next()` in a `try`/`catch` is an error boundary for **synchronous** handlers only. A deferred response (`$Response->defer()`) runs its work after the pipeline has already returned — the handler returns at once and the work runs later, on a pooled Fiber — so a `Throwable` thrown inside that work never reaches the `catch` around `$next()`: the server answers it itself (`500 Internal Server Error`; `503 Service Unavailable` for a `Response\Timeout`).

To answer those failures too, implement `Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Recovering` — a `Middleware` with one more method, `recover()`, which the server calls when deferred work throws:

```php
use Closure;
use Throwable;

use Bootgly\ABI\Debugging\Data\Throwables;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Timeout;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Recovering;

class Errors implements Recovering
{
   public function process (object $Request, object $Response, Closure $next): object
   {
      try {
         return $next($Request, $Response);
      }
      catch (Throwable $Throwable) {
         Throwables::notify($Throwable, ['interface' => 'WPI']);
         $Response->Header->set('Content-Type', 'application/json');
         return $Response(code: 500, body: '{"error":"internal"}');
      }
   }

   public function recover (Request $Request, Response $Response, Throwable $Throwable): null|Response
   {
      $Response->Header->set('Content-Type', 'application/json');

      if ($Throwable instanceof Timeout) {
         return $Response(code: 503, body: '{"error":"timeout"}');
      }

      Throwables::notify($Throwable, ['interface' => 'WPI']);
      return $Response(code: 500, body: '{"error":"internal"}');
   }
}
```

Register it exactly like any other middleware — global, group or route level. When deferred work throws, the route's middlewares are asked in order, **innermost first** (the route-level ones before the group's `intercept()` entries), and then the global `SAPI::$Middlewares` pipeline, last entry first. The first `Response` returned is sent as-is; return `null` to decline. A `recover()` that throws hands its **new** `Throwable` to the boundaries further out, exactly as a rethrow inside `process()` reaches the enclosing middleware. When nobody answers, the server's own error response is sent. A `Response\Timeout` is offered as well: it is a server budget, not an application error — it is logged as a warning before any boundary is consulted, whichever answer wins — decline it to keep the `503`, or answer with an explicit unavailability of your own.

Reporting follows the answer. The framework's single `Throwables::notify()` intake runs when the built-in error response answers an application error — so a boundary that answers a generic `Throwable` owns the report too, and must call `Throwables::notify()` itself if it wants the `exceptions` channel, the `exceptions_total` counter and your reporters to see the failure. This is the same rule a synchronous `catch` around `$next()` has always followed (a `Response\Timeout` is never reported either way: it is a server budget, logged as a warning). The built-in `Web\API\Problems` already does this in Production/Staging.

`recover()` runs inside the deferred Fiber with the request snapshot bound: `$Request` is the request the work was answering (the same object as `$Response->Request`), the matched Route and its `Params` are still in place, and a Session written before the throw is persisted whichever answer wins. `$Response` is the deferred clone as the work left it — as a synchronous boundary's `$Response` carries what the handler wrote — so answering in place keeps what is already there: headers the work set, a session cookie set on first touch, a queued file. A boundary that wants a representation of its own — an error body that is not concatenated with a queued file — returns a fresh `Response` instead of answering in place. Answer synchronously: `wait()` is not refused, but the walk is not unbounded — when the generation has a budget (`defer(timeout:)` or `deferredTimeout`), a parked boundary is interrupted with a fresh `Response\Timeout` at its wait point after one budget re-armed for the walk; that Timeout replaces the Throwable that was offered, travels outward like any throwing `recover()`, and ends on the built-in `503` when nobody else answers. Without a budget, only transport teardown bounds it. The boundary is consulted only through `recover()`, never by running the pipeline again: `process()` is not re-executed, so admission middlewares in the same chain do not run twice.

The boundaries are the chain the route was dispatched with, captured while the pipeline is running. A deferral started after the pipeline returned — from a `Request\Events::Handled` listener, or from a global middleware after its `$next()` — carries no route chain: only the global `SAPI::$Middlewares` pipeline is offered its failures. Work that already handed the generation off is not offered to a boundary at all: a successful `$Response->SSE->open()` and a nested `defer()` both settle the generation, so a `Throwable` raised after that handoff reaches no `recover()`, no built-in error response and no `Throwables::notify()` — the SSE client keeps the stream it was given, with no error event and no terminating chunk, and a nested child's own answer is what the client sees. Report inside the work, before the handoff, when such a failure must be visible. (A handoff made from inside `recover()` is a different case: the boundary chose it.) A nested `defer()` made from inside `recover()` inherits the chain, so a child that throws is offered to the same boundaries again — a boundary that reports through a child must not let that child throw.

Headers set by a middleware **after** `$next()` do not apply to a deferred response: by then the pipeline has returned, and the response is built later, inside the work. Set them inside the work instead.

## Built-in Middlewares

All built-in middlewares are in the namespace `Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares`.

---

### AccessLog

One log line per request, on its own channel — the access log the server itself never writes.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\AccessLog;

new AccessLog(
   channel: 'HTTP.Server.CLI.access', // Log channel → storage/logs/HTTP.Server.CLI.access.log (default)
   header: 'X-Request-Id',            // Response header the request id is read back from; null = no id (default: 'X-Request-Id')
   query: false,                      // Keep the query string in the logged target (default: false)
   Formatter: null                    // fn (array $entry): string — your own line (default: the line below)
);
```

Register it **once, globally and outermost** — first in the list, so every request passes through it, cache replays included:

```php
$Router->intercept(new AccessLog, new TrustedProxy(proxies: [/* ... */]), new RequestId);
```

Every request then writes one line, whatever its outcome — and only one:

```text
GET /api/health → 200 in 0.2ms
POST /api/account/sign-in → 401 in 353ms
GET /api/report → cancelled after 15002.4ms
```

Severity follows the outcome — 5xx `error`, 4xx `warning`, a cancelled request `notice`, everything else `info` — so the severity filter already separates noise from trouble:

```bash :toolbar="true";
bootgly logs -f --channel=HTTP.Server.CLI.access
bootgly logs --channel=HTTP.Server.CLI.access --level=warning --since=1h
```

The context of every record carries the raw fields (`--json` and the viewer's detail show them):

| Field | Meaning |
|---|---|
| `method`, `URI`, `protocol` | the request line — `URI` without its query unless `query: true`; `protocol` is `HTTP/1.1` or `HTTP/2` |
| `code` | the status the wire carried; `null` for a cancelled request |
| `ms` | duration — the handler's for a synchronous response, the whole generation's (parked time included) for a deferred one |
| `bytes` | body bytes as the middleware saw them (after inner middlewares such as `Compression`); `null` on a throw or a handoff |
| `peer`, `address` | the socket peer (never forged) and the application-facing client address — behind a proxy, what [TrustedProxy](#trustedproxy) resolved |
| `id` | the request id read back from `header` — the one [RequestId](#requestid) stamped |
| `deferred`, `cancelled` | how the request settled |
| `throwable` | the class of a Throwable that left the onion (synchronous throw → 500) |

**Deferred responses and cancelled requests.** A deferred route answers after the onion unwound, so a plain post-`$next()` line would record the placeholder status and ~0 ms. `AccessLog` lets the request's lifecycle settle the line instead: it fires once the answer is chosen — the work's, a boundary's or the Catcher's (a budget that runs out is the Catcher's 503) — and also when there is **no** answer: the client left with the response parked, or the generation was abandoned. That request gets its line too, as `cancelled`, with the time it stayed parked. No application-level middleware can log that case; it is the reason the middleware ships with the framework.

**Your own line.** The `Formatter` receives the context array plus two neutralized fields — `target` (the URI) and `method` — and returns the message:

```php
new AccessLog(Formatter: static fn (array $entry): string => "{$entry['method']} {$entry['target']} {$entry['code']} {$entry['ms']}ms")
```

Build the message from `target`, never from `URI`: the message is rendered by the Output template engine, where every `@` opens a directive, and the target is client-controlled. In the default line every `@` and every byte outside printable ASCII enters as `%XX` (`%40` is how `@` is written in a URI anyway), the target is capped at 120 characters, and the query stays out. The context is JSON-encoded and keeps the raw values. Leave the trailing newline out — the middleware adds it.

**What it does not see.** A route-level `AccessLog` logs only its routes — never the 404 catch-all, an answer a global middleware short-circuited (401/403/429, a CORS preflight) or a deferral begun outside its chain. A global instance logs route-cache replays with the reset Response's status (200) and no bytes: the wire came from the cache. Neither logs the health probe, the ACME responder or a request the decoder rejected before routing. A response whose encoding failed after an error answer settles as `cancelled`. Two instances write two lines — one per channel.

**Phase:** Both — pre-processing opens the entry; post-processing writes the synchronous line, the lifecycle writes the deferred one.

---

### Authentication

Protects routes with ordered Basic, Bearer, JWT, and Session guards. Authentication is configured with an `Authenticating` guard strategy and executed by the `Authentication` middleware.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Bearer;

$Bearer = new Authenticating(
   new Bearer(function (string $token): bool {
      return $token === 'demo-bearer-token';
   })
);

yield $Router->route('/private', $Handler, GET, middlewares: [new Authentication($Bearer)]);
```

See the [Authentication](/manual/WPI/HTTP/HTTP_Server_CLI/Authentication/) page for Bearer, JWT, Basic, Session, middleware-owned challenges, and demo routes.

**Phase:** Pre-processing — rejects unauthenticated requests before the handler runs.

---

### Authorization

Protects authenticated routes with ordered Scope, Role and Policy gates. Authorization is configured with an `Authorizing` gate strategy and executed by the `Authorization` middleware.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorizing;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Scope;

$Authorizing = new Authorizing(new Scope('demo:read'));

yield $Router->route('/private', $Handler, GET, middlewares: [new Authorization($Authorizing)]);
```

See the [Authorization](/manual/WPI/HTTP/HTTP_Server_CLI/Authorization/) page for Scope, Role, Policy gates, denial responses and the API/RBAC boundary.

**Phase:** Pre-processing — rejects unauthorized requests before the handler runs.

---

### CORS

Handles Cross-Origin Resource Sharing validation and preflight (`OPTIONS`) requests.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\CORS;

new CORS(
   origins: ['https://example.com'],      // Allowed origins (default: [] — empty allowlist; pass ['*'] for wildcard)
   methods: ['GET', 'POST'],              // Allowed methods (default: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'])
   headers: ['Content-Type'],             // Allowed headers (default: ['Content-Type','Authorization'])
   maxAge: 86400,                         // Preflight cache in seconds (default: 86400)
   credentials: false                     // Allow credentials (default: false)
);
```

> **Secure by default.** `origins` defaults to an **empty allowlist** — every cross-origin
> request is rejected (`403`) until you list the origins you trust. Pass `origins: ['*']` to opt
> into a wildcard (origin-independent) policy. When a request's `Origin` is reflected (allowlist
> match), `Vary: Origin` is emitted so a shared cache (CDN / reverse proxy) never serves one
> origin's response to another. An allowlist with no request `Origin` emits no
> `Access-Control-Allow-Origin` — it never falls back to `*`.

**Phase:** Pre-processing — validates the origin and handles preflight before the handler runs.

---

### Compression

Compresses response bodies using `gzip` or `deflate` based on the client's `Accept-Encoding` header.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Compression;

new Compression(
   level: 6,        // Compression level 1-9 (default: 6)
   minSize: 1024    // Minimum body size in bytes to compress (default: 1024)
);
```

**Phase:** Post-processing — compresses the response body after the handler produces it.

> **Only 2xx/3xx.** Only success and redirect bodies are compressed — `4xx`/`5xx` error and auth-challenge responses are left untouched.

---

### ETag

Generates and validates ETags for HTTP caching. Returns `304 Not Modified` when the client's `If-None-Match` header matches.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\ETag;

new ETag(
   weak: true  // Use weak ETags (default: true)
);
```

**Phase:** Post-processing — computes the ETag from the response body after the handler runs.

> **Only 2xx/3xx + RFC 7232.** An ETag is set (and `304` revalidation performed) only for success/redirect responses — never for `4xx`/`5xx` error or auth-challenge bodies. `If-None-Match` is evaluated per RFC 7232: `*` matches any representation, comma-separated lists are supported, and the weak comparison ignores the `W/` prefix. Order `ETag` **outside** `Compression` so the tag covers the encoded (delivered) body.

---

### RateLimit

Enforces rate limiting by tracking request counts per principal within time windows. The immutable TCP peer is the principal by default. Returns `429 Too Many Requests` when exceeded.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RateLimit;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RateLimit\Algorithms;

new RateLimit(
   limit: 60,                        // Maximum requests per window (default: 60)
   window: 60,                       // Time window in seconds (default: 60)
   trustForwarded: false,            // Key on the proxy-resolved $Request->address (default: false)
   ipv6Prefix: 64,                   // Aggregate IPv6 keys to this prefix (default: /64)
   globalLimit: 0,                   // Optional cross-worker aggregate ceiling (default: 0 = off)
   algorithm: Algorithms::Sliding,   // Counting algorithm (default: Sliding; or Fixed)
   key: null,                        // Custom principal resolver fn (Request): ?string (default: IP)
   scope: 'public-api',              // Stable per-principal policy identity (default: derived source line)
   globalScope: null                 // Aggregate policy identity (default: scope)
);
```

**Counter key (security).** By default the limiter keys on `$Request->peer` — the **immutable TCP transport IP**, which a client cannot forge. This is deliberate: `TrustedProxy` can overwrite `$Request->address` from a client-supplied `X-Forwarded-For` header, so keying on `$address` would let a client behind (or co-located with) a trusted proxy rotate that header and open a fresh rate-limit bucket per request, evading the limit entirely.

Set `trustForwarded: true` **only** when the server sits behind a genuinely trusted proxy and you want per-real-client buckets — it makes the limiter key on `$Request->address` (the proxy-resolved client IP). Combine it with a correctly configured `TrustedProxy` so that address is itself trustworthy.

**IPv6 aggregation.** A single client is routinely allocated a whole `/64`, giving 2⁶⁴ distinct `/128` addresses. Keying on the full address would let such a client mint a fresh bucket per request, so IPv6 keys are masked to `ipv6Prefix` (default `/64`) — every address in the same `/64` shares one counter. IPv4 keys are used in full. Lower the prefix (e.g. `/56`, `/48`) to aggregate even more aggressively.

**Algorithm.** `Algorithms::Sliding` (default) is a weighted sliding window: it blends the current and previous windows by how much of the previous window is still in view, so a client cannot send `2 × limit` by bursting across a window boundary. `Algorithms::Fixed` is the cheaper classic counter (one key, resets on TTL) if you do not need boundary smoothing.

**Policy scope.** `scope` identifies the logical policy; `key` identifies the principal inside that policy. When `scope` is omitted, Bootgly derives an automatic identity from the normalized source file and line containing the `new RateLimit` expression. The same construction site therefore shares counters when lazy route declarations are built independently by different workers, while different source lines are isolated. Use an explicit stable scope for factories, subclasses, generated definitions, multiple logical policies created on one physical line, and security-critical rolling deployments: reusing a construction site unintentionally shares a policy, while moving it changes the automatic identity and starts a fresh quota. Explicit `scope` and `globalScope` values must contain between 1 and 256 bytes and cannot be empty or whitespace-only. A shared principal scope still cannot mix incompatible algorithms or windows; those semantics remain partitioned.

**Global ceiling.** `globalLimit` (default `0` = off) adds one cross-worker aggregate counter per `globalScope` and window on top of the per-principal limit. When `globalScope` is omitted, it inherits `scope`, so independent policies have independent aggregate ceilings by default. Requests are counted globally only after they pass the per-principal check.

Route-disjoint policies can deliberately share one aggregate ceiling by using distinct principal scopes and the same explicit `globalScope`, cache namespace, window, and `globalLimit`:

```php
$LoginLimit = new RateLimit(
   limit: 5,
   window: 60,
   globalLimit: 1_000,
   scope: 'auth-login',
   globalScope: 'public-auth'
);

$ResetLimit = new RateLimit(
   limit: 3,
   window: 60,
   globalLimit: 1_000,
   scope: 'auth-reset',
   globalScope: 'public-auth'
);
```

Do not stack middleware instances with the same `globalScope` in one request pipeline: every middleware invocation increments the shared aggregate counter, so one request would be counted more than once.

**Custom key.** `key` is a resolver `fn (object $Request): ?string`. Return a string to rate-limit on something other than the IP — an API key owner, an authenticated user id, a tenant — or `null` to fall back to the default IP key. Authenticate and map untrusted credentials to a bounded, stable principal ID; never return a raw header value. Here `$APIKeys` represents an application authentication service whose `resolve()` returns that ID or `null`.

```php
// Rate-limit by the validated API-key owner instead of IP:
new RateLimit(
   limit: 1000,
   window: 3600,
   scope: 'api-key-hourly',
   key: static fn (object $Request): ?string =>
      $APIKeys->resolve($Request->Header->get('X-Api-Key'))
);
```

> [!NOTE]
> **Namespace migration.** Upgrading from legacy counters without policy scopes starts fresh counters once. During a mixed-version rolling deployment, old and new workers do not share one quota; drain the old workers or otherwise account for that temporary split. After the migration, use explicit scopes wherever quota continuity must survive source movement or rolling releases.

> [!WARNING]
> **Shared-memory capacity.** The default Shared backend has fixed capacity. Expired records stop counting, but their segment space is not automatically reclaimed until an explicit `$Cache->purge()`; `clear()` or segment removal also reclaims space but resets every live entry sharing that segment. Sliding windows and changing principals create new records over time, and a custom `key` resolver can accelerate growth. Policy-scope hashing does not bound the custom principal key stored beside it. Never return unbounded, unauthenticated attacker-controlled values directly: bound both input length and cardinality and prefer stable authenticated identifiers. Hashing the principal yourself limits each entry's key size, but not the number of entries. For long-lived Shared deployments, manage an injected cache and arrange periodic purge outside the request hot path, or choose a backend whose reclamation and operational trade-offs fit the workload. Capacity exhaustion can surface as HTTP `500` responses. See [Cache](/guide/cache/overview/) for backend behavior.

**Phase:** Pre-processing — rejects requests that exceed the rate limit before reaching the handler.

---

### BodyParser

Validates and enforces maximum request body size. Returns `413 Content Too Large` when exceeded.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\BodyParser;

new BodyParser(
   maxSize: 1_048_576  // Maximum body size in bytes (default: 1 MB)
);
```

**Phase:** Pre-processing — validates the body size before the handler processes it.

---

### CSRF

Synchronizer-token CSRF protection. Generates a per-session token, stores it on `$Request->Session`, and validates submitted tokens on unsafe HTTP methods (`POST`, `PUT`, `PATCH`, `DELETE`) using a timing-safe comparison.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\CSRF;

new CSRF(
   sessionKey: '_csrf_token',     // Session key for token storage (default: '_csrf_token')
   headerName: 'X-CSRF-Token',    // Request header carrying the token (default: 'X-CSRF-Token')
   formField: '_token',           // Form field carrying the token (default: '_token')
   checkOrigin: false,            // Validate Origin/Referer hostname against Host (default: false)
   allowedOrigins: [],            // Trusted cross-origin hostnames when checkOrigin=true (default: [])
   tokenBytes: 32                 // Random bytes; token is hex-encoded (default: 32 → 64-char token)
);
```

The token is read from the `X-CSRF-Token` header **or** the `_token` form field. Safe methods (`GET`, `HEAD`, `OPTIONS`) emit the token but skip validation. Unsafe methods that fail validation are rejected with `403 Forbidden`:

- `Invalid CSRF token` — token missing or mismatched.
- `Invalid CSRF origin` — only when `checkOrigin: true` and the `Origin` (fallback `Referer`) hostname does not match `Host` nor any entry in `allowedOrigins`.

The token rotates only when you call `$Request->Session->regenerate()` (e.g. after login or privilege escalation). Comparison uses `hash_equals()` to prevent timing attacks.

**Render the token masked (BREACH protection).** The session token is a stable secret; rendering it raw into a body that is also compressed (see [Compression](#compression)) and reflects attacker input exposes it to a BREACH compression-length oracle. Render `CSRF::mask()` instead of the raw token — it returns a per-response value (`hex(nonce ‖ (token XOR nonce))`, different every call), so there is no stable secret in the body. Validation unmasks the submitted token automatically (and still accepts a raw token, so existing forms keep working).

```php
// In your view/template — emit a masked token, never the raw session value:
<input type="hidden" name="_token"
       value="<?= CSRF::mask($Request->Session->get('_csrf_token')) ?>">
```

```php
// Equivalent for an API/JS client (e.g. a meta tag the front end reads):
$masked = CSRF::mask($Request->Session->get('_csrf_token'));
```

> An app that renders *its own* secret (an API key, a session value) alongside reflected request input in a compressed response should still avoid compressing that response — masking only covers the framework's CSRF token.

**Phase:** Pre-processing — generates and validates the token before the handler runs.

---

### Validator

Fail-closed request validation. Runs a set of rules against one Request source (`Fields`, `Queries`, `Headers`, `Cookies`, or `Files`) and short-circuits with a JSON error response if any rule fails — the route handler never runs.

```php
use Bootgly\ADI\Validators\Email;
use Bootgly\ADI\Validators\Required;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator\Sources;

new Validator(
   rules: [
      'email' => [new Required, new Email],
   ],
   Source: Sources::Fields,   // Fields | Queries | Headers | Cookies | Files
   code: 422,                  // HTTP status on validation failure (default: 422)
   fallback: null              // Optional Closure(Request, Response, Validation): object
);
```

The default failure response is `422 Unprocessable Entity` with body `{"errors": {"email": ["email must be a valid email address."]}}`. Provide a `fallback` closure to render a custom error response while keeping the route fail-closed.

With `Sources::Headers`, rule keys match header names case-insensitively (RFC 9110) — a rule keyed `'X-API-Key'` binds to the header the client sent regardless of casing, and validation errors keep the key exactly as you wrote it. All other sources match keys case-sensitively.

See the [Request Validation](/manual/WPI/HTTP/HTTP_Server_CLI/Request/#request-validation) section for end-to-end examples, and the [ADI Validation](/manual/ADI/Validation/overview/) page for the full rule catalog and custom rules.

**Phase:** Pre-processing — validates input before the handler runs.

---

### RequestId

Generates or propagates unique request identifiers for distributed tracing and logging.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RequestId;

new RequestId(
   header: 'X-Request-Id'  // Header name to read/write (default: 'X-Request-Id')
);
```

If the request already contains the specified header, the existing value is preserved. Otherwise, a new unique ID is generated.

**Phase:** Pre-processing — sets the request ID before the handler runs.

---

### SecureHeaders

Adds security headers to protect against common web vulnerabilities (XSS, clickjacking, MIME sniffing, etc.).

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\SecureHeaders;

new SecureHeaders(
   contentSecurityPolicy: "default-src 'self'",  // CSP directive (default: "default-src 'self'")
   hsts: true,                                    // Enable HSTS (default: true)
   hstsMaxAge: 31536000                           // HSTS max-age in seconds (default: 31536000)
);
```

**Phase:** Post-processing — appends security headers to the response.

---

### TrustedProxy

Resolves the real client IP from trusted proxy headers (`X-Forwarded-For`, `X-Real-IP`) when the server runs behind a reverse proxy, load balancer or CDN.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\TrustedProxy;

new TrustedProxy(
   // Trusted proxy IPs and CIDR ranges — set these explicitly in production
   proxies: ['10.0.0.1', '173.245.48.0/20', '2400:cb00::/32']
);
```

When the request comes from a trusted proxy, the middleware:
- Reads `X-Forwarded-For` (right-to-left, first untrusted hop) or `X-Real-IP` to update `$Request->address`
- Reads `X-Forwarded-Proto` to update `$Request->scheme`

Untrusted proxy IPs are ignored — the address and scheme are left unchanged.

**CIDR ranges.** Behind a CDN every request arrives from a different edge address, so no literal list can express the trust set — list the provider's published ranges instead. An IP literal counts as `/32` | `/128`, so existing lists of valid IPs keep working; textual IPv6 variants (`0:0:0:0:0:0:0:1` vs `::1`) now match by value; an IPv4-mapped form (`::ffff:a.b.c.d`) matches its IPv4 equivalent on both sides; and surrounding whitespace is tolerated. A CIDR entry whose host bits are set (`10.0.0.8/8`) trusts its whole network, per the usual convention. The list is compiled once at construction, so per-request matching is a byte comparison — and an entry that is not a valid IP or CIDR now throws `InvalidArgumentException` at boot instead of silently never matching, which is the one breaking change here. The `X-Forwarded-For` walk skips trusted hops by the same range match, so an in-chain edge address is never mistaken for the client. Provider ranges change over time — load them from a file you can refresh (`proxies: require 'ranges.php'`) rather than hardcoding.

> **CDNs that do not append to `X-Forwarded-For`.** Some edges publish the client only in a header of their own (`CF-Connecting-IP`, `True-Client-IP`). Reading those is not supported yet — trusting a fourth field safely also requires teaching the route cache about it, otherwise an address-varying response cached for one client could be replayed to another. Cloudflare and most CDNs also append to `X-Forwarded-For`, so listing their ranges above already resolves the real client.

**`$Request->address` vs `$Request->peer`.** This middleware only ever changes `$Request->address` (the application-facing client IP). The real socket peer is always available, unaltered, as **`$Request->peer`** — use it for anti-abuse decisions that must not be spoofable (rate limiting keys on it by default; see [RateLimit](#ratelimit)).

> **Security — set `proxies` explicitly in production.** When you construct `TrustedProxy` without a `proxies` argument it falls back to the localhost default (`127.0.0.1`, `::1`) and logs a one-time `WARNING` the first time it trusts a forwarded header. With that default, anything that can reach the server from localhost — a sidecar, an SSRF pivot, a dev port-forward — is trusted and can spoof `$Request->address` via `X-Forwarded-For`. Always pass the actual IPs of your reverse proxy / load balancer.

**Phase:** Pre-processing — resolves the real client IP before the handler runs. Only processes forwarded headers when the request originates from a trusted proxy IP.

## Reference

### Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Recovering

```php
public function recover (Request $Request, Response $Response, Throwable $Throwable): null|Response
```

Answers a `Throwable` raised by deferred work, or declines with `null`. `$Request` is the generation's captured snapshot, `$Response` the deferred clone as the work left it, `$Throwable` the failure — a `Response\Timeout` when the deferral budget elapsed. Boundaries are walked innermost first along the route's chain, then along the global pipeline last entry first; the first `Response` wins, a throwing `recover()` replaces the `Throwable` for the boundaries further out, and the server's own error response is sent when every boundary declines. Reporting follows the answer: the core's `Throwables::notify()` intake runs only when its own error response answers, so a boundary that answers owns the report. `Recovering` extends the `Middleware` contract, so `process()` keeps its synchronous role on the same class.
