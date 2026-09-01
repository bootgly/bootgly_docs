# Logs CLI

"How do I see the server log **right now**?" has one answer in Bootgly: `bootgly logs`. It reads
everything the sinks persisted under the shared `storage/logs/` — the backlog — and, with `-f`,
follows running instances **live**, from any terminal, in any server mode. Daemon included: no
`journalctl`, no `tail`, no SSH gymnastics.

## Follow a project live

Address the project by **name** — never by port. A console project has no port; a server's port is
a record filter and, with `-f`, the live-tap tiebreaker:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI logs -f
```

On a terminal this opens the same full-screen viewer the Monitor mode uses — identical status bar,
filters and keys (`l` severity, `1`–`9` channels, `/` search, `space` pause, `Enter` detail,
`q` quit). Two sessions can attach at once; both receive every record.

Without a TTY — or with `--json` — the output is a plain stream, one record per line, ready for
`grep` or a log shipper:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI logs -f --json | grep -i error
```

When several instances of the same project are live, an omitted target **lists and refuses** —
pick one with `--instance`:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI logs -f --instance=8443
```

The same option narrows the **backlog** too — every record carries the instance that wrote it —
so a per-instance feed is one command:

```bash :toolbar="true";
bootgly project Demo/HTTP_Server_CLI logs --instance=8443 --since=15m --json
```

## Read the backlog (and ship it)

Without `-f`, `logs` prints what the sinks persisted and exits. `--since` bounds the read
(rotated archives included), and every filter composes:

```bash :toolbar="true";
bootgly logs --since=15m --level=warning
bootgly logs --channel=exceptions --json
bootgly logs --project=Demo/HTTP_Server_CLI --since=2h
bootgly logs --framework
```

The kit scope (`bootgly logs`) sees **every** project's records, each line labeled by its
[provenance](/guide/logging/overview/) — the `project` field (`framework` for the framework's
own processes) — and by its `instance`, the bound port or master PID that wrote it.
`bootgly logs -f` follows every live instance at once.

## Console projects too

A queue worker, a schedule runner, a TUI app — console projects have no port and no server, but
they have an instance identity (registered by `project start`) and their records follow through
the **file lane**: whatever their sinks persist streams into the same `logs -f` session. Live-tap
sockets are a server (WPI) feature this cycle.

## Zero cost until you look

The live tap is a per-instance unix socket (owner-only, `0600`) published by the server master in
every mode. **Attaching arms it; detaching disarms it**:

- nobody attached → workers' `Logger::$Tap` stays `null`, no writes, no measurable cost — the
  request hot path is never touched;
- attached → each record (not each request) costs one non-blocking datagram write, dropped whole
  under backpressure — a slow viewer can never stall a worker;
- the master fans frames out to every session from its supervision tick (≤ 0.5 s latency in
  Daemon/Foreground; ~30 ms under Monitor).

A `kill -9`'d instance leaves a dead socket behind: `logs -f` says so and degrades to files-only;
the next `start` rebinds it and `stop` removes it.

> [!NOTE]
> Records emitted **between** your attach and the workers arming (one signal round-trip) reach the
> files, not the live stream — the backlog covers them. In Interactive mode, frames buffered while
> a typed command executes are delivered on the next tick.

## Reference

```php
bootgly logs [-f|--follow] [--project=<Name>] [--framework] [--instance=<id>]
             [--channel=<c>] [--level=<l>] [--since=<t>] [--json]
```

Kit scope: the shared `storage/logs/` backlog, plus every live instance's tap with `-f`.
`--project` and `--framework` filter by record provenance and are mutually exclusive.
`--instance` filters by the record's `instance` field — the bound port (servers) or master PID
(console) — on the backlog and live alike; lines written before the field existed carry no
instance and never match.

```php
bootgly project <Name> logs [-f|--follow] [--instance=<id>]
                            [--channel=<c>] [--level=<l>] [--since=<t>] [--json]
```

Project scope — the same implementation, pre-filtered to `<Name>` (the canonical folder id).
`--instance` selects one instance: it filters the backlog by the records' `instance` field and,
with `-f`, picks which live tap to attach; with several live and no `--instance`, `-f` lists them
and refuses.

| Option | Meaning |
|---|---|
| `-f`, `--follow` | keep following new records (unrelated to `start -f`, which is Foreground) |
| `--project=<Name>` | only that project's records (kit scope) |
| `--framework` | only records with `framework` provenance |
| `--instance=<id>` | only that instance's records — port (servers) or master PID (console); with `-f`, also the live-tap tiebreaker |
| `--channel=<c>` | only these channels (comma-separated) |
| `--level=<l>` | minimum severity (`debug` … `emergency`) |
| `--since=<t>` | start point — `30s`/`15m`/`2h`/`7d` or any `strtotime` syntax |
| `--json` | machine output: one JSON record per line (implies the stream lane) |

```php
Bootgly\ACI\Logs\Backlog->__construct (string $directory, bool $rotations = true)
```

The persisted-log reader behind the command. `scan()` lists the log files (rotations
oldest-first), `read(float $since = 0.0)` merges every file ascending by timestamp, and
`following()` yields NDJSON appended after the call — surviving rotation and new files.

```php
Bootgly\ACI\Process\States::scan (string $id): array
```

Instance discovery over `storage/pids/` by encoded id — with `States::locate()` and
`States::authenticate()`, the same verified addressing `project stop/restart` uses.

```php
Bootgly\CLI\UX\Components\Tail->run (Iterator $Source): void
```

The client-side follow loop: alternate screen, raw input, the shared `LogsViewer` — and a
guaranteed terminal restore on every exit path.

## Next references

- **[Logging](/guide/logging/overview/)** — the pipeline that produces these records: sinks,
  provenance, formats, the Monitor viewer.
- **[Console Platform](/guide/console-platform/overview/)** — console projects and their lifecycle.
