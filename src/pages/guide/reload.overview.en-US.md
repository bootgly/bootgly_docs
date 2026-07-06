# Reload

`project reload` performs a **graceful hot-reload** of a running server: it drains the
in-flight requests, then re-executes the master process into a fresh PHP image so your whole
application — route closures **and** autoloaded classes — is reloaded from disk. The master
keeps the same PID, and no established request is dropped.

Use it to ship a code change to a running server without a full stop/start and without dropping
connections.

## Reload a running server

Start a server, then reload it after editing your code:

```bash
# Start the project (daemon by default; -f foreground, -m monitor)
bootgly project Demo/HTTP_Server_CLI start

# ...edit your route handlers / project code...

# Graceful reload — new code is live, same master PID, no dropped requests
bootgly project Demo/HTTP_Server_CLI reload
```

The server answers `HTTP 200` before, during (for already-accepted requests) and after the
reload. There is a brief window — between the last old worker exiting and the fresh workers
binding — where **new** connections are refused; clients simply retry.

Inside an interactive session (`start -i`), type the command directly:

```text
reload
```

## What happens on reload

1. The master receives the reload signal (`SIGUSR2`).
2. Each worker stops accepting new connections and **finishes its in-flight requests**
   (graceful drain), then exits. A worker that is stuck is force-stopped after
   `drainTimeout` seconds (default `30`).
3. The master replaces its own process image with a fresh one (`pcntl_exec`) using the exact
   command it was launched with. Because the process image is replaced, PHP re-parses every
   file from disk — this is why classes reload, which an in-place reboot cannot do.
4. The fresh master re-binds (via `SO_REUSEPORT`) and forks new workers running the new code.

The master PID never changes, so PID files, `project status` and any supervisor stay valid.

## Reload vs restart

```bash
bootgly project <name> reload    # graceful: drains in-flight, re-execs, no dropped requests
bootgly project <name> restart   # hard: stop then start (drops connections, brief full downtime)
```

Prefer `reload` for deploying code to a live server. Use `restart` only when you want a clean
cold start.

## Caveats

- **Brief no-accept window.** In-flight requests are never dropped, but new connections are
  refused for the short interval while workers cycle. This is not zero-downtime; clients retry.
- **Production OPcache.** Reload re-executes into a new process, which normally re-reads files
  from disk. If you run OPcache with `opcache.validate_timestamps=0` (common in production),
  the new process may still serve cached bytecode — reset OPcache on deploy, or keep timestamp
  validation on, so reload actually picks up the new code.
- **Automatic reload on file change** (watch the project on disk and reload when it changes) is
  not wired yet; `reload` is the explicit, canonical trigger.

## Reference

```bash
bootgly project <name> reload
```

Sends `SIGUSR2` to the project's master process, which runs the graceful re-exec described
above. Requires the project to be running; prints an error if it is not.

```text
reload
```

The interactive-mode command (available under `start -i`). Signals the master of the current
server to reload — identical behavior to `project <name> reload`.

```php
\Bootgly\WPI\Interfaces\TCP_Server_CLI::$drainTimeout = 30;
```

Seconds each worker is given to finish its in-flight requests before the master force-stops it
during a reload. Set higher for long-running requests; lower for a faster, more aggressive
reload. Applies to the HTTP, WebSocket and raw TCP servers. (UDP is connectionless and has no
drain phase.)
