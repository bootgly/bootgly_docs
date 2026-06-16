# Docker

Run, test, benchmark and ship Bootgly without installing PHP locally. A single multi-stage
image gives you two targets:

- **`slim`** — PHP 8.4 with the required extensions, opcache and JIT, plus the framework
  source. Use it to run servers, deploy, and run your own projects.
- **`full`** — everything in `slim` plus the test framework, the internal benchmark cases
  and a few command-line tools. Use it to test and benchmark Bootgly.

The Docker assets live in the `bootgly_docker/` directory (a sibling of `bootgly/`). The
image stays dependency-free: no third-party runtime packages, no database, no external
benchmark frameworks.

## Build the image

The build context is the **parent** directory, so the `full` target can reach the sibling
`bootgly_benchmarks/`. Run these from inside `bootgly_docker/`:

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

Pass `-i` to run a server in the **foreground** — this is required in containers. Without it
the demo servers daemonize (fork and detach) and the container exits immediately. In the
foreground the server logs to stdout and stops cleanly on `SIGTERM` (`docker stop`).

```bash
docker run --rm -p 8082:8082 bootgly:slim project Demo-HTTP_Server_CLI start -i
```

Then, from another terminal:

```bash
curl http://localhost:8082
```

Every demo server reads the `PORT` environment variable (falling back to its default) and
binds `0.0.0.0`:

| Server | Project | Default port |
|--------|---------|--------------|
| HTTP  | `Demo-HTTP_Server_CLI`  | 8082 |
| HTTPS | `Demo-HTTPS_Server_CLI` | 443  |
| TCP   | `Demo-TCP_Server_CLI`   | 8080 |
| UDP   | `Demo-UDP_Server_CLI`   | 9999 |

Change the port without rebuilding:

```bash
docker run --rm -e PORT=9090 -p 9090:9090 bootgly:slim project Demo-HTTP_Server_CLI start -i
```

## Use Bootgly in your own project

### Bind-mount (quickest)

Mount your project into `/bootgly/projects/<Name>` and start it — no rebuild:

```bash
docker run --rm -p 8082:8082 \
  -v "$PWD/MyApp:/bootgly/projects/MyApp" \
  bootgly:slim project MyApp start -i
```

A project is found by its directory under `projects/`, so no registration is needed to
`start` it.

### Base image (for real apps)

```dockerfile
FROM bootgly:slim
COPY . /bootgly/projects/MyApp
EXPOSE 8082
CMD ["project", "MyApp", "start", "-i"]
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
  test benchmark HTTP_Server_CLI --opponents=bootgly --runner=tcp_client
```

Other cases include `TCP_Server_CLI`, `UDP_Server_CLI`, `Template_Engine` and `Cache`.

Cross-framework and TechEmpower (PostgreSQL + Swoole) benchmarking is intentionally not part
of this image; run that from the `bootgly_benchmarks` repository directly.

## Docker Compose

A Compose file in `bootgly_docker/` drives the three use-cases through profiles. From that
directory:

```bash
docker compose --profile serve up        # demo HTTP server on :8082
docker compose --profile test  up        # run a test suite
docker compose --profile bench up        # run the internal benchmark
```

Server state and PIDs persist in a named `workdata` volume.

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
BOOTGLY_VERSION   OCI image version label (default: 0.17.1-beta)
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
