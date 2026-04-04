# HTTP Server CLI — Router

The Router provides a flexible and powerful routing system for the HTTP Server CLI.
It features **automatic route caching** for high performance, **parameter constraint types** for input validation, and a **middleware pipeline** for cross-cutting concerns.

## API

The `route` method is used to define routes:

```php
route (string $route, callable $handler, null|string|array $methods = null, array $middlewares = []) : false|object
```

- `$route` — the URL pattern to match (accepts params, constraints, and catch-all).
- `$handler` — the callback to be executed when the route is matched.
- `$methods` — the HTTP method(s) that this route should respond to.
- `$middlewares` — an optional array of middlewares for this specific route.

`$handler` arguments:

- `$Request` — the HTTP Server Request
- `$Response` — the HTTP Server Response
- `$Route` — the matched Route object (only when the handler is not a Closure; in Closures, `$this` is bound to the Route)

## Basic usage

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

return static function
(Request $Request, Response $Response, Router $Router): Generator
{
   yield $Router->route('/', function (Request $Request, Response $Response) {
      return $Response(body: 'Hello World!');
   }, GET);

   // @ Catch-all 404
   yield $Router->route('/*', function (Request $Request, Response $Response) {
      return $Response(code: 404, body: 'Not Found');
   });
};
```

> You should use `yield` (Generator) if you define more than one route. This ensures consistency and performance in HTTP Responses under the hood.

## Route Callbacks

### Passing Closures as handler

Inside a Closure handler, `$this` is bound to the `Route` object, giving direct access to `$this->Params`.

```php
yield $Router->route('/', fn (Request $Request, Response $Response) => $Response(body: 'Hello World!'), GET);
```

```php
yield $Router->route('/', function (Request $Request, Response $Response) {
   return $Response(body: 'Hello World!');
}, GET);
```

### Passing functions as handler

Consider that you have the following function:

```php
function talk (Request $Request, Response $Response, Route $Route): Response
{
   $queries = $Request->queries;
   $message = 'Hello ' . ($queries['who'] ?? 'World!');

   return $Response(code: 200, body: $message);
}
```

```php
yield $Router->route('/hello', 'talk', GET);
```

### Passing methods as handler

Consider that you have the following class:

```php
class World
{
   public static function hello (Request $Request, Response $Response, Route $Route): Response
   {
      return $Response(body: 'Hello World!!!');
   }
}
```

```php
yield $Router->route('/hello', __NAMESPACE__ . '\World::hello', GET);
```

## Route with multiple HTTP methods

```php
yield $Router->route('/data', function ($Request, $Response) {
   return $Response(body: 'Data!');
}, [GET, POST]);
```

## Route Params

Route params are defined with the `:paramName` syntax. Inside Closure handlers, access params via `$this->Params->paramName`.

### Basic params (no constraint)

When no regex or constraint type is defined, the param matches any non-slash characters:

```php
yield $Router->route('/user/:id', function ($Request, $Response) {
   return $Response(body: 'User ID: ' . $this->Params->id);
}, GET);
```

### Pre-set regex constraint

Set a regex pattern on the `Route->Params` object before defining the route:

```php
$Route->Params->id = '[0-9]+';

yield $Router->route('/user/:id', function ($Request, $Response) {
   return $Response(body: 'User ID: ' . $this->Params->id);
}, GET);
```

### Inline regex constraint

Define the regex directly in the route pattern using parentheses `:paramName(regex)`:

```php
yield $Router->route('/order/:oid(\\d+)', function ($Request, $Response) {
   return $Response(body: 'Order ID: ' . $this->Params->oid);
}, GET);
```

### Parameter Constraint Types

Use the `<type>` syntax for built-in validation constraints. These are expanded to regex at **compile-time** with **zero runtime cost**:

```php
yield $Router->route('/user/:id<int>', function ($Request, $Response) {
   // :id only matches integers (e.g., /user/42 ✅, /user/abc ❌)
   return $Response(body: 'User ID: ' . $this->Params->id);
}, GET);
```

| Type | Pattern | Description | Example Match |
|------|---------|-------------|---------------|
| `int` | `[0-9]+` | Integer numbers | `42`, `123` |
| `alpha` | `[a-zA-Z]+` | Alphabetic characters only | `books`, `Admin` |
| `alphanum` | `[a-zA-Z0-9]+` | Alphanumeric characters | `abc123`, `Item5` |
| `slug` | `[a-zA-Z0-9_-]+` | URL-safe slug (letters, numbers, hyphen, underscore) | `hello-world_2` |
| `uuid` | UUID v4 pattern | Standard UUID format | `550e8400-e29b-41d4-a716-446655440000` |

#### Examples

```php
// @ Alpha constraint — only letters
yield $Router->route('/category/:name<alpha>', function ($Request, $Response) {
   return $Response(body: 'Category: ' . $this->Params->name);
}, GET);

// @ Slug constraint — URL-friendly strings
yield $Router->route('/tag/:slug<slug>', function ($Request, $Response) {
   return $Response(body: 'Tag: ' . $this->Params->slug);
}, GET);

// @ UUID constraint — standard UUID format
yield $Router->route('/resource/:id<uuid>', function ($Request, $Response) {
   return $Response(body: 'UUID: ' . $this->Params->id);
}, GET);

// @ Alphanum constraint — letters and numbers only
yield $Router->route('/item/:code<alphanum>', function ($Request, $Response) {
   return $Response(body: 'Item: ' . $this->Params->code);
}, GET);
```

When a constraint does not match, the route is skipped and the next route is tried (usually falling through to the catch-all 404).

### Multiple params

```php
yield $Router->route('/posts/:pid/comments/:cid', function ($Request, $Response) {
   return $Response(body: 'Post: ' . $this->Params->pid . ', Comment: ' . $this->Params->cid);
}, GET);
```

### Duplicate (equal) param names

When the same param name appears multiple times, it becomes an indexed array:

```php
$Route->Params->id = '[0-9]+';

yield $Router->route('/param/:id/param/:id', function ($Request, $Response) {
   return $Response(body: 'ID 1: ' . $this->Params->id[0] . ', ID 2: ' . $this->Params->id[1]);
}, GET);
```

## Nested Routes (Route Groups)

Groups allow organizing routes under a shared prefix:

```php
yield $Router->route('/profile/:*', function () use ($Router) {
   yield $Router->route('maria', function ($Request, $Response) {
      return $Response(body: 'Hello Maria!');
   });
   yield $Router->route('bob', function ($Request, $Response) {
      return $Response(body: 'Hello Bob!');
   });
}, GET);
```

### Parameterized nested routes

```php
$Route->Params->id = '[0-9]+';

yield $Router->route('/page/:*', function () use ($Router) {
   yield $Router->route(':id', function ($Request, $Response) {
      return $Response(body: 'Page ID: ' . $this->Params->id);
   });
}, GET);
```

## Catch-All Routes

### Generic catch-all (404 fallback)

Matches any URL that was not matched by previous routes:

```php
yield $Router->route('/*', function ($Request, $Response) {
   return $Response(code: 404, body: 'Not Found');
});
```

### Parameterized catch-all

Captures the remaining path segments into a named param. The `*` modifier after the param name captures everything including forward slashes:

```php
yield $Router->route('/search/:query*', function ($Request, $Response) {
   // /search/hello       → $this->Params->query === 'hello'
   // /search/hello/world → $this->Params->query === 'hello/world'
   return $Response(body: 'Search: ' . $this->Params->query);
});
```

> The catch-all param must be the **last** path segment.

## Route Caching

The Router automatically caches all route definitions on the **first request**. Subsequent requests resolve routes from the cache without re-executing the Generator.

### How it works

1. **First request**: the Generator is fully iterated, each `yield $Router->route(...)` populates the cache tables.
2. **Subsequent requests**: the `resolve()` method performs a direct lookup:
   - **Static routes** — O(1) hash-table lookup by URL + method.
   - **Dynamic routes** — O(1) first-segment index + O(m) regex match within the segment bucket.
   - **Catch-all** — fallback after all specific routes are checked.
3. **Nested groups** are flattened into the cache during warmup (e.g., `/admin/:*` → `/admin/dashboard`, `/admin/settings`).

The cache is per-worker (each worker process warms its own cache on the first request).

### Cache status

```php
$Router->cached; // bool — true after the cache is warmed
```

## Route Group Middlewares (intercept)

```php
public function intercept (Middleware ...$middlewares): void;
```

Applies middlewares to all routes defined after the `intercept()` call within the current routing scope:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\CORS;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RateLimit;

$Router->intercept(new CORS, new RateLimit(limit: 100, window: 60));

yield $Router->route('/api/:*', function ($Request, $Response) use ($Router) {
   // All nested routes inherit CORS + RateLimit
   yield $Router->route('users', function ($Request, $Response) {
      return $Response->Json->send(['users' => []]);
   }, GET);
}, GET);
```

### Per-route middlewares

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\RequestId;

$requestId = new RequestId;
yield $Router->route('/protected/dashboard', function ($Request, $Response) {
   return $Response(body: 'Protected Dashboard');
}, GET, middlewares: [$requestId]);
```

When both group and route-level middlewares are present, they are **merged** — group middlewares execute first, then route-level ones, forming a single onion pipeline around the handler.

See [Middlewares](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares) for the full middleware pipeline documentation.

## Route Object

The `Route` class (`Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Route`) exposes the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `path` | `string` | The route path pattern |
| `Params` | `Params` | Route parameters container |
| `base` | `string` | The request base path (property hook) |
| `parameterized` | `bool` | Whether the route has `:param` segments (property hook) |
| `nested` | `bool` | Whether this is inside a route group |

### Params Object

The `Params` class (`Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Route\Params`) provides dynamic typed access to route parameters:

```php
$this->Params->id;       // string — single param value
$this->Params->id[0];    // string — first value of duplicate param
$this->Params->id[1];    // string — second value of duplicate param
```

`Params` implements `IteratorAggregate`, so you can iterate over all captured params:

```php
foreach ($this->Params as $name => $value) {
   // $name  → 'id', 'slug', etc.
   // $value → 'abc', ['val1', 'val2'], etc.
}
```
