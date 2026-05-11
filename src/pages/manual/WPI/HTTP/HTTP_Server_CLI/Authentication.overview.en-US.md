# HTTP Server CLI — Authentication

Bootgly HTTP authentication is split into small layers:

- **Request credentials** parse Basic `Authorization` headers without trusting them.
- **Request token metadata** exposes Bearer transport as `$Request->token`.
- **Authentication guards** verify credentials and emit protocol-aware challenges.
- **The `Authentication` middleware** runs one or more guards around protected routes.

Supported mechanisms in HTTP Server CLI are:

| Mechanism | Use case | Transport |
| --- | --- | --- |
| Basic | Compatibility, development, simple protected endpoints | `Authorization: Basic ...` |
| Bearer | Opaque API tokens and access tokens | `Authorization: Bearer <token>` |
| JWT | Signed compact tokens verified by Bootgly | `Authorization: Bearer <jwt>` |
| Session | Browser flows backed by `$Request->Session` | Session cookie |

> Digest authentication is intentionally not part of this first implementation.

## Request credentials

`$Request->authenticate()` parses Basic HTTP `Authorization` credentials and returns a credentials object or `null`:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Authentications\Basic;

$Credentials = $Request->authenticate();

if ($Credentials instanceof Basic) {
   $username = $Credentials->username;
   $password = $Credentials->password;
}
```

The parser does not verify credentials. Verification belongs to guards and application resolvers. Bearer and JWT tokens stay inside `Router\Middlewares`: read `$Request->token` or use the Bearer/JWT guards.

The request also exposes lazy authentication metadata:

```php
$Request->username; // Basic username
$Request->password; // Basic password
$Request->token;    // Bearer token
```

## Response challenges

Use `$Response->authenticate()` to return a Basic `401 Unauthorized` challenge. Bearer challenges are emitted by the Bearer/JWT guards so their definitions stay inside `Router\Middlewares`.

### Basic challenge

```php
use Bootgly\WPI\Modules\HTTP\Server\Response\Authentication\Basic;

return $Response->authenticate(new Basic(
   realm: 'Bootgly Protected Area'
));
```

Emits:

```http
WWW-Authenticate: Basic realm="Bootgly Protected Area"
```

### Bearer challenge

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Bearer;

$Bearer = new Bearer(
   Resolver: fn (string $token): bool => $token === 'demo-bearer-token',
   realm: 'Bootgly API',
   error: 'invalid_token',
   description: 'The access token is missing or invalid.',
   URI: 'https://docs.bootgly.com/manual/WPI/HTTP/HTTP_Server_CLI/Authentication',
   scope: 'demo:read'
);
```

On failure, the guard emits a Bearer `WWW-Authenticate` header with RFC 6750-style attributes.

## Authentication middleware

The middleware receives an `Authenticating` strategy object. The strategy stores guards in evaluation order.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
```

When any guard authenticates successfully, the route handler runs. When all guards fail, the middleware uses the first guard to build the challenge response.

`Authentication` requires at least one guard. Creating it with an empty `Authenticating` strategy throws `InvalidArgumentException` so protected routes cannot fail closed silently because of misconfiguration.

Custom fallback callbacks may render a body or extra headers for denied requests, but the middleware normalizes the returned response to `401 Unauthorized` before and after the callback. This prevents accidental `200 OK` responses on authentication failure.

```php
$Auth = new Authentication(
   Authenticating: $Bearer,
   Fallback: function (Request $Request, Response $Response): Response {
      return $Response(body: 'Custom unauthorized body');
   }
);
```

Authentication guards expose metadata through declared `Request` properties: `$Request->identity` for the authenticated principal and `$Request->claims` for verified token claims. Request doubles should declare those properties too, or use `stdClass` in lightweight tests.

## Hardening notes

- Pair Basic and Bearer routes with `RateLimit` to reduce brute-force attempts.
- Resolver callbacks should compare secrets with `hash_equals()` when checking passwords, API tokens, or shared secrets.
- Place CSRF protection before state-changing authenticated browser routes; token/API routes that do not use cookies can be exempted by route policy.
- JWT is transported as a Bearer token and shares the `$Request->token` hook with opaque Bearer credentials.

## Bearer token guard

Use the Bearer guard for opaque API tokens. The resolver receives the token and the `Request`.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Bearer;

$Bearer = new Authenticating(
   new Bearer(function (string $token, Request $Request): bool {
      return $token === 'demo-bearer-token';
   })
);

yield $Router->route('/auth/bearer', function (Request $Request, Response $Response) {
   return $Response->JSON->send([
      'authorized' => true,
      'guard' => 'Bearer',
   ]);
}, GET, middlewares: [new Authentication($Bearer)]);
```

Try it:

```bash
curl -H 'Authorization: Bearer demo-bearer-token' http://localhost:8082/auth/bearer
```

A resolver may return:

- `false` or `null` to deny.
- `true` to expose the token as `$Request->identity`.
- any custom value to expose that value as `$Request->identity`.

## JWT guard

Bootgly includes a native JWT signer/verifier in `Bootgly\API\Security\JWT`. JWT is not a separate HTTP scheme; it uses Bearer transport. Create the JWT object once at application boot and share it across requests instead of rebuilding the key set per request.

```php
use Bootgly\API\Security\JWT;
use Bootgly\API\Security\JWT\Policies;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\JWT as JWTGuard;

$Token = new JWT('bootgly-demo-authentication-secret');

yield $Router->route('/auth/jwt/issue', function (Request $Request, Response $Response) use ($Token) {
   $token = $Token->sign([
      'sub' => 'demo-user',
      'scope' => 'demo:read',
      'exp' => time() + 3600,
   ]);

   return $Response->JSON->send([
      'token' => $token,
      'authorization' => "Bearer {$token}",
   ]);
}, GET);

$Policies = new Policies(
   issuers: 'https://issuer.bootgly.dev',
   audiences: 'api://bootgly-demo',
   subject: true
);
$JWT = new Authenticating(new JWTGuard($Token, $Policies));

yield $Router->route('/auth/jwt', function (Request $Request, Response $Response) {
   return $Response->JSON->send([
      'authorized' => true,
      'guard' => 'JWT',
   ]);
}, GET, middlewares: [new Authentication($JWT)]);
```

JWT signing throws `RuntimeException` when claims or headers cannot be JSON encoded. JWT verification rejects malformed tokens, unsupported algorithms, unsupported `typ` values, invalid signatures, expired `exp`, future `nbf`, and future `iat`. The HS256 secret must be at least 32 bytes. `Policies` can require exact `iss`, matching `aud`, non-empty `sub`, and non-empty `jti` claims. The guard still returns only a generic Bearer `invalid_token` challenge to the client.

The default `JWT->leeway` is `0`, so time claim verification is strict. Set a small value such as `5` seconds when your servers can have minor clock drift.

For deterministic tests, use `JWT->freeze($timestamp)` and then `JWT->resume()` to return to the wall clock.

When the `sub` claim is present, the guard exposes `Bootgly\API\Security\Identity` as `$Request->identity`. It always exposes verified claims as `$Request->claims` and verified protected headers as `$Request->tokenHeaders`. A space-separated JWT `scope` claim or an array/string `scp` claim is normalized into `Identity->scopes`, so `$Request->identity->check('demo:read')` works for JWT users. When both are present, `scope` takes precedence over `scp`.

### RS256, JWKS, and key rotation

Use `Bootgly\API\Security\JWT\Key` for explicit key ids and `Bootgly\API\Security\JWT\KeysJWKS` for local JWKS documents:

```php
use Bootgly\API\Security\JWT;
use Bootgly\API\Security\JWT\Key;
use Bootgly\API\Security\JWT\KeysJWKS;

$Signer = new JWT($privatePem, 'RS256');
$Signer->select(new Key($privatePem, 'RS256', 'current'));

$Verifier = new JWT($publicPem, 'RS256');
$Verifier->trust(KeysJWKS::parse($jwks, 'RS256'));
```

Always set `kid` when rotating JWT keys. A no-`kid` key set is intentionally single-slot for backwards-compatible tokens; adding a second default key fails loudly instead of letting the verifier guess.

For external OAuth/OIDC issuers, use `Bootgly\API\Security\JWT\Remote` with the provider's `jwks_uri`:

```php
use Bootgly\API\Security\JWT;
use Bootgly\API\Security\JWT\Policies;
use Bootgly\API\Security\JWT\Remote;
use Bootgly\API\Security\JWT\Vault;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\JWT as JWTGuard;

$Remote = new Remote('https://issuer.example/.well-known/jwks.json');
$Remote->cache(new Vault);
$Verifier = new JWT($Remote, 'RS256');

$Policies = new Policies(
   issuers: 'https://issuer.example',
   audiences: 'api://bootgly-demo',
   subject: true
);

$JWT = new Authenticating(new JWTGuard($Verifier, $Policies));
```

`Remote` keeps a process-local `KeySet` cache, can use `Vault` for a shared file-backed JWKS cache across workers on the same filesystem, refreshes the JWKS when a token arrives with an unknown `kid`, and fails closed when the endpoint cannot be fetched, returns a non-2xx status, returns invalid JSON, or returns an invalid JWKS document. Remote JWKS requires HTTPS by default; use `insecure: true` only in tests or controlled local environments. OIDC Discovery and external multi-host cache backends are separate future layers.

### Refresh tokens and `jti` usage

For first-party fullstack apps, keep access tokens short-lived and rotate opaque refresh tokens through `Bootgly\API\Security\JWT\Tokens`:

```php
use Bootgly\API\Security\JWT\Tokens;
use Bootgly\API\Security\JWT\Usage;
use Bootgly\API\Security\JWT\Vault;

$Vault = new Vault;
$Tokens = new Tokens($Vault);

$Issued = $Tokens->mint('user-42', 60 * 60 * 24 * 30, [
   'role' => 'admin',
]);

$Rotated = $Tokens->rotate($Issued->refresh, 60 * 60 * 24 * 30);
if ($Rotated !== null) {
   $Tokens->revoke($Rotated->refresh);
}
```

`Tokens` stores refresh state under token hashes, consumes the old refresh token on rotation, leaves a tombstone for replay detection, and revokes the whole family if a consumed refresh token is reused.

Use `Usage` when access-token `jti` values need persistent revocation or single-use replay protection:

```php
$Usage = new Usage($Vault);
$Verifier->track($Usage);

$Usage->block('access-token-jti', 300);

$SingleUse = new Usage($Vault, single: true);
$Verifier->track($SingleUse);
```

`Usage` runs only after signature, temporal claim validation, and optional `Policies` pass. Single-use mode requires an `exp` claim so the seen `jti` marker expires automatically.

## Basic guard

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Basic as BasicGuard;

$Basic = new Authenticating(
   new BasicGuard(function (string $username, string $password, Request $Request): bool {
      return $username === 'demo' && $password === 'secret';
   })
);

yield $Router->route('/auth/basic', function (Request $Request, Response $Response) {
   return $Response->JSON->send([
      'authorized' => true,
      'guard' => 'Basic',
   ]);
}, GET, middlewares: [new Authentication($Basic)]);
```

Try it:

```bash
curl -u demo:secret http://localhost:8082/auth/basic
```

## Session guard

Use the Session guard when authentication state lives in `$Request->Session`. It checks a session key and exposes the stored value as `$Request->identity`.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Session as SessionGuard;

$Session = new Authenticating(new SessionGuard(key: 'identity'));

yield $Router->route('/account', function ($Request, $Response) {
   return $Response->JSON->send([
      'authorized' => true,
   ]);
}, GET, middlewares: [new Authentication($Session)]);
```

Session failures return a generic `401 Unauthorized` response without a `WWW-Authenticate` header.

## Multiple guards

You can compose guards in order:

```php
$API = new Authenticating(new JWTGuard($Token));
$API->add(new Bearer(function (string $token, Request $Request): bool {
   return $token === 'legacy-api-token';
}));

yield $Router->route('/api/private', $Handler, GET, middlewares: [new Authentication($API)]);
```

In this example Bootgly tries JWT first, then the opaque Bearer token. If both fail, the JWT guard defines the challenge because it is the first guard.

## Demo project

The repository includes working examples in `projects/Demo-HTTP_Server_CLI`:

- `router/HTTP_Server_CLI-authentication.SAPI.php`
- `router/routes/Authentication.routes.php`

Enable that SAPI in `Demo-HTTP_Server_CLI.project.php`, start the demo server, then open `GET /auth` to see runnable commands for Bearer, JWT, and Basic routes.
