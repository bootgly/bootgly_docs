# Authentication

Bootgly ships a complete session/cookie authentication scaffold: registration,
e-mail verification, login/logout with an optional remember-me cookie, password
reset and password change — built from small core stores you can also compose
by hand.

The scaffold is the exportable **Auth** demo project. The security logic lives
in the framework:

- `Bootgly\API\Security\Users` — credential store (argon2id via `Password`,
  rehash-on-verify, uniform timing).
- `Bootgly\API\Security\Tokens` — single-use action tokens (selector +
  verifier) for verification and recovery links.
- `Bootgly\API\Security\Tokens\Trust` — rotating trusted-device tokens
  (remember-me) with theft detection.
- `Authentication\Session` + `Authentication\Remember` — the WPI guards that
  bind sessions and the remember cookie to protected routes.

## Scaffold the Auth project

In a Bootgly kit, import the Auth project through the wizard — it appears in
the "Import projects from Platforms" picker:

```bash
php bootgly project create
```

Or non-interactively:

```bash
php bootgly project create Auth --from=Auth --yes
```

Then start it:

```bash
php bootgly project Auth start
```

Open `http://localhost:8087`. A verified demo account ships seeded:
`demo@bootgly.com` / `bootgly-demo`.

With no SMTP configured, every e-mail lands as a file in `storage/mails/*.eml`
— open the newest file and copy the link. Zero setup.

## The flows

### Registration → e-mail verification

`POST /register` validates the input, enrolls the credentials and signs the
user in with a fresh session id:

```php
$user = $this->Users->enroll($email, $password);   // null on duplicate e-mail

$this->notify($user, $email);                      // mints + mails the link

$Request->Session->regenerate();                   // fixation defense
$Request->Session->set('identity', $user);
```

The verification link is a single-use `selector.verifier` token:

```php
$Token = $this->Tokens->mint($user, Purposes::Verification, ttl: 86400);
$link = "{$URL}/verify/" . str_replace('.', '/', $Token->value);
```

`GET /verify/:selector/:verifier` redeems it exactly once and stamps the
account:

```php
$user = $this->Tokens->redeem($token, Purposes::Verification);
if ($user !== null) {
   $this->Users->confirm($user);
}
```

Unverified accounts can still sign in — the account page shows a banner with a
resend button. Adjust to taste.

### Login, logout and remember-me

`POST /login` verifies credentials with uniform timing (unknown e-mails burn a
decoy argon2 hash), regenerates the session id and optionally issues a
trusted-device cookie:

```php
$Identity = $this->Users->verify($email, $password);
if ($Identity === null) {
   // uniform "Invalid credentials." — never reveals which half was wrong
}

$Request->Session->regenerate();
$Request->Session->set('identity', $Identity->id);

if (isSet($Request->fields['remember'])) {
   $this->Remember->emit($this->Trust->issue($Identity->id, Remember::$lifetime));
}
```

The remember cookie value is `selector.validator`: the selector (series) stays
stable per device, the validator rotates on every successful use. A replayed
old validator is the stolen-cookie signature — the store revokes **every**
device of that user and the guard clears the cookie.

Logout drops the presented device series, clears the cookie and destroys the
session:

```php
$this->Trust->forget($Request->Cookies->get(Remember::$name));
$this->Remember->forget();
$Request->Session->flush();
$Request->Session->regenerate();
```

### Password reset

`POST /forgot` answers uniformly whether the e-mail exists or not:

```php
$Identity = $this->Users->fetch($email);
if ($Identity !== null) {
   $Token = $this->Tokens->mint($Identity->id, Purposes::Recovery, ttl: 3600);
   // mail the link — the response below never varies
}

$this->flash($Request, 'If that e-mail exists, we sent a password reset link.');
```

`GET /reset/:selector/:verifier` peeks the token without consuming it
(`Tokens->check()`), so rendering the form does not burn the link. The POST
redeems it and completes the orchestration contract:

```php
$user = $this->Tokens->redeem($token, Purposes::Recovery);

$this->Users->rotate($user, $password);   // new argon2id hash
$this->Tokens->revoke($user);             // pending links die
$this->Trust->revoke($user);              // every trusted device dies
$this->Users->confirm($user);             // reset proves mailbox possession
```

### Change password

`POST /password` requires the current password (`Users->check()`), rotates the
hash, revokes tokens and trusted devices, and regenerates the surviving
session — other devices are signed out.

## Configuration

The `auth` config scope lives in `configs/auth/auth.config.php`:

| Env | Default | Meaning |
|-----|---------|---------|
| `APP_URL` | `http://localhost:8087` | Canonical base for e-mail links |
| `AUTH_VERIFICATION_TTL` | `86400` | Verification link lifetime (seconds) |
| `AUTH_RECOVERY_TTL` | `3600` | Reset link lifetime (seconds) |
| `AUTH_REMEMBER_NAME` | `remember` | Remember cookie name |
| `AUTH_REMEMBER_TTL` | `2592000` | Remember cookie lifetime (seconds) |

<d-block-hint kind="warning">
E-mail links are built ONLY from `APP_URL` — never from the request `Host`
header. Deriving reset links from the Host header enables reset-link
poisoning.
</d-block-hint>

Session and remember cookies ship with `Secure; HttpOnly; SameSite=Lax`
(framework-owned policy — php.ini cannot downgrade it). Browsers treat
`localhost` as a secure context, so the demo works over plain-HTTP localhost.

## Mail setup

`projects/Auth/Mails.php` picks one of three delivery lanes from the `mail`
config scope:

1. **File sink (default)** — `MAIL_HOST` empty: rendered messages land in
   `storage/mails/*.eml`.
2. **Synchronous SMTP** — set `MAIL_HOST`, `MAIL_PORT`, `MAIL_SECURE`,
   `MAIL_USERNAME`, `MAIL_PASSWORD`.
3. **Queued** — additionally `MAIL_QUEUE=1`; drain with
   `php bootgly queue run mail`.

See the **[Mail](/guide/mail/overview/)** guide for the SMTP client itself.

## Protect your own routes

Compose the session guard with the remember guard — the cheap session check
wins, and rotation only runs on session misses. Guests get a real `303` to the
sign-in page:

```php
use Bootgly\API\Security\Tokens\Trust;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Remember;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Session as SessionGuard;

$Trust = new Trust($Response->Database->Database);
$Auth = new Authentication(
   new Authenticating(new SessionGuard, new Remember($Trust)),
   Fallback: function ($Request, $Response) {
      $Request->Session->set('intended', $Request->URI);

      return $Response->redirect('/login', 303);
   }
);

yield $Router->route('/account', new Action(Accounts::class, 'show'), GET, middlewares: [$Auth]);
```

A Fallback result that is already a redirect (3xx + `Location`) is returned
untouched; any other fallback is still normalized to `401 Unauthorized`.

Pair the sensitive endpoints with per-route rate limits — and give every
`RateLimit` a route-scoped key, because instances share one cache namespace:

```php
new RateLimit(limit: 5, window: 60, key: static fn (object $Request): string => "login:{$Request->peer}")
```

## Security notes

- **Session fixation** — `Session->regenerate()` runs on login, registration,
  remember revival and after password change/reset.
- **Enumeration** — login failures and the forgot flow answer uniformly;
  unknown identifiers burn a decoy argon2 hash so timing does not reveal
  account existence.
- **Tokens at rest** — only the sha256 digest of the verifier/validator is
  persisted; the raw secret exists once, in the returned `Token->value`.
- **Single use** — redeeming deletes the row atomically
  (`DELETE … WHERE id AND verifier` + affected-rows gate); concurrent redeems
  lose.
- **Theft detection** — a known remember series with a wrong validator revokes
  every device of the user and reports a `Theft` incident.
- **CSRF** — every POST (including logout) carries the masked `_token` from
  the default `Web\App` stack.

## Testing

```bash
# bootgly (core)
AI_AGENT=1 ./bootgly test 21   # API/Security — tokens, trust, users (1.18-1.21)
AI_AGENT=1 ./bootgly test 28   # WPI middlewares — Remember guard, Fallback redirect (11.2-11.3)

# bootgly-web
AI_AGENT=1 ./bootgly test 5    # Auth demo E2E — 19 specs over the real wire
```

The E2E suite drives the real routes: registration → verification link from
the mail sink → logout → login + remember → revival/rotation → theft replay →
forgot/reset → CSRF negative → rate limit.

## Reference

### `Bootgly\API\Security\Users`

```php
public function __construct (SQLDatabase|Transaction $Database, Password $Password, string $table = 'users', string $key = 'id', string $identifier = 'email', string $secret = 'password', string $verified = 'email_verified_at')
```

Creates the credential store over an ADI SQL connection. Table and column
names are configurable; the defaults match the Auth demo migrations.

```php
public function enroll (string $email, #[\SensitiveParameter] string $password): null|string
```

Registers credentials and returns the new account id. Returns `null` on a
duplicate identifier (the unique index is the only gate — no read-then-write
race) or on database error.

```php
public function verify (string $email, #[\SensitiveParameter] string $password): null|Identity
```

Verifies credentials with uniform timing and rehash-on-verify: legacy hashes
upgrade to the current argon2id policy transparently. Returns an `Identity`
with `email` and `verified` claims, or `null`.

```php
public function check (string $user, #[\SensitiveParameter] string $password): bool
```

Current-password gate by account id — used by the change-password form.

```php
public function fetch (string $email): null|Identity
```

Looks up an account by identifier without credentials (reset-request flow).

```php
public function rotate (string $user, #[\SensitiveParameter] string $password): bool
```

Replaces the stored hash. Callers MUST follow a successful rotation with
`Tokens->revoke()`, `Trust->revoke()` and session regeneration.

```php
public function confirm (string $user): bool
```

Stamps the account e-mail as verified (epoch seconds). Idempotent.

### `Bootgly\API\Security\Tokens`

```php
public function __construct (SQLDatabase|Transaction $Database, string $table = 'tokens')
```

Creates the single-use action token store.

```php
public function mint (string $user, Purposes $Purpose, int $ttl = 3600): Token
```

Mints a token and supersedes any live token of the same user + purpose. The
returned `Token->value` (`selector.verifier`) is the only exposure of the raw
secret. Purposes: `Purposes::Recovery`, `Purposes::Verification`.

```php
public function redeem (string $token, Purposes $Purpose): null|string
```

Consumes a token exactly once and returns the owner user id. Tampered
verifiers never consume the row; expired rows are purged on contact.

```php
public function check (string $token, Purposes $Purpose): bool
```

Validates without consuming — for rendering a reset form from a GET link.

```php
public function revoke (string $user, null|Purposes $Purpose = null): int
```

Drops live tokens for a user, optionally scoped to one purpose.

```php
public function sweep (): int
```

Drops expired tokens.

### `Bootgly\API\Security\Tokens\Trust`

```php
public function __construct (SQLDatabase|Transaction $Database, string $table = 'trusts')
```

Creates the trusted-device (remember-me) token store.

```php
public function issue (string $user, int $ttl = 2592000): Token
```

Starts a new device series.

```php
public function rotate (string $token, int $ttl = 2592000): null|Theft|Token
```

Validates and rotates the validator (the series stays stable). A known series
with a wrong validator revokes ALL of the user's devices and returns `Theft`.
A concurrent rotation losing the atomic-update race returns `null` —
deliberately not `Theft`, so a benign double submit cannot revoke every
session.

```php
public function forget (string $token): bool
```

Drops the presented device series (single-device logout). Requires the
matching validator, so it cannot be used as a revocation oracle.

```php
public function revoke (string $user): int
```

Drops all device series of a user (logout everywhere / password change).

```php
public function sweep (): int
```

Drops expired series.

### `Authentication\Remember` (WPI guard)

```php
public function __construct (Trust $Trust, string $key = 'identity', string $realm = 'Protected area')
```

Persistent-login guard. Static cookie policy (framework-owned):
`Remember::$name` (`remember`), `$lifetime` (2592000), `$path`, `$domain`,
`$secure` (true), `$httpOnly` (true), `$sameSite` (`Lax`).

```php
public function authenticate (object $Request): bool
```

Revives a session from the remember cookie: rotates the trust token,
regenerates the session id, installs the identity and re-emits the rotated
cookie. On theft it clears the cookie and declines.

```php
public function emit (Token $Token): void
```

Appends the remember `Set-Cookie` for a trusted-device token — login flows
call it after `Trust->issue()`. One canonical cookie owner.

```php
public function forget (): void
```

Appends an expiring `Set-Cookie` (`Max-Age=0`) — logout and theft handling.
