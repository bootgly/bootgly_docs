# Commands

Commands are the entry point of the Bootgly console: `bootgly <command> [arguments] [--options]`. The framework ships its own commands (`demo`, `test`, `help`, ...) and your project can register more — they all go through the same router, the same argument parser and the same middleware pipeline.

## Creating a command

A command is a class extending `Bootgly\CLI\Command` that defines a `$name`, a `$description` and a `run()` method:

```php
<?php
namespace projects\commands;

use const Bootgly\CLI;
use Bootgly\CLI\Command;


class GreetCommand extends Command
{
   // * Data
   public string $name = 'greet';
   public string $description = 'Greet someone from the terminal';


   public function run (array $arguments = [], array $options = []): bool
   {
      $name = $arguments[0] ?? 'world';
      $greeting = "Hello, $name!";

      if (isSet($options['shout'])) {
         $greeting = strtoupper($greeting);
      }

      CLI->Terminal->Output->write($greeting . PHP_EOL);

      return true;
   }
}
```

`run()` returns `true` on success and `false` on failure — a `false` makes the `bootgly` process exit with status `1`.

## Registering commands

The CLI boot looks for a `projects/Bootgly/commands/@.php` file in your working directory. It must return an array of command instances:

```php
<?php
// projects/Bootgly/commands/@.php

return [
   new \projects\commands\GreetCommand,
];
```

That is all — the command is now routed:

```bash
bootgly greet Rodrigo --shout
# HELLO, RODRIGO!
```

Running `bootgly` with no command (or an unknown one) shows the help screen listing every registered command with its description.

## Arguments and options

The router parses the raw command line into three buckets before calling `run()`:

- **arguments** — positional words after the command name: `bootgly greet Rodrigo` → `$arguments = ['Rodrigo']`;
- **long options** — `--name=value` becomes `$options['name'] = 'value'`; a bare `--flag` becomes `$options['flag'] = true`;
- **short options** — `-abc` is split per letter and counted: `$options = ['a' => 1, 'b' => 1, 'c' => 1]`; repeating a letter increments it (`-vvv` → `['v' => 3]`).

### Verbosity

The `v` short option is reserved: the router consumes it, caps it at `3` and stores it on the command before running:

```php
public function run (array $arguments = [], array $options = []): bool
{
   if ($this->verbosity >= 2) {
      // ... print extra diagnostics ...
   }

   return true;
}
```

## Middlewares

Every command execution flows through a middleware pipeline — a good place for cross-cutting concerns like timing, logging or output footers. A middleware implements `Bootgly\CLI\Commands\Middleware`:

```php
<?php
namespace projects\commands;

use Closure;
use Bootgly\CLI\Command;
use Bootgly\CLI\Commands\Middleware;


class TimerMiddleware implements Middleware
{
   public function process (Command $Command, array $arguments, array $options, Closure $next): bool
   {
      $start = microtime(true);

      $status = $next($Command, $arguments, $options);

      $elapsed = round((microtime(true) - $start) * 1000, 2);
      echo "\n({$elapsed} ms)\n";

      return $status;
   }
}
```

Register it on the commands manager before routing (e.g. in your `@.php` bootstrap):

```php
use const Bootgly\CLI;

CLI->Commands->Middlewares->pipe(new TimerMiddleware);
```

Middlewares wrap the command like an onion: the first piped middleware is the outermost layer, and calling `$next(...)` hands control to the next layer (ultimately, the command's `run()`).

## See it live

The `bootgly demo` command — the one powering the [CLI showcase](/manual/CLI/showcase) — is a regular `Command` subclass exactly like the ones above.

## Reference

The commands manager lives at `CLI->Commands` (`Bootgly\CLI\Commands`):

```php
public function register (Command $Command, null|object $Script = null, null|object $Context = null): bool
```

Registers a command instance under a script namespace (the framework uses this for its own commands and for the ones returned by your `@.php`). When a `$Context` object is given, it is injected into the command.

```php
public function route (null|array $route = null, null|object $From = null): bool
```

Parses the command line (or the given `$route` array of `argv`-style strings, for programmatic routing), finds the matching command — falling back to `help` when the command is unknown — extracts the verbosity, and runs the command through the middleware pipeline. Returns the command's boolean status.

```php
public function find (null|string $command, null|object $From = null, null|string $input = null): Command|null
```

Finds a registered command by name, optionally scoped to the `$From` script namespace. Returns `null` when there is no match.

```php
public function list (null|object $From = null): array
```

Lists the commands registered by `$From`, or every registered command grouped by script namespace when called without arguments.

```php
public function autoload (string $location, null|object $Context = null, null|object $Script = null): bool
```

Loads commands from a `commands/@.php` map file inside `$location` (relative to the Bootgly root), where each entry is a file returning a `Command` instance. Used to lazily bootstrap command sets from other locations.

The middleware pipeline lives at `CLI->Commands->Middlewares` (`Bootgly\CLI\Commands\Middlewares`):

```php
public function pipe (Middleware ...$middlewares): self
```

Appends one or more middlewares to the end of the pipeline. `prepend()` and `append()` insert a single middleware at the start or end, respectively.

```php
public function process (Command $Command, array $arguments, array $options, Closure $handler): bool
```

Runs the command through the registered middlewares, with `$handler` as the innermost layer. Called by `route()` — you rarely call it yourself.
