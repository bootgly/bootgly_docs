# Backtrace

`Bootgly\ABI\Debugging\Backtrace` answers one question: **who called me?** Constructing it snapshots the PHP call stack at that point, drops the frame that did the constructing, and exposes what is left in two shapes — a list of `Call` objects you can walk, and a rendered, project-relative `file:line` listing you can print.

It is the piece the rest of the layer stands on: the trace above every `dump()`, the file a test snapshot names itself after, the location stamped on a benchmark record. It does not implement the `Debugging` contract — it produces a string, it is not a destination.

## Who called me

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

## Render the stack

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

Read it downwards: `audit()` was called at line 14, inside `validate()`, which was called at line 9, inside `charge()`, called at line 34 by `pay()`, called at line 40 by `checkout()`, called at line 43. The blocks on this page show the output without the ANSI escape sequences a terminal consumes.

Frames PHP cannot attribute to a file — a closure invoked by the engine, a callback run by `array_map()` — contribute an empty line instead of a reference, and the ordinal still counts them, so the numbering skips. When the *nearest* frame is one of those, `dump()` gives up and returns an empty string.

## Walk the frames

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

## Capture arguments

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

## Tune the render

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

## Collect the rendered lines

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

## Reference

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
