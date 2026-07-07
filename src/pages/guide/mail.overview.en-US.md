# Mail

Bootgly ships a native, dependency-free SMTP client at `Bootgly\ACI\Mail`. It speaks
RFC 5321 directly over PHP streams — implicit TLS or STARTTLS via `ext-openssl`, AUTH
PLAIN / LOGIN / XOAUTH2, per-phase timeouts and a typed failure taxonomy — with no Composer
package involved.

> [!NOTE]
> Compose with the `Mail\Message` builder (alternative text/HTML bodies, attachments,
> inline images, template-based HTML) — or pass a **raw RFC 5322 string** with an explicit
> envelope. Deliver synchronously or queue the send for a background worker via
> `WPI\Services\Mail::dispatch()`. All of it ships today.

## Send a mail

```php
use Bootgly\ACI\Mail;
use Bootgly\ACI\Mail\Message;

$Mail = new Mail([
   'host' => 'smtp.example.com',
   'port' => 587,
   'secure' => 'starttls',
   'username' => 'no-reply@example.com',
   'password' => getenv('MAIL_PASSWORD')
]);

$Message = new Message();
$Message->from = 'Bootgly <no-reply@example.com>';
$Message->to = ['user@example.net', 'Ana <ana@example.net>'];
$Message->bcc = 'audit@example.com';       // envelope-only — never rendered
$Message->subject = 'Welcome! 🎉';         // non-ASCII → RFC 2047 automatically
$Message->text = 'Plain-text version.';
$Message->html = '<p>Rich <strong>HTML</strong> version.</p>';

$Receipt = $Mail->send($Message);          // envelope derived from the Message

echo $Receipt->reply;   // e.g. "2.0.0 OK: queued as 4Fx19a"
```

`send()` connects lazily (TCP → TLS → EHLO → AUTH) on the first call, runs the
`MAIL FROM` / `RCPT TO` / `DATA` transaction and returns a `Receipt` — the server's
acceptance evidence. Every failure throws; you never get a silent `false`.

A few things the client does for you on every send:

- **EOL normalization + dot-stuffing** — the raw data may use `\n`, `\r\n` or a mix; it is
  normalized to CRLF and leading dots are escaped per RFC 5321 §4.5.2.
- **Command injection guard** — CR/LF/NUL in any envelope value is rejected locally.
- **SIZE pre-flight** — a payload larger than the server's advertised `SIZE` fails locally
  (code 552) before a single transaction byte is sent.
- **All-or-nothing recipients** — if any `RCPT TO` is refused, the transaction is aborted
  (`RSET`) and the exception is thrown *before* `DATA`; no partial audience is ever mailed.

> [!IMPORTANT]
> With a `Message`, both bodies ship as `multipart/alternative` and the envelope is derived
> automatically: `from` → sender, `to`+`cc`+`bcc` → recipients (deduplicated). `bcc`
> reaches the envelope only — it never appears in the rendered message.

### Raw RFC 5322 form

The explicit-envelope form still works — compose the headers and body yourself:

```php
$Receipt = $Mail->send(
   sender: 'no-reply@example.com',      // envelope addresses: bare user@host
   recipients: ['user@example.net'],
   data: $rfc5322
);
```

Here `sender`/`recipients` steer the SMTP routing while `From:`/`To:`/`Subject:` live in
the raw `data` headers. An empty `sender` (`''`) sends the null reverse-path `<>` used by
bounce messages.

> [!WARNING]
> Raw payloads must already be **7-bit safe**. The transaction fails closed — locally,
> before `MAIL` — when the payload carries 8-bit bytes and the server does not advertise
> `8BITMIME`, or when the envelope/headers carry non-ASCII and it does not advertise
> `SMTPUTF8`. A `Message` render is always 7-bit ASCII (RFC 2047 headers, quoted-printable
> or base64 bodies) and never hits these guards.

## Attach files

```php
use Bootgly\ABI\IO\FS\File;

$Message->attach(new File($path));                                        // name + MIME type detected
$Message->attach($bytes, name: 'report.pdf', type: 'application/pdf');   // raw bytes
```

`attach()` returns the `Message` for chaining. A `File` source detects its name (basename)
and MIME type; raw bytes require a `name` and fall back to `application/octet-stream`.
Attachments ship base64-encoded inside `multipart/mixed`.

## Embed inline images

```php
$cid = $Message->embed(new File('logo.png'));      // returns "cid:…"
$Message->html = "<p>Hello!</p><img src=\"{$cid}\">";
```

`embed()` adds a `multipart/related` inline part with a `Content-ID` and returns the
`cid:` URI to drop into the HTML body. Pass `cid:` explicitly for a stable id across
renders. The full nesting — `mixed { related { alternative { text, html }, embeds… },
attachments… }` — collapses automatically: each level exists only when its parts do.

## Template the body

The HTML body can come from a named template rendered by the
[ABI template engine](/guide/templates/overview/) — same directives, cache and
inheritance as web views:

```php
use Bootgly\ACI\Mail\Message;

Message::$path = BOOTGLY_PROJECT->path . 'mails/';   // once, at boot

$Message = new Message();
$Message->from = 'no-reply@example.com';
$Message->to = 'user@example.net';
$Message->subject = 'Welcome!';
$Message->text = 'Welcome, Ana!';          // plain-text alternative (manual)
$Message->template = 'welcome';            // mails/welcome.template.php
$Message->data = ['name' => 'Ana'];
```

At `render()` (or `send()`) the template output becomes the `html` body — composing with
`text`, attachments and embeds exactly like a hand-written HTML body. Template names are
jailed inside `Message::$path` (`''` falls back to the engine's current `Template::$path`),
and the web default layout never wraps an email — use an explicit `@extends` in the mail
template for a shared mail layout.

## Deterministic renders

`id` (Message-ID), `date` and `boundary` are generated on the first `render()` and
persisted back to the properties, so rendering is idempotent. Set them explicitly for
byte-exact output (snapshots, audits):

```php
$Message->id = 'token@example.com';
$Message->date = 'Mon, 06 Jul 2026 20:00:00 +0000';
$Message->boundary = 'seed';
```

The rendered output is always pure 7-bit ASCII: non-ASCII headers become RFC 2047
encoded-words, non-ASCII text bodies quoted-printable and binary parts wrapped base64 —
regardless of what the server advertises.

## Queue the delivery

SMTP is slow for a request handler. `Bootgly\WPI\Services\Mail` is the web-platform mail
service: boot it once, then `dispatch()` enqueues the message through the shared
[`WPI\Queues`](/guide/queues/overview/) messenger (a quick local write or one Redis
round-trip) and the SMTP delivery runs in the queue worker:

```php
use Bootgly\WPI\Queues;
use Bootgly\WPI\Services\Mail;

// once, at boot (HTTP server AND the queue worker bootstrap)
Queues::boot(['driver' => 'redis', 'host' => '127.0.0.1']);   // the platform queue store
Mail::boot(['host' => 'smtp.example.com', 'secure' => 'starttls', 'username' => '…', 'password' => '…']);

// in a route handler
Mail::dispatch($Message);            // → `mail` queue; returns the Job
Mail::send($Message);                // synchronous alternative, same shared mailer
```

Run the consumer exactly like any other queue:

```sh
bootgly queue run mail
```

The shipped `WPI\Services\Mail\Courier` handler rebuilds the message in the worker
(`Message::import()` of the Job payload) and sends it through the shared mailer. A
delivery failure propagates to the queue Worker, which **retries with the configured
backoff** (`attempts`, `base`, `backoff` queue config) and buries the job as a dead-letter
once attempts are exhausted — see [Queues](/guide/queues/overview/).

> [!IMPORTANT]
> The worker process must call `Queues::boot()` and `Mail::boot()` too (the Job carries
> the message, never the SMTP credentials). Everything a queued message carries —
> `template` + `data` included — must be serializable; the template itself is rendered in
> the worker.

## Choose the TLS mode

```php
'secure' => 'starttls',   // default — plaintext connect, upgrade via STARTTLS (port 587)
'secure' => 'tls',        // implicit TLS from the first byte (SMTPS, port 465)
'secure' => 'none',       // plaintext (local relays only)
```

Certificate verification is **on by default** (`'verify' => true`) against the system CA
bundle; point `'cafile'` at a custom bundle or `'peer'` at the expected certificate name
when they differ from `host`. There is no silent downgrade: under `starttls`, a server that
does not advertise or refuses STARTTLS throws a `CryptoException` — the client never
continues in plaintext. An unknown `secure` value throws immediately.

## Authenticate

Credentials select the mechanism automatically:

```php
// PLAIN (or LOGIN, whichever the server advertises):
'username' => 'no-reply@example.com',
'password' => getenv('MAIL_PASSWORD'),

// XOAUTH2 (Gmail/Microsoft — a non-empty token selects it):
'username' => 'no-reply@example.com',
'token' => $bearerToken,   // acquiring/refreshing the OAuth token is up to you
```

With no credentials configured, no AUTH is attempted. With credentials over an
**unencrypted** session (`'secure' => 'none'`), the client refuses locally — before any
credential byte touches the wire — unless you explicitly opt in with `'insecure' => true`.

## Handle failures and retries

Everything the client throws implements `Bootgly\ACI\Mail\Exceptioning`, so one `catch`
covers the whole subsystem. The two reply-driven exceptions map straight to retry policy:

```php
use Bootgly\ACI\Mail\Exceptions\PermanentException;
use Bootgly\ACI\Mail\Exceptions\TransientException;

try {
   $Receipt = $Mail->send($sender, $recipients, $data);
}
catch (TransientException $e) {
   // 4xx — the server refused temporarily: retry later (with backoff)
   retry($e->getCode(), $e->status);   // e.g. 450, '4.2.0'
}
catch (PermanentException $e) {
   // 5xx — retrying the same send will not succeed
   giveUp($e->getCode(), $e->status);  // e.g. 550, '5.1.1'
}
```

| Exception | Thrown for |
|---|---|
| `TransientException` | any 4xx reply (421 busy, 450 mailbox busy, …) — retryable; carries `$status` |
| `PermanentException` | any 5xx reply + local pre-flights with 5xx semantics (SIZE, SMTPUTF8) — carries `$status` |
| `AuthenticationException` | AUTH rejected (535), mechanism not advertised, or plaintext AUTH without opt-in |
| `CryptoException` | TLS negotiation/verification failure; STARTTLS missing/refused under `starttls` |
| `ConnectionException` | connect refusal, reply timeout, unexpected EOF |
| `ProtocolException` | the server violated the SMTP grammar |

On success, the `Receipt` value object carries the delivery evidence for your logs:
`code` (250), `status` (`2.0.0`), `reply` (the server text, usually with a queue id),
`recipients` (accepted envelope) and `size` (bytes transmitted).

## Reuse the connection

The session stays open across sends — ideal for a worker draining a mail queue:

```php
$Mail->connect();                              // optional pre-flight (TCP+TLS+EHLO+AUTH)

foreach ($outbox as $mail) {
   $Mail->send($mail->sender, $mail->recipients, $mail->data);
}

$Mail->disconnect();                           // best-effort QUIT (also runs on destruction)
```

A refused transaction (`Transient`/`PermanentException`) is aborted with `RSET` and the
session **stays connected and reusable** — only transport-level failures tear it down.
`connect()` is idempotent; a boot-time call doubles as a credential check.

## Trace the wire

For debugging, hook the wire dialog. Credentials are redacted (`AUTH PLAIN ****`) and the
DATA payload is traced as a byte count only — a trace log never leaks secrets or bodies:

```php
'trace' => function (string $direction, string $line): void {
   error_log("{$direction} {$line}");   // "> EHLO app.example.com" / "< 250-STARTTLS"
}
```

## Timeouts

Blocking with absolute per-phase deadlines (RFC 5321 §4.5.3.2 allows far larger values;
the defaults are pragmatic):

| Key | Default | Bounds |
|---|---|---|
| `timeout` | `10.0` s | TCP connect (and the implicit-TLS handshake) |
| `wait` | `30.0` s | every command reply: greeting, EHLO, AUTH, MAIL, RCPT, DATA-init |
| `drain` | `120.0` s | the final reply after the `.` terminator (server-side processing) |

## Reference

```php
public function __construct (array|Config $config = [])
```

`Bootgly\ACI\Mail` — builds the service from a config array (keys below) or a prepared
`Mail\Config`. Invalid `secure` values throw `InvalidArgumentException`.

```php
public function connect (): bool
```

Pre-flights the SMTP session — TCP connect, TLS (implicit or STARTTLS), EHLO capability
discovery and AUTH — without sending mail. Idempotent while connected. Throws a
`Mail\Exceptioning` exception on any failure.

```php
public function send (string|Message $sender, array|string $recipients = [], string $data = ''): Receipt
```

Sends a mail, lazily connecting when needed. Single-argument form: a `Message` — envelope
and data are derived from it (passing `$recipients`/`$data` alongside throws). Explicit
form: a bare envelope sender (may be `''` — null reverse-path), one recipient or a list,
and the raw RFC 5322 `$data`. Returns the `Receipt`; throws on every failure (see the
exception table).

```php
public function disconnect (): bool
```

Closes the session with a best-effort `QUIT`. Idempotent; also runs on destruction.

### Message

```php
public function attach (File|string $source, string $name = '', string $type = ''): self
```

Adds a regular attachment. A `File` detects name/MIME type; raw bytes require `$name` and
default to `application/octet-stream`. Returns the `Message` for chaining.

```php
public function embed (File|string $source, string $name = '', string $type = '', string $cid = ''): string
```

Adds an inline (`multipart/related`) part with a `Content-ID` and returns the `cid:` URI
for the HTML body. `$cid` = `''` generates a random one; pass it for stable renders.

```php
public function render (): string
```

Renders the full raw RFC 5322 message — CRLF line endings, 7-bit safe. When `template` is
set, first renders it (inside `Message::$path`) into the `html` body. Generates and
persists unset `id`/`date`/`boundary` (idempotent). Throws `InvalidArgumentException` on a
missing `from`, invalid addresses, header injection or reserved custom header names, and
`TemplateException` on template problems.

```php
public function export (): array
```

Exports the message as a scalars-only array — the shape a queued Job payload carries
across processes (attachments and embeds included, binary contents intact).

```php
public static function import (array $data): self
```

Rebuilds a `Message` from an `export()` array. Unknown keys are ignored and malformed
values fall back to the property defaults.

| Property | Meaning |
|---|---|
| `Message::$path` | static — base directory for mail templates (`''` = engine `Template::$path`) |
| `from`, `reply` | `a@b` or `Name <a@b>` (`reply` = Reply-To; `''` omits it) |
| `to`, `cc`, `bcc` | one address or a list; `bcc` is envelope-only |
| `subject`, `text`, `html` | content — non-ASCII is encoded automatically |
| `template`, `data` | mail template name + variables — rendered into `html` at render() |
| `id`, `date`, `boundary` | deterministic overrides (`''` = generated + persisted) |
| `headers` | extra `name => value` headers (structural names rejected) |
| `$Attachments`, `$Embeds` | read-only `Attachment` lists |
| `$sender`, `$recipients` | read-only derived envelope (virtual) |

### WPI\Services\Mail (web service)

```php
public static function boot (array|Config $config = []): Messenger
```

Builds and stores the shared `Mail\Messenger` over an `ACI\Mail` mailer. Call it in the
HTTP server boot **and** in the queue worker bootstrap (it also wires the `Courier` to the
shared mailer). The queue store is configured separately — once — via `WPI\Queues::boot()`.

```php
public static function send (string|Message $sender, array|string $recipients = [], string $data = ''): Receipt
```

Sends synchronously through the shared messenger (lazily created on first use). Same
signature and behavior as `ACI\Mail::send()`.

```php
public static function dispatch (Message $Message, string $queue = 'mail'): Job
```

Exports the message into a Job handled by `WPI\Services\Mail\Courier` and enqueues it
through the shared `WPI\Queues` messenger — the SMTP delivery happens in the
`bootgly queue run` worker, never on the HTTP event loop.

### Config keys

| Key | Default | Meaning |
|---|---|---|
| `host` | `'127.0.0.1'` | SMTP server host |
| `port` | `587` | SMTP server port (465 typical for `tls`) |
| `secure` | `'starttls'` | `'none'` \| `'tls'` \| `'starttls'` — invalid values throw |
| `verify` | `true` | TLS certificate verification (peer + peer name) |
| `cafile` | `''` | CA bundle path (`''` = system default) |
| `peer` | `''` | expected certificate name / SNI (`''` = `host`) |
| `username` | `''` | AUTH identity (`''` disables AUTH unless `token` is set) |
| `password` | `''` | AUTH PLAIN/LOGIN secret |
| `token` | `''` | XOAUTH2 bearer token (non-empty selects XOAUTH2) |
| `domain` | `''` | EHLO client name (`''` = machine hostname) |
| `timeout` | `10.0` | TCP connect timeout, seconds |
| `wait` | `30.0` | per-reply timeout, seconds |
| `drain` | `120.0` | final DATA-reply timeout, seconds |
| `insecure` | `false` | allow AUTH over an unencrypted session (explicit opt-in) |
| `trace` | `null` | `function (string $direction, string $line): void` wire hook |

### Value objects and internals

- **Receipt** — `Mail\Receipt`: read-only `$code`, `$status`, `$reply`, `$recipients`,
  `$size`. Returned by `send()`.
- **Reply** — `Mail\Reply`: read-only `$code`, `$status`, `$lines`; virtual `$text`. The
  parsed form of every server reply (also surfaced by the trace hook).
- **Exceptions** — `Mail\Exceptioning` (catch-all interface) and the six concrete classes
  under `Mail\Exceptions\*` (table above); `Transient`/`PermanentException` expose the
  enhanced status via `$status`.
- **Message units** — `Message\Address` (parsed `email`+`name` value object),
  `Message\Attachment` (name/type/contents/disposition/cid) and `Message\Encoder`
  (RFC 2047 encoded-words, quoted-printable, wrapped base64, header folding).
- **SMTP_Client** — `Mail\SMTP_Client`: the blocking transport behind the facade, with its
  protocol units `SMTP_Client\Decoder` (incremental reply parser), `Encoder` (command
  writer + dot-stuffing), `Extensions` (EHLO capabilities) and `Mechanisms` (AUTH blobs).
- **Web units** — `WPI\Services\Mail` (the platform mail service),
  `WPI\Services\Mail\Messenger` (the shared mailer adapter, dispatching through
  `WPI\Queues`) and `WPI\Services\Mail\Courier` (the queue `Handler` that delivers
  exported messages in the worker).
- **Layering** — `ACI\Mail` depends on nothing above the ABI: raw PHP streams for the
  socket, `ext-openssl` for TLS (templates come from the ABI engine). Console commands,
  queue workers and web handlers can all use it; the queue facade lives in the WPI.

## Next references

- **[Queues](/guide/queues/overview/)** — the retry/backoff, drivers and worker behind
  `Mail::dispatch()` and the `Courier` handler.
- **[Templates](/guide/templates/overview/)** — the ABI engine behind `Message->template`
  (directives, inheritance, compilation cache).
