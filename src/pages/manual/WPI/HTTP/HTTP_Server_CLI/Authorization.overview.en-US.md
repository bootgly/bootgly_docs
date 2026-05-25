# HTTP Server CLI — Authorization

HTTP Server CLI authorization protects already-authenticated routes. Authentication proves
who is making the request; Authorization checks whether that `Identity` may continue.

The middleware is intentionally small:

- `Authorizing` stores ordered gate objects.
- `Authorization` executes those gates around the route handler.
- `Gate` is the base HTTP contract for custom gates.
- `Denial` normalizes failed authorization responses to `403 Forbidden`.
- `Scope`, `Role` and `Policy` are the built-in route gates.

## Pipeline position

Place Authentication before Authorization so gates receive a typed `Identity` on the
request.

```php
use Bootgly\API\Security\JWT;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\JWT as JWTGuard;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorizing;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Scope;

$JWT = new JWT('application-secret');
$JWTStrategy = new Authenticating(new JWTGuard($JWT));
$Authorizing = new Authorizing(new Scope('demo:read'));

$middlewares = [
   new Authentication($JWTStrategy),
   new Authorization($Authorizing),
];
```

If no identity is present, every built-in gate fails. That normally means Authentication
was missing, failed, or was placed after Authorization.

## `Authorizing`

`Authorizing` is an ordered gate collection. Every configured gate must pass.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorizing;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Role;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Scope;

$Authorizing = new Authorizing(
   new Scope('demo:read'),
   new Role('editor')
);
```

Use `add()` when the strategy is assembled incrementally:

```php
$Authorizing->add(new Scope('demo:write'));
```

## `Authorization`

`Authorization` receives an `Authorizing` strategy. Creating it with an empty strategy
throws `InvalidArgumentException` so a protected route cannot silently run without gates.

When any gate returns `false`, the middleware stops immediately and the route handler is not
called. The failed gate builds the response; by default that response is `403 Forbidden`.

Custom fallbacks may render a body or extra headers, but the middleware marks the response
as `403` before and after the fallback.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization;

$Middleware = new Authorization(
   Authorizing: $Authorizing,
   Fallback: function (Request $Request, Response $Response): Response {
      return $Response->JSON->send([
         'error' => 'forbidden',
      ]);
   }
);
```

## Scope gate

`Scope` checks exact grants in `Identity->scopes`.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Scope;

new Scope('posts:view');
new Scope(['posts:view', 'posts:update']);
new Scope(['posts:view', 'posts:update'], all: false);
```

`all: true` is the default. With `all: false`, any configured scope is enough.

## Role gate

`Role` checks role grants in `Identity->claims['role']` and `Identity->claims['roles']`.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Role;

new Role('admin');
new Role(['editor', 'publisher'], all: true);
```

Role matching is strict and case-sensitive.

## Policy gate

`Policy` delegates resource checks to the API authorization policy contract. The gate
resolves the HTTP request identity, resolves an optional route resource, and calls the
transport-agnostic API engine.

```php
use Bootgly\API\Security\Authorization\Policy as PolicyContract;
use Bootgly\API\Security\Identity;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Policy as PolicyGate;

$Post = (object) ['owner' => 'user-42'];

$Policy = new class extends PolicyContract {
   public function update (Identity $Identity, mixed $Resource = null): null|bool
   {
      if (is_object($Resource) === false || property_exists($Resource, 'owner') === false) {
         return null;
      }

      return $Resource->owner === $Identity->id;
   }
};

new PolicyGate(
   Policy: $Policy,
   action: 'update',
   Resource: static function (object $Request) use ($Post): object {
      return $Post;
   }
);
```

Policy methods return `null|bool`: `true` allows, `false` denies, and `null` means no
opinion. The engine treats `null` as denial. Built-in action names are `view`, `create`,
`update` and `delete`, but any public method on the provided policy may be used. Missing or
non-callable action names are rejected when the gate is constructed.

## API and RBAC boundary

The WPI gates stay HTTP-focused. Persisted RBAC lookup belongs to API:

```php
use Bootgly\API\Security\Authorization\RBAC;

$RBAC = new RBAC($Database);
$Identity = $RBAC->load($Identity);
```

Use RBAC to enrich or check an identity before the HTTP route reaches a `Scope`, `Role` or
`Policy` gate. This preserves Bootgly's layer direction: WPI may depend on API, while API
may use ADI.

## Demo and guide

The runnable demo routes are in
`projects/Demo-HTTP_Server_CLI/router/HTTP_Server_CLI-authorization.SAPI.php` and
`projects/Demo-HTTP_Server_CLI/router/routes/Authorization.routes.php`.

For the full workflow, including migrations, seeders, RBAC tables and Postman collection,
see **[Authorization guide](/guide/authorization/overview/)**.