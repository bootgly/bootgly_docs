# Authentication

The WebSocket upgrade is a regular HTTP `GET`, so the HTTP Server CLI's authentication **guards**
work on it unchanged. Pass guards to `configure(guards: [...])`; the handshake runs them before
sending `101`, and if **every** guard denies, the connection is rejected with `401` and never
upgrades. The first guard to pass wins.

## Guard a handshake with a Bearer token

A guard reads the upgrade request (the `Authorization` header, cookies, …) and returns `true` to
admit the connection. `Guard::extract()` pulls a `Bearer` token out of the request for you:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating\Guard;

$TokenGuard = new class extends Guard {
   public function authenticate (object $Request): bool
   {
      if ($this->extract($Request) !== 'secret') {   // Authorization: Bearer secret
         return false;
      }

      $this->expose($Request, 'identity', 'user-42');
      $this->expose($Request, 'claims', ['role' => 'admin']);

      return true;
   }
   public function challenge (object $Response): object
   {
      return $this->announce($Response, $this->format('Bearer', ['realm' => 'WS']));
   }
};

$WS->configure(host: '0.0.0.0', port: 8083, workers: 1, guards: [$TokenGuard]);
```

A client without a valid token gets `HTTP/1.1 401 Unauthorized` at the handshake; a valid one gets
`HTTP/1.1 101 Switching Protocols` and the socket upgrades.

## Guard a handshake with Basic credentials

The same handshake adapter parses `Authorization: Basic …`, so the built-in `Basic` guard works
unchanged — resolve the username/password to an identity (or `false` to deny):

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Basic;

$BasicGuard = new Basic(
   Resolver: function (string $user, string $pass): mixed {
      return ($user === 'alice' && $pass === 'secret') ? 'alice' : false;
   },
   realm: 'WS'
);

$WS->configure(host: '0.0.0.0', port: 8083, workers: 1, guards: [$BasicGuard]);
```

## Read the identity and claims

Whatever a guard exposes with `Guard::expose()` is copied to the `Session` after a successful
handshake — `identity`, `claims` and `tokenHeaders` — so your handlers know who is connected:

```php
->on(Events::Connected, function ($Session) {
   $Session->identity;   // e.g. 'user-42' (or null)
   $Session->claims;     // e.g. ['role' => 'admin'] (or null)
})
```

## Challenge on denial

When every guard denies, the `401` carries a `WWW-Authenticate` header built from the first guard
whose `challenge()` announces one (Bearer/JWT/custom schemes via `announce()` + `format()`). This
lets a client learn the expected scheme/realm. `Basic` has no application-readable WebSocket retry
path, so it falls back to a plain `401`.

## Custom upgrade gate (Origin check)

Beyond guards, `Events::HandshakeRequested` runs an arbitrary predicate on the upgrade request and
**rejects with `403` when it returns false** — the canonical place to enforce an `Origin` allowlist
(the WebSocket defense against cross-site hijacking, CSWSH):

```php
$WS->on(Events::HandshakeRequested, function ($Request) {
   return $Request->Header->get('Origin') === 'https://app.example';
});
```

The predicate receives the same `Handshake\Request` adapter as guards (headers, token, Basic parser),
runs after any guards, and a `false` return ends the upgrade with `HTTP/1.1 403 Forbidden`. Use it
for Origin allowlists, per-IP rate limits, or any custom admission rule.

## Reference

### The handshake request adapter

Each guard receives a `Handshake\Request` adapter exposing the upgrade request three ways, so the
HTTP guard contract works without change:

```php
$Request->Header->get('Authorization');   // case-insensitive header bag
$Request->headers['authorization'];         // lowercased header map
$Request->token;                            // pre-resolved Bearer token slot ('' by default)
$Request->authenticate();                   // parses `Authorization: Basic …` -> Basic credentials
```

For cookie or custom-header schemes, read `$Request->Header->get('<name>')` inside `authenticate()`.

> Guards run at handshake time, before any `Session` exists — session-backed guards are not
> supported (such a guard simply denies). See the HTTP Server CLI **Authentication** page for the
> full guard contract.
