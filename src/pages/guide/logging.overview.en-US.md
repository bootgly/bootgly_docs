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

A `{project}` placeholder resolves to the record's **provenance** — the booted project's canonical
folder id, or `framework` when no project is booted — separating framework and application records
with zero application code (both placeholders are sanitized; no path traversal):

```php
$Logger->Handlers->push(new File(BOOTGLY_STORAGE_DIR . 'logs/{project}/{channel}.log'));
// a 'Demo/HTTP_Server_CLI' boot → storage/logs/Demo_HTTP_Server_CLI/Demo.App.log
// a bare framework process     → storage/logs/framework/<channel>.log
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

The framework's **server channels opt in by default**: `HTTP.Server.CLI`, `TCP.Server.CLI` and the
other server-owned loggers are built `global: true`, so boot, Auto-TLS and lifecycle records reach
your sinks without any workaround. Opting a server back out is one line:

```php
$Server->Logger->global = false;
```

Where an opted-in logger's records land, per server mode:

| Mode | Sink file | Live viewer |
|---|---|---|
| Foreground / Interactive | ✅ (also stdout) | `bootgly logs -f` |
| Daemon | ✅ (auto-installed when unset) | `bootgly logs -f` |
| Monitor | ✅ | ✅ (in-terminal) + `bootgly logs -f` |

> [!NOTE]
> **Daemon is never a silent black hole.** When a server daemonizes with `Logger::$Sinks` still
> unset, it installs the default sink — `File(BOOTGLY_STORAGE_DIR . 'logs/{channel}.log')` — and a
> NOTICE saying so is that file's first record. A project that registered its own sinks is never
> touched (`??=` semantics). Follow any mode live with
> **[`bootgly logs -f`](/guide/logs/overview/)** — no `tail` needed.

> [!IMPORTANT]
> **A root launch never writes a log sink as root.** When the server starts as root with a
> runtime `user`, the global sinks — the fallback above, or the ones your project registered —
> are held back from the moment the server is configured — before the first record it writes:
> root only prepares `storage/logs`
> (a plain directory, handed to the runtime identity by inode) and keeps its own records in
> memory. Right after privileges are dropped, the master and each worker install the sinks and
> replay what they held — the master writes the notice first; a worker may persist its own
> records before it — so the file is created by the identity that keeps writing it and root
> never names a file inside that directory. If `storage/logs` is a symbolic link, root leaves it
> exactly as found and hands nothing over: make its target writable by the runtime identity
> yourself. Should the daemon exit before it could drop privileges (an unknown user, a port
> already taken), the held records go to the system logger instead. The file sink itself
> refuses anything but a plain file at the destination — a symbolic link, a hard link, a
> dangling link — needs read and write access to it, and reports each refusal once to the
> system logger (ident `bootgly`, muted under `BOOTGLY_ENVIRONMENT=test`) where one listens,
> so a refused sink is never a silent one (the test runner mutes it). The boundary: on a root
> launch, never log through a global logger *before* the server is configured — a record
> written then is written by root, and so is one that reaches a sink pushed onto `Logger::$Sinks`
> *after* the server was configured: register every sink before `configure()`. Root hands
> `storage/logs` over only when this launch created it and it is still the empty directory it
> created — as the inode it decided on, never as a name — and touches nothing inside it: a
> `storage/logs` that was there before and is not the runtime identity's (root's from an
> earlier launch, or anybody else's) stays as found, the demoted sink refuses it and the notice
> says so — make it the runtime identity's yourself. A
> sink that runs as root (a launch without `user`) writes only under a path nobody else can
> steer: every directory on the way must belong to root and be writable by nobody else (a
> sticky directory is fine unless it belongs to the runtime identity, who could empty it — and
> with no runtime `user` at all, or `user: root`, every sticky directory that is not root's is
> refused), and
> a link on the way must belong to root; a volume owned by another identity is refused, with
> the reason in the system logger. Inside a user namespace (a rootless container) an owner the
> namespace does not map shows as the overflow identity (`nobody`, 65534) and counts as root's —
> the host mounted that volume; when the namespace does map that identity, it is somebody, and
> foreign. The sink appends under an advisory lock (`flock`) rather than
> the kernel's `O_APPEND`: writers that ignore the lock — a shell `>>`, `logrotate copytruncate` —
> can interleave with it. The hold itself is a `Handlers\Memory` — a handler that keeps records
> in memory (bounded) for a later replay; it is distinct from the `Processors\Memory` processor
> above, and a project may use one of its own in `Logger::$Sinks` without confusing the hold —
> only the hold is carried into the detached master; a `Handlers\Memory` of your own starts
> empty there, like in any other fork. Only `Logger::$Sinks` is held: handlers pushed on a logger's own `Handlers` (the per-logger
> pattern) are written by whoever logs, root included. And only `Handlers\File` re-opens its
> file on every write, as whoever writes: a handler that captured a descriptor while root ran (a
> `Stream` opened in `boot()`) is withheld and installed like any other, but keeps writing through
> root's descriptor.

## Steer what a privileged sink accepts

The refusals above are the file sink's default posture, and three statics on `Handlers\File` are
the only levers over it. All three are process-wide — set them at boot, before the first record is
written.

**`guard()` — name the identity root must not follow.** A launch that starts as root and will drop
to a runtime identity tells the sink whose directories to distrust, by uid:

```php
use Bootgly\ACI\Logs\Handlers\File;

File::guard(1000);   // the uid this process will demote to
```

Without it, every *sticky* directory on the path that is not root's is refused — the sink cannot
tell the one identity that could empty it from any other. With it, a sticky directory owned by that
uid is still refused (its owner may rename anything inside), while one owned by anybody else keeps
the sticky protection and passes. Never calling it — or calling `File::guard(0)` — is the strict
posture. The server already does this for you: `WPI\Endpoints\Demotable` calls it with the runtime
uid right before dropping privileges, so you only reach for it when your own process performs the
demotion. Naming a uid that is not the one you demote to widens the walk for the very identity you
meant to guard against.

**`mute()` — stop the reports, not the refusals.** Every refused destination is reported once per
path and reason to the system logger (ident `bootgly`), so a sink switched off by a planted link is
never a silent one. A process that refuses on purpose does not want that in the host's journal:

```php
File::mute();        // File::mute(false) reports again
```

The test runner does exactly this — `ACI\Tests\Suites` calls `File::mute()` in its constructor —
and the handler already keeps quiet on its own under `BOOTGLY_ENVIRONMENT=test`. Muting hides only
the report: the write still fails and the handler still returns `false`. Mute a production process
and you lose the one signal that says the audit trail stopped.

**`exempt()` — predict the namespace verdict.** Inside a user namespace, an owner the namespace
does not map shows up as the overflow identity and counts as root's; a rootless container that
*does* map it makes that identity somebody, and foreign. `exempt()` is that decision on its own —
it reads nothing, changes nothing, and answers before a refusal reaches the journal:

```php
$exempt = File::exempt(
   (string) file_get_contents('/proc/self/uid_map'),
   (int) file_get_contents('/proc/sys/fs/overflowuid')
);
// -1 on a host (or when the map covers the overflow uid): nobody is exempt
```

Use it to answer "will this volume be accepted?" while you still have a shell. The handler runs the
same call itself, once, on the first privileged write.

## Hold records until a sink can be written

Sometimes the destination is not writable **yet** — the case above is the classic one: a root
launch that must not create the log file as root. `Handlers\Memory` is the handler for that
window. It writes nowhere; it keeps every record it receives in memory — at most `Memory::LIMIT`
(10000), the oldest giving way past it — until something replays them through the real sinks.

The server does this for you. You reach for it directly when your own process has the same shape:
it changes identity, opens the destination late, or only decides later where the records go.

```php
use const BOOTGLY_STORAGE_DIR;

use Bootgly\ACI\Logs\Handlers;
use Bootgly\ACI\Logs\Handlers\File;
use Bootgly\ACI\Logs\Handlers\Memory;
use Bootgly\ACI\Logs\Logger;

// ! Stand in for the real sinks — nothing reaches a destination yet
$Sinks = Logger::$Sinks ?? new Handlers;
$Hold = new Memory;
Memory::hold($Hold, $Sinks->Handlers);
Logger::$Sinks = new Handlers;
Logger::$Sinks->push($Hold);

// ... every record logged from here on is held in memory ...

// @ The destination is safe now: install the real sinks and replay what was held
Logger::$Sinks = new Handlers;
Logger::$Sinks->push(new File(BOOTGLY_STORAGE_DIR . 'logs/{channel}.log'));

$Hold->replay(...Logger::$Sinks->Handlers);
Memory::release();
```

`Memory::hold()` is a per-process registry of **one** hold: it is how a later phase of the same
process — or code that knows nothing about your launch — finds the hold in place and the handlers
it stands in for (`$Hold->Withheld`), with nothing passed around. `replay()` hands every held
record to the handlers you name, in arrival order, and forgets them, so calling it again replays
nothing; `release()` then forgets the registration.

The hold is **per process**. A `fork()` inherits the array but not the ownership: in the child,
the next record held — or the next `replay()` — clears what it inherited, so a worker never
replays what its parent held. The one process that must keep the inheritance — a detached daemon
master, forked from the launcher that started the hold — claims it with `adopt()` right after
detaching.

## Know whose record it is (provenance)

Every `Record` carries a `project` field: the **canonical folder id** of the booted project
(`Demo/HTTP_Server_CLI`, `App`, …), or `framework` when no project is booted in the process.
It is stamped **once per process** by `Project::mount()` (which `boot()` calls) — never derived
per record from file-path heuristics — so framework and application records in a shared file are
always distinguishable:

```json
{"timestamp":1788122369.47,"level":"INFO","project":"Demo/HTTP_Server_CLI","instance":"8082","channel":"Demo.App","message":"Heartbeat — server healthy.","context":[],"extra":[]}
```

Every `Record` also carries an `instance` field: the qualifier the process registry uses for the
writing process — the bound port for servers, the master PID for console and TUI processes —
stamped once per process when the instance is claimed (a server's `start()`, `project start`,
`project <Name> schedule run`, the terminal loop), and empty (`""`) when the process claimed none
(kit commands, plain scripts, WPI clients).

Both fields are first-class filters in `bootgly logs` (`--project=<Name>`, `--framework`,
`--instance=<id>`), and `project` is the `{project}` path placeholder above. Lines written before
the fields existed read back as `framework` with an empty `instance`.

## Choose a format

Each handler has a formatter. `Line` (default) is the human/terminal format with ANSI colors;
`JSON` emits one structured object per line for log shippers:

```php
use Bootgly\ACI\Logs\Formatters\JSON;
use Bootgly\ACI\Logs\Handlers\Stream;

$Logger->Handlers->push(new Stream(STDERR, new JSON));
```

A JSON line carries `timestamp`, `level`, `project`, `instance`, `channel`, `message`, `context`
and `extra` (ANSI is stripped from the message).

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

```bash :toolbar="true";
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
| `Enter` | **expand** the selected record — a full detail view with every line, context and extra, folded to the width (nothing is cut) |
| `Home`/`End` | jump to the oldest / back to the live tail (in the detail view: top / bottom of the record) |
| `q` / `Esc` | leave the viewer (drops to the interactive prompt) |

Multiline messages — exceptions, stack traces — are **collapsed to a single line** with a `⏎N`
marker so they never flood the dashboard. Select the record and press `Enter` to read the whole
thing (message, `context` and `extra`) in a scrollable detail view — `context` and `extra` print
one key per line, long lines fold at the terminal width instead of being cut, and `Home`/`End`
jump to the top/bottom of the record.

> [!NOTE]
> The viewer works because Monitor sets a live tap (`Logger::$Tap`) that **every** `Logger` feeds —
> regardless of opt-in — while `Display::show(Display::NONE)` mutes the local stdout output so
> nothing scribbles the TUI directly. (The tap is separate from `Logger::$Sinks`, which is the
> opt-in persistent channel below.) Under a log flood, a worker's non-blocking pipe write is dropped
> rather than blocking the request path.

The same screen also works **from any other terminal, against any mode** — Daemon included:
**[`bootgly project <Name> logs -f`](/guide/logs/overview/)** attaches to the running instance's
live tap and renders it through this exact viewer (same filters, same keys). Attaching arms the
tap; detaching disarms it — a server nobody is watching pays nothing.

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
  reach it; the framework's server channels are built `global: true`). The static `$Tap` (a single
  `Handler`) is the live tap — fed by every record regardless of opt-in; armed by the Monitor
  viewer and, in any mode, while a `bootgly logs -f` session is attached.
- **Display** — `Logs\Data\Display`: `show(int ...$segments): void` sets the active mask, held in
  static `$segments`. Flags `Display::NONE` / `MESSAGE` / `TIMESTAMP` / `CHANNEL` / `SEVERITY` /
  `CONTEXT` — the segments of the default `Line` output (a bitmask; combine freely).
- **Levels** — `Logs\Data\Levels` backed enum (`Emergency` = 1 … `Debug` = 8; lower = more severe):
  `Levels::fetch(string $name): null|self`, `render(): string`.
- **Record** — `Logs\Data\Record(Levels $Level, string $channel, string $message, array $context = [])`:
  public `$Level`, `$channel`, `$message`, `$project`, `$instance`, `$context`, `$extra`,
  `$timestamp`; static `$provenance` (the process-scoped provenance stamped into `$project` at
  construction — `'framework'` until `Project::mount()` sets the booted project's folder id);
  static `$qualifier` (the process-scoped instance qualifier stamped into `$instance` at
  construction — `''` until the owner claims an instance: the port for servers, the master PID
  for console/TUI); static `import(array $data): self` rebuilds a record from a decoded JSON
  line (a line without a `project` key imports as `framework`; without an `instance` key, as `''`).
- **Handler** — abstract `Logs\Handler`: `handle(Record): bool`; public `$Level` (min severity),
  `$Formatter`, `$Filters`. Concretes: `Handlers\Stream($stream = STDOUT, …)`,
  `Handlers\File($path, …, Rotation)` — the path resolves `{channel}` and `{project}` per record,
  sanitized —, `Handlers\Syslog($ident, $facility, …)`, `Handlers\Pipe(IPC\Pipe, …)`,
  `Handlers\Memory` (the hold — detailed below).
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

### Handlers\File

```php
public static function guard (int $UID): void
```

Names the runtime identity a privileged writer must guard against — the uid a root launch demotes
to. A sticky directory on the path belonging to that identity is refused, because its owner may
rename anything inside it; one belonging to anybody else keeps the sticky protection. With no
identity named, or with `0`, every foreign sticky directory is refused. Process-wide, and only
consulted while the writer is root.

```php
public static function mute (bool $quiet = true): void
```

Keeps the refusal reports out of the system logger; `false` turns them back on. It silences the
report alone — a refused destination still fails the write. The test runner calls it because its
suites refuse on purpose.

```php
public static function exempt (string $map, int $overflow): int
```

The uid a privileged writer may treat as root's, given the process's `uid_map` (`inside outside
count` rows) and the kernel's overflow uid — or `-1` when nobody qualifies. Outside a user
namespace, and inside one whose map covers the overflow uid (a rootless container's does), the
answer is `-1`. Pure: it opens no file and sets nothing; the handler calls it once itself, on the
first privileged write.

### Handlers\Memory

```php
public static function hold (null|self $Hold = null, array $Withheld = []): null|self
```

Registers — or reads — the one hold of this process. With no arguments it only reads: the handler
in place, or `null` when none is registered. Given a handler it registers **that instance** —
a hold is known by identity, never by class, so a `Handlers\Memory` a project pushed into
`Logger::$Sinks` of its own never becomes the hold — together with `$Withheld`, the handlers it
stands in for, and returns it. Re-registering the hold already in place with no handlers named
keeps the ones it already stands in for; naming handlers replaces that list, and registering a
different instance with none named leaves it standing in for nothing.

```php
public static function release (): void
```

Forgets the registered hold — `hold()` reads `null` again. Called once the real sinks are
installed and what was held has been replayed. The `Memory` instance itself is untouched.

```php
public function replay (Handler ...$Handlers): int
```

Hands every held record, in arrival order, to each handler given — `$Hold->replay(...Logger::$Sinks->Handlers)`
is the usual call — then forgets them, and returns how many were replayed. A second call replays
nothing (`0`). In a process that inherited the records from a `fork()` and did not adopt them,
they are dropped instead of replayed.

```php
public function adopt (): void
```

Makes the inherited records this process's own, so a later `replay()` persists them. Only the
process that succeeds the one that held calls it — the detached daemon master, forked from the
launcher that started the hold, right after detaching. Without it a fork's inheritance is dropped
on its first held record or replay, which is exactly what a worker wants.

```php
public private(set) array $Records
```

Data (read-only). The `Record` objects held, in arrival order. A record below the handler's
`$Level`, or dropped by its filters, is never held.

```php
public private(set) array $Withheld
```

Data (read-only). The handlers this hold stands in for — what `hold()` was given, so whichever
process settles first installs them.

```php
public const int LIMIT
```

`10000` — the most records one hold keeps. Past it the oldest gives way: the window a hold spans
(Auto-TLS issuance runs inside it) has no controlled length.

## Next references

- **[Logs CLI](/guide/logs/overview/)** — `bootgly logs` / `bootgly project <Name> logs`: read the
  backlog and follow any instance live, from any terminal.
- **[Events](/guide/events/overview/)** — the ABI event bus used elsewhere in the stack.
- **[Docker](/guide/docker/overview/)** — run the server (and its logs) in a container with `-f`.
- **[Performance](/guide/performance/overview/)** — the zero-allocation patterns the logger follows.
