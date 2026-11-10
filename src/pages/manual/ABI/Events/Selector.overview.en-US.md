# Selector

`Selector` tells you when a stream can be read or written without blocking. You hand it the
streams you care about, then wait — until one is ready, until a deadline, or until a signal
arrives. It is the readiness primitive under blocking loops: a pipe reader, a client waiting for
a reply, a tool following several sockets at once.

It only reports readiness. Reading, writing, timers and Fibers stay with your code.

## Wait for a stream

Watch the stream, then wait. `wait()` returns how many streams are ready and fills
`$Selector->readable`:

```php
use Bootgly\ABI\Events\Selector;

$Selector = new Selector;
$Selector->watch($socket);

$Selector->wait(); // blocks until $socket has something to read

foreach ($Selector->readable as $id => $stream) {
   $data = fread($stream, 8192);
}
```

A stream is ready to read when data arrived, when the peer closed its end (the read then returns
an empty string) or, for a listening socket, when a connection is waiting to be accepted.

Readiness is level-triggered: a stream you did not drain is reported again by the next `wait()`.

## Wait until a deadline

Pass a deadline to give up after some time. The deadline is an **absolute** instant on the
monotonic clock — `$Selector->Clock->tick`, in nanoseconds — not a duration:

```php
$deadline = $Selector->Clock->tick + 5 * 1_000_000_000; // 5 s from now

$ready = $Selector->wait($deadline);

if ($ready === 0) {
   // nothing arrived in 5 s
}
```

Because the deadline is absolute, a loop that waits several times keeps one time budget for the
whole exchange instead of restarting the clock on every call:

```php
$deadline = $Selector->Clock->tick + 5 * 1_000_000_000;
$reply = '';

while (str_ends_with($reply, "\r\n") === false) {
   if ($Selector->wait($deadline) === 0 && $Selector->interrupted === false) {
      throw new RuntimeException('No complete reply in 5 s.');
   }

   foreach ($Selector->readable as $stream) {
      $chunk = fread($stream, 8192);

      if ($chunk === '' || $chunk === false) {
         throw new RuntimeException('The peer closed before the reply was complete.');
      }

      $reply .= $chunk;
   }
}
```

A wait that times out never returns before its deadline, so waiting again on a timeout cannot
spin. Readiness is another matter: a peer that closed stays readable forever, so always handle
the empty read — as above — or the loop would run without ever waiting.

## Poll without waiting

A deadline that is not in the future makes `wait()` answer at once with what is ready right now.
`0` is always in the past:

```php
if ($Selector->wait(0) > 0) {
   // something is ready
}
```

## Watch many streams, each with its payload

Give `watch()` a payload — the connection object, a label, a callback — and the ready sets carry
it instead of the stream. The sets are keyed by the stream id (`(int) $stream`):

```php
foreach ($Connections as $Connection) {
   $Selector->watch($Connection->socket, payload: $Connection);
}

while ($Selector->reads !== []) {
   $Selector->wait();

   foreach ($Selector->readable as $id => $Connection) {
      if ($Connection->receive() === false) {
         $Selector->forget($Connection->socket);
         fclose($Connection->socket);
      }
   }
}
```

Watching a stream again for the same interest replaces its payload. `$Selector->reads` and
`$Selector->writes` list what is watched, by id.

## Wait until you can write

By default a stream is watched for read interest. Ask for write interest when a non-blocking
write could not take everything — and drop it once the buffer is flushed, or `wait()` will keep
reporting the stream:

```php
use Bootgly\ABI\Events\Selector\Interests;

$Selector->watch($socket, Interests::Write);

while ($pending !== '') {
   $Selector->wait();

   foreach ($Selector->writable as $stream) {
      $written = fwrite($stream, $pending);

      if ($written === false) {
         throw new RuntimeException('The peer is gone.');
      }

      $pending = substr($pending, $written);
   }
}

$Selector->forget($socket, Interests::Write);
```

A stream may be watched for both interests, each with its own payload: call `watch()` once per
interest. It then counts once per ready interest in the number `wait()` returns.

## Signals

A signal that arrives during a wait ends it early: `wait()` returns `0` and sets
`$Selector->interrupted`. Dispatch the pending signals and wait again with the **same** deadline
— the wait resumes where it stopped, without extending it:

```php
$deadline = $Selector->Clock->tick + 30 * 1_000_000_000;

do {
   pcntl_signal_dispatch();

   $ready = $Selector->wait($deadline);
} while ($ready === 0 && $Selector->interrupted);
```

So the three answers of `wait()` are told apart like this:

| `wait()` returns | `$interrupted` | Meaning |
|---|---|---|
| `> 0` | — | that many ready entries in `$readable` + `$writable` |
| `0` | `true` | a signal arrived first |
| `0` | `false` | the deadline passed |

## Stop watching

`forget()` removes a stream — one interest, or both when you name none. Forget a stream **before**
you close it:

```php
$Selector->forget($socket);                    // both interests
$Selector->forget($socket, Interests::Write);  // only write

fclose($socket);
```

A stream that was closed while still watched can no longer be waited on. The Selector does not
hang or spin on it: the next `wait()` drops it and throws a `Refusal` naming it (see below).
A closed stream can still be passed to `forget()`.

## Refusals

When the Selector cannot serve a stream or a wait, it throws
`Bootgly\ABI\Events\Selector\Refusal` and says why in `$Refusal->Reason`:

| Reason | Thrown by | What happened |
|---|---|---|
| `Reasons::Invalid` | `watch()` | the value is not an open stream (closed, another kind of resource, not a resource) |
| `Reasons::Unselectable` | `watch()` | the stream has no descriptor the system can wait on (`php://memory`) |
| `Reasons::Overflow` | `watch()` | the stream's descriptor is beyond what `select()` takes — see Limits below |
| `Reasons::Closed` | `wait()` | watched streams were closed without `forget()`; they were dropped |
| `Reasons::Empty` | `wait()` | nothing is watched and no deadline was given: the wait could never return |
| `Reasons::Failure` | both | the system refused the call for another reason (in the message) |

A stream is checked once, when it is first watched, so a stream that cannot be waited on is
refused at `watch()` and never surprises a `wait()`.

After a `Reasons::Closed` refusal the Selector is usable again: the closed streams are gone and
`$Refusal->streams` lists their ids, so you can release whatever you kept for them.

```php
use Bootgly\ABI\Events\Selector\Reasons;
use Bootgly\ABI\Events\Selector\Refusal;

try {
   $Selector->wait($deadline);
}
catch (Refusal $Refusal) {
   if ($Refusal->Reason !== Reasons::Closed) {
      throw $Refusal;
   }

   foreach ($Refusal->streams as $id) {
      unset($Connections[$id]);
   }
}
```

## Sleep until a deadline

With nothing watched, `wait($deadline)` is a plain sleep that a signal can interrupt — handy for
a loop whose streams come and go:

```php
$Selector = new Selector;

$Selector->wait($Selector->Clock->tick + 250_000_000); // 250 ms
```

## Limits

- **One backend: `select()`.** A stream is refused (`Reasons::Overflow`) when its descriptor
  number is at or above `FD_SETSIZE` — 1024 in a default PHP build. The bound is on the
  descriptor **number**, not on how many streams the Selector watches: a process that already
  holds a thousand open files hits it with its first socket.
- **The ready sets are a snapshot** of the last `wait()`. They are rebuilt by the next one;
  `forget()` does not edit them.
- **Buffered data counts as readable.** If PHP already holds unread bytes of a stream in its own
  buffer, `wait()` reports the stream at once — and that answer lists **only** the streams with
  buffered data: `$writable` comes back empty even when a stream could be written. Drain what is
  readable and wait again.
- **Not a reactor.** No callbacks, timers or Fibers: the HTTP server's event loop is
  `Bootgly\WPI\Events\Select`.

## Testing with a fake clock

The Selector measures the time left on the `Clock` it is given, so a test can decide what "now"
is:

```php
use Bootgly\ABI\Events\Selector;
use Bootgly\ACI\Tests\Doubles\Fake\Clock;

$Clock = new Clock;
$Selector = new Selector($Clock);
$Selector->watch($socket);

$deadline = $Clock->tick + 60 * 1_000_000_000; // one minute from the fake now
$Clock->advance(61);

$Selector->wait($deadline); // 0 at once — the deadline is behind the clock
```

The wait itself still runs on the system: with the fake clock **before** the deadline, `wait()`
really blocks for the time left. See [Clock](/manual/ABI/Clock/overview/).

## In the framework

`Bootgly\ABI\IO\IPC\Pipe::reading()` waits on a Selector: each wait lasts the given timeout,
pending signals are dispatched between waits, and a signal that interrupts a wait resumes it
without extending the timeout.

## Reference

```php
public function __construct (null|Clock $Clock = null)
```

Creates a Selector that watches nothing. Deadlines are measured on `$Clock` (the system `Clock`
when null).

```php
public function watch (mixed $Stream, Interests $Interest = Interests::Read, mixed $payload = null): void
```

Watches `$Stream` (an open stream resource with a descriptor) for one interest. `$payload` is
what the ready sets carry for it — the stream itself by default. Watching it again for the same
interest replaces the payload. Throws `Refusal` with `Reasons::Invalid`, `Reasons::Unselectable`,
`Reasons::Overflow` or `Reasons::Failure`.

```php
public function forget (mixed $Stream, null|Interests $Interest = null): bool
```

Stops watching `$Stream` for `$Interest`, or for both interests when null. Accepts a stream that
was already closed. Returns whether the stream was watched for that interest.

```php
public function wait (null|int $deadline = null): int
```

Waits until a watched stream is ready, `$deadline` passes or a signal arrives; fills `$readable`,
`$writable` and `$interrupted`, and returns the number of ready entries. `$deadline` is a
monotonic instant in nanoseconds (`$Selector->Clock->tick`): null waits indefinitely, an instant
that is not in the future polls. Throws `Refusal` with `Reasons::Closed`, `Reasons::Empty` or
`Reasons::Failure`.

```php
public private(set) Clock $Clock
```

The clock deadlines are measured on.

```php
public private(set) array $reads
```

The streams watched for read interest, by id (`(int) $stream`).

```php
public private(set) array $writes
```

The streams watched for write interest, by id.

```php
public private(set) array $readable
```

The payloads of the streams the last `wait()` found ready to read, by stream id.

```php
public private(set) array $writable
```

The payloads of the streams the last `wait()` found ready to write, by stream id.

```php
public private(set) bool $interrupted
```

Whether a signal cut the last `wait()` short.

```php
enum Interests { case Read; case Write; }
```

`Bootgly\ABI\Events\Selector\Interests` — what a stream is watched for.

```php
enum Reasons { case Invalid; case Unselectable; case Overflow; case Closed; case Empty; case Failure; }
```

`Bootgly\ABI\Events\Selector\Reasons` — why the Selector refused; see Refusals above.

```php
public private(set) Reasons $Reason
```

On `Bootgly\ABI\Events\Selector\Refusal` (a `RuntimeException`): why the Selector refused.

```php
public private(set) array $streams
```

On `Refusal`: the ids of the streams the refusal is about — the refused stream of a `watch()`,
the streams a `wait()` dropped. Empty when no stream is concerned.
