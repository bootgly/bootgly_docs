# Observability

Bootgly ships a native, dependency-free metrics stack at `Bootgly\ACI\Observability`. A central
`Observability` registry holds **instruments** (counter, gauge, histogram) and **collectors**
(process + runtime health). Calling `gather()` snapshots everything into a `Snapshot`, which an
**exporter** turns into bytes (JSON today). Two HTTP routes — `/health` and `/metrics` — expose it,
and a file-per-worker model merges metrics across the whole server fleet. Everything is built in —
no Composer dependency, and the collector lives one layer below the web server (`WPI` feeds `ACI`,
never the other way around).

## Built-in health endpoint (K8s probes)

The HTTP server answers health probes natively — no route, no middleware, no
Observability registry required. Opt in with the `health:` parameter of `configure()`:

```php
$HTTP_Server_CLI->configure(
   host: '0.0.0.0',
   port: 8080,
   workers: 4,
   health: '/health'   // ← built-in probe endpoint (null = disabled, the default)
);
```

On the Web platform (`Web\App`) it is **on by default** at `/health` — pass
`health: null` to `configure()` to disable it.

```bash
curl -s http://127.0.0.1:8080/health
# {"status":"ok"}
```

The guard answers `GET`/`HEAD` on the exact configured path **before the middleware
pipeline** — RateLimit, Authentication or any user middleware can never break a probe —
and always with `Cache-Control: no-store`. The body is deliberately minimal: the
endpoint is middleware-proof (auth cannot gate it), so it never leaks process internals;
rich vitals (pid, memory, connections) live in the Observability route set below, where
middleware protection applies. A reachable worker that accepts and serves the request
*is* the health signal, which makes one endpoint valid for both Kubernetes probes:

```yaml
livenessProbe:
  httpGet: { path: /health, port: 8080 }
  periodSeconds: 10
readinessProbe:
  httpGet: { path: /health, port: 8080 }
  periodSeconds: 5
```

When configured, the framework path shadows an identical user route. Deep readiness
(database pings, queue depth) stays an application concern — the Observability route set
below is the rich option.

## Expose `/health` and `/metrics`

The endpoints ship as a route set in the demo project. Enable them by adding `'Observability'` to
the router manifest:

```php
// projects/<your-project>/router/router.index.php
return [
   'Database',
   'Observability',   // ← /health + /metrics
];
```

Start the server and scrape:

```bash
curl -s http://127.0.0.1:8082/health
# {"status":"ok","pid":12345,"uptime_seconds":12.3,"memory_bytes":4194304,"timestamp":...}

# /metrics returns Prometheus text by default (the scrape standard):
curl -s http://127.0.0.1:8082/metrics
# # TYPE http_bytes_read_total counter
# http_bytes_read_total 28320
# # TYPE process_memory_bytes gauge
# process_memory_bytes{pid="12345"} 6291456
# ...

# …or JSON, when you ask for it:
curl -s -H 'Accept: application/json' http://127.0.0.1:8082/metrics
# {"timestamp":...,"metrics":{"process_memory_bytes":{...},"http_bytes_read_total":{...}, ...}}
```

`/health` is a cheap JSON liveness probe (status + this worker's pid, uptime and memory). `/metrics`
is the full snapshot — process & runtime health plus any instruments you register, merged across
workers — served as **Prometheus text by default**, or **JSON** when the request sends
`Accept: application/json`.

> [!NOTE]
> The route set lives at `router/routes/Observability.php`. It builds one `Observability` per worker
> (the default `Process` + `Runtime` collectors plus bridged HTTP socket counters), writes that
> worker's snapshot on each scrape, and merges every worker file. Copy it into your own project to
> own the convention.

## Record your own metrics

Create instruments and register them on a registry. There are three kinds:

```php
use Bootgly\ACI\Observability;
use Bootgly\ACI\Observability\Metrics\Counter;
use Bootgly\ACI\Observability\Metrics\Gauge;
use Bootgly\ACI\Observability\Metrics\Histogram;

$O = new Observability();

$Requests = new Counter(name: 'http_requests_total', help: 'Total requests.', labels: ['method' => 'GET']);
$Workers  = new Gauge(name: 'workers_active', help: 'Active workers.');
$Latency  = new Histogram(name: 'request_duration_seconds', help: 'Request latency.');

$O->Metrics->push($Requests)->push($Workers)->push($Latency);

$Requests->increment();        // +1 (counters are monotonic; negative deltas throw)
$Workers->set(8.0);            // absolute value (also increment()/decrement())
$Latency->observe(0.042);      // one observation into the buckets
```

A **counter** only goes up (totals). A **gauge** is a value that moves in both directions. A
**histogram** buckets observations — its default buckets are Prometheus' (`0.005s … 10s`), override
with `buckets:`. Instruments sharing a `name` but different `labels` become distinct series under
that name.

> [!NOTE]
> Make the registry reachable from anywhere by assigning the optional global instance:
> `Observability::$Instance = $O;`. Routes and the metric bridge then share one registry.

## Collect process & runtime health

`new Observability()` auto-registers two **collectors**, so a snapshot carries self-health out of
the box (each series is labelled by `pid`, so worker series stay distinct when merged):

| Collector | Metrics |
|---|---|
| `Process` | `process_memory_bytes`, `process_memory_peak_bytes`, `process_cpu_seconds_total`, `process_uptime_seconds`, `process_open_fds` |
| `Runtime` | `runtime_gc_runs_total`, `runtime_gc_collected_total`, `runtime_included_files`, `runtime_opcache_memory_used_bytes`, `runtime_opcache_hit_rate` |

They read only PHP builtins and `/proc/self` — never higher-layer classes. Pass
`new Observability(collectors: false)` for a bare registry with no health metrics.

## Bridge existing server counters

The web server already counts socket reads, writes, bytes and errors (`Connections::$stats`). Surface
them as **observable** instruments — a callback that reads the live value at snapshot time. This is
how `WPI` feeds `ACI` without the collector ever importing the server:

```php
use Bootgly\ACI\Observability\Metrics\Counter;
use Bootgly\WPI\Interfaces\TCP_Server_CLI\Connections;

Connections::$stats = true;   // enable the server's socket counters (lazy, like the `stats` command)

$O->Metrics
   ->push(new Counter(name: 'http_bytes_read_total',    help: 'Bytes read.',    observe: static fn () => Connections::$read))
   ->push(new Counter(name: 'http_bytes_written_total', help: 'Bytes written.', observe: static fn () => Connections::$written));
```

Because the counters are per-process after the fork, each worker reports its own totals — merging the
per-worker files sums them into a fleet total. `Gauge` accepts the same `observe:` callback.

## Record HTTP request metrics

`Telemetry` records per-request metrics by listening to the HTTP server's request-lifecycle events —
one `boot()` call wires it onto a registry:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Telemetry;

new Telemetry($O)->boot();
```

It records `http_requests_total`, `http_responses_total{class}` (`2xx`, `4xx`, …),
`http_request_duration_seconds` (histogram) and `http_requests_in_flight`.

> [!NOTE]
> The server's request events are `isSet`-guarded at the emit site, so they cost **nothing** until a
> listener is registered — the hot path is unaffected when telemetry is off. With telemetry on, the
> per-request recording is allocation-light (counters/gauge are plain accumulators exposed by
> *observable* instruments; only the duration histogram records per request). Duration pairs the
> Received→Handled events and is exact for synchronous responses.

## Export a snapshot

`gather()` builds a `Snapshot`; an exporter encodes it. The JSON exporter emits one
`{timestamp, metrics}` document (float values preserved, e.g. `5.0`):

```php
use Bootgly\ACI\Observability\Exporters\JSON;

$Snapshot = $O->gather();
$json = $O->export(new JSON);     // shorthand for (new JSON)->export($O->gather())
```

## Aggregate across workers

A scrape lands on one worker, so each worker writes its snapshot to its own file and the reader
merges them. `dump()` writes atomically (temp + rename); `aggregate()` globs the files, skips stale
ones (dead workers) and sums matching series:

```php
use Bootgly\ACI\Observability;
use Bootgly\ACI\Observability\Exporters\JSON;

$dir = sys_get_temp_dir() . '/bootgly-observability';

// in each worker, when scraped:
$O->dump(new JSON, "$dir/worker-" . getmypid() . ".json");

// the /metrics handler:
$Cluster = Observability::aggregate("$dir/worker-*.json", maxAge: 60.0);
echo (new JSON)->export($Cluster);
```

`merge()` sums counter/gauge values and adds histogram buckets/sum/count for series with the same
name **and** labels; series with different labels are kept side by side.

> [!NOTE]
> With one worker this is exact. For several workers the demo route also registers a periodic
> per-worker dump (a `Timer`), so every worker refreshes on an interval — not only when it happens to
> be the one scraped. Files older than `maxAge` (e.g. dead workers) are skipped.

## Scrape with Prometheus

`/metrics` already speaks Prometheus — point a scraper at it:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: bootgly
    static_configs:
      - targets: ['127.0.0.1:8082']
```

The `Prometheus` exporter is also usable directly — `# HELP`/`# TYPE` headers, one line per series,
histograms expanded to `_bucket`/`_sum`/`_count`:

```php
use Bootgly\ACI\Observability\Exporters\Prometheus;

echo $O->export(new Prometheus);
# # HELP http_requests_total Total requests.
# # TYPE http_requests_total counter
# http_requests_total{method="GET"} 5
```

Pass `new Prometheus(namespace: 'bootgly')` to prefix every metric name.

## Push with OpenTelemetry (OTLP)

For push pipelines, encode the snapshot as OTLP/HTTP JSON and POST it to a collector. The encoder is
pure (ACI — counter → `sum`, gauge → `gauge`, histogram → `histogram`):

```php
use Bootgly\ACI\Observability\Exporters\OTLP;

$body = $O->export(new OTLP(service: 'my-service'));
```

Bootgly ships a ready ship script that merges the per-worker files and POSTs once — run it on an
interval (cron / systemd-timer):

```bash
cd /path/to/bootgly
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector:4318 \
OTEL_SERVICE_NAME=my-service \
php scripts/observability-ship.php
# observability-ship: POST http://collector:4318/v1/metrics → HTTP 200
```

The server keeps the per-worker files fresh via the periodic dump `Timer`, so the script always has
current data — no scrape required.

## Reference

```php
new Observability (bool $collectors = true)
```
The registry. Holds public `Metrics` and `Collectors`; when `$collectors` is true (default)
auto-registers the `Process` + `Runtime` health collectors. Static `$Instance` is an optional shared
handle.

```php
Observability->gather (): Snapshot
```
Reads every instrument and runs every collector into one point-in-time `Snapshot`.

```php
Observability->export (Exporter $Exporter): string
```
Encodes the current snapshot through an exporter (shorthand for `$Exporter->export($this->gather())`).

```php
Observability->dump (Exporter $Exporter, string $path): bool
```
Gathers, encodes and atomically writes the snapshot to `$path` (creating its directory). Used by each
worker with a per-PID path.

```php
Observability::aggregate (string $pattern, float $maxAge = 0.0): Snapshot
```
Reads and merges every JSON snapshot matching the glob `$pattern`; when `$maxAge > 0`, files older
than that many seconds are skipped.

```php
new Counter (string $name, string $help = '', array $labels = [], null|Closure $observe = null)
```
Monotonic total. `increment(int|float $by = 1): void` (negative throws); `read(): array`. With
`observe:` set, `read()` pulls the live total from the callback.

```php
new Gauge (string $name, string $help = '', array $labels = [], null|Closure $observe = null)
```
A value that moves both ways. `set(float): void`, `increment($by = 1)`, `decrement($by = 1)`,
`read(): array`. With `observe:`, `read()` pulls the live value.

```php
new Histogram (string $name, string $help = '', array $labels = [], array $buckets = Histogram::BUCKETS)
```
Buckets observations. `observe(float): void`; `read()` returns cumulative `le => count` buckets
(plus a `+Inf` total), `sum` and `count`. `Histogram::BUCKETS` is the Prometheus default ladder.

```php
Observability\Collector
```
Abstract source: `collect(): array`. Concretes `Collectors\Process` and `Collectors\Runtime`. The
`Collectors` collection exposes `push(Collector): self` and `collect(): array`.

```php
Observability\Data\Snapshot
```
DTO: public `$timestamp` and `$metrics` (series grouped by name). `merge(Snapshot): self` folds
another snapshot in (additive on matching name+labels); static `import(array): self` rebuilds one
from a decoded document.

```php
Observability\Exporters\JSON
```
Implements `Observability\Exporter` (`export(Snapshot): string`). Emits a newline-terminated
`{timestamp, metrics}` JSON document, preserving float values.

```php
new Observability\Exporters\Prometheus (string $namespace = '')
```
Implements `Exporter`. Renders Prometheus text exposition (v0.0.4): `# HELP`/`# TYPE` + one sample
per series; histograms expand to cumulative `_bucket{le=…}` plus `_sum`/`_count`. `$namespace`
prefixes every metric name.

```php
new Observability\Exporters\OTLP (string $service = 'bootgly', string $scope = 'bootgly.observability')
```
Implements `Exporter`. Renders an OTLP/HTTP metrics request as JSON (no protobuf): counters →
monotonic cumulative `sum`, gauges → `gauge`, histograms → `histogram` with de-cumulated
`bucketCounts` + `explicitBounds`; int64 fields (`timeUnixNano`, `count`, `bucketCounts`) are
strings. Shipped to a collector by `scripts/observability-ship.php`.

```php
new Bootgly\WPI\Nodes\HTTP_Server_CLI\Telemetry (Observability $Observability)
```
Registers HTTP request instruments on the registry; `boot(): void` attaches the
`Request\Events::Received`/`Handled` listeners that record `http_requests_total`,
`http_responses_total{class}`, `http_request_duration_seconds` and `http_requests_in_flight`. Off
until `boot()` (the server's guarded emit sites cost nothing when no listener is attached).

- **Layering** — `ACI\Observability` depends only on ABI and itself; `Collectors` read PHP builtins
  and `/proc/self`, never `ACI\Process` or any `WPI` class. The server feeds it through observable
  instruments — no `ACI → WPI` back-dependency.

## Next references

- **[Logging](/guide/logging/overview/)** — the sibling `ACI` pipeline that shares the pipe/sink model.
- **[Events](/guide/events/overview/)** — the ABI event bus (`Worker::Boot`) used to wire per-worker setup.
- **[Performance](/guide/performance/overview/)** — the zero-allocation patterns these instruments follow.
