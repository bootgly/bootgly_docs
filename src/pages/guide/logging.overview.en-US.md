# Logging

Bootgly ships a native, dependency-free logging pipeline at `Bootgly\ACI\Logs`. A `Logger` turns
each call into a `Record` that flows through **processors** (enrich), then to each **handler**,
where it passes a severity threshold and **filters**, gets rendered by a **formatter**, and is
written to a destination (terminal, file, syslog, a pipe). Levels follow RFC 5424. Everything is
built in — no Composer dependency.

## Log a message

Create a `Logger` for a channel and log with a **named level argument**:

```php
use Bootgly\ACI\Logs\Logger;

$Logger = new Logger(channel: 'App');

$Logger->log(info: 'Server healthy.');
$Logger->log(error: 'Payment failed.', context: ['order' => 42]);
```

The level is the argument **name** — there is one `log()` verb, not eight methods. Recognized
levels: `emergency`, `alert`, `critical`, `error`, `warning`, `notice`, `info`, `debug`. Positional
calls are rejected on purpose:

```php
$Logger->log('oops');            // ✗ throws — a level name is required
$Logger->log(error: 'oops');     // ✓
```

> [!NOTE]
> A fresh `Logger` writes a colored line to **stdout** by default. `context` is optional
> structured data attached to the record (it shows up verbatim in the JSON formatter).

You can emit **several levels in one call** — each pair becomes its own record, in order, sharing
the same `context`:

```php
$Logger->log(
   info:  'Cache warmed.',
   warning: 'Cache near capacity.',
   context: ['region' => 'eu'],
);
```

## Send logs to a file (with rotation)

Push a `File` handler. Rotation is built in — it rotates on a size cap **or** a day change,
whichever comes first, and keeps a bounded number of archives:

```php
use const BOOTGLY_STORAGE_DIR;

use Bootgly\ACI\Logs\Handlers\File;
use Bootgly\ACI\Logs\Handlers\File\Rotation;
use Bootgly\ACI\Logs\Data\Levels;
use Bootgly\ACI\Logs\Logger;

$Logger = new Logger(channel: 'App');

$Logger->Handlers->push(
   new File(
      BOOTGLY_STORAGE_DIR . 'logs/app.log',
      Rotation: new Rotation(size: 10_485_760, daily: true, keep: 7),
   ),
   Levels::Warning,   // this handler only accepts Warning and more severe
);
```

`push()`'s second argument sets the handler's **minimum severity** (lower RFC 5424 value = more
severe). Archives are numbered `app.log.1` … `app.log.7`; the oldest is dropped.

A `{channel}` placeholder in the path writes **one file per channel** — each record lands in a file
named after its module:

```php
$Logger->Handlers->push(new File(BOOTGLY_STORAGE_DIR . 'logs/{channel}.log'));
// a logger on channel 'Demo.App' → storage/logs/Demo.App.log
```

## Persist logs across the app

A per-logger `File` handler covers one logger. To persist **every opted-in logger** to one place —
a framework-wide channel — register a global **sink** once and opt modules in:

```php
use const BOOTGLY_STORAGE_DIR;

use Bootgly\ACI\Logs\Handlers;
use Bootgly\ACI\Logs\Handlers\File;
use Bootgly\ACI\Logs\Logger;

// destination — register once at boot, before forking workers
Logger::$Sinks ??= new Handlers;
Logger::$Sinks->push(new File(BOOTGLY_STORAGE_DIR . 'logs/{channel}.log'));

// source — a module opts in by constructing its logger global
$Logger = new Logger(channel: 'Payments', global: true);
```

Persistence is **opt-in on both ends**: nothing is written until you register a sink (the
destination), and only loggers built `global: true` reach it (the source). With `{channel}` you get
one file per module — `storage/logs/Payments.log`.

Where an opted-in logger's records land, per server mode:

| Mode | Sink file | Live viewer |
|---|---|---|
| Foreground / Interactive | ✅ (also stdout) | — |
| Daemon | ✅ | — |
| Monitor | ✅ | ✅ |

> [!NOTE]
> In **Daemon** mode stdout is detached, so a logger that did **not** opt in (`global: false` — e.g.
> a framework subsystem) has its terminal output discarded; only opted-in loggers persist. Opt in
> the channels you need. Tail one live with `tail -f storage/logs/<channel>.log`.

## Choose a format

Each handler has a formatter. `Line` (default) is the human/terminal format with ANSI colors;
`JSON` emits one structured object per line for log shippers:

```php
use Bootgly\ACI\Logs\Formatters\JSON;
use Bootgly\ACI\Logs\Handlers\Stream;

$Logger->Handlers->push(new Stream(STDERR, new JSON));
```

A JSON line carries `timestamp`, `level`, `channel`, `message`, `context` and `extra` (ANSI is
stripped from the message).

## Enrich records with processors

Processors add fields to every record's `extra`. Attach them once per logger:

```php
use Bootgly\ACI\Logs\Processors\Memory;
use Bootgly\ACI\Logs\Processors\PID;
use Bootgly\ACI\Logs\Processors\RequestID;

$Logger->Processors
   ->push(new PID)         // extra['pid']
   ->push(new Memory)      // extra['memory'], extra['memory_peak']
   ->push(new RequestID);  // extra['request_id'] when a correlation id is set
```

`RequestID` reads a process/request-wide id from `Processors\RequestID::$id` — set it from a higher
layer (e.g. an HTTP middleware) to correlate every line of a request.

## Filter what a handler accepts

Beyond the per-handler severity threshold, attach `Filters` for finer control. They all share one
`check(Record): bool` contract:

```php
use Bootgly\ACI\Logs\Filters\Channel;
use Bootgly\ACI\Logs\Filters\Level;
use Bootgly\ACI\Logs\Filters\Search;

$Handler->Filters
   ->push(new Level(Min: Levels::Warning, Max: Levels::Emergency))  // a severity band
   ->push(new Channel(allowed: ['App', 'Auth']))                    // allow/deny channels
   ->push(new Search('timeout'));                                   // message substring
```

All attached filters must pass for the record to be written. `Filters\Callback` takes any
`Closure(Record): bool`, and `Filters\Tags` matches tags read from the record's `context['tags']`.

## Watch logs live in the terminal

Start an `HTTP_Server_CLI` in **Monitor** mode and its terminal becomes a real-time, filterable
log dashboard. Master **and** every worker stream their records to the master, which renders them:

```bash
bootgly project Demo/HTTP_Server_CLI start -m
```

You get a status bar, a tailing log pane and a keybindings footer. Filter and navigate live:

| Key | Action |
|---|---|
| `l` | cycle the **severity threshold** (Debug → … → Emergency) |
| `1`–`9` | toggle a **channel** on/off (numbered in the status bar) |
| `/` | **search** — type to filter messages, `Enter`/`Esc` to keep it |
| `space` | **pause** — freezes the view (new logs keep buffering, the screen doesn't move) |
| `↑`/`↓`, `PgUp`/`PgDn` | **select** a record (pauses to navigate a frozen snapshot) |
| `Enter` | **expand** the selected record — a full detail view with every line, context and extra |
| `Home`/`End` | jump to the oldest / back to the live tail |
| `q` / `Esc` | leave the viewer (drops to the interactive prompt) |

Multiline messages — exceptions, stack traces — are **collapsed to a single line** with a `⏎N`
marker so they never flood the dashboard. Select the record and press `Enter` to read the whole
thing (message, `context` and `extra`) in a scrollable detail view.

> [!NOTE]
> The viewer works because Monitor sets a live tap (`Logger::$Tap`) that **every** `Logger` feeds —
> regardless of opt-in — while `Display::show(Display::NONE)` mutes the local stdout output so
> nothing scribbles the TUI directly. (The tap is separate from `Logger::$Sinks`, which is the
> opt-in persistent channel below.) Under a log flood, a worker's non-blocking pipe write is dropped
> rather than blocking the request path.

## Choose what the terminal line shows

The default `Line` output is assembled from independent **segments** — pick exactly the pieces you
want with `Display::show()` (it does not affect file/JSON handlers):

```php
use Bootgly\ACI\Logs\Data\Display;

Display::show(Display::MESSAGE, Display::TIMESTAMP, Display::CHANNEL);
```

| Segment | Adds |
|---|---|
| `Display::MESSAGE` | the message text (the content) |
| `Display::TIMESTAMP` | `[ISO-8601 time]` before the line |
| `Display::CHANNEL` | the channel name |
| `Display::SEVERITY` | the level label (`ERROR`, `INFO`, …) |
| `Display::CONTEXT` | the `context` array, encoded inline |

`CHANNEL` and `SEVERITY` are independent — together they read `channel.LEVEL`, either one shows
alone. `Display::show()` with no arguments (or `Display::NONE`) silences the local stdout output
entirely. The flags are a bitmask, so `Display::MESSAGE | Display::TIMESTAMP` works too. The
default is `Display::MESSAGE` alone — a compact inline line with no trailing newline.

## Reference

- **Logger** — `Bootgly\ACI\Logs\Logger(string $channel = '', bool $global = false)`:
  `log(string|array ...$args): bool` (named-level variadic, multi-level). Holds public `Handlers`
  and `Processors`. `$global` (default `false`) opts the logger into the static `$Sinks` — a global
  `Handlers` fan-out for framework-wide persistence (push a `File` sink once; only opted-in loggers
  reach it). The static `$Tap` (a single `Handler`) is the Monitor live viewer — fed by every
  record regardless of opt-in, set/cleared by Monitor.
- **Display** — `Logs\Data\Display`: `show(int ...$segments): void` sets the active mask, held in
  static `$segments`. Flags `Display::NONE` / `MESSAGE` / `TIMESTAMP` / `CHANNEL` / `SEVERITY` /
  `CONTEXT` — the segments of the default `Line` output (a bitmask; combine freely).
- **Levels** — `Logs\Data\Levels` backed enum (`Emergency` = 1 … `Debug` = 8; lower = more severe):
  `Levels::fetch(string $name): null|self`, `render(): string`.
- **Record** — `Logs\Data\Record(Levels $Level, string $channel, string $message, array $context = [])`:
  public `$Level`, `$channel`, `$message`, `$context`, `$extra`, `$timestamp`; static
  `import(array $data): self` rebuilds a record from a decoded JSON line.
- **Handler** — abstract `Logs\Handler`: `handle(Record): bool`; public `$Level` (min severity),
  `$Formatter`, `$Filters`. Concretes: `Handlers\Stream($stream = STDOUT, …)`,
  `Handlers\File($path, …, Rotation)`, `Handlers\Syslog($ident, $facility, …)`,
  `Handlers\Pipe(IPC\Pipe, …)`.
- **Handlers** — `Logs\Handlers`: `push(Handler $Handler, null|Levels $Level = null): self`.
- **Formatter** — interface `Logs\Formatter`: `format(Record): string`. Concretes: `Formatters\Line`
  (ANSI + template tokens), `Formatters\JSON` (one object per line).
- **Processor** — abstract `Logs\Processor`: `process(Record): Record`. Concretes:
  `Processors\PID`, `Processors\Memory`, `Processors\RequestID` (static `$id`). `Logs\Processors`
  collection: `push()`, `process()`.
- **Filter** — abstract `Logs\Filter`: `check(Record): bool`. Concretes: `Filters\Level(Min, Max)`,
  `Filters\Channel(allowed, denied)`, `Filters\Callback(Closure)`, `Filters\Tags(tags, all)`,
  `Filters\Search(term)`. `Logs\Filters` collection: `push()`, `check()`.
- **Rotation** — `Handlers\File\Rotation(int $size = 10_485_760, bool $daily = true, int $keep = 7)`:
  `rotate(string $path): void`.
- **Live viewer** — `Bootgly\CLI\UI\Components\Logs(Input, Output, int $max = 5000)`: `feed(string)`,
  `control(string $key): bool`, `render(): void`. Driven by `TCP_Server_CLI::monitoring()`.
- **Layering** — `ACI\Logs` depends only on ABI (template/ANSI helpers, `IO/IPC/Pipe`); the CLI
  viewer and the WPI servers consume it — no `ACI → CLI/WPI` back-dependency.

## Next references

- **[Events](/guide/events/overview/)** — the ABI event bus used elsewhere in the stack.
- **[Docker](/guide/docker/overview/)** — run the server (and its logs) in a container with `-f`.
- **[Performance](/guide/performance/overview/)** — the zero-allocation patterns the logger follows.
