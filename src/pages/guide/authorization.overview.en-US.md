# Authorization

Authorization answers one question after authentication succeeds: may this `Identity`
perform this action? Bootgly keeps that decision transport-agnostic in the API layer and
lets WPI HTTP routes enforce it through middleware gates.

The current surface has four practical pieces:

- `Scope` gate for exact scope grants such as `demo:read`.
- `Role` gate for role claims such as `editor` or `admin`.
- `Policy` gate for resource decisions such as owner-only updates.
- `RBAC` resolver for persisted role-permission checks backed by project SQL tables.

## Request flow

Authorization is intentionally separate from authentication:

1. Authentication middleware validates a Basic, Bearer or JWT credential.
2. The guard writes a typed `Identity` to the request.
3. Authorization middleware runs one or more gates.
4. Every configured gate must pass; the first denial returns `403 Forbidden`.

That split matters because WPI handles HTTP, while API owns the authorization model. WPI
gates do not reach into database tooling directly; DB-backed RBAC lives in API and depends
only on ADI SQL.

For the HTTP middleware reference, see
**[HTTP Server CLI Authorization](/manual/WPI/HTTP/HTTP_Server_CLI/Authorization/overview/)**.

## Scope gate

Use `Scope` when the credential already carries exact grants. JWT `scope` strings are a
natural fit for this style.

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

$middlewares = [
   new Authentication($JWTStrategy),
   new Authorization(new Authorizing(new Scope('posts:view'))),
];
```

By default `Scope` requires all configured scopes. Pass `all: false` to accept any one of
the configured grants.

```php
new Scope(['posts:view', 'posts:update'], all: false);
```

## Role gate

Use `Role` when the authenticated identity carries coarse-grained role claims. The gate
checks both a single `role` claim and a list-style `roles` claim. Matching is exact and
case-sensitive.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorizing;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Role;

$Authorizing = new Authorizing(
   new Role(['editor', 'publisher'], all: true)
);

$Middleware = new Authorization($Authorizing);
```

For most routes, prefer specific scopes or policies. Roles are best for coarse route groups
such as administrative panels.

## Policy gate

Policies model resource decisions. Extend `Bootgly\API\Security\Authorization\Policy` and
override only the actions the route needs. Built-in examples use `view`, `create`, `update`
and `delete`, but custom public policy methods such as `publish` are valid too.

```php
use Bootgly\API\Security\Authorization\Policy as PolicyContract;
use Bootgly\API\Security\Identity;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorizing;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authorization\Policy as PolicyGate;

$OwnedPost = (object) ['owner' => 'user-42'];

$OwnershipPolicy = new class extends PolicyContract {
   public function update (Identity $Identity, mixed $Resource = null): null|bool
   {
      if (is_object($Resource) === false || property_exists($Resource, 'owner') === false) {
         return null;
      }

      return $Resource->owner === $Identity->id;
   }
};

$Middleware = new Authorization(new Authorizing(new PolicyGate(
   Policy: $OwnershipPolicy,
   action: 'update',
   Resource: static function (object $Request) use ($OwnedPost): object {
      return $OwnedPost;
   }
)));
```

`override()` can short-circuit every action. Use it for rules such as super-admin allow or
disabled-user deny.

Policy methods return `null|bool`: `true` allows, `false` denies, and `null` means no
opinion. The engine treats `null` as denial, so policies fail closed by default.

## Named abilities

`Abilities` is a lightweight registry for application-defined checks when a full policy
class would be too much.

```php
use Bootgly\API\Security\Authorization\Abilities;
use Bootgly\API\Security\Identity;

$Abilities = new Abilities;

$Abilities->define('posts:update', function (Identity $Identity, object $Post): bool {
   return $Post->owner === $Identity->id;
});

$allowed = $Abilities->check($Identity, 'posts:update', $Post);
```

Missing abilities fail closed and return `false`.

## Persisted RBAC

Use `RBAC` when permissions live in SQL tables instead of only in token claims. The resolver
belongs to API and uses ADI SQL through a `SQL` database or transaction object.

```php
use Bootgly\API\Security\Authorization\RBAC;

$RBAC = new RBAC($Database);

$Identity = $RBAC->load($Identity);
$allowed = $RBAC->check($Identity, 'posts:update');
```

The canonical project tables are:

| Table | Purpose |
|---|---|
| `roles` | Role records such as `admin` or `editor`. |
| `permissions` | Named permissions such as `posts:update`. |
| `role_permissions` | Many-to-many role to permission grants. |
| `user_roles` | Application user id to role grants. |

The demo project includes migrations and a rerunnable seeder for those tables:

```bash
bootgly project Demo-HTTP_Server_CLI migrate status
bootgly project Demo-HTTP_Server_CLI migrate up
bootgly project Demo-HTTP_Server_CLI seed list
bootgly project Demo-HTTP_Server_CLI seed run --dry-run
bootgly project Demo-HTTP_Server_CLI seed run authorization_rbac
```

Run the migrate commands only after the project database is configured and reachable.

## Demo routes

Enable the Authorization demo handler in
`projects/Demo-HTTP_Server_CLI/Demo-HTTP_Server_CLI.project.php`:

```php
$HTTP_Server_CLI->on(
   Events::RequestReceived,
   require __DIR__ . '/router/HTTP_Server_CLI-authorization.SAPI.php'
);
```

Then start the demo server:

```bash
bootgly project Demo-HTTP_Server_CLI start -i
```

Available routes:

| Route | Description |
|---|---|
| `/authz` | Lists available Authorization examples. |
| `/authz/jwt/issue` | Issues a demo JWT for `demo-user`. |
| `/authz/scope` | Requires `demo:read`. |
| `/authz/role` | Requires `editor`. |
| `/authz/policy` | Requires the authenticated user to own the demo resource. |

The matching Postman collection lives at
`projects/Demo-HTTP_Server_CLI/router/HTTP_Server_CLI-authorization.postman_collection.json`.
It covers successful Scope, Role and Policy requests plus denial cases with valid tokens.

## Testing

Authorization tests are split by layer:

```bash
AI_AGENT=1 bootgly test 19       # API/Security: policies, abilities and RBAC
AI_AGENT=1 bootgly test 26       # WPI middleware units
AI_AGENT=1 bootgly test 28 166   # E2E Scope success
AI_AGENT=1 bootgly test 28 167   # E2E Scope failure
AI_AGENT=1 bootgly test 28 168   # E2E Role success
AI_AGENT=1 bootgly test 28 169   # E2E Role failure
AI_AGENT=1 bootgly test 28 170   # E2E Policy success
AI_AGENT=1 bootgly test 28 171   # E2E Policy failure
AI_AGENT=1 bootgly test 28 172   # E2E RBAC optional path, no DB by default
```

Use focused tests first when changing gates or policies. Add broader E2E coverage when a
new route flow combines Authentication and Authorization middleware. To run the optional
RBAC E2E against PostgreSQL, configure `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`,
`DB_PASS` and set `BOOTGLY_RBAC_E2E=1`. Set `BOOTGLY_RBAC_E2E_RESET=1` only when
the test may drop and recreate its isolated `rbac_e2e_*` tables.