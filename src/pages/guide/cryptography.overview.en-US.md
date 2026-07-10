# Cryptography

Bootgly ships two application-layer crypto essentials in `Bootgly\API\Security`, next to
the existing JWT and Authorization components:

- `Encrypter` — authenticated symmetric encryption (AES-256-GCM via OpenSSL) with key
  management and rotation.
- `Password` — argon2id password hashing with a rehash-on-verify policy.

Both are transport-agnostic: they encrypt values and hash passwords for any storage —
database columns, cookies, queue payloads — without touching HTTP concerns.

## Generate a key

An `Encrypter` key is exactly 32 bytes of random material. Generate one and keep it
outside the repository — an environment variable is the canonical place:

```bash
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
   // valid, but the stored hash predates the current policy:
   // persist the upgraded hash transparently
   $Users->update($id, password: $Verification->hash);
}
```

This is also the migration path from legacy storage: verification is format-agnostic, so
a bcrypt `$2y$…` hash still verifies — and `inspect()` upgrades it to argon2id on the
user's next successful login. No batch migration, no forced resets.

## Testing

The crypto specs live in the `API/Security` suite:

```bash
AI_AGENT=1 bootgly test 21        # full API/Security suite (JWT, Authorization, crypto)
AI_AGENT=1 bootgly test 21 12     # Encrypter roundtrip
AI_AGENT=1 bootgly test 21 13     # Encrypter tamper rejection
AI_AGENT=1 bootgly test 21 14     # Encrypter AAD binding
AI_AGENT=1 bootgly test 21 15     # Key guards, keyring and rotation
AI_AGENT=1 bootgly test 21 16     # Password hashing
AI_AGENT=1 bootgly test 21 17     # Password rehash policy and migration
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
public function __construct (int $memory = 65536, int $time = 4, int $threads = 1)
```

Creates a password hasher with argon2id cost parameters (`memory` in KiB). Throws a
`RuntimeException` when the PHP build lacks Argon2 support and an
`InvalidArgumentException` when a parameter is below the OWASP floor (19456 KiB, 2
iterations, 1 thread).

```php
public function hash (#[\SensitiveParameter] string $password): string
```

Hashes a password with the current policy. The returned string embeds the algorithm and
cost parameters.

```php
public function verify (#[\SensitiveParameter] string $password, string $hash): bool
```

Verifies a password against a stored hash. Format-agnostic — hashes minted by other
algorithms (e.g. legacy bcrypt) still verify. An empty stored hash never verifies.

```php
public function check (string $hash): bool
```

Checks whether a stored hash conforms to the current policy — `false` means the hash
should be regenerated.

```php
public function inspect (#[\SensitiveParameter] string $password, string $hash): Verification
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
