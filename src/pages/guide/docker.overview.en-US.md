# Docker

Run, test, benchmark and ship Bootgly without installing PHP locally. A single multi-stage
image gives you two targets:

- **`slim`** — PHP 8.4 with the required extensions, opcache and JIT, plus the framework
  source. Use it to run servers, deploy, and run your own projects.
- **`full`** — everything in `slim` plus the test framework, the internal benchmark cases
  and a few command-line tools. Use it to test and benchmark Bootgly.

The Docker assets live in the `bootgly/` repository itself (`Dockerfile` and `docker-compose.yml` at the root, opcache/JIT tuning in `@/__php__/zz-bootgly.ini`). The
image stays dependency-free: no third-party runtime packages, no database, no external
benchmark frameworks.

## Install — the one canonical way

Bootgly has **one** canonical install and first-time setup path: the **installer wizard**.
In Docker, a bare interactive run opens it on the first run:

```bash
docker run -it --rm -v "$PWD/projects:/bootgly/projects" bootgly/bootgly
```

It is the same wizard behind [`bootgly project create`](/guide/getting-started) — a fixed
timeline guides you through the start mode (from scratch, import from the platforms or
from a Git remote), project path, interface (CLI or WPI), metadata and scaffolding. The
project — and the `projects/.initialized` first-run marker — land in your mounted
`projects/` directory, so later bare runs open the CLI directly, and explicit commands
always bypass the wizard.

The `-it` flags are required: without a TTY the wizard cannot open (the container prints
a hint instead). With Compose, set `stdin_open: true` and `tty: true`.

## Pull from Docker Hub

The images are published as `bootgly/bootgly` — pull and run, nothing to install:

```bash
# run your wizard-created project
docker run --rm -p 8082:8082 -v "$PWD/projects:/bootgly/projects" \
  bootgly/bootgly project <Name> start -f

# run the demo HTTP server
docker run --rm -p 8082:8082 bootgly/bootgly:slim project Demo/HTTP_Server_CLI start -f
```

Tags: `bootgly/bootgly:slim` (runtime), `:full` (test + benchmark) and `:latest` (= `slim`).

The rest of this guide uses the local `bootgly:slim`/`bootgly:full` tags that `docker build`
produces. If you pulled instead, prefix them with `bootgly/` (e.g. `bootgly/bootgly:slim`).

## Build the image

The build context is the **parent** directory, so the `full` target can reach the sibling
`bootgly_benchmarks/`. Run these from the `bootgly/` repo root:

```bash
# slim — runtime only
docker build -f Dockerfile --target slim -t bootgly:slim ..

# full — adds test + benchmark
docker build -f Dockerfile --target full -t bootgly:full ..
```

The `bootgly` CLI is the image entrypoint, so any arguments you pass go straight to it:

```bash
docker run --rm bootgly:slim help
docker run --rm bootgly:slim demo
docker run --rm -it --entrypoint bash bootgly:full   # open a shell
```

## Run a server

Pass `-f` to run a server in the **foreground** (headless) — this is required in containers.
Without it the demo servers daemonize (fork and detach) and the container exits immediately.
In the foreground the server logs to stdout and stops cleanly on `SIGTERM` (`docker stop`).
(`-i` instead gives an interactive REPL and needs a TTY, e.g. `docker run -it`.)

```bash
docker run --rm -p 8082:8082 bootgly:slim project Demo/HTTP_Server_CLI start -f
```

Then, from another terminal:

```bash
curl http://localhost:8082
```

Every demo server reads the `PORT` environment variable (falling back to its default) and
binds `0.0.0.0`:

| Server | Project | Default port |
|--------|---------|--------------|
| HTTP  | `Demo/HTTP_Server_CLI`  | 8082 |
| HTTPS | `Demo/HTTPS_Server_CLI` | 443  |
| TCP   | `Demo/TCP_Server_CLI`   | 8080 |
| UDP   | `Demo/UDP_Server_CLI`   | 9999 |

Change the port without rebuilding:

```bash
docker run --rm -e PORT=9090 -p 9090:9090 bootgly:slim project Demo/HTTP_Server_CLI start -f
```

## Use Bootgly in your own project

### Bind-mount (quickest)

Mount your project into `/bootgly/projects/<Name>` and start it — no rebuild:

```bash
docker run --rm -p 8082:8082 \
  -v "$PWD/MyApp:/bootgly/projects/MyApp" \
  bootgly:slim project MyApp start -f
```

A project is found by its directory under `projects/`, so no registration is needed to
`start` it.

### Base image (for real apps)

```dockerfile
FROM bootgly:slim
COPY . /bootgly/projects/MyApp
EXPOSE 8082
CMD ["project", "MyApp", "start", "-f"]
```

```bash
docker build -t myapp .
docker run --rm -p 8082:8082 myapp
```

## Test

Run a suite (or a single test) by index:

```bash
docker run --rm bootgly:full test 16          # one suite
docker run --rm bootgly:full test 16 1         # one test in a suite
docker run --rm -e AI_AGENT=1 bootgly:full test 16   # machine-readable output
```

A few suites assert against host-specific paths (such as `/etc/php/8.3/`) or assume a
non-root user (such as `/sbin` not being writable). Those assumptions do not hold inside a
clean container, and because the test runner is fail-fast the full `docker run --rm
bootgly:full test` stops at the first such suite. Run suites individually by index to work
around it — this is a property of those tests, not of the image.

## Benchmark

The internal benchmark compares Bootgly against itself using the built-in TCP_Client runner —
no database, no external frameworks:

```bash
docker run --rm bootgly:full \
  test benchmark HTTP_Server_CLI --opponents=bootgly --runner=tcp_client --loads=benchmark:1
```

Other cases include `TCP_Server_CLI`, `UDP_Server_CLI`, `Template_Engine` and `Cache`.

### Cross-framework (vs Swoole, Workerman, …)

Competitor runtimes are never baked into `bootgly:slim`/`:full` — they stay dependency-free.
They live only in the separate `bootgly_benchmarks` image. Every server is spawned locally in the
one container, so all share loopback and the comparison stays fair.

Pull and run (Swoole already baked in):

```bash
docker run --rm bootgly/bootgly_benchmarks:swoole test benchmark HTTP_Server_CLI \
  --opponents=bootgly,swoole --runner=tcp_client --loads=benchmark:1 --server-workers=15
```

A full worker **sweep with charts** also runs in one `docker run` —
`--server-workers` accepts sweep values (`1..24`, `1..24:4`, `1,2,4,8`), each
one an execution round, and `--results=charts` generates the Markdown report +
native SVG charts. Mount a host directory to keep the artifacts:

```bash
docker run --rm -v "$(pwd)/results:/bootgly/storage/tests/benchmarks" \
  bootgly/bootgly_benchmarks:swoole test benchmark HTTP_Server_CLI \
  --opponents=bootgly,swoole --loads=techempower:1,2 \
  --server-workers=1..24:4 --results=charts
```

Or build it yourself (e.g. to add other opponents), from `bootgly_benchmarks/` (build
`bootgly:full` first), opting in per opponent with a build ARG:

```bash
docker build -f Dockerfile --build-arg WITH_SWOOLE=1 -t bootgly_benchmarks:swoole .

docker run --rm bootgly_benchmarks:swoole test benchmark HTTP_Server_CLI \
  --opponents=bootgly,swoole --runner=TCP_Client --loads=benchmark:1
```

Opponent ARGs: `WITH_SWOOLE`, `WITH_WORKERMAN`, `WITH_ROADRUNNER`, `WITH_FRANKENPHP`,
`WITH_HYPERF`, and `WITH_POSTGRES` (for TechEmpower DB loads of the `swoole` opponent).

### Laravel (TechEmpower)

The Laravel opponents (`laravel-nginx`, `laravel-apache`) are a heavier, **separate** image:
Laravel 13 served by nginx and Apache over PHP-FPM 8.4, with PostgreSQL for the six
TechEmpower routes. It runs as a non-root user (PHP-FPM refuses `opcache.preload` as root)
and has its own `Dockerfile.laravel`. PostgreSQL is started and the TechEmpower tables seeded
automatically on first run.

```bash
docker run --rm \
  bootgly/bootgly_benchmarks:laravel test benchmark HTTP_Server_CLI \
  --opponents=bootgly,laravel-nginx,laravel-apache --runner=TCP_Client --loads=techempower:1,3
```

> `--loads=<set>:<indexes>` is mandatory. The `techempower:` set both selects the load
> routes and tells the Bootgly opponent which server router to serve — no env needed. Use
> `techempower:*` for all six routes, or list indices (`techempower:1,3`).

Build it yourself from `bootgly_benchmarks/` (with `bootgly:full` built first):

```bash
docker build -f Dockerfile.laravel -t bootgly_benchmarks:laravel ..
```

## Docker Compose

A Compose file at the `bootgly/` repo root drives the three use-cases through profiles. From
that root:

```bash
docker compose --profile serve up        # demo HTTP server on :8082
docker compose --profile test  up        # run a test suite
docker compose --profile bench up        # run the internal benchmark
```

Server state and PIDs persist in a named `storage` volume.

## Reference

### Image layout

```text
/bootgly/                 framework source · WORKDIR · symlinked to /usr/local/bin/bootgly
/bootgly_benchmarks/      benchmark cases (full target only)
/usr/local/etc/php/conf.d/zz-bootgly.ini   opcache + JIT tuning
```

### Exposed ports

`8082` HTTP, `443` HTTPS, `8080` TCP, `8083`/`8084` benchmark, `9999/udp` UDP.

### Environment variables

```text
PORT        Overrides a server's listening port
AI_AGENT    Set to 1 for machine-readable test output
```

### Build arguments

```text
PHP_IMAGE         Base image (default: php:8.4-cli-bookworm)
BOOTGLY_VERSION   OCI image version label
```

### PHP extensions

Built into the image: `pcntl`, `sockets`, `shmop`, `opcache` and `mbstring`, plus `openssl`,
`posix` and `readline` from the base image. opcache and tracing JIT are enabled by default.

### Notes

```text
User       Containers run as root by default so the framework can bind low ports
           (e.g. 443) and manage workers/PIDs. Pass --user to drop privileges
           (use a port >= 1024).
Coverage   Disable opcache for accurate coverage runs:
           docker run --rm bootgly:full php -d opcache.enable_cli=0 bootgly test --coverage
```
