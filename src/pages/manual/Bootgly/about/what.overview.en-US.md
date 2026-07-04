# What is Bootgly?

Bootgly is the **native, zero-dependency PHP framework**: one asynchronous core that serves both the **Web** and the **Console (CLI)**. Its HTTP server is a long-running, event-loop process written in pure PHP — Fibers for non-blocking I/O, no Nginx or PHP-FPM in front, no C extensions required.

Bootgly is also the first PHP framework built on the **I2P (Interface-to-Platform)** architecture: six layered interfaces with a strict one-way dependency direction, where the top-level interfaces give rise to the platforms — `CLI` creates the **Console** platform and `WPI` creates the **Web** platform. The layers themselves are covered in [Architecture](/manual/Bootgly/basic/architecture/overview/).

In practice, the ecosystem is three repositories: [`bootgly`](https://github.com/bootgly/bootgly) is the **base platform** with the shared interfaces, while the **working platforms** — **Console** ([`bootgly-console`](https://github.com/bootgly/bootgly-console)) and **Web** ([`bootgly-web`](https://github.com/bootgly/bootgly-web)) — are the starting points for your own projects.

## What is in the box

Every item below is first-party code — the core has **zero third-party runtime dependencies**:

- **HTTP** — HTTP/1.1 and native HTTP/2 (HPACK, multiplexing, ALPN), TLS, generator-based router with per-route response cache, and an async HTTP client;
- **WebSockets** — server and client, RFC 6455, channels and broadcasting, permessage-deflate compression;
- **TCP / UDP** — raw socket servers and clients for custom protocols;
- **Data** — async PostgreSQL DBAL with connection pooling, Query Builder, Schema Builder, migrations, seeders, ORM (Data Mapper) and read replicas;
- **Security** — CORS, CSRF with token masking, sliding-window rate limiting, secure headers, trusted proxies, JWT (HS256/RS256/JWKS), RBAC authorization and server-side sessions;
- **Testing** — suites, expressive assertions, Mock/Spy/Fake doubles, code coverage, snapshots and deterministic fakers;
- **CLI** — command system, ANSI terminal I/O and UI components: Progress, Table, Menu, Alert, Logs;
- **Operations** — cache (File, APCu, shared memory, Redis), storage (Local, Memory, S3-compatible), queues, scheduler, events, logging and observability with JSON, Prometheus and OTLP exporters;
- **Templates** — native template engine with directives and iterators.

## Requirements and status

- **PHP ≥ 8.4** — Opcache + JIT recommended (up to +50% performance);
- **License** — MIT;
- **Operating system** — Linux native; Windows and other systems via Docker.

> [!WARNING]
> Bootgly is in **beta**, stabilizing toward 1.0. Pin a version and expect some API changes before the stable release — it is not yet recommended for production use.

## Next steps

- **[Why Bootgly?](/manual/Bootgly/about/why/overview/)** — the problems it solves and the proof behind it;
- **[Architecture](/manual/Bootgly/basic/architecture/overview/)** — the I2P layers in depth;
- **[Getting started](/guide/getting-started/overview/)** — your first project in one command;
- **[Bootgly vs other runtimes](/manual/WPI/HTTP/HTTP_Server_CLI/vs/)** — feature matrix and benchmarks against Swoole, Hyperf, ReactPHP, AMPHP and Laravel stacks.
