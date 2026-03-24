# HTTP Server CLI — Router

The Router provides a flexible and powerful routing system for the HTTP Server CLI.
The `route` method is used to define routes, with the schema as follows:

```php
route (string $route, callable $handler, null|string|array $methods = null, array $middlewares = []) : false|object
```

- `$route` is the URL pattern to match that accepts params.
- `$handler` is the callback to be executed when the route is matched.
- `$methods` is the HTTP method(s) that this route should respond to.
- `$middlewares` is an optional array of middlewares for this specific route.

`$handler` arguments:

- `$Request` is the HTTP Server Request
- `$Response` is the HTTP Server Response
- `$Route` is the HTTP Server Route matched (only when the handler is not a Closure)

## Basic usage

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;

yield $Router->route('/', function (Request $Request, Response $Response) {
  $Route = $this;
  // $Params = $Route->Params;
  // ...

  return $Response(body: 'Hello World!');
}, GET);
```

> You should use `yield` (Generator) if you define more than one route. This ensures consistency and performance in HTTP Responses under the hood.

## Route Callbacks

### Passing Closures as handler

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
function talk (Request $Request, Response $Response, Route $Route) {
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
  public static function response (Request $Request, Response $Response, Route $Route)
  {
    return $Response(body: 'Hello World!!!');
  }
}
```

```php
yield $Router->route('/hello', 'World::talk', GET);
```

```php
yield $Router->route('/hello', __NAMESPACE__ . '\World::response', GET);
```

```php
yield $Router->route('/hello', [World::class, 'response'], GET);
```

## Route with Route Params

```php
yield $Router->route('/user/:id', function ($Request, $Response) {
  return $Response(body: 'User ID: ' . $this->Params->id);
}, GET);
```

```php
$Route->Params->id = '[0-9]+'; // Set Param Regex pattern

yield $Router->route('/param6/:id/param7/:id', function ($Request, $Response) {
  return $Response(body: <<<HTML
  Equals named params with Regex:<br>
  Param 1: {$this->Params->id[0]}<br>
  Param 2: {$this->Params->id[1]}
  HTML);
}, GET);
```

## Route with multiple HTTP methods

```php
yield $Router->route('/data', function ($Request, $Response) {
  return $Response(body: 'Data!');
}, [GET, POST]);
```

## Nested Routes

```php
yield $Router->route('/profile/:*', function ($Request, $Response)
  use ($Router) {
  // ...

  yield $Router->route('default', function ($Request, $Response) {
      return $Response(body: 'User Default!');
  });
  yield $Router->route('user/:id', function ($Request, $Response) {
      return $Response(body: 'User ID: ' . $this->Params->id);
  });
}, GET);
```

## Catch-All Route

```php
yield $Router->route('/*', function ($Request, $Response) {
  return $Response(code: 404, body: 'pages/404');
});
```

## Route Group Middlewares (intercept)

```php
public function intercept (Middleware ...$middlewares): void;
```

Applies middlewares to all routes defined after the `intercept()` call within the current routing scope:

```php
use Bootgly\WPI\Modules\HTTP\Server\Router\Middlewares\CORS;
use Bootgly\WPI\Modules\HTTP\Server\Router\Middlewares\RateLimit;

$Router->intercept(new CORS, new RateLimit(limit: 100, window: 60));

yield $Router->route('/api/:*', function ($Request, $Response) use ($Router) {
   // All nested routes inherit CORS + RateLimit
   yield $Router->route('users', function ($Request, $Response) {
      $Response->Json->encode(['users' => []]);
   }, GET);
}, GET);
```

See [Middlewares](/manual/WPI/HTTP/HTTP_Server_Middlewares) for the full middleware pipeline documentation.
