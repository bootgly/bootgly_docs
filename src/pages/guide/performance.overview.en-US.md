# Performance

Bootgly is designed to keep the framework path small, but performance still depends on how the project is configured, what each route does and how external services behave.

Use this guide as a checklist before treating a benchmark result as a framework limit.

## Start with the right baseline

Measure at least two routes:

1. A static route that returns a small fixed body.
2. The real route being optimized.

The static route shows the HTTP server ceiling for the current machine, PHP build, worker count and benchmark client. A database, file, network or template route will always be lower because each request performs extra work.

```bash
bootgly test benchmark HTTP_Server_CLI \
  --opponents=bootgly \
  --runner=tcp_client \
  --loads=benchmark:1 \
  --server-workers=13
```

For focused route families, keep a dedicated benchmark router and scenario set. This avoids mixing routing overhead, application work and benchmark setup changes in the same number.

## Tune concurrency deliberately

Throughput is bounded by concurrency and latency:

```text
maximum throughput ~= concurrent in-flight requests / average latency
```

If a database route has about `2ms` average latency and the client only keeps `128` requests in flight, the practical ceiling is around `64k req/s` before CPU and scheduling overhead. Raising client connections can expose more capacity, but it also raises latency.

Recommended sweep order:

1. Benchmark client connections: `64`, `128`, `256`, `512`.
2. Server workers: close to CPU cores first, then above and below.
3. Per-route resources such as database pool size.
4. External service settings.

Only compare runs with the same scenario, duration, warmup and machine load.

## HTTP server workers

`HTTP_Server_CLI` uses worker processes. More workers can increase throughput until CPU, scheduler overhead or shared dependencies become the bottleneck.

Start around the number of physical cores or a known static-route optimum, then
sweep — `--server-workers` accepts sweep values (`A..B`, `A..B:step`, `N,N,...`)
that run one round per value in a single command:

```bash
bootgly test benchmark HTTP_Server_CLI \
  --opponents=bootgly \
  --runner=tcp_client \
  --loads=benchmark:1 \
  --connections=256 \
  --server-workers=8..24:4
```

Each round writes its own `.bench.marks` file and the run ends with an
**Artifacts** footer pointing at every file. Three global options shape the
output:

- `--output=full|compact` — output style (auto: compact when sweeping — the
  system banner and opponents list print once, each round gets a short header).
- `--format=text|json` — with `json`, the run prints **only** one
  machine-readable JSON document (all rounds, results and artifact paths);
  all human-readable output is suppressed, so the output pipes straight
  into `jq`.
- `--results=marks|report|charts` — artifact levels: `report` also writes a
  `RESULTS-<set>-<timestamp>.md`; `charts` adds native SVG charts
  (throughput, ratio, latency) — no external tooling required. Reports land in
  `bootgly/storage/tests/benchmarks/<case>/results/`.

## Database pool sizing

For ADI Database, pool limits are per HTTP worker process.

```text
total possible PostgreSQL sessions = server workers * DB_POOL_MAX
```

For example, `24` workers and `DB_POOL_MAX=4` can open up to `96` PostgreSQL sessions.

Start low:

- `DB_POOL_MAX=1` for one active database operation per worker.
- `DB_POOL_MAX=2` when routes often overlap more than one query per worker.
- `DB_POOL_MAX=4` for moderate parallel database work.
- Larger values only after measuring a clear gain.

Idle PostgreSQL sessions are expected with a pool. They are already connected and waiting for work. Too many idle sessions waste memory and can increase PostgreSQL scheduling overhead without improving request throughput.

A pool that is too large can be slower than a small one, especially for simple `SELECT 1` style routes where the database work is shorter than the connection-management and scheduling overhead.

## PostgreSQL settings

PostgreSQL tuning should match the workload. For tiny read-only queries, large buffers and write durability settings usually have little effect.

Useful checks:

```sql
SHOW max_connections;
SHOW shared_buffers;
SHOW effective_cache_size;
SHOW work_mem;
SHOW jit;
SHOW synchronous_commit;
SHOW fsync;
```

Practical guidance:

- Set `max_connections` above the maximum expected pool sessions plus admin connections.
- Keep `shared_buffers` reasonable for the machine; increasing it does not automatically improve small hot queries.
- `effective_cache_size` guides the planner, but does not allocate memory directly.
- `jit=off` can help very small queries avoid unnecessary planning overhead.
- `synchronous_commit=off` matters for writes, not simple reads.
- Avoid `fsync=off` for real data. It is unsafe and usually irrelevant for read-only route benchmarks.

## Keep database routes asynchronous

Use the native ADI Database client or a WPI helper that waits through the HTTP response scheduler. Do not run blocking database clients inside event-loop paths unless the route is intentionally isolated.

A blocking call can stall a worker. An async database operation lets the worker continue handling readiness events while PostgreSQL is processing the query.

## Query and result tips

- Prefer parameterized queries.
- Reuse prepared statements where practical.
- Select only the columns needed by the response.
- Keep response serialization small for hot routes.
- Add indexes for real predicates before increasing pool size.
- Measure the route with realistic result sizes; `SELECT 1` tests protocol and scheduling overhead, not application data access.

## Preload assets with 103 Early Hints

While a handler is still producing its response — waiting on a database, rendering a
template — the browser can already be downloading the page's CSS and JS. Send an interim
`103 Early Hints` response (RFC 8297) with `Response->hint()` before the heavy work:

```php
$Router->route('/page', function (Request $Request, Response $Response): Response {
   $Response->hint([
      '</assets/app.css>; rel=preload; as=style',
      '</assets/app.js>; rel=preload; as=script'
   ]);

   // ...expensive work: queries, rendering...

   return $Response->send($HTML);
}, GET);
```

The interim response goes out on the wire immediately — before the final status is known
— and the final response follows untouched. `hint()` is repeatable (each call is one
interim response), works on HTTP/1.1 and HTTP/2, and is a safe no-op for HTTP/1.0
clients or after the response was sent.

The win scales with the gap between "request arrived" and "response head ready": a route
that spends 50ms on database time gives the browser 50ms of free preload.

### Reference

```php
public function hint (string|array $links = []): self
```

Sends one interim `103 Early Hints` response carrying the given `Link` header value(s)
directly on the transport. CR/LF in values is stripped (response-splitting guard). No-op
when no transport is bound, the final response was already sent, the client speaks
HTTP/1.0, or the HTTP/2 stream was reset.

## Read benchmark numbers carefully

A high static-route number and a lower database-route number can both be correct. Static routes mostly measure HTTP parsing, routing and response writes. Database routes add at least one network round trip, PostgreSQL execution, result decoding and JSON serialization.

When a database route plateaus:

1. Check client concurrency.
2. Check server workers.
3. Check total database sessions.
4. Inspect PostgreSQL active versus idle sessions.
5. Compare native low-level code with helper code.
6. Only then tune PostgreSQL memory and durability settings.

For many routes, reducing the pool can improve stability even when the maximum single benchmark number is slightly lower.
