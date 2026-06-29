Bootgly's HTTP Server CLI is a pure-PHP, event-driven server (workers + fibers, no C
extension). This page compares it with the alternatives measured in
[`bootgly_benchmarks`](https://github.com/bootgly/bootgly_benchmarks) across features,
performance and security.

## Features

### Runtime model

| Framework | Engine | Concurrency model | Core dependencies |
|---|---|---|---|
| **Bootgly** | Pure PHP | Workers + fibers, event loop | None (dependency-free core) |
| Swoole 6.2.0 | C extension | Coroutines | `ext-swoole` |
| Hyperf | C extension (Swoole) | Coroutines | `ext-swoole` + framework |
| ReactPHP | Pure PHP | Single-thread async event loop | ReactPHP packages |
| AMPHP | Pure PHP | Fibers async event loop | Amp packages |
| Laravel (Octane) | C extension (Swoole) | Persistent workers / coroutines | Laravel + Octane + `ext-swoole` |
| Laravel (nginx + PHP-FPM) | FPM process pool | Process per request | nginx + PHP-FPM |
| Laravel (OpenLiteSpeed + LSCache) | LSAPI + edge cache | Process pool + cache | OpenLiteSpeed |

Bootgly is the only entry that reaches this throughput class in **pure PHP** — no compiled
extension and no third-party runtime in its core.

### Feature comparison

Everything here ships inside the
[HTTP Server CLI core](https://github.com/bootgly/bootgly/tree/main/Bootgly/WPI/Nodes/HTTP_Server_CLI)
— no extra package.
[Routing](https://github.com/bootgly/bootgly/tree/main/Bootgly/WPI/Nodes/HTTP_Server_CLI/Router),
the [middleware pipeline](https://github.com/bootgly/bootgly/tree/main/Bootgly/WPI/Nodes/HTTP_Server_CLI/Router/Middlewares),
sessions, auth and the
[JSON / View / Database response resources](https://github.com/bootgly/bootgly/tree/main/Bootgly/WPI/Nodes/HTTP_Server_CLI/Response/Resources)
are wired into the request/response lifecycle and used directly (e.g. `$Response->JSON->send(...)`,
`$Response->View->render(...)`, `$Response->Database->...`). The table shows what each
alternative makes you assemble yourself.

_Legend: ✓ built-in · ➕ official/companion package · ✗ not provided_

| Feature | Bootgly | Swoole | Hyperf | ReactPHP | AMPHP | Laravel |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Built-in router | ✓ | ✗ | ✓ | ➕ | ➕ | ✓ |
| Middleware pipeline | ✓ | ✗ | ✓ | ➕ | ✓ | ✓ |
| JSON responses | ✓ | ➕ | ✓ | ➕ | ➕ | ✓ |
| Template / View rendering | ✓ | ✗ | ➕ | ✗ | ✗ | ✓ |
| Async database access (non-blocking) | ✓ | ✓ | ✓ | ➕ | ➕ | ✗ |
| Sessions | ✓ | ✗ | ✓ | ➕ | ➕ | ✓ |
| Authentication | ✓ | ✗ | ➕ | ✗ | ✗ | ✓ |
| Authorization | ✓ | ✗ | ➕ | ✗ | ✗ | ✓ |
| Request validation | ✓ | ✗ | ✓ | ✗ | ✗ | ✓ |
| File downloads (range / streaming) | ✓ | ✓ | ✓ | ➕ | ➕ | ✓ |
| Queue dispatch | ✓ | ✗ | ✓ | ➕ | ➕ | ✓ |
| HTTP client | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

Security middlewares (CORS, CSRF, rate limiting, trusted proxy, secure headers) are listed
under **Security**; raw throughput under **Performance**.

Laravel ships a similar feature checklist, but it runs **synchronously, one request per
process** (see Runtime model) — every database call blocks the worker. Bootgly is the only
stack here that pairs a full, batteries-included framework with an **async, event-driven core
in pure PHP** — exactly what the **Performance** gap reflects (≈ 150× Laravel + FPM on plaintext).

## Performance

> [!NOTE]
> **Methodology** — 24 logical CPUs (WSL2), PHP 8.4.22, 514 connections, 10s per point,
> `DB_POOL_MAX=1` for **every** framework (symmetric database footprint). Each server's
> **worker count** (`--server-workers`) was swept from 1 to 24; figures are the peak req/s at
> each framework's best worker count. Reproduce with the
> [HTTP_Server_CLI benchmark case](https://github.com/bootgly/bootgly_benchmarks/tree/main/HTTP_Server_CLI),
> full per-opponent runs under [results](https://github.com/bootgly/bootgly_benchmarks/tree/main/HTTP_Server_CLI/results).

Peak req/s per route, at each framework's best worker count:

| Route (req/s) | Bootgly | Swoole 6.2.0 | Hyperf | ReactPHP | AMPHP | Laravel (Octane) |
|---|--:|--:|--:|--:|--:|--:|
| `/plaintext` | 1,076,709 | 964,908 | 358,576 | 267,158 | 99,093 | 11,482 |
| `/json` | 1,068,765 | 979,082 | 347,233 | 269,292 | 99,244 | 11,413 |
| `/db` (single query) | 88,304 | 95,718 | 75,883 | 43,190 | 29,008 | 8,094 |
| `/query` (20×) | 20,341 | 17,263 | 15,800 | 924 | 1,890 | 2,326 |
| `/fortunes` | 73,640 | 98,557 | 75,650 | 42,550 | 14,954 | 7,695 |
| `/updates` (20×) | 5,974 | 3,721 | 3,499 | 1,086 | 809 | 321 |

Against Swoole — the closest competitor — Bootgly leads on `/plaintext`, `/json`, `/query`
(+126%) and `/updates` (+60%), trailing only on `/db` (−7.7%) and `/fortunes` (−25.3%) at peak
worker counts. Against every other framework it leads on every route. Laravel (Octane) is shown;
on nginx + PHP-FPM the gap widens to ≈ 150× on `/plaintext`.

## Security

The HTTP layer ships hardening **by default** (Bootgly HTTP security audit, June 2026), each
item exercised by the
[HTTP security test suite](https://github.com/bootgly/bootgly/tree/main/Bootgly/WPI/Nodes/HTTP_Server_CLI/tests/Security).
The benchmarked alternatives do not publish an equivalent comparative audit, so this section
documents Bootgly's built-in posture rather than ranking competitors — security in those
stacks is largely framework- and application-dependent.

| Area | Bootgly built-in default |
|---|---|
| HTTP protocol | Bare-LF request line rejected (`400`); unsupported version → `505` |
| Connection limits | Global **and** per-IP concurrency ceiling |
| Client IP trust | Immutable peer; `X-Forwarded-*` honored only behind an opt-in trusted proxy |
| Rate limiting | Sliding window, IPv6 `/64` grouping, global cap, pluggable key |
| CSRF | Per-response token masking (BREACH-resistant) with dual-accept validation |
| Chunked decoding | Absolute deadline + body-size cap on the decoder |
| JSONP | `text/javascript` + `X-Content-Type-Options: nosniff`, callback length cap |
| CORS | Restrictive default (no wildcard fallback), `Vary: Origin` on reflected origins |
| Security headers | CSP, HSTS, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, Referrer-Policy, Permissions-Policy |
| Sessions | Framework-owned `Secure` + `HttpOnly` cookies |
| Caching | ETag / compression gated to `2xx`/`3xx`; RFC 7232 `If-None-Match` handling |
| Views | Render-path whitelist + normalization |

> [!NOTE]
> These are server-layer defaults built into Bootgly's HTTP stack. Bring-your-own
> equivalents exist for most frameworks, but they are opt-in or live in application code
> rather than the server core.
