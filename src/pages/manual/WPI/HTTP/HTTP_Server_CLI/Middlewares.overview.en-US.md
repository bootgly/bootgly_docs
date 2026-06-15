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
$Router->intercept(new CORS, new RateLimit(limit: 100, window: 60));

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
}, POST, middlewares: [new RateLimit(limit: 5, window: 60)]);
```

When both group and route-level middlewares are present, they are **merged** — group middlewares execute first, then route-level ones, forming a single onion pipeline around the handler.

## Registration Methods

| Method | Description |
|---|---|
| `prepend(Middleware $Middleware)` | Add a middleware to the **beginning** of the pipeline |
| `append(Middleware $Middleware)` | Add a middleware to the **end** of the pipeline |
| `pipe(Middleware ...$middlewares)` | Add one or more middlewares to the end at once |

## Built-in Middlewares

All built-in middlewares are in the namespace `Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares`.

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
   origins: ['https://example.com'],      // Allowed origins (default: ['*'])
   methods: ['GET', 'POST'],              // Allowed methods (default: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'])
   headers: ['Content-Type'],             // Allowed headers (default: ['Content-Type','Authorization'])
   maxAge: 86400,                         // Preflight cache in seconds (default: 86400)
   credentials: false                     // Allow credentials (default: false)
);
```

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

---

### RateLimit

Enforces rate limiting by tracking request counts per IP address within time windows. Returns `429 Too Many Requests` when exceeded.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RateLimit;

new RateLimit(
   limit: 60,             // Maximum requests per window (default: 60)
   window: 60,            // Time window in seconds (default: 60)
   trustForwarded: false  // Key on the proxy-resolved $Request->address (default: false)
);
```

**Counter key (security).** By default the limiter keys on `$Request->peer` — the **immutable TCP transport IP**, which a client cannot forge. This is deliberate: `TrustedProxy` can overwrite `$Request->address` from a client-supplied `X-Forwarded-For` header, so keying on `$address` would let a client behind (or co-located with) a trusted proxy rotate that header and open a fresh rate-limit bucket per request, evading the limit entirely.

Set `trustForwarded: true` **only** when the server sits behind a genuinely trusted proxy and you want per-real-client buckets — it makes the limiter key on `$Request->address` (the proxy-resolved client IP). Combine it with a correctly configured `TrustedProxy` so that address is itself trustworthy.

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

**Phase:** Pre-processing — generates and validates the token before the handler runs.

---

### Validator

Fail-closed request validation. Runs a set of rules against one Request source (`Fields`, `Queries`, `Headers`, `Cookies`, or `Files`) and short-circuits with a JSON error response if any rule fails — the route handler never runs.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validation\Sources;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Email;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Validators\Required;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator;

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

See the [Request Validation](/manual/WPI/HTTP/HTTP_Server_CLI/Request/#request-validation) section for the full validator catalog, custom rules, and end-to-end examples.

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

Resolves the real client IP from trusted proxy headers (`X-Forwarded-For`, `X-Real-IP`) when the server runs behind a reverse proxy or load balancer.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\TrustedProxy;

new TrustedProxy(
   proxies: ['10.0.0.1']  // Trusted proxy IPs — set these explicitly in production
);
```

When the request comes from a trusted proxy IP, the middleware:
- Reads `X-Forwarded-For` (right-to-left, first untrusted hop) or `X-Real-IP` to update `$Request->address`
- Reads `X-Forwarded-Proto` to update `$Request->scheme`

Untrusted proxy IPs are ignored — the address and scheme are left unchanged.

**`$Request->address` vs `$Request->peer`.** This middleware only ever changes `$Request->address` (the application-facing client IP). The real socket peer is always available, unaltered, as **`$Request->peer`** — use it for anti-abuse decisions that must not be spoofable (rate limiting keys on it by default; see [RateLimit](#ratelimit)).

> **Security — set `proxies` explicitly in production.** When you construct `TrustedProxy` without a `proxies` argument it falls back to the localhost default (`127.0.0.1`, `::1`) and logs a one-time `WARNING` the first time it trusts a forwarded header. With that default, anything that can reach the server from localhost — a sidecar, an SSRF pivot, a dev port-forward — is trusted and can spoof `$Request->address` via `X-Forwarded-For`. Always pass the actual IPs of your reverse proxy / load balancer.

**Phase:** Pre-processing — resolves the real client IP before the handler runs. Only processes forwarded headers when the request originates from a trusted proxy IP.
