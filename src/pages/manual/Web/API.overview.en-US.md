# Web API

`Web\API` is the REST shell: controller-action dispatch, REST resource routing, RFC 9457 problem details and entity transformers — an opinionated layer over the unopinionated WPI core.

## A REST resource

Declare the resource in a route set — reads public, mutations behind JWT:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Web\API\Routes;

use Tasks\Controllers\Tasks;


return static function (Request $Request, Response $Response, Router $Router) use ($JWTStrategy): Generator
{
   yield from Routes::map($Router, '/tasks', Tasks::class, only: ['list', 'show']);
   yield from Routes::map(
      $Router, '/tasks', Tasks::class,
      except: ['list', 'show'],
      middlewares: [new Authentication($JWTStrategy)]
   );
};
```

| Route        | Methods    | Action   |
|--------------|------------|----------|
| `/tasks`     | GET        | `list`   |
| `/tasks`     | POST       | `create` |
| `/tasks/:id` | GET        | `show`   |
| `/tasks/:id` | PUT, PATCH | `update` |
| `/tasks/:id` | DELETE     | `delete` |

No form pages here — that's the MVC mapping of [Controllers::map](/manual/Web/App). Per-action middleware is two `map()` calls with `only`/`except`, as above.

## Problems (RFC 9457)

A `Problem` is both an `Exception` and a renderer — throw it from any controller and the `Problems` middleware turns it into `application/problem+json`:

```php
use Web\API\Problem;

public function show (Request $Request, Response $Response): Response
{
   $id = $this->Route->Params->id;

   if ($task === null) {
      throw new Problem(404, detail: "Task {$id} not found.");
   }
   // ...
}
```

```json
{"type":"about:blank","title":"Not Found","status":404,"detail":"Task 13 not found."}
```

Put `Problems` in the app middleware stack (or on the REST route group). It narrows the error representation only:

- a thrown `Problem` renders in **every** environment — it is a designed API response, not a defect;
- a generic `Throwable` is **rethrown** in Development/Test, so the core Catcher keeps its debug page;
- in Production/Staging it is reported through `Throwables::notify()` and rendered as an internals-free 500 problem.

## Resources (transformers)

A `Resource` shapes entities (ORM models or row arrays) into their public API representation:

```php
use Web\API\Resource;


class Tasks extends Resource
{
   public function transform (object|array $Entity): array
   {
      return [
         'id' => (int) $Entity->id,
         'title' => (string) $Entity->title,
         'done' => (bool) $Entity->done
      ];
   }
}
```

`paginate()` maps the `items` of a core pagination body in place — the REST DX envelope (`page`/`pages`/`limit`/`total` or `limit`/`next`, plus the `X-Total-Count`/`Link` headers) is reused, never recomputed:

```php
public function list (Request $Request, Response $Response): Response
{
   $body = $Response->Database->paginate(Task::class);

   return $Response->JSON->send(new Resource()->paginate($body));
}
```

## Dispatch

`Action` is the invokable dispatcher both shells share: it satisfies the Router's `callable` handler type while deferring controller construction to request time — a **fresh controller instance per request**. Use it directly for non-CRUD routes:

```php
use Web\API\Action;

yield $Router->route('/about', new Action(Pages::class, 'show'), GET);
```

---

## Reference

### Web\API\Action

```php
public function __construct (string $controller, string $action)
```

Registers the dispatcher. The action is validated with `method_exists` — unknown actions throw an `InvalidArgumentException` at registration time, never at request time.

```php
public function __invoke (object $Request, object $Response): mixed
```

Dispatches the action on a fresh controller instance.

### Web\API\Problem

```php
public function __construct (int $status = 500, string $title = '', null|string $detail = null, string $type = 'about:blank', null|string $instance = null, array $extensions = [])
```

An RFC 9457 problem. An empty `title` derives from the HTTP status text; `extensions` are extra members (they never override the standard ones). Being an `Exception`, it carries the title as message and the status as code.

```php
public function render (Response $Response): Response
```

Renders the problem as `application/problem+json` on the given Response (status + members payload).

### Web\API\Problems

```php
public function process (object $Request, object $Response, Closure $next): object
```

The middleware error boundary described above. `Problems::$Environment` is a one-shot environment override (mirrors the core `Catcher::$Environment`) consumed by the generic-Throwable branch — for E2E specs exercising the Production path.

### Web\API\Resource

```php
abstract public function transform (object|array $Entity): array
```

Shapes one entity into its public API representation.

```php
public function collect (iterable $Entities): array
```

Transforms a list of entities, in order.

```php
public function paginate (array $body): array
```

Transforms the `items` of a `$Response->Database->paginate()` body in place, preserving the envelope keys.

### Web\API\Routes

```php
public static function map (Router $Router, string $path, string $controller, null|array $only = null, null|array $except = null, array $middlewares = [], null|string $constraint = 'int'): Generator
```

Expands one REST resource declaration into the route table above. Unknown `only`/`except` action names throw at registration time; `middlewares:` applies to every expanded route; `constraint:` adjusts the `:id` param type (null registers an unconstrained `:id`).
