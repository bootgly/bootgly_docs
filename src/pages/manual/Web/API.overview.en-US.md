# Web API

`Web\API` is the REST shell: controller-action dispatch, REST resource routing, RFC 9457 problem details and entity transformers — an opinionated layer over the unopinionated WPI core.

## A REST resource

Declare the resource in a route set — reads public, mutations behind JWT:

```php
use Bootgly\API\Security\JWT;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\JWT as JWTGuard;
use Web\API\Routes;

use Demo\Tasks\Controllers\Tasks;


$JWT = new JWT((string) getenv('JWT_SECRET'));  // HS256: at least 32 bytes
$JWTStrategy = new Authenticating(new JWTGuard($JWT));


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

The router requires a route set once, when `App->load()` runs, so the JWT strategy is built at boot and every mutation route shares it. An HS256 secret shorter than 32 bytes — an unset `JWT_SECRET` included — makes `new JWT()` throw `InvalidArgumentException`, and the app stops there instead of running with a weak key. The `Demo/Tasks` example project is this route set plus a `POST /auth/token` route that issues a demo token; the guard and its policies are on [Authentication](/manual/WPI/HTTP/HTTP_Server_CLI/Authentication/#jwt-guard).

## Problems (RFC 9457)

A `Problem` is both an `Exception` and a renderer — throw it from any controller and the `Problems` middleware turns it into `application/problem+json`:

```php
use Web\API\Problem;

public function show (Request $Request, Response $Response): Response
{
   $id = (int) $this->Route->Params->id;
   $Result = $Response->Database->fetch('SELECT id, title, done FROM tasks WHERE id = $1', [$id]);

   if ($Result->empty === true) {
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
- in Production/Staging it is reported through `Throwables::notify()` and rendered as an internals-free 500 problem;
- the boundary also covers **deferred work**: `Problems` implements `Recovering`, so a `Problem` thrown inside `$Response->defer()` still renders as `application/problem+json`, a `Response\Timeout` becomes a `503` problem, and a generic `Throwable` follows the same environment rule — declined to the core Catcher in Development/Test, an internals-free 500 problem in Production/Staging.

```php
public function delete (Request $Request, Response $Response): Response
{
   $id = $this->Route->Params->id;

   return $Response->defer(static function (Response $Response) use ($id): void {
      $Response->wait();
      throw new Problem(422, detail: "Task {$id} cannot be deleted.");
   });
}
```

### Validation errors

Extension members carry what the standard ones cannot — the failed rules of a payload, for one. Run a [Validation](/manual/ADI/Validation) on the request fields and hand its `errors` over through `extensions:`:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Boolean;
use Bootgly\ADI\Validators\Required;
use Web\API\Problem;

public function create (Request $Request, Response $Response): Response
{
   $Validation = new Validation(
      source: $Request->fields,
      rules: [
         'title' => [new Required],
         'done' => [new Boolean]
      ]
   );

   if ($Validation->valid === false) {
      throw new Problem(422, detail: 'The task payload is invalid.', extensions: [
         'errors' => $Validation->errors
      ]);
   }
   // ...
}
```

For `{"title": "", "done": "maybe"}`, the client gets:

```json
{"type":"about:blank","title":"Unprocessable Entity","status":422,"detail":"The task payload is invalid.","errors":{"title":["title is required."],"done":["done must be a boolean."]}}
```

Extensions come after the standard members and never override one of them: an extension named `status` is left out.

### Render without throwing

`render()` answers the same problem with no stack unwinding: it writes the problem on the Response and returns it, so a handler can return it directly — and no `Problems` middleware has to catch anything. The `show()` above, answering its 404 that way:

```php
if ($Result->empty === true) {
   return new Problem(404, detail: "Task {$id} not found.")->render($Response);
}
```

The same call fits anywhere a Response is returned — the `fallback` of the core [Validator](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/#validator) middleware, for one, which otherwise answers a failed rule with plain `application/json`:

```php
use Bootgly\ADI\Validation;
use Bootgly\ADI\Validators\Boolean;
use Bootgly\ADI\Validators\Required;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Validator\Sources;
use Web\API\Problem;

$Payload = new Validator(
   rules: [
      'title' => [new Required],
      'done' => [new Boolean]
   ],
   Source: Sources::Fields,
   fallback: static fn (Request $Request, Response $Response, Validation $Validation): Response
      => new Problem(422, detail: 'The task payload is invalid.', extensions: [
         'errors' => $Validation->errors
      ])->render($Response)
);
```

Pass `$Payload` in the `middlewares:` of the route that receives that payload: a request that fails a rule gets the same `422` problem as the action above, and the action never runs.

## Resources (transformers)

A `Resource` shapes entities (ORM models or row arrays) into their public API representation. `transform()` receives either one, so read both:

```php
namespace Demo\Tasks\Resources;


use function is_object;

use Web\API\Resource;


class Tasks extends Resource
{
   public function transform (object|array $Entity): array
   {
      $id = is_object($Entity) === true ? $Entity->id : $Entity['id'];
      $title = is_object($Entity) === true ? $Entity->title : $Entity['title'];
      $done = is_object($Entity) === true ? $Entity->done : $Entity['done'];

      return [
         'id' => (int) $id,
         'title' => (string) $title,
         'done' => (bool) $done
      ];
   }
}
```

`paginate()` maps the `items` of a core pagination body in place — the REST DX envelope (`page`/`pages`/`limit`/`total` or `limit`/`next`, plus the `X-Total-Count`/`Link` headers) is reused, never recomputed:

```php
use Demo\Tasks\Models\Task;
use Demo\Tasks\Resources\Tasks as Resource;

public function list (Request $Request, Response $Response): Response
{
   $body = $Response->Database->paginate(Task::class);

   return $Response->JSON->send(new Resource()->paginate($body));
}
```

`Web\API\Resource` is abstract: a controller instantiates the project's subclass. The Tasks controller is a `Tasks` class itself, so it imports the transformer under the `Resource` alias.

## Dispatch

`Action` is the invokable dispatcher both shells share: it satisfies the Router's `callable` handler type while deferring controller construction to request time — a **fresh controller instance per request**. Use it directly for non-CRUD routes — a page, or an extra action beside a mapped resource:

```php
use Web\API\Action;
use Web\API\Routes;

use Journal\Controllers\Notes;
use Journal\Controllers\Pages;


yield $Router->route('/about', new Action(Pages::class, 'show'), GET);

yield from Routes::map($Router, '/notes', Notes::class);
yield $Router->route('/notes/:id<int>/pin', new Action(Notes::class, 'pin'), POST);
```

`pin()` is a public method of `Notes` with the signature of the mapped actions — `(Request $Request, Response $Response): Response` — and reads `:id` from `$this->Route->Params->id`. Its route repeats the `int` constraint `map()` puts on `:id`, and its extra segment keeps it apart from `/notes/:id<int>`.

---

## Reference

### Web\API\Action

```php
public function __construct (string $controller, string $action)
```

Registers the dispatcher. The action is validated with `method_exists` — unknown actions throw an `InvalidArgumentException` at registration time, never at request time. Keep the action public: `method_exists()` accepts a private or protected method too, and calling it fails at request time with an `Error`.

```php
public function __invoke (object $Request, object $Response): mixed
```

Dispatches the action on a fresh controller instance.

```php
public private(set) string $controller
```

The controller class (`class-string`) instantiated on each dispatch, as registered. Read-only.

```php
public private(set) string $action
```

The method called on that instance. Read-only.

### Web\API\Problem

```php
public function __construct (int $status = 500, string $title = '', null|string $detail = null, string $type = 'about:blank', null|string $instance = null, array $extensions = [])
```

An RFC 9457 problem. An empty `title` derives from the HTTP status text — `'Error'` for a status the server has no text for (`299`), which `render()` then refuses: the Response throws `InvalidArgumentException`. `extensions` are extra members (they never override the standard ones). Being an `Exception`, it carries the title as message and the status as code. Each argument is kept in the read-only property of the same name below.

```php
public function render (Response $Response): Response
```

Renders the problem as `application/problem+json` on the given Response and returns it: the status, and as payload the `type`, `title` and `status` members, `detail` and `instance` when set, then the extensions.

```php
public private(set) string $type
```

URI reference identifying the problem type (RFC 9457 §3.1.1) — `'about:blank'` by default.

```php
public private(set) string $title
```

Short, human-readable summary: the one given, or the derived status text.

```php
public private(set) int $status
```

HTTP status code of the response.

```php
public private(set) null|string $detail
```

Explanation specific to this occurrence; `null` leaves it out of the payload.

```php
public private(set) null|string $instance
```

URI reference identifying this occurrence; `null` leaves it out of the payload.

```php
public private(set) array $extensions
```

Extension members, by name (`array<string,mixed>`), rendered after the standard ones and never over them — one named `detail` or `instance` shows only while the problem leaves that member unset.

### Web\API\Problems

```php
public function process (object $Request, object $Response, Closure $next): object
```

The middleware error boundary described above. `Problems::$Environment` is a one-shot environment override (mirrors the core `Catcher::$Environment`) consumed by the generic-Throwable branch — for E2E specs exercising the Production path.

```php
public function recover (Request $Request, Response $Response, Throwable $Throwable): null|Response
```

The deferred-work side of the same boundary (`Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Recovering`): renders a `Problem` in every environment, answers a `Response\Timeout` with a `503` problem, and applies the environment rule to any other `Throwable` — `null` (declined to the core Catcher) in Development/Test, a reported, internals-free 500 problem in Production/Staging. `Problems::$Environment` is consumed by that generic-Throwable branch here too — a `Problem` or a `Timeout` leaves it untouched.

### Web\API\Resource

```php
abstract public function transform (object|array $Entity): array
```

Shapes one entity — an ORM model or a row array — into its public API representation.

```php
public function collect (iterable $Entities): array
```

Transforms a list of entities, in order.

```php
public function paginate (array $body): array
```

Transforms the `items` of a `$Response->Database->paginate()` body in place, preserving the envelope keys. A body without an `items` array comes back unchanged, and an `items` entry that is neither an object nor an array is dropped.

### Web\API\Routes

```php
public static function map (Router $Router, string $path, string $controller, null|array $only = null, null|array $except = null, array $middlewares = [], null|string $constraint = 'int'): Generator
```

Expands one REST resource declaration into the route table above. Unknown `only`/`except` action names throw at registration time; `middlewares:` applies to every expanded route; `constraint:` adjusts the `:id` param type (null registers an unconstrained `:id`).
