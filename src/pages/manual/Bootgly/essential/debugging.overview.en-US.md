# Debugging

Bootgly's debugging layer lives in `Bootgly\ABI\Debugging` — the **first** layer of the framework, so every other layer and every application can reach it without creating a dependency. It has no third-party parts: the value dumper, the throwable report, the development debug page and the backtrace reader are all framework code.

The whole layer is built on one contract — a single static `debug()` method — and on one dispatcher that decides which implementation of that contract should answer for the value you handed it. Most of the time you touch neither: you call the global `dump()`.

## The layer at a glance

| Entity | What it answers for | Documented in |
|---|---|---|
| `Debugging` | The contract — `debug()` plus the `TARGET_CLI` / `TARGET_HTML` render targets | this page |
| `Debugging\Data` | The dispatcher — routes each value to the destination that fits it | this page |
| `Debugging\Backtrace` | "Who called me?" — the call stack as objects and as a rendered string | [Backtrace](/manual/Bootgly/essential/debugging/backtrace/overview/) |
| `Debugging\Data\Vars` | Value dumps — the engine behind `dump()`, `dd()` and the terminal dumper | [Dumper](/manual/CLI/UI/Atoms/Dumper/overview/) |
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
