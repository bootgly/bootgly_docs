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
bootgly project Demo/HTTP_Server_CLI migrate status
bootgly project Demo/HTTP_Server_CLI migrate up
bootgly project Demo/HTTP_Server_CLI seed list
bootgly project Demo/HTTP_Server_CLI seed run --dry-run
bootgly project Demo/HTTP_Server_CLI seed run authorization_rbac
```

Run the migrate commands only after the project database is configured and reachable.

### Caching permission lists

Every `check()` and `load()` queries the four tables. Pass a `Cache` to keep one permission
list per identity for `lifetime` seconds (300 by default):

```php
use Bootgly\ABI\Resources\Cache;
use Bootgly\API\Security\Authorization\RBAC;

$RBAC = new RBAC($Database, Cache: new Cache(['driver' => 'file']), lifetime: 300);
```

After a role or permission write **commits**, call `invalidate()` — with the identity whose
grants changed, or with no argument when a role or permission itself changed:

```php
$Database->Pool->wait($Transaction->commit());   // the revoke is durable first
$RBAC->invalidate($Identity);                     // this identity's lists
$RBAC->invalidate();                              // every list of this resolver
```

Each cached list is bound to two generations — the resolver's and the identity's — read
before the database, and `invalidate()` stores a fresh one (or drops the old one when the
cache refuses the write — a full disk, Redis at maxmemory): a check that starts after
`invalidate()` returns never serves a list computed before it, even when a check already in
flight read the database before the write. A cache that fails a read or a write never fails
the check: it answers from the database.
Permission reads always go to the primary, so with read replicas configured, replica lag
never decides a check nor what the cache keeps. A resolver over a `Transaction` reads the
transaction's own view (its uncommitted writes, its snapshot) and never caches it.

A cached check costs three cache reads (three round trips on Redis). The `memory` driver keeps
lists per `Cache` object: in one worker, share one `Cache` between the code that writes grants
and the code that checks them, and use `file`, `shared` or `redis` across workers. A private
SQLite database keeps its lists in the process that holds it.

Resolvers share cached lists — and invalidations — only within one **realm**, derived from the
connection (driver, host, port, database, username; an SQLite file by its path alone, and a
private SQLite database — `:memory:` or the empty name — by its SQL object) and the four table
names: two applications or tenants on one cache never serve each other's permissions while
their connections or tables differ. The realm names a connection as it is spelled, so the same
spelling reaching two servers or files (one SQLite path in two containers, one host name in
two networks) shares a realm — give each tenant its own Cache `prefix` or `realm:` then. When
the code that writes grants reaches the database
under a different spelling than the code that checks them (`localhost` vs `127.0.0.1`, an
admin role vs the application role, a symlink to the SQLite file), its `invalidate()` returns
`true` without reaching the readers — give both the same `realm:`:

```php
$RBAC = new RBAC($Database, Cache: $Cache, realm: 'shop-permissions');
```

*Upgrading from 1.0.9:* lists are stored under a new key layout; entries of the old one expire
within `lifetime`, and `invalidate()` clears them meanwhile (until 1.1.0), so workers still on
the old release during a rolling deploy see the invalidation too. The reverse does not hold:
an `invalidate()` from a 1.0.9 worker does not reach upgraded readers, so upgrade the
processes that write grants first, or expect up to `lifetime` of staleness during the deploy.
Check that the writers and the readers of one permission set derive the same realm (or pass
the same `realm:`) before upgrading — in 1.0.9 every invalidation reached every resolver on
the cache. Permission reads now go to the primary even when read replicas are configured.

## Demo routes

Enable the Authorization demo set in
`projects/Demo/HTTP_Server_CLI/router/router.index.php` (the project loads the `router/` folder via `Router::load()`):

```php :filename="router.index.php";
// add 'Authorization' to the manifest
return [
   'Authorization',
];
```

Then start the demo server:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI start -i
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
`projects/Demo/HTTP_Server_CLI/router/HTTP_Server_CLI-authorization.postman_collection.json`.
It covers successful Scope, Role and Policy requests plus denial cases with valid tokens.

## Testing

Authorization tests are split by layer:

```bash
AI_AGENT=1 bootgly test 22       # API/Security: policies, abilities and RBAC
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

## Reference

### Bootgly\API\Security\Authorization\RBAC

```php
public function __construct (SQLDatabase|Transaction $Database, string $roles = 'roles', string $permissions = 'permissions', string $rolePermissions = 'role_permissions', string $userRoles = 'user_roles', null|Cache $Cache = null, int $lifetime = 300, null|string $realm = null)
```

Creates the resolver. With a `Cache`, permission lists are cached for `$lifetime` seconds,
bound to the resolver's and the identity's generations; `$realm` replaces the connection part
of the realm (the four table names still apply). Over an SQL facade the permission reads go to
the primary; over a `Transaction` they read its own view and are never cached. A database
error denies (`check()` is `false`, `load()` leaves the identity untouched) and is never
cached.

```php
public function invalidate (null|Identity $Identity = null): bool
```

Drops cached permission lists after a role or permission write commits: the identity's, or
every list of the resolver's realm when called without one. Returns `false` when the cache
could neither store a new generation nor drop the old one. A no-op without a cache.
