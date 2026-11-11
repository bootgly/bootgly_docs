# Cryptography

Bootgly ships two application-layer crypto essentials in `Bootgly\API\Security`, next to
the existing JWT and Authorization components:

- `Encrypter` — authenticated symmetric encryption (AES-256-GCM via OpenSSL) with key
  management and rotation.
- `Password` — argon2id password hashing with a rehash-on-verify policy, and verifiers
  for the hashes of users imported from another stack.

Both are transport-agnostic: they encrypt values and hash passwords for any storage —
database columns, cookies, queue payloads — without touching HTTP concerns.

## Generate a key

An `Encrypter` key is exactly 32 bytes of random material. Generate one and keep it
outside the repository — an environment variable is the canonical place:

```bash :toolbar="true";
php -r "echo base64_encode(random_bytes(32)), PHP_EOL;"
```

```bash
# .env / process environment
BOOTGLY_KEY="wV3n0v9…44-char base64…Q0k="
```

There is no implicit global key: the application always injects the key explicitly, the
same way `JWT` receives its secret.

## Encrypt and decrypt values

Wire the key once during boot and encrypt any string payload:

```php
use Bootgly\API\Security\Encrypter;
use Bootgly\API\Security\Encrypter\Key;

$Encrypter = new Encrypter(
   Key::import((string) getenv('BOOTGLY_KEY'))
);

$envelope = $Encrypter->encrypt('4111 1111 1111 1111');
// v1..EUtRhzNuVLmVSiGJE8yikQd7oVb8sxabiFi8NvNJN99umiGxvcGLkcwo4_6PPdE

$plaintext = $Encrypter->decrypt($envelope);
```

`decrypt()` returns `null` on **any** failure — tampered ciphertext, wrong key, unknown
key id, malformed envelope. No reason is disclosed, so invalid data cannot be probed:

```php
$plaintext = $Encrypter->decrypt($envelope);

if ($plaintext === null) {
   // treat as invalid — re-authenticate, discard, or log
}
```

Every call uses a fresh random IV, so encrypting the same value twice produces different
envelopes. The envelope is an ASCII-safe string in the form `v1.<kid>.<blob>`: a format
version, the key id and a base64url blob carrying IV, ciphertext and authentication tag.

## Bind context with AAD

Additional Authenticated Data ties an envelope to its context without storing that context
inside the ciphertext. A value encrypted for one user fails authentication when replayed
for another:

```php
$envelope = $Encrypter->encrypt($document, AAD: "user-{$id}");

// Later — the same AAD is required to decrypt:
$document = $Encrypter->decrypt($envelope, AAD: "user-{$id}");   // ✅
$stolen = $Encrypter->decrypt($envelope, AAD: 'user-1337');      // null
```

The envelope version and key id segments are always authenticated together with the
caller AAD — swapping segments between envelopes fails authentication.

## Rotate keys

Rotation needs key ids. Give every key a `kid`, build a `Keyring`, and promote a new
primary while the previous keys remain registered for decryption:

```php
use Bootgly\API\Security\Encrypter;
use Bootgly\API\Security\Encrypter\Key;
use Bootgly\API\Security\Encrypter\Keyring;

// Year one:
$Encrypter = new Encrypter(new Key($material2026, 'k2026'));

// Year two — new primary, old key kept for decryption:
$Encrypter->Keyring->rotate(new Key($material2027, 'k2027'));

$new = $Encrypter->encrypt($payload);   // sealed with k2027
$old = $Encrypter->decrypt($legacy);    // k2026 envelopes still decrypt
```

The rotation runbook:

1. Generate a new key with a new id and `rotate()` it in (or construct the `Keyring` with
   the new primary first and the old keys after it).
2. New writes are sealed with the new primary; old envelopes keep decrypting because the
   envelope records which `kid` sealed it.
3. Re-encrypt stored values lazily — decrypt, encrypt, persist — as they are touched.
4. Drop the retired key once no stored envelope references it. From then on, its
   envelopes decrypt to `null`.

Multiple processes can share the ring by injecting the same keys everywhere — the key id
inside the envelope selects the right key deterministically, never by trial decryption.

One operational limit comes with sharing: random 96-bit GCM IVs carry a usage budget
(NIST SP 800-38D) of at most **2^32 encryptions per raw key**, aggregated across every
process, host and key id that shares the same 32-byte material. Rotate keys well before
that bound — for a high-volume shared key, schedule rotation as routine maintenance, not
as an incident response.

## Hash passwords

`Password` hashes with argon2id. The defaults match PHP's own Argon2 defaults (64 MiB
memory, 4 iterations, 1 thread) and the constructor refuses parameters below the OWASP
floor (19 MiB, 2 iterations, 1 thread):

```php
use Bootgly\API\Security\Password;

$Password = new Password;

// Registration:
$hash = $Password->hash($input);
// $argon2id$v=19$m=65536,t=4,p=1$…  — persist this string
```

The PHP build must include Argon2 support (official distribution packages do); the
constructor throws a `RuntimeException` otherwise. There is no silent bcrypt fallback —
one canonical algorithm, predictable hashes on every host.

## Login with rehash-on-verify

Hashing policies evolve: costs get raised, algorithms replaced. `inspect()` verifies the
password **and** applies the policy in one call — when the stored hash is stale, the
result carries a fresh conformant hash to persist:

```php
$Verification = $Password->inspect($input, $stored);

if ($Verification->valid === false) {
   // wrong password — reject the login
}

if ($Verification->hash !== null) {
   // valid, but the stored hash predates the current policy: persist the
   // upgraded hash — only over the hash just verified, so a reset committed
   // meanwhile is never overwritten with the old password
   // UPDATE users SET password = :new WHERE id = :id AND password = :stored
}
```

`Bootgly\API\Security\Users::verify()` does all of this for you — the decoy, the
verify and the compare-and-set upgrade; write it by hand only for a store of your own.

This is also the migration path from legacy storage: `verify()` reads every format PHP's
`password_verify()` reads, so a bcrypt `$2y$…` hash — or the `$2a$…`, `$2b$…` and `$6$…`
hashes other stacks write — still verifies, and `inspect()` upgrades it to argon2id on the
user's next successful login. No batch migration, no forced resets. A format PHP cannot
read needs a verifier — the next section.

## Users imported from another stack

Accounts that come from another stack often carry a hash PHP cannot read: a PBKDF2
string, a salted digest. A **verifier** teaches `Password` that one format, so those users
sign in with the password they already have and leave the legacy format behind on their
first successful sign-in.

**Before you enable a verifier, check the hash column.** The upgrade writes an argon2id
hash over the legacy one, and an argon2id hash of the default policy is 97 characters
long — longer than most legacy formats. A column sized for the old format rejects the
write or, worse, truncates it: the user signs in once and never again. Make the column
`VARCHAR(255)` (or `TEXT`) first.

Then pass the verifier to `Password`. The shipped one reads PBKDF2:

```php
use Bootgly\API\Security\Password;
use Bootgly\API\Security\Password\Verifiers\PBKDF2;
use Bootgly\API\Security\Users;

$Password = new Password(Verifiers: [
   new PBKDF2(prefix: 'v1:', digest: 'sha256', ceiling: 100_000),
]);
$Users = new Users($Database, $Password);

$Identity = $Users->verify($email, $input);
// first sign-in: verified by the verifier, the row now holds an argon2id hash
// next sign-ins: verified natively, nothing is written
```

What happens on a sign-in:

1. Native formats come first: `password_verify()` is asked for every hash. A hash
   `password_hash()` mints (argon2id, argon2i, bcrypt `$2y$…`) is answered by it alone —
   a verifier never sees one, whatever the password, and never sees an empty hash.
2. Only a hash PHP did not accept **and** names no algorithm for goes to the verifiers,
   in the order you gave them: a legacy format, or a `$2a$…` / `$6$…` hash of another
   stack that the password did not open. The first verifier that accepts it ends the
   search.
3. A legacy hash never conforms to the current policy, so `inspect()` returns a fresh
   argon2id hash and `Users::verify()` stores it. The second sign-in finds a native hash.

Set `ceiling` to the highest iteration count present in the imported rows — a stack
that raised its default over the years left more than one. A stored hash asking for more
never verifies (and nothing is reported), so a tampered PBKDF2 row cannot keep a worker
busy.

A row PHP names an algorithm for never reaches a verifier: any row starting
`$argon2i$` or `$argon2id$`, and a `$2y$` row that happens to be exactly 60 bytes long.
If a legacy format's rows start like that, give them a prefix of their own in the table
first; `PBKDF2` refuses a prefix that could produce such a row.

### What the shipped verifier reads

`PBKDF2` reads one layout: `<prefix><iterations>:<salt>:<key>`.

| Part | Rule |
|---|---|
| `prefix` | Whatever marks the rows of the other stack (`v1:`, `pbkdf2:`). Required, never empty, never the start of a native hash |
| `iterations` | Decimal, no sign, no leading zero, from 1 to the ceiling |
| `salt` | Standard Base64 with padding, not empty |
| `key` | Standard Base64 with padding; exactly the digest's output — 32 bytes for `sha256`, 64 for `sha512` |

Anything else answers `false`: another separator (`$`), hex or unpadded Base64, a
truncated or longer key, a row above 1024 bytes. It does not read Django's
`pbkdf2_sha256$…` or passlib's `$pbkdf2-sha256$…` strings. For those — or for a salted
digest — write a verifier.

### Write a verifier

A verifier is one method:

```php
use SensitiveParameter;

use Bootgly\API\Security\Password\Verifier;

final class SaltedDigest implements Verifier
{
   public function verify (#[SensitiveParameter] string $password, #[SensitiveParameter] string $hash): bool
   {
      // legacy rows: sha256$<salt>$<64 hex characters>
      $parts = explode('$', $hash);

      if (
         count($parts) !== 3
         || $parts[0] !== 'sha256'
         || strlen($parts[1]) > 64
         || strlen($parts[2]) !== 64
      ) {
         return false;
      }

      return hash_equals($parts[2], hash('sha256', "{$parts[1]}{$password}"));
   }
}

$Password = new Password(Verifiers: [new SaltedDigest]);
```

It is a security surface, so keep five rules:

- **Answer `true` only for your own format.** Every hash PHP cannot read reaches the
  verifier — including a `$2a$…` or `$6$…` hash that a wrong password did not open.
- **Bound the work.** Cap iterations and lengths before you compute anything.
- **Compare with `hash_equals()`**, never with `===`.
- **Answer `false` on a malformed row; do not throw.** A verifier that throws fails the
  sign-in — it is never a pass. The throwable is reported through `Throwables::notify()`
  and no other verifier is asked for that hash. The HTTP server logs what is reported,
  so an outage of something the verifier calls shows up there; a process of your own (a
  command, a job) sees it only if it registers a reporter.
- **Mark the password and the hash `#[SensitiveParameter]`**, as above, so neither
  appears in the trace of a reported throwable.

The upgrade stores the hash of the password as it was typed at that sign-in. A verifier
that accepts more than one spelling of a password therefore moves the account to the
spelling used — accept exactly one.

Until its first successful sign-in, an imported account verifies at the cost of its legacy
format, not at the cost of argon2id — see the enumeration note in the
[authentication guide](/guide/authentication/overview/).

## Testing

The crypto specs live in the `API/Security` suite:

```bash
AI_AGENT=1 bootgly test 22        # full API/Security suite (JWT, Authorization, crypto)
AI_AGENT=1 bootgly test 22 12     # Encrypter roundtrip
AI_AGENT=1 bootgly test 22 13     # Encrypter tamper rejection
AI_AGENT=1 bootgly test 22 14     # Encrypter AAD binding
AI_AGENT=1 bootgly test 22 15     # Key guards, keyring and rotation
AI_AGENT=1 bootgly test 22 16     # Password hashing
AI_AGENT=1 bootgly test 22 17     # Password rehash policy and migration
AI_AGENT=1 bootgly test 22 53     # crypt-family hashes of other stacks ($2a$, $2b$, $6$)
AI_AGENT=1 bootgly test 22 54     # when a verifier is asked, and when it never is
AI_AGENT=1 bootgly test 22 55     # legacy hash: verify, one rehash, conformant afterwards
AI_AGENT=1 bootgly test 22 56     # PBKDF2 verifier: format, ceiling, key length
AI_AGENT=1 bootgly test 22 57     # a verifier that throws
AI_AGENT=1 bootgly test 22 58     # imported account: sign-in and stored upgrade
AI_AGENT=1 bootgly test 22 59     # additive surface, sensitive parameters, constant-time compare
```

## Reference

### Encrypter

```php
public function __construct (#[\SensitiveParameter] string|Key|Keyring $key)
```

Creates an encrypter. Accepts raw 32-byte key material, a single `Key` or a full
`Keyring`. Throws an `InvalidArgumentException` when raw material is invalid and a
`RuntimeException` when OpenSSL symmetric encryption is unavailable.

```php
public function encrypt (#[\SensitiveParameter] string $plaintext, string $AAD = ''): string
```

Encrypts a payload with the keyring's primary key into a `v1.<kid>.<blob>` envelope. The
envelope prefix and the caller AAD are authenticated together. Environmental failures
throw: `Random\RandomException` when the randomness source fails, `RuntimeException` when
the OpenSSL encryption fails.

```php
public function decrypt (string $ciphertext, string $AAD = ''): null|string
```

Decrypts an envelope. Returns the plaintext, or `null` on any failure — malformed
envelope, unknown key id, tampered data or AAD mismatch. Never throws. Envelopes are
canonical: alternate textual encodings of the same sealed bytes (padding, standard
base64, stray trailing bits) are rejected, so an envelope string can safely be used as
a cache/revocation key.

```php
public private(set) Keyring $Keyring;
```

The encrypter's key collection — publicly readable for rotation
(`$Encrypter->Keyring->rotate(…)`).

### Encrypter\Key

```php
public function __construct (#[\SensitiveParameter] string $material, null|string $id = null)
```

Wraps raw key material. The material must be exactly 32 bytes; the optional id must match
`[A-Za-z0-9_-]` with at most 64 characters (it travels as public envelope metadata).
Throws an `InvalidArgumentException` otherwise, and a `RuntimeException` when OpenSSL is
unavailable. The material is private state — it is redacted from `var_dump`, absent from
JSON and the key refuses both `serialize()` and `unserialize()`. Same-process reflection
(`var_export`, `ReflectionProperty`) cannot be blocked in PHP and is outside this
boundary.

```php
public static function generate (null|string $id = null): self
```

Mints a key with 32 bytes of fresh CSPRNG material. **The generated key is ephemeral by
design**: there is no supported export API for its material, so anything encrypted with
it is undecryptable after the process ends. For persisted data, provision the material
first (`base64_encode(random_bytes(32))`) and construct via `import()`. Throws
`Random\RandomException` (randomness source), `InvalidArgumentException` (invalid id) or
`RuntimeException` (OpenSSL unavailable).

```php
public static function import (#[\SensitiveParameter] string $encoded, null|string $id = null): self
```

Builds a key from base64-encoded material (strict decoding). Throws an
`InvalidArgumentException` on invalid base64, wrong decoded length or an invalid id, and
a `RuntimeException` when OpenSSL is unavailable. A `Key` offers no supported API to read
its material back — when a key must be persisted, encode the raw bytes first
(`base64_encode($material)`) and only then construct the key.

```php
public function seal (#[\SensitiveParameter] string $plaintext, string $AAD): string
```

Low-level AEAD primitive: seals a payload and returns the raw `IV ∥ ciphertext ∥ tag`
bytes. A fresh random 12-byte IV is generated internally on every call — callers cannot
choose or intentionally reuse one (the 2^32 per-key budget above still applies).
`Encrypter` builds its envelopes on top of this method. Environmental failures throw
`Random\RandomException` or `RuntimeException`.

```php
public function open (string $sealed, string $AAD): null|string
```

Low-level AEAD primitive: opens raw `IV ∥ ciphertext ∥ tag` bytes, always authenticating
the full 16-byte tag (truncated tags are structurally impossible). Returns `null` on any
failure.

### Encrypter\Keyring

```php
public function __construct (Key $Key, Key ...$Keys)
```

Creates a keyring. The first key becomes the primary (used to encrypt); every key —
including the primary — is registered for decryption. Throws an
`InvalidArgumentException` on a duplicate id or a second id-less key.

```php
public function add (Key $Key): self
```

Registers a decrypt-only key. Throws an `InvalidArgumentException` on a duplicate id or a
second id-less key.

```php
public function rotate (Key $Key): self
```

Registers the key and promotes it to primary. The previous primary stays registered, so
its envelopes keep decrypting. Rotation requires an explicit key id — an id-less key
throws, and id conflicts throw before the primary changes.

```php
public function resolve (null|string $id): null|Key
```

Resolves the decryption key for an envelope key id: an id maps through the index, `null`
maps to the single id-less slot, unknown ids return `null`.

```php
public private(set) Key $Primary;
```

The key used to encrypt new payloads.

### Password

```php
public function __construct (int $memory = 65536, int $time = 4, int $threads = 1, array $Verifiers = [])
```

Creates a password hasher with argon2id cost parameters (`memory` in KiB). `$Verifiers`
is the list of `Password\Verifier` objects asked, in order, for a stored hash PHP did not
accept and does not recognise. Throws a `RuntimeException` when the PHP build lacks Argon2
support, an `InvalidArgumentException` when a parameter is below the OWASP floor (19456
KiB, 2 iterations, 1 thread) and a `TypeError` when an element of `$Verifiers` does not
implement `Password\Verifier`.

```php
public function hash (#[\SensitiveParameter] string $password): string
```

Hashes a password with the current policy. The returned string embeds the algorithm and
cost parameters.

```php
public function verify (#[\SensitiveParameter] string $password, #[\SensitiveParameter] string $hash): bool
```

Verifies a password against a stored hash. Every format `password_verify()` reads is
tried natively first — hashes minted by other algorithms (legacy bcrypt, argon2i, the
crypt-family hashes of other stacks) still verify. A hash it did not accept and that names
no native algorithm is handed to the configured verifiers, in order; a verifier that
throws makes the answer `false` and is reported through `Throwables::notify()`. An empty
stored hash never verifies.

```php
public function check (string $hash): bool
```

Checks whether a stored hash conforms to the current policy — `false` means the hash
should be regenerated.

```php
public function inspect (#[\SensitiveParameter] string $password, #[\SensitiveParameter] string $hash): Verification
```

Verifies a password and applies the rehash-on-verify policy in one call. Returns a
`Password\Verification` result.

### Password\Verification

```php
public private(set) bool $valid;
```

Whether the password matched the stored hash.

```php
public private(set) null|string $hash;
```

Fresh policy-conformant hash to persist. Filled only when the password is valid and the
stored hash no longer conforms to the current policy.

### Password\Verifier

```php
public function verify (#[SensitiveParameter] string $password, #[SensitiveParameter] string $hash): bool
```

The contract of a legacy-format verifier. Called only for a non-empty stored hash that
`password_verify()` did not accept and that names no native algorithm. Returns `true`
only when the hash is in the verifier's own format and the password matches it.

### Password\Verifiers\PBKDF2

```php
public function __construct (string $prefix, string $digest = 'sha256', int $ceiling = 1_000_000)
```

Creates a verifier for PBKDF2 hashes stored as `<prefix><iterations>:<salt>:<key>`. Throws
an `InvalidArgumentException` when the prefix is empty or could be read by PHP as a
native hash (`$2y$…`, or one carrying the `argon2i$` / `argon2id$` identifier), the
digest is not an HMAC algorithm of the PHP build
(`hash_hmac_algos()`) or the ceiling is below 1.

```php
public function verify (#[SensitiveParameter] string $password, #[SensitiveParameter] string $hash): bool
```

Verifies a password against a stored PBKDF2 hash, comparing in constant time. Returns
`false` — never throws — for a hash of another format, a malformed one, one above the
iteration ceiling or one whose key is not exactly the digest's length.

```php
public private(set) string $prefix;
```

The format prefix that marks a stored hash as this verifier's.

```php
public private(set) string $digest;
```

The HMAC digest of the derivation.

```php
public private(set) int $ceiling;
```

The iteration ceiling — a stored hash asking for more never verifies.
