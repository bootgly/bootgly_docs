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

```bash :toolbar="true";
php bootgly project create
```

Or non-interactively:

```bash :toolbar="true";
php bootgly project create Auth --from=Demo/Auth --yes
```

Then start it:

```bash :toolbar="true";
php bootgly project Demo/Auth start
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

The `tokens` table enforces `UNIQUE (user_id, purpose)`, and `mint()` replaces
that row with one atomic upsert. Two concurrent callers can both receive a
`Token`, but only the value written by the winning upsert remains valid; the
other returned value is already superseded.

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
stable per device, while the validator rotates on every successful use. To
absorb an in-flight duplicate request, `Trust` retains only the immediately
previous validator digest for a fixed, private five-second grace window. An
exact duplicate during that window is declined without authenticating the
request, clearing its cookie or revoking any device. A replay after five
seconds, or any unrelated wrong validator, is the stolen-cookie signature —
the store revokes **every** device of that user and the guard clears the
cookie.

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
$tokens = $this->Tokens->revoke($user);   // pending links die
$trusts = $this->Trust->revoke($user);    // every trusted device dies
if ($tokens === null || $trusts === null) {
   throw new RuntimeException('Credential revocation failed.');
}
$this->Users->confirm($user);             // reset proves mailbox possession
```

### Change password

`POST /password` requires the current password (`Users->check()`), rotates the
hash, revokes tokens and trusted devices, and regenerates the surviving
session — other devices are signed out.

## Configuration

The `auth` config scope lives in `configs/auth/auth.Config.php`:

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

`projects/Demo/Auth/Mails.php` picks one of three delivery lanes from the `mail`
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

Pair sensitive endpoints with per-route rate limits. Give each logical policy an
explicit, stable `scope` so its quota identity survives source moves and rolling
deployments. The optional `key` resolver selects the principal (for example, an
API key, user, or tenant); it is not the policy namespace. Without a custom
resolver, the middleware uses the immutable transport peer:

```php
new RateLimit(limit: 5, window: 60, scope: 'auth-login');
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
- **Atomic supersession** — `UNIQUE (user_id, purpose)` plus one upsert keeps
  exactly one live action token per pair. Concurrent issuers may both receive
  values, but only the winning value remains valid.
- **Remember concurrency** — only the immediately previous validator is
  tolerated, for five seconds inclusive. That duplicate is declined without
  authentication or state changes.
- **Theft detection** — an older replay or any unrelated wrong validator for a
  known remember series reports `Theft` only after every device has been
  successfully revoked. A recorded revocation failure returns `null` instead
  of fabricating an incident.
- **Authoritative verdicts** — credential, action-token and remember-token
  decisions are read from the primary database even when read replicas are
  configured. A store backed by a `Transaction` uses a locking current read on
  MySQL/PostgreSQL. PostgreSQL repeatable-read transactions whose row changed
  can fail with SQLSTATE `40001` — the credential store raises it, so the
  caller can roll back and retry the whole transaction. SQLite uses a zero-row
  writer barrier instead; a stale snapshot raises `database is locked` from
  the credential store and fails the token stores closed. These locks last until
  commit/rollback, so keep security transactions short. A read-only
  transaction cannot acquire them and fails closed.
- **CSRF** — every POST (including logout) carries the masked `_token` from
  the default `Web\App` stack.

## Action-token store upgrade

The `tokens` table must enforce `UNIQUE (user_id, purpose)`. The Auth scaffold
supplies the additive `20260822000200_unique_tokens_user_purpose` migration. It
first keeps the greatest `id` for each existing pair, invalidating the other
links, and then creates the unique index. The original ordinary index remains
in place.

Apply and verify this migration before deploying the matching framework code:
the PostgreSQL and SQLite upserts require that conflict target, and MySQL needs
the constraint to make the user-purpose row authoritative. Old workers can run
temporarily after the migration; under a concurrent issuance one can fail, but
the unique index prevents duplicate live links. Pause action-token writers
while MySQL performs the non-transactional deduplication/index transition. For
rollback, restore and drain the old code first, then optionally roll back the
unique index after no new worker remains.

## Remember-store upgrade

The `trusts` table requires two nullable columns in addition to the current
validator digest: `previous VARCHAR(64)` stores the immediately previous
sha256 digest, and `rotated BIGINT` stores its rotation time in epoch seconds.
The Auth scaffold supplies one additive migration per column. Custom schemas
must add both columns before upgrading the framework code; existing rows need
no backfill.

Deploy the migrations first while the old workers are still running, verify
both columns, then deploy and restart or drain every worker as one cohort.
Mixed old/new workers are unsafe because old workers rotate `verifier` without
refreshing `previous` and `rotated`. For rollback, restore the old code and
drain all new workers before optionally removing the columns.

## Testing

```bash
# bootgly (core)
AI_AGENT=1 ./bootgly test 22   # API/Security — JWT, tokens, trust, users (1.1-1.39)
AI_AGENT=1 ./bootgly test 29   # WPI middlewares — Remember guard, Fallback redirect (11.2-11.3)

# bootgly-web
AI_AGENT=1 ./bootgly test 5    # Auth demo E2E — 20 specs over the real wire
```

The E2E suite drives the real routes: registration → verification link from
the mail sink → logout → login + remember → revival/rotation → tolerated
duplicate → late theft replay → forgot/reset → CSRF negative → rate limit.

## Reference

### `Bootgly\API\Security\Users`

```php
public function __construct (SQLDatabase|Transaction $Database, Password $Password, string $table = 'users', string $key = 'id', string $identifier = 'email', string $secret = 'password', string $verified = 'email_verified_at')
```

Creates the credential store over an ADI SQL connection. Table and column
names are configurable; the defaults match the Auth demo migrations.

All three SQL-backed security stores keep infrastructure trouble distinguishable from
credential facts. The credential store (`Users`) raises a `RuntimeException` carrying the
driver's own cause for any database failure — recorded on its `Operation` or thrown by
the wait — so an outage can never answer as "wrong password", "no such account" or
"already registered". The token stores (`Tokens`, `Trust`) keep the per-method failure
results documented below (`null` where noted) for a failure already recorded on the
`Operation`; an unrecorded `RuntimeException` from `await()` is propagated, and other
infrastructure throwables also remain exceptions — neither can masquerade as a wrong
credential, zero affected rows, or a successfully issued token. An interrupted
`stream_select()` is retried with the same operation until it resolves or its configured
deadline or another failure decides the outcome.

```php
public function enroll (string $email, #[\SensitiveParameter] string $password): null|string
```

Registers credentials and returns the new account id. Returns `null` only on a
duplicate identifier — the unique index is the only gate (no read-then-write
race), and the violation is recognized by the driver's machine code, never
guessed from an arbitrary failure. Inside a `Transaction` the insert is fenced
by a savepoint, so a duplicate cannot abort the caller's unit of work on
PostgreSQL. Any other database failure raises a `RuntimeException`.

```php
public function verify (string $email, #[\SensitiveParameter] string $password): null|Identity
```

Verifies credentials with uniform timing and rehash-on-verify: legacy hashes
upgrade to the current argon2id policy transparently. Returns an `Identity`
with `email` and `verified` claims, or `null`. The rehash persistence is
best-effort: an upgrade write that fails or lands on no row never fails the
login, and is announced through the `Bootgly\ADI\Databases\SQL\Events::Failed`
event (zero cost unless a listener is attached).

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

Creates the single-use action token store. Its table must enforce
`UNIQUE (user_id, purpose)`; see **Action-token store upgrade** above.

```php
public function mint (string $user, Purposes $Purpose, int $ttl = 3600): Token
```

Mints a token and atomically supersedes any live token of the same user +
purpose. Two concurrent calls can both return a `Token`, but only the winning
upsert's value remains valid. The returned `Token->value`
(`selector.verifier`) is the only exposure of the raw secret. Purposes:
`Purposes::Recovery`, `Purposes::Verification`.

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
public function revoke (string $user, null|Purposes $Purpose = null): null|int
```

Drops live tokens for a user, optionally scoped to one purpose. Returns the
affected-row count (`0` means no match) or `null` on a recorded database
failure. Treat `null` as an infrastructure failure; it never proves that
revocation succeeded.

```php
public function sweep (): int
```

Drops expired tokens.

### `Bootgly\API\Security\Tokens\Trust`

```php
public function __construct (SQLDatabase|Transaction $Database, string $table = 'trusts')
```

Creates the trusted-device (remember-me) token store. The table must include
nullable `previous` (64-character sha256 digest) and `rotated` (epoch seconds)
columns; see **Remember-store upgrade** above.

```php
public function issue (string $user, int $ttl = 2592000): Token
```

Starts a new device series.

```php
public function rotate (string $token, int $ttl = 2592000): null|Theft|Token
```

Validates and rotates the validator (the series stays stable). The successful
update atomically records the former digest as `previous`, records `rotated`
and installs the new digest. The exact immediately previous validator is
accepted as a benign duplicate for five seconds inclusive: `rotate()` returns
`null` without authenticating, writing or revoking. A replay after that window,
or any unrelated wrong validator for a known series, returns `Theft` only after
ALL of the user's devices have been successfully revoked. If that revocation
fails, `rotate()` returns `null` rather than fabricating a theft incident. A
concurrent rotation losing the atomic-update race also returns `null`.

```php
public function forget (string $token): bool
```

Drops the presented device series (single-device logout). Requires the
matching validator, so it cannot be used as a revocation oracle.

```php
public function revoke (string $user): null|int
```

Drops all device series of a user (logout everywhere / password change).
Returns the affected-row count (`0` means no match) or `null` on a recorded
database failure.

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
cookie. A benign duplicate inside the five-second grace window is declined
without authenticating or clearing the cookie. On theft the guard clears the
cookie and declines.

```php
public function emit (Token $Token): void
```

Appends the remember `Set-Cookie` for a trusted-device token — login flows
call it after `Trust->issue()`. One canonical cookie owner.

```php
public function forget (): void
```

Appends an expiring `Set-Cookie` (`Max-Age=0`) — logout and theft handling.
