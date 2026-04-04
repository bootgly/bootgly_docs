# HTTP Server CLI — Middlewares

Middlewares in the HTTP Server CLI follow an **onion pipeline** pattern. Each middleware wraps the next, allowing logic to run before (pre-processing) and after (post-processing) the request handler.

## Registration Scopes

Middlewares can be registered at three levels:

### Global (SAPI)

Applied to **every** request processed by the server:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\API\Servers\SAPI;
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
      $Response->Json->encode(['users' => []]);
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
   limit: 60,   // Maximum requests per window (default: 60)
   window: 60   // Time window in seconds (default: 60)
);
```

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
   proxies: ['127.0.0.1', '::1']  // Trusted proxy IPs (default: ['127.0.0.1', '::1'])
);
```

When the request comes from a trusted proxy IP, the middleware:
- Reads `X-Forwarded-For` (first IP) or `X-Real-IP` to update `$Request->address`
- Reads `X-Forwarded-Proto` to update `$Request->scheme`

Untrusted proxy IPs are ignored — the address and scheme are left unchanged.

**Phase:** Pre-processing — resolves the real client IP before the handler runs.

Only processes forwarded headers when the request originates from a trusted proxy IP.

**Phase:** Pre-processing — resolves the real client IP before the handler runs.
