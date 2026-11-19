# Debugging

Bootgly's debugging layer lives in `Bootgly\ABI\Debugging` — the **first** layer of the framework, so every other layer and every application can reach it without creating a dependency. It has no third-party parts: the value dumper, the throwable report, the development debug page and the backtrace reader are all framework code.

The whole layer is built on one contract — a single static `debug()` method — and on one dispatcher that decides which implementation of that contract should answer for the value you handed it. Most of the time you touch neither: you call the global `dump()`.

## The layer at a glance

| Entity | What it answers for | Documented in |
|---|---|---|
| `Debugging` | The contract — `debug()` plus the `TARGET_CLI` / `TARGET_HTML` render targets | this page |
| `Debugging\Data` | The dispatcher — routes each value to the destination that fits it | this page |
| `Debugging\Backtrace` | "Who called me?" — the call stack as objects and as a rendered string | [Backtrace](#backtrace) |
| `Debugging\Data\Vars` | Value dumps — the engine behind `dump()`, `dd()` and the terminal dumper | [Dumper](/manual/CLI/UI/Atoms/Dumper/overview/) |
| `Debugging\Data\Vars\Redactable` | Secrets kept out of dumps — the trait and its `#[Secret]` attribute | [Redaction](#redaction) |
| `Debugging\Data\Throwables` (and `Errors`, `Exceptions`) | Throwable reports, the reporter seam, the exit policy | [Error handling](/guide/error-handling/overview/) |
| `Debugging\Page` | The self-contained development debug page | [Error handling](/guide/error-handling/overview/) |
| `Debugging\Shutdown` | Fatal errors, which bypass every PHP handler | [Error handling](/guide/error-handling/overview/) |

> [!NOTE]
> `Backtrace` and `Page` are the two entities of the layer that do **not** implement `Debugging` — they produce a string for someone else to print, instead of being a destination values are sent to.

## Dump a value

`dump()` and `dd()` are global functions registered by the ABI autoboot. There is nothing to import and nothing to configure — they exist as soon as Bootgly is booted:

```php :filename="app/Orders.php";
<?php

function place (array $order): void
{
   dump($order);
}

function checkout (array $cart): void
{
   place($cart);
}

function handle (): void
{
   checkout(['sku' => 'BG-1', 'qty' => 2]);
}

handle();
```

```text :toolbar="false";
 in call number: 1
 1 app/Orders.php:5
 2 app/Orders.php:10
 3 app/Orders.php:15
 4 app/Orders.php:18
array:2 [
   'sku' => 'BG-1'
   'qty' => 2
]
```

Every dump is prefixed by the **call site** — the line that called `dump()` first, then the frames above it, each relative to the project directory. On a terminal the numbers and line references are colorized; the blocks on this page show the same output without the escape sequences.

`dd()` ("dump and die") prints the same thing and then terminates the process — nothing after the call runs. Use it to stop a request or a command exactly where the interesting value is.

The tree below the trace — `array:2 [ … ]`, typed literals, visibility sigils, caps — is produced by the dumper; see the [Dumper](/manual/CLI/UI/Atoms/Dumper/overview/) page for its rendering rules, caps and themes.

> [!TIP]
> A dump prints whatever the object holds — passwords and tokens included. A class that stores a secret keeps it out of every dump with the `Redactable` trait and a `#[Secret]` mark; see [Redaction](#redaction).

## Route by type

The globals go **straight to the dumper**: `dump($Throwable)` renders the throwable's object graph — message, code, raw `trace` array — like any other object.

`Data::debug()` is the type-aware entry point instead. It accepts any number of values, inspects each one independently, and sends it to the destination that knows how to render it:

| Value | Destination |
|---|---|
| an `Error` | `Errors::debug()` |
| an `Exception` | `Exceptions::debug()` |
| any other `Throwable` | `Throwables::debug()` |
| anything else | `Vars::debug()` |

A call with no arguments returns immediately, so `Data::debug(...$optional)` is safe when `$optional` may be empty.

Because each argument is routed on its own, one call can mix kinds — `Data::debug($order, $Throwable)` dumps the array and reports the throwable.

## Your own entry point

`dump()` is a two-line function, and it is worth copying when you want a project-specific entry point (a tagged dump, a dump that only fires for one request, a dump that also reports throwables instead of dumping them).

The part that matters is the **attribution seam**: `Vars::$Backtrace`. A `Backtrace` reports where the function that built it was called from, so constructing one inside your wrapper makes the dump point at the line that called the wrapper — not at framework code:

```php :filename="app/Tracing.php";
<?php

use Bootgly\ABI\Debugging\Backtrace;
use Bootgly\ABI\Debugging\Data;
use Bootgly\ABI\Debugging\Data\Vars;

function trace (mixed ...$data): void
{
   Vars::$Backtrace = new Backtrace;

   Data::debug(...$data);
}

function place (array $order): void
{
   trace($order);
}

function checkout (array $cart): void
{
   place($cart);
}

function handle (): void
{
   checkout(['sku' => 'BG-1', 'qty' => 2]);
}

handle();
```

```text :toolbar="false";
 in call number: 1
 1 app/Tracing.php:16
 2 app/Tracing.php:21
 3 app/Tracing.php:26
 4 app/Tracing.php:29
array:2 [
   'sku' => 'BG-1'
   'qty' => 2
]
```

Frame `1` is line 16 — `trace($order);` inside `place()` — exactly as if `trace()` were `dump()`. Drop the seeding line and the first frame becomes `Debugging/Data.php` itself, because the dumper then builds its own `Backtrace` from inside the framework.

This wrapper is also an upgrade on the global: because it goes through `Data::debug()`, a throwable passed to `trace()` is *reported* rather than dumped as an object.

## Your own destination

Implementing `Debugging` is how a class joins the layer: one static, variadic `debug()`, returning nothing. The interface is also the carrier of the render targets, so implementors inherit `TARGET_CLI` and `TARGET_HTML`:

```php :filename="app/Telemetry.php";
<?php

use Bootgly\ABI\Debugging;

final class Telemetry implements Debugging
{
   public static function debug (mixed ...$data): void
   {
      foreach ($data as $datum) {
         echo '[telemetry] ', get_debug_type($datum), ' ', json_encode($datum), "\n";
      }
   }
}

Telemetry::debug(1200, 'BRL', ['sku' => 'BG-1']);
```

```text :toolbar="false";
[telemetry] int 1200
[telemetry] string "BRL"
[telemetry] array {"sku":"BG-1"}
```

The contract is deliberately minimal — it exists so the layer can identify a debugging destination by `instanceof`, not to impose a rendering model. Your implementation decides whether it prints, returns, buffers or ships.

> [!TIP]
> To send *throwables* somewhere (Sentry-like ingestion, an event bus, a metrics counter) do not implement a new destination — push a closure onto `Throwables::$reporters`, documented in [Error handling](/guide/error-handling/overview/).

## Backtrace

`Bootgly\ABI\Debugging\Backtrace` answers one question: **who called me?** Constructing it snapshots the PHP call stack at that point, drops the frame that did the constructing, and exposes what is left in two shapes — a list of `Call` objects you can walk, and a rendered, project-relative `file:line` listing you can print.

It is the piece the rest of the layer stands on: the trace above every `dump()`, the file a test snapshot names itself after, the location stamped on a benchmark record. It does not implement the `Debugging` contract — it produces a string, it is not a destination.

### Who called me

Build a `Backtrace` inside a function and its `file`, `line` and `dir` describe **the line that called that function** — not the line that built the object. That is what makes it useful for wrappers, helpers and instrumentation:

```php :filename="app/Audit.php";
<?php

use Bootgly\ABI\Code\__String\Path;
use Bootgly\ABI\Debugging\Backtrace;

function audit (): void
{
   $Backtrace = new Backtrace;

   $file = Path::relativize($Backtrace->file, BOOTGLY_WORKING_DIR);

   echo "audit() was called from $file:{$Backtrace->line}\n";
}

function charge (int $cents): void
{
   audit();
}

charge(1200);
```

```text :toolbar="false";
audit() was called from app/Audit.php:17
```

Line 17 is `audit();` inside `charge()`. The three accessors are read-only hooks over the same frame: `file` is the absolute path, `line` its line number, `dir` the `dirname()` of that path. They are absolute — relativize them yourself when you are printing for a human, the way the framework does with `Path::relativize()` against `BOOTGLY_WORKING_DIR`.

> [!NOTE]
> When the stack is too short to have a frame left — `new Backtrace(1)`, or a call at the very top of the entry file — the accessors answer with their empty values (`''`, `0`) instead of failing.

### Render the stack

`dump()` returns the stack already formatted: one `file:line` per line, paths relative to the project directory, numbered, and colorized on a terminal:

```php :filename="app/Billing.php";
<?php

use Bootgly\ABI\Debugging\Backtrace;

final class Ledger
{
   public function charge (int $cents): void
   {
      $this->validate($cents);
   }

   private function validate (int $cents): void
   {
      $this->audit();
   }

   private function audit (): void
   {
      echo new Backtrace()->dump();
   }
}

final class Checkout
{
   public Ledger $Ledger;

   public function __construct (Ledger $Ledger)
   {
      $this->Ledger = $Ledger;
   }

   public function pay (int $cents): void
   {
      $this->Ledger->charge($cents);
   }
}

function checkout (int $cents): void
{
   new Checkout(new Ledger)->pay($cents);
}

checkout(1200);
```

```text :toolbar="false";
 1 app/Billing.php:14
 2 app/Billing.php:9
 3 app/Billing.php:34
 4 app/Billing.php:40
 5 app/Billing.php:43
```

Read it downwards: `audit()` was called at line 14, inside `validate()`, which was called at line 9, inside `charge()`, called at line 34 by `pay()`, called at line 40 by `checkout()`, called at line 43.

Frames PHP cannot attribute to a file — a closure invoked by the engine, a callback run by `array_map()` — contribute an empty line instead of a reference, and the ordinal still counts them, so the numbering skips. When the *nearest* frame is one of those, `dump()` gives up and returns an empty string.

### Walk the frames

`calls` is the same stack as data — an array of `Backtrace\Call` objects, ordered from the nearest caller outwards. Pass a `limit` to the constructor when you only need the top of the stack; it is PHP's own `debug_backtrace()` limit, so it counts the dropped frame too — `new Backtrace(3)` leaves you two:

```php :filename="app/Frames.php";
<?php

use Bootgly\ABI\Code\__String\Path;
use Bootgly\ABI\Debugging\Backtrace;

final class Ledger
{
   public function charge (int $cents): void
   {
      $Backtrace = new Backtrace(3);

      foreach ($Backtrace->calls as $Call) {
         $file = Path::relativize($Call->file ?? '', BOOTGLY_WORKING_DIR);

         echo $Call->class, $Call->type, $Call->function, "() at $file:{$Call->line}\n";
      }
   }
}

function checkout (int $cents): void
{
   new Ledger()->charge($cents);
}

checkout(1200);
```

```text :toolbar="false";
Ledger->charge() at app/Frames.php:22
checkout() at app/Frames.php:25
```

A `Call` is a thin, typed view of one `debug_backtrace()` frame: `function` always holds the called function or method name, `class` and `type` (`->` or `::`) are `null` for plain functions, and `file` and `line` are `null` for frames PHP cannot attribute to source.

> [!WARNING]
> A negative `limit` leaves the object unusable — the constructor returns before assigning `calls`, so reading it raises *"Typed property `Backtrace::$calls` must not be accessed before initialization"*. Use `0` (the default) for an unlimited stack.

### Capture arguments

Frames arrive without arguments: `Backtrace::$options` defaults to `DEBUG_BACKTRACE_IGNORE_ARGS`, which keeps the snapshot cheap and keeps secrets out of it. Clear that flag — before constructing — and `Call::$args` is filled with the arguments each frame was called with:

```php :filename="app/Args.php";
<?php

use Bootgly\ABI\Debugging\Backtrace;

Backtrace::$options = DEBUG_BACKTRACE_PROVIDE_OBJECT;

function charge (int $cents, string $currency): void
{
   $Backtrace = new Backtrace(2);

   foreach ($Backtrace->calls as $Call) {
      $args = implode(', ', array_map(json_encode(...), $Call->args ?? []));

      echo "{$Call->function}($args)\n";
   }
}

charge(1200, 'BRL');
```

```text :toolbar="false";
charge(1200, "BRL")
```

With the default options `args` is `null` for every frame, so guard it (`$Call->args ?? []`) in code that must work under both settings.

> [!CAUTION]
> Captured arguments contain whatever your application passes around — passwords, tokens, payloads. Turn the flag on for a targeted investigation, not as a default, and never render those frames to a client.

### Tune the render

Two statics shape what `dump()` writes. `$traces` is the frame budget: the render stops **after** the budget is exceeded, so it emits `$traces + 1` lines (the default `4` gives five). `$counter` toggles the leading ordinal:

```php :filename="app/Tuning.php";
<?php

use Bootgly\ABI\Debugging\Backtrace;

Backtrace::$traces = 2;
Backtrace::$counter = false;

function audit (): void
{
   echo new Backtrace()->dump();
}

function charge (int $cents): void
{
   audit();
}

function checkout (): void
{
   charge(1200);
}

checkout();
```

```text :toolbar="false";
app/Tuning.php:15
app/Tuning.php:20
app/Tuning.php:23
```

Both are static — they are process-wide settings, not per-instance ones. The framework relies on that: `bootgly test` turns `$counter` off around assertion output and restores it afterwards.

> [!IMPORTANT]
> The dumper writes to `$traces` too. Every `dump()` / `dd()` assigns `Backtrace::$traces = Vars::$traces - 1` (so `3` by default), permanently. If you tune `$traces` for your own `dump()` calls, set `Vars::$traces` instead, or reassign `Backtrace::$traces` after the dump that clobbered it.

### Collect the rendered lines

`dump()` also keeps every line it rendered in `backtraces`, so a caller that needs the frames as data — a log record, a test report, a structured payload — does not have to parse the returned blob:

```php :filename="app/Lines.php";
<?php

use Bootgly\ABI\Debugging\Backtrace;

function audit (): void
{
   $Backtrace = new Backtrace(3);

   $Backtrace->dump();

   var_dump($Backtrace->backtraces);
}

function charge (int $cents): void
{
   audit();
}

charge(1200);
```

```text :toolbar="false";
array(2) {
  [0]=>
  string(41) " 1 app/Lines.php:16"
  [1]=>
  string(41) " 2 app/Lines.php:19"
}
```

Each entry is the rendered line, escape sequences included — 41 bytes for 19 visible characters here. The property is publicly readable but privately written (`private(set)`), and it **accumulates**: calling `dump()` twice on the same instance appends a second copy of every line. It is empty until the first `dump()`.

## Redaction

A dump is the fastest way to look inside an object — and the fastest way to print a password, an API key or a token into a terminal, a log or a bug report. `Bootgly\ABI\Debugging\Data\Vars\Redactable` keeps those values out of debug dumps: a class that stores a secret uses the trait and marks the property with `#[Secret]`, and `var_dump()`, `print_r()`, `debug_zval_dump()` and the [Dumper](/manual/CLI/UI/Atoms/Dumper/overview/) (`dump()` / `dd()`) show `[redacted]` in its place.

Three tools cover the three places a secret travels:

| A secret in… | Use | So that |
|---|---|---|
| a property | `use Redactable;` + `#[Secret]` | debug dumps of the object show it masked |
| a parameter | PHP's `#[SensitiveParameter]` | stack traces show a `SensitiveParameterValue` instead |
| a URL in a text | `URI::redact()` | the userinfo (`user:password@`) is dropped before it is shown |

### Mark a class that stores a secret

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

#### In `dump()` and `dd()`

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

### Mark the parameters that carry a secret

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

### Show URLs through `URI::redact()`

A connection string or a git remote often carries its credentials in the URL (`redis://:password@host:6379/0`). Keep the original URL to connect with; whenever one — or any text that may hold one, such as an error message — is shown, logged or printed in a report, pass it through `URI::redact()`:

```php
use Bootgly\ABI\Data\URI;

echo URI::redact('redis://:SYNTH-PASSWORD@127.0.0.1:6379/0');
// redis://127.0.0.1:6379/0
```

`#[Secret(URI: true)]` applies the same method to a property. The rules it follows (every URL in a text, the last `@` of the authority, `file:` URLs) are in the [URI](/manual/ABI/Data/URI/overview/#redact-credentials) manual.

### What is masked, and what is not

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
- the wire buffers of a connection — TCP server and client, UDP client, the HTTP client's response bytes and HTTP/2 session, the HTTP/2 server decoder and its HPACK table: what it read, what it is writing and what it holds back for the next read or write.

The credential header fields are the names in `HTTP::SECRET_HEADERS`: `authorization`, `proxy-authorization`, `cookie`, `set-cookie`, `x-csrf-token`, `x-api-key` and `x-auth-token`. A credential under another header name is yours to mask. Request and response bodies, session data and log contexts hold application data and are not masked: keep a secret out of them, or out of their dump. The decoded header fields of an open HTTP/2 stream are not masked either.

### Rules of thumb

- **Mark the property that stores the value.** A virtual property (a `get` hook with no storage) is not part of a dump; marking it masks nothing, and the property behind it is printed in clear. Put `#[Secret]` on the backing property.
- **`null` and `''` stay visible.** That is on purpose — "no password" and "a password" must be told apart in a dump.
- **Your own `__debugInfo()` replaces the redaction.** The trait's method is declared without a return type, so a subclass may still declare its own (untyped, `: array` or `: null|array`) — but then that body is what every dump shows, and the `#[Secret]` marks no longer apply. Mask the secrets in it yourself.
- **Enums cannot use it.** PHP forbids `__debugInfo()` in an enum.
- **The Dumper masks nothing by itself.** It renders what the object's `__debugInfo()` returns; an object without `Redactable` is dumped in full.

## Reference

### Debugging

```php
public const int TARGET_CLI = 1;
```

Render target for ANSI terminal output. Consumed by `Throwables::render()` — see [Error handling](/guide/error-handling/overview/).

```php
public const int TARGET_HTML = 2;
```

Render target for escaped HTML output. Consumed by `Throwables::render()` — see [Error handling](/guide/error-handling/overview/).

```php
public static function debug (mixed ...$data): void
```

The layer contract. Every debugging destination (`Data`, `Vars`, `Throwables`, `Errors`, `Exceptions`, `Shutdown`) implements it; implementing it is what makes a class a debugging destination.

### Debugging\Data

```php
public static function debug (mixed ...$x): void
```

The dispatcher. Routes each argument independently: `Error` to `Errors`, `Exception` to `Exceptions`, any other `Throwable` to `Throwables`, everything else to `Vars`. Returns immediately when called with no arguments.

### Debugging\Shutdown

```php
public static bool $debug = true;
```

Config. Master switch for the shutdown hook. Set it to `false` and a fatal error is neither synthesized into an `ErrorException` nor reported — the buffered throwables are not flushed either. `Shutdown::collect()` is documented in [Error handling](/guide/error-handling/overview/).

### Globals

```php
function dump (mixed ...$vars): void
```

Seeds `Vars::$Backtrace` with a fresh `Backtrace` (so the trace points at the caller) and hands every value to `Vars::debug()` — the dumper directly, not the `Data` dispatcher, so a throwable is dumped as an object rather than reported. Registered by the ABI autoboot only when no `dump()` already exists.

```php
function dd (mixed ...$vars): void
```

Same as `dump()`, plus `Vars::$exit = true` and `Vars::$debug = true` — the process terminates after the dump. Registered by the ABI autoboot only when no `dd()` already exists.

### Backtrace

```php
public static int $options = DEBUG_BACKTRACE_IGNORE_ARGS;
```

Config. The flags handed to PHP's `debug_backtrace()` when an instance is constructed. Clear `DEBUG_BACKTRACE_IGNORE_ARGS` to populate `Call::$args`. Read at construction time, so assign it before `new Backtrace`.

```php
public static int $traces = 4;
```

Config. Frame budget for `dump()`. The check happens after a frame is written, so the render emits up to `$traces + 1` lines. Overwritten by `Vars::debug()` with `Vars::$traces - 1` on every `dump()` / `dd()`.

```php
public static bool $counter = true;
```

Config. Whether `dump()` prefixes each line with its ordinal.

```php
public array $calls;
```

Data. The captured stack as `array<int,Backtrace\Call>`, nearest caller first, with the frame that constructed the `Backtrace` already removed. Left uninitialized when the constructor is given a negative `limit`.

```php
public string $dir { get; }
```

Metadata. `dirname()` of the nearest caller's file; `''` when there is no such frame.

```php
public string $file { get; }
```

Metadata. Absolute path of the nearest caller's file; `''` when there is no such frame.

```php
public int $line { get; }
```

Metadata. Line number inside that file; `0` when there is no such frame.

```php
public private(set) array $backtraces;
```

Metadata. The `file:line` strings produced by `dump()`, escape sequences included. Empty until the first `dump()`, and appended to by each subsequent one.

```php
public function __construct (int $limit = 0)
```

Captures the stack. `$limit` is PHP's `debug_backtrace()` limit and counts the frame that is then dropped, so `new Backtrace(3)` yields two `Call` objects; `0` means unlimited. A negative `$limit` returns early and leaves the instance unusable.

```php
public function dump (): string
```

Renders the captured stack as `file:line` lines — paths relativized against `BOOTGLY_WORKING_DIR`, ANSI-colorized under the `cli` SAPI, wrapped in `<small>` otherwise — and records each line in `backtraces`. Returns `''` when the nearest frame has no file or line.

### Backtrace\Call

```php
public null|string $file;
```

Data. Absolute path of the file the call was made from; `null` when PHP cannot attribute the frame to a file.

```php
public null|int $line;
```

Data. Line number of the call; `null` under the same conditions as `file`.

```php
public string $function;
```

Data. Name of the called function or method. Always present.

```php
public null|string $class;
```

Data. Declaring class of the called method; `null` for plain functions.

```php
public null|string $type;
```

Data. `->` for an instance call, `::` for a static one; `null` for plain functions.

```php
public null|array $args;
```

Data. Arguments the call received, or `null` while `Backtrace::$options` keeps `DEBUG_BACKTRACE_IGNORE_ARGS` (the default).

```php
public function __construct (array $call)
```

Wraps one raw `debug_backtrace()` frame. Constructed by `Backtrace` — you read `Call` objects, you do not build them.

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
