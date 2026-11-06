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

### Answering `insufficient_scope`

By default a denied `Scope` answers a bare `403 Forbidden`. Pass the route's `Bearer` (or `JWT`) guard as `Bearer:` and the denial also tells the client which scopes it needs, as RFC 6750 §3.1 describes — the signal an OAuth or MCP client reads to ask for a token with more scope:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Bearer;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Scope;

$Bearer = new Bearer($Resolver, realm: 'Bootgly API');

new Scope(['posts:view', 'posts:update'], Bearer: $Bearer);
```

A request whose identity lacks a scope then gets:

```http
HTTP/1.1 403 Forbidden
WWW-Authenticate: Bearer realm="Bootgly API", error="insufficient_scope", scope="posts:view posts:update"
```

`scope` lists every configured scope, space-separated (also with `all: false`). When the Bearer has a `metadata:` URL, `resource_metadata="…"` follows. The body stays `Forbidden`, exactly as without a Bearer. A custom `Authorization` fallback owns its response, so it is not given the challenge.

A request that carries no identity at all — no authentication ran before the gate, or it left `$Request->identity` as `null` — is not a client lacking scope but an unauthenticated one. With a `Bearer:`, the `Scope` then answers exactly what the authentication would: `401 Unauthorized` with the Bearer's own challenge.

```php
yield $Router->route('/reports', $Handler, GET, middlewares: [
   new Authorization(new Authorizing(
      new Scope('reports:read', Bearer: new Bearer($Resolver, realm: 'Bootgly API'))
   )),
]);
```

```http
HTTP/1.1 401 Unauthorized
WWW-Authenticate: Bearer realm="Bootgly API", error="invalid_token"
```

An identity that is not an `Identity` object (an opaque value returned by a `Bearer` resolver) is an authenticated client without scopes, so it still gets the `403 insufficient_scope` challenge. Without a `Bearer:`, a request with no identity gets the bare `403 Forbidden`, as before.

Because the scopes travel space-separated inside the challenge, each one must be an RFC 6749 `scope-token` when a `Bearer:` is given — printable ASCII without space, `"` or `\`. Anything else throws `InvalidArgumentException` when the gate is built. Without a `Bearer:` any non-empty string is still accepted.

See [Protecting an MCP endpoint](/manual/WPI/HTTP/HTTP_Server_CLI/Authentication/) on the Authentication page for the full Bearer + Scope + CORS route.

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
may use ADI. To serve those checks from a cache, and keep a revoked permission from being
served once `invalidate()` returns, see
**[Caching permission lists](/guide/authorization/overview/)** in the Authorization guide.

## Demo and guide

The runnable demo routes are in
`projects/Demo/HTTP_Server_CLI/router/routes/Authorization.routes.php`.

For the full workflow, including migrations, seeders, RBAC tables and Postman collection,
see **[Authorization guide](/guide/authorization/overview/)**.

## Reference

### Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Scope

```php
public function __construct (string|array $scopes, bool $all = true, null|Bearer $Bearer = null)
```

Creates an exact-scope gate. `$scopes` is one scope or a list of them; `$all` requires every scope (`true`, the default) or any one of them (`false`). `$Bearer` turns a denial into an `insufficient_scope` challenge (or, for a request with no identity, into the Bearer's `401` challenge). Throws `InvalidArgumentException` for an empty scope or list, and — with a `$Bearer` — for a scope that is not an RFC 6749 `scope-token`.

```php
public private(set) null|Bearer $Bearer
```

The guard whose challenge answers a denial, or `null` (the default) for a bare `403 Forbidden`.

```php
public function deny (object $Response): object
```

Builds the denial: `403 Forbidden` with the body `Forbidden`, plus — when `$Bearer` is set — the `WWW-Authenticate` challenge written by `Bearer::forbid()` with the configured scopes. When `$Bearer` is set and the Request the Response answers (`$Response->Request`) carries no identity at all, it answers `Bearer::challenge()` instead: `401 Unauthorized` with the Bearer's own challenge. The gate keeps no per-request state: it reads the identity from the Response's own Request, so each request gets its own answer. The HTTP middleware pipeline runs synchronously, so a `resolve()` must not suspend. A response-like object without a `Request` gets the `403`.
