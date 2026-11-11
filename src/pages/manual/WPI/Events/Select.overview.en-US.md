# Select

`Select` is the event loop every server worker runs: it waits on the worker's sockets, resumes
its Fibers and runs its timers. Since v1.3.0 it also owns the worker's **signals**: a handler you
register on the loop runs on the loop, between two callbacks, when the process receives the
signal.

This page covers that capability. For the loop's timers, see the
[Timers guide](/guide/timers/overview/).

## Run a handler when a signal arrives

The loop offers signals as an optional capability, `Bootgly\ACI\Events\Signalling`, so check for
it before use. Register from code that runs in the worker — a route handler, for example —
because each worker is a process with its own loop:

```php
use Bootgly\ACI\Events\Signalling;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;

$Loop = HTTP_Server_CLI::$Event;

if ($Loop instanceof Signalling) {
   $Loop->trap(SIGRTMIN, static function (int $signal): void {
      // runs on this worker's event loop each time the worker receives the signal
   });
}
```

Send the signal to the worker's PID to run it:

```bash
kill -s RTMIN <worker pid>
```

The handler receives the signal number, so one closure can serve several signals.

Real-time signals (`SIGRTMIN` to `SIGRTMAX`) exist on Linux only. On another system, pick a
signal the server does not use — see the table below.

**When it runs.** Signals are dispatched at the top of each pass of the loop, and again right
after a wait a signal interrupted — always between callbacks, never in the middle of a route
handler, a timer callback or a write. A signal that arrives while a callback runs waits for the
next pass; one that arrives while the loop is waiting wakes it. Whatever the handler does to the loop — arming a timer, trapping or releasing a
signal, stopping the loop — takes effect in that same pass.

**One handler per signal.** Trapping a signal the loop already holds replaces its handler:

```php
$Loop->trap(SIGRTMIN, $First);
$Loop->trap(SIGRTMIN, $Second); // $First no longer runs
```

Keep handlers short: they run on the loop, so every connection of the worker waits for them.

## Stop handling a signal

`untrap()` releases the signal and answers whether the loop held it:

```php
$Loop->untrap(SIGRTMIN); // true
$Loop->untrap(SIGRTMIN); // false — already released
```

The process goes back to what it did with the signal before the loop trapped it: the handler that
was installed then, or the signal's default action. A signal still pending when you release it
reaches the handler that takes the signal back; when what comes back is the default action, the
pending signal is dropped — it does not end the process.

PHP cannot tell a signal the process inherited as ignored — one its parent ignored before
starting it — from one with its default action. Released, such a signal takes its default
action; ignore it again yourself (`pcntl_signal($signal, SIG_IGN)`) when that matters.

## Signals the server already uses

A worker starts by handing the signals of its server to its loop, so they follow the same rule as
yours: dispatched between callbacks, on the loop.

| Signal | What the server does with it |
|---|---|
| `SIGALRM` | Runs the static `Timer` wheel |
| `SIGHUP`, `SIGINT`, `SIGTERM` | Stop |
| `SIGQUIT` | Graceful stop of a TCP-based worker: it finishes the connections in flight first (a UDP worker stops) |
| `SIGTSTP` / `SIGCONT` | Pause / resume |
| `SIGUSR2` | Reload |
| `SIGUSR1` | Custom command |
| `SIGCHLD` | Worker recovery |
| `SIGIOT`, `SIGIO` | Connection info / stats |
| `SIGURG` | Out-of-band wake-up (TCP-based servers) |

Trapping one of them replaces the server's own handling in that worker — a worker whose `SIGTERM`
you trapped no longer stops on `SIGTERM` — and `untrap()` gives the signal back to the server.
Pick a signal the server does not use, such as a real-time one (`SIGRTMIN` to `SIGRTMAX`), unless
replacing is what you want.

`SIGPIPE` is ignored by the whole process and is not handled on the loop.

## When a handler throws

A handler that throws does not stop the loop, and does not hide the other signals pending in the
same pass — each still reaches its handler. The failure is reported through
`Throwables::notify()`: every reporter registered in `Throwables::$reporters` receives it with the
context `['origin' => 'loop.signal', 'signal' => $signal]`.

Only the HTTP server registers a reporter by itself — it writes the failure to its `exceptions`
log. On a TCP, WebSocket or UDP server, or on a loop you run yourself, nothing records the
failure until you register a reporter:

```php
use Bootgly\ABI\Debugging\Data\Throwables;

Throwables::$reporters[] = static function (Throwable $Throwable, array $context): void {
   $origin = $context['origin'] ?? 'unknown';

   error_log("{$origin}: {$Throwable->getMessage()}");
};
```

Register it before the server starts, so every worker inherits it.

## Signals that are refused

`trap()` refuses, with an `InvalidArgumentException`, a signal no process can catch (`SIGKILL`,
`SIGSTOP`) and a number that is not a signal.

Signals belong to the process, not to a loop, so only one loop of a process holds a given signal
at a time: trapping a signal another loop of the same process holds throws a `LogicException`
until that loop releases it.

`trap()` also throws a `LogicException` when the handler installed for the signal is one the loop
could not put back on `untrap()` — a private method only its own class may call. Nothing changes
in that case: the handler stays installed.

## Forks and `destroy()`

A handler trapped before a fork is copied into the child together with the loop, as its timers
are — the child handles the signal from its first pass, with no window in which the signal would
take its default action.

The loop object already exists in the master process, where it never runs. A handler trapped
there, in boot code, is copied into every worker forked afterwards — and it also runs in the
master, whenever the master dispatches the signals it received. That holds for a signal the
server does not use: for one of its own, the server installs its handlers when it starts and
each worker takes them over, so a handler trapped in boot code runs nowhere. Trap in the worker
when the handler is meant for workers only, or replaces the server's.

`destroy()` releases every signal the loop holds, as it drops its timers. A
loop that is run again afterwards starts with no handler: trap again.

## A loop without the capability

`Signalling` is optional, and the loop contract itself (`Bootgly\ACI\Events\Loops`) has no signal
method. A server started on a custom loop that does not implement it works as before: its worker
keeps the handlers the server installed before forking, and they run wherever that loop calls
`pcntl_signal_dispatch()`.

## Reference

`Bootgly\WPI\Events\Select` implements `Bootgly\ACI\Events\Signalling`.

```php
public function trap (int $signal, Closure $Handler): void
```

Runs `$Handler` on the loop each time the process receives `$signal`. The handler receives the
signal number and runs between callbacks, outside any Fiber. Trapping a signal this loop already
holds replaces its handler. Throws `InvalidArgumentException` when the signal cannot be caught
(`SIGKILL`, `SIGSTOP`) or is not a signal number, and `LogicException` when another loop of the
process holds the signal or the handler installed for it could not be put back.

```php
public function untrap (int $signal): bool
```

Releases `$signal` and restores what the process did with it before this loop trapped it. Returns
whether this loop held the signal.
