# Redaction

A dump is the fastest way to look inside an object — and the fastest way to print a password, an API key or a token into a terminal, a log or a bug report. `Bootgly\ABI\Debugging\Data\Vars\Redactable` keeps those values out of debug dumps: a class that stores a secret uses the trait and marks the property with `#[Secret]`, and `var_dump()`, `print_r()`, `debug_zval_dump()` and the [Dumper](/manual/CLI/UI/Atoms/Dumper/overview/) (`dump()` / `dd()`) show `[redacted]` in its place.

Three tools cover the three places a secret travels:

| A secret in… | Use | So that |
|---|---|---|
| a property | `use Redactable;` + `#[Secret]` | debug dumps of the object show it masked |
| a parameter | PHP's `#[SensitiveParameter]` | stack traces show a `SensitiveParameterValue` instead |
| a URL in a text | `URI::redact()` | the userinfo (`user:password@`) is dropped before it is shown |

## Mark a class that stores a secret

Use the trait in the class and put `#[Secret]` on each property that **stores** a secret:

```php :filename="app/Gateway.php";
<?php

use Bootgly\ABI\Debugging\Data\Vars\Redactable;
use Bootgly\ABI\Debugging\Data\Vars\Redactable\Secret;

final class Gateway
{
   use Redactable;

   public string $merchant;
   #[Secret]
   private string $key;
   #[Secret(['password', 'token'])]
   public array $options;
   #[Secret(URI: true)]
   public string $webhook;

   public function __construct (string $merchant, string $key, array $options, string $webhook)
   {
      $this->merchant = $merchant;
      $this->key = $key;
      $this->options = $options;
      $this->webhook = $webhook;
   }
}

$Gateway = new Gateway(
   merchant: 'Shop',
   key: 'SYNTH-KEY',
   options: [
      'region' => 'eu',
      'Password' => 'SYNTH-PASSWORD',
      'retry' => ['token' => 'SYNTH-TOKEN', 'times' => 3]
   ],
   webhook: 'https://shop:SYNTH-PASS@hooks.example.com/paid'
);

print_r($Gateway);
```

Without `use Redactable;` the attributes do nothing, and the dump carries every secret:

```text :toolbar="false";
Gateway Object
(
    [merchant] => Shop
    [key:Gateway:private] => SYNTH-KEY
    [options] => Array
        (
            [region] => eu
            [Password] => SYNTH-PASSWORD
            [retry] => Array
                (
                    [token] => SYNTH-TOKEN
                    [times] => 3
                )

        )

    [webhook] => https://shop:SYNTH-PASS@hooks.example.com/paid
)
```

With it, the same call prints:

```text :toolbar="false";
Gateway Object
(
    [merchant] => Shop
    [key:Gateway:private] => [redacted]
    [options] => Array
        (
            [region] => eu
            [Password] => [redacted]
            [retry] => Array
                (
                    [token] => [redacted]
                    [times] => 3
                )

        )

    [webhook] => https://hooks.example.com/paid
)
```

The three forms of the attribute:

- `#[Secret]` masks the **whole value** — `key` becomes `[redacted]`.
- `#[Secret(['password', 'token'])]` masks only the **entries under those keys** of an array value, in any letter case and at any depth — `Password` and the nested `token` go, `region` and `times` stay.
- `#[Secret(URI: true)]` keeps the value and removes the **userinfo of every URL** in a string (or in each string inside an array), through [`URI::redact()`](/manual/ABI/Data/URI/overview/) — the webhook keeps its host and path.

Everything else is shown as PHP would show it: every initialized property under its visibility, in its order. `var_dump()` and `debug_zval_dump()` print the same masked values.

### In `dump()` and `dd()`

The Dumper renders a `Redactable` object like any other object — visibility sigils, `readonly` marks, the value-less rows of uninitialized and virtual properties — with the masked values:

```php :filename="app/Mailer.php";
<?php

use Bootgly\ABI\Debugging\Data\Vars\Redactable;
use Bootgly\ABI\Debugging\Data\Vars\Redactable\Secret;

final class Mailer
{
   use Redactable;

   public string $host = 'smtp.example.com';
   #[Secret]
   protected string $password = 'SYNTH-PASSWORD';
   #[Secret]
   public null|string $token = null;
   public int $port;
   public string $sender {
      get => "orders@{$this->host}";
   }
}

dump(new Mailer);
```

```text :toolbar="false";
 in call number: 1
 1 app/Mailer.php:21
Mailer {
   +host: 'smtp.example.com'
   #password: '[redacted]'
   +token: null
   +port: uninitialized
   +sender: virtual
}
```

`token` is marked but shows `null`: `null` and `''` are never masked, so a dump still tells a secret that is *not configured* from one that is.

Nothing runs until the object is dumped, and the dump changes nothing: no property get hook runs (a hook may create a directory or build a key), the values are copied, and a property that holds a reference keeps its live value.

## Mark the parameters that carry a secret

A property is not the only place a secret sits. While a call is on the stack its arguments are there too, and a stack trace can show them — an exception's trace when `zend.exception_ignore_args` is `0`, the development debug page, a `Backtrace` that captures arguments. PHP's own `#[SensitiveParameter]` attribute replaces such an argument with a `SensitiveParameterValue` object in every trace.

Mark the parameter on **every** frame the secret passes through. The attribute belongs to that function alone: a function the value is handed to, or a method that overrides one with a marked parameter, shows it again unless it is marked too. That includes the closures you hand to the framework — an authentication resolver receives the password the client sent:

```php :filename="app/Login.php";
<?php

namespace Shop;


use SensitiveParameter;

use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Basic;


function verify (string $username, #[SensitiveParameter] string $password): bool
{
   // ... look the user up and check the password hash
}

$Guard = new Basic(
   function (string $username, #[SensitiveParameter] string $password, Request $Request): bool {
      return verify($username, $password);
   },
   realm: 'Shop'
);
```

If `verify()` throws, both frames in its trace show `SensitiveParameterValue` in place of the password. Leave the attribute out of `verify()` and its frame shows the password in clear, even though the closure's frame does not.

> [!NOTE]
> Import the attribute (`use SensitiveParameter;`) in a namespaced file. Without the import, `#[SensitiveParameter]` inside `namespace Shop;` names `Shop\SensitiveParameter`, a class PHP does not know: no error is raised, and the argument is shown in clear.

## Show URLs through `URI::redact()`

A connection string or a git remote often carries its credentials in the URL (`redis://:password@host:6379/0`). Keep the original URL to connect with; whenever one — or any text that may hold one, such as an error message — is shown, logged or printed in a report, pass it through `URI::redact()`:

```php
use Bootgly\ABI\Data\URI;

echo URI::redact('redis://:SYNTH-PASSWORD@127.0.0.1:6379/0');
// redis://127.0.0.1:6379/0
```

`#[Secret(URI: true)]` applies the same method to a property. The rules it follows (every URL in a text, the last `@` of the authority, `file:` URLs) are in the [URI](/manual/ABI/Data/URI/overview/#redact-credentials) manual.

## What is masked, and what is not

`Redactable` works through `__debugInfo()`, the hook PHP's debug dumps call. The channels that call it are covered; the channels that do not, are not:

| Channel | `#[Secret]` value |
|---|---|
| `var_dump()` | masked |
| `print_r()` | masked |
| `debug_zval_dump()` | masked |
| `dump()` / `dd()` / the Dumper | masked |
| `var_export()` | **shown** |
| `(array)` cast, `get_object_vars()` | **shown** |
| `json_encode()`, `serialize()` | **shown** |
| `$Object->property` (a public property read directly) | **shown** |

Until 2.0, the last four rows stay as they are: the attribute protects what is dumped for a human, not what is converted, serialized or read by code. Do not hand an object that holds a secret to `json_encode()` or `var_export()` for display — build the array you want to show instead.

The framework's own classes that store secrets use the trait, so a dump of them is already masked:

- the database, cache, queue, mail and storage configurations (passwords, tokens, a disk's `secret`), and the TLS passphrases of servers and clients;
- the environment configs: the `.env` values a loader holds and every value bound in a config tree;
- JWT secrets and keys, refresh and remember tokens, and the encryption key material;
- the credential header fields of requests and responses — on the server, the HTTP client and the WebSocket client — with the raw header blocks, the cookies, the `Set-Cookie` lines, the Basic password, the Bearer token and the session id;
- the wire buffers of a TCP server or client connection: what it read, what it is writing and what it holds back for the next read or write.

The credential header fields are the names in `HTTP::SECRET_HEADERS`: `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `x-csrf-token`, `x-api-key` and `x-auth-token`. A credential under another header name is yours to mask. Request and response bodies, session data and log contexts hold application data and are not masked: keep a secret out of them, or out of their dump.

## Rules of thumb

- **Mark the property that stores the value.** A virtual property (a `get` hook with no storage) is not part of a dump; marking it masks nothing, and the property behind it is printed in clear. Put `#[Secret]` on the backing property.
- **`null` and `''` stay visible.** That is on purpose — "no password" and "a password" must be told apart in a dump.
- **Your own `__debugInfo()` replaces the redaction.** The trait's method is declared without a return type, so a subclass may still declare its own (untyped, `: array` or `: null|array`) — but then that body is what every dump shows, and the `#[Secret]` marks no longer apply. Mask the secrets in it yourself.
- **Enums cannot use it.** PHP forbids `__debugInfo()` in an enum.
- **The Dumper masks nothing by itself.** It renders what the object's `__debugInfo()` returns; an object without `Redactable` is dumped in full.

## Reference

### Redactable

```php
public function __debugInfo ()
```

Returns the object's properties as PHP's `(array)` cast lists them — mangled names for private and protected ones, values copied — with each `#[Secret]` property passed through `Secret::redact()`. Private and protected properties are covered, and so are the private properties of ancestors. No get hook runs, and uninitialized and virtual properties are absent, as from any `(array)` cast. Declared without a return type, so a subclass can still declare its own `__debugInfo()`, which then replaces this one.

### Redactable\Secret

```php
public const string MASK = '[redacted]';
```

What a dump shows in place of a secret.

```php
public function __construct (array $keys = [], bool $URI = false)
```

The attribute (`#[Attribute(Attribute::TARGET_PROPERTY)]`). With no arguments the whole value is masked. `$keys` lists the array keys to mask inside the value — matched in any letter case, at any depth. `$URI: true` redacts the userinfo of the URLs in a string value (or in each string inside an array) instead of masking it. Both are exposed as read-only properties: `keys` (lowercased) and `URI`.

```php
public function redact (mixed $value): mixed
```

Redacts one value for a dump and never writes it: arrays are rebuilt, so a reference held inside one keeps its live value. Returns `null` and `''` as they are; a string through `URI::redact()` when `URI` is set; `Secret::MASK` when no keys are given; an array with its keyed entries masked (an entry under a key that holds `null` or `''` also stays as it is); any other value unchanged — a string under a keyed `#[Secret]` carries no keys, so it comes back whole.
