# Auto-TLS

Bootgly's HTTP Server can manage its own HTTPS certificate. Pass a typed `AutoTLS` config as the `secure` option and the server obtains a certificate from **Let's Encrypt** (ACME v2, RFC 8555) by itself — no certbot, no cron, no third-party package:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\AutoTLS;

$Server = new HTTP_Server_CLI;
$Server->configure(
   host: '0.0.0.0',
   port: 443,
   workers: 8,
   secure: new AutoTLS(
      domains: ['example.com', 'www.example.com'],
      email: 'admin@example.com'
   ),
   user: 'www-data',
   group: 'www-data'
);
```

That is the whole setup. `secure` still accepts the raw SSL context array (`local_cert` / `local_pk`) exactly as before — `AutoTLS` is the managed alternative.

## What happens on first boot

1. **The server binds immediately** on a temporary self-signed certificate — no waiting on the CA, no downtime window.
2. A background **certifier** process registers an ACME account, places the order and answers the `HTTP-01` challenge natively.
3. The issued certificate is installed and **hot-swapped** into every live worker — new TLS handshakes present the real certificate, without a restart.
4. A supervision tick in the master **renews automatically** (~30 days before expiry, checked every 12h, lock-guarded), hot-swapping again on success.

If the CA is unreachable, the server keeps serving on its current certificate and retries with backoff (60s → 5m → 15m → 1h → 6h). Issuance failures never take the server down.

**Startup is a barrier.** The server does not advertise itself as started until *every* worker has bound its socket, activated the certificate and acknowledged it. A worker that cannot activate its credential refuses traffic and exits, and the launcher reports the failure with a non-zero exit — you never get a half-started server silently listening with the wrong identity.

## Port 80

`HTTP-01` validation always arrives over plain HTTP on port 80, so the server needs it answered. Auto-TLS covers the three deployments:

- **Only the 443 server (default)** — the master binds port 80 before dropping privileges and keeps a tiny **helper** process on it: ACME tokens are answered and every other request is redirected to HTTPS (`308`), like Caddy does.
- **A Bootgly server already on port 80** — opt it in explicitly by pointing it at the shared token directory (the route is never reserved implicitly, so existing user routes or another ACME client keep working):

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\ACME_Client\Challenges;

Challenges::$path = '/path/to/storage/security/tls/challenges/';
```

  With it set, that instance answers `/.well-known/acme-challenge/` before any middleware or route — nothing you configure can break a validation.
- **Another server (nginx, etc.) on port 80** — proxy `/.well-known/acme-challenge/` to this host; Auto-TLS logs a notice and keeps working through the proxy.

## Renewal and the reload fallback

Renewal is automatic — nothing to schedule. The swap applies to **new** handshakes; established connections keep the old certificate until they reconnect.

A swap only counts as applied once **every live worker acknowledges the exact certificate it activated**. Each worker copies the validated bytes into a private artifact, probes it and reports back; the master keeps the generation pending until all of them converge. If they do not, the master retries and then falls back on its own to a bounded graceful reload. You can also force a full re-read from disk at any time:

```bash
bootgly project reload   # SIGUSR2 — graceful re-exec, re-reads the secure config
```

## Staging and local testing

Let's Encrypt rate-limits production issuance. Use the staging environment while wiring things up:

```php
secure: new AutoTLS(
   domains: ['example.com'],
   email: 'admin@example.com',
   staging: true
)
```

Staging certificates are stored apart (`certificates/example.com-staging-{identity}/`) and never satisfy production checks.

For fully local end-to-end testing, point Auto-TLS at [Pebble](https://github.com/letsencrypt/pebble) (Let's Encrypt's own test CA):

```bash
docker run --rm --net=host -e PEBBLE_VA_NOSLEEP=1 \
   ghcr.io/letsencrypt/pebble -config test/config/pebble-config.json
```

```php
secure: new AutoTLS(
   domains: ['localhost'],
   email: 'dev@example.com',
   directory: 'https://localhost:14000/dir',   // Pebble
   port: 5002,        // Pebble validates HTTP-01 on 5002 (unprivileged)
   verify: false      // Pebble uses its own test root
)
```

The repository ships this exact scenario as an opt-in suite: `BOOTGLY_ACME_E2E=1 bootgly test`.

## Storage

Everything lives under `storage/security/tls/` (overridable via `path:`), plain PEM guarded by file permissions — inspectable with `openssl x509` and portable to other tooling:

```text
storage/security/tls/
├── account/{ca-host}-{service}/    ← account key (0600) + registered URL —
│                                      one per ACME SERVICE (full directory URL)
├── certificates/{domain}-{id128}/  ← one store per configuration identity
│   ├── bootstrap.pem               ← temporary self-signed (with the SAN set)
│   ├── current.json                ← atomic manifest (the commit point)
│   └── {issued-ts}/                ← versioned: fullchain.pem, certificate.pem,
│                                      chain.pem, key.pem (0600)
├── challenges/                     ← HTTP-01 tokens (shared across processes)
└── renew.lock                      ← cross-process renewal lock
```

The `{id128}` suffix (128 bits of the identity digest) and the manifest carry a **configuration identity** (the sorted, deduplicated SAN set plus the ACME directory URL): adding a domain or switching CAs never silently reuses a certificate issued for another configuration — and the readable domain label is truncated, so even a maximal 253-byte hostname never overflows filesystem name limits. Installs are validated before the manifest commit — certificate/key match, every chain block parsed, validity window and SAN coverage; the credential snapshot is all-or-nothing (a certificate whose key went missing is never served).

Wildcards are not supported — they require the `DNS-01` challenge (deferred; `HTTP-01` only for now). Use explicit SANs: `domains: ['example.com', 'www.example.com', 'api.example.com']`.

## Reference

### AutoTLS

```php
public function __construct (
   array $domains,
   string $email,
   bool $staging = false,
   null|string $directory = null,
   null|string $path = null,
   int $threshold = 30,
   int $bits = 2048,
   bool $agreement = true,
   int $port = 80,
   bool $verify = true,
   array $options = []
)
```

Validates the whole configuration at construction (`InvalidArgumentException` on any invalid value — misconfiguration never reaches the CA). `domains` is the SAN set; `domains[0]` is the Common Name and names the certificate directory. `directory` overrides `staging`. `threshold` is the renew-when-fewer-days-remain trigger (1–89). `bits` sizes the RSA account and certificate keys (≥ 2048). `agreement` is the RFC 8555 Terms-of-Service agreement — configuring Auto-TLS implies it (the Caddy model), so it defaults to `true` and passing `false` throws. `port` is the HTTP-01 validation port the CA connects to. `verify` controls TLS peer verification toward the ACME directory. `options` are extra SSL context options merged into the server socket context (explicit options win over managed values).

```php
public function check (): bool
```

Whether an installed (non-bootstrap) certificate exists and has not expired.

```php
public function forge (): void
```

Ensures a servable certificate exists: reuses the current one while unexpired, else generates the temporary self-signed bootstrap. The server calls it during `configure()`.

```php
public function renew (): bool
```

Threshold-, lock- and backoff-guarded issuance: registers the account when needed, orders, installs. Returns `true` when a new certificate was installed (the hot-swap signal), `false` when nothing was due or another process holds the renewal lock. Failures record the backoff and are rethrown as `Exceptioning` (the ACME exception marker).

```php
public private(set) array $context
```

The SSL stream-context options for the server socket — the installed certificate when committed, else the bootstrap. Never cached: the underlying manifest changes under a live server.

### HTTP Server

```php
public function configure (string $host, int $port, int $workers, null|array|AutoTLS $secure = null, ...): self
```

`secure` accepts the raw SSL context array (as before) or an `AutoTLS` instance — the server then owns the certificate lifecycle (bootstrap, background issuance, hot swap, renewal).

```php
public function swap (array $secure): bool
```

Low-level hot swap (inherited from `TCP_Server_CLI`): replaces the SSL context options of the live listening socket. Subsequent handshakes present the new credentials; established connections keep the old ones. Auto-TLS drives it automatically — direct use is only needed for custom certificate tooling.
