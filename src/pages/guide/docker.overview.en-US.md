# Docker

Bootgly publishes **three** images, one per repository, each with a different job:

| Image | What it is | Reach for it to |
|-------|------------|-----------------|
| `bootgly/bootgly.kit` | **The product.** Framework + Console + Web + the kit entry — the same thing `curl -fsSL https://bootgly.com/install \| bash` installs. | Run Bootgly. |
| `bootgly/bootgly` | **The framework alone** — the ingredient. No Console, no Web, and `kit` commands do not work in it. | Build your own image on Bootgly. |
| `bootgly/bootgly_benchmarks` | **The cross-framework harness**, one tag per contender. | Race Bootgly against Swoole, FrankenPHP, Bun, … |

If you only want to *use* Bootgly, you want `bootgly/bootgly.kit` and nothing else on this
page until the Reference.

> **Coming from an older tag? `bootgly/bootgly` changed meaning.** Every tag that repository
> published up to and including `1.0.0-rc.1` — `:slim`, `:full`, the bare versions, and the
> `:rc` / `:beta` channels — carried an image that presented itself as the product: a bare
> `docker run -it` opened the project wizard. That repository is now **the framework alone**:
> a bare run prints the help, and `kit` commands refuse. The product moved to
> `bootgly/bootgly.kit`.
>
> | You were running | Run now |
> |---|---|
> | `bootgly/bootgly:slim`, or any bare version tag | `bootgly/bootgly.kit` |
> | `bootgly/bootgly:rc` / `:beta` | `bootgly/bootgly.kit:rc` / `:beta` |
> | `bootgly/bootgly:full` | `bootgly/bootgly` (framework + its suites) or `bootgly/bootgly_benchmarks` |
> | `FROM bootgly/bootgly:<version>` in an image of your own | unchanged — that is exactly what this image is for |
>
> Tags already published are never rewritten: `bootgly/bootgly:1.0.0-rc.1` keeps the bytes it
> shipped with, and both release workflows refuse to overwrite an exact version tag. The
> **moving** channels are the ones to watch — `:rc` and `:beta` follow the newest pre-release
> of whatever their repository publishes today, so pin an exact version if you need the old
> image to stay put. `:slim`, `:full` and every `*-full` were **deleted** on 2026-09-04 and no
> longer resolve at all — a pull against one now fails outright rather than quietly handing
> over a variant that means the opposite of its name.
>
> Why the variant names are gone: in every other image on Docker Hub `slim` means a smaller OS
> base, not less software — and Bootgly's `slim` was the product while `full` was the
> benchmark harness, so the names said the opposite of the truth.

> **The kit image has no `latest` while Bootgly is in pre-release** (and the framework image
> never gets one — see the tag scheme). Append the channel tag to
> every image name below — `bootgly/bootgly.kit:rc` — or pin an exact version
> (`bootgly/bootgly.kit:1.0.0-rc.1`). See [Tag scheme](#tag-scheme).

## Run Bootgly

### First run — the wizard

A bare interactive run opens the canonical project installer:

```bash :toolbar="true";
docker run -it --rm \
  -v "$PWD/projects:/bootgly/projects" \
  -v "$PWD/storage:/bootgly/storage" \
  bootgly/bootgly.kit
```

It is the same wizard behind [`bootgly projects create`](/guide/getting-started) — start
mode (from scratch, from a shipped example, or from a Git remote), project path, interface
(CLI or WPI), metadata and scaffolding. That first run also lays down the kit's resource
directories and stocks the shipped example projects — the framework Demos, the Console
games, the Web examples — into `projects/`, as living guides for you and for AI agents.

The `-it` flags are required: without a TTY the wizard cannot open and the container prints
a hint instead. With Compose, set `stdin_open: true` and `tty: true`.

Any explicit command bypasses the wizard and goes straight to the `bootgly` CLI:

```bash
docker run --rm bootgly/bootgly.kit help
docker run --rm bootgly/bootgly.kit test --bootgly 102          # one framework suite
docker run --rm bootgly/bootgly.kit project Demo/HTTP_Server_CLI start -f
```

### Keep your work — volumes

`/bootgly/projects` and `/bootgly/storage` are declared `VOLUME`s. Bind-mount them and your
projects, logs, PIDs and cache live on the host:

```bash :toolbar="true";
docker run --rm -it \
  -v "$PWD/projects:/bootgly/projects" \
  -v "$PWD/storage:/bootgly/storage" \
  bootgly/bootgly.kit projects list
```

Once the wizard has run, that lists your projects and the stocked examples.

Two consequences worth stating plainly:

- **A `docker pull` of a newer version keeps everything that lives in a volume.** Upgrading
  replaces the image — the framework, the platforms, the CLI — and never the volume.
- **Work written inside a container with no volume dies with it.** Without `-v`, Docker
  seeds an *anonymous* volume from the image, and `--rm` deletes it when the container
  exits. The wizard will happily create a project you will never see again.

The first-run marker is `projects/.initialized`, so it lives in the volume too: mount
`projects/` and the wizard opens once, on the first run; later bare runs print the CLI help.

### Run a server

Pass `-f` to run a server in the **foreground** (headless) — required in containers. Without
it the server daemonizes and the container exits immediately. In the foreground it logs to
stdout and drains gracefully on `SIGTERM`, which is what `docker stop` sends (the image
declares `STOPSIGNAL SIGTERM`).

```bash :toolbar="true";
docker run --rm -p 8082:8082 \
  bootgly/bootgly.kit project Demo/HTTP_Server_CLI start -f
```

Then, from another terminal:

```bash :toolbar="true";
curl http://localhost:8082
```

The `Demo/*` projects come from the framework the image carries, so they run before the
wizard has stocked anything into `projects/`.

Your own project starts the same way, once `projects/` is mounted:

```bash
docker run --rm -p 8082:8082 \
  -v "$PWD/projects:/bootgly/projects" \
  -v "$PWD/storage:/bootgly/storage" \
  bootgly/bootgly.kit project MyApp start -f
```

Every shipped server reads the `PORT` environment variable (falling back to its default) and
binds `0.0.0.0`, so you can move a port without rebuilding anything:

```bash :toolbar="true";
docker run --rm -e PORT=9090 -p 9090:9090 \
  bootgly/bootgly.kit project Demo/HTTP_Server_CLI start -f
```

### Move between versions

Inside the image, a release **is** an image tag:

```bash
docker pull bootgly/bootgly.kit:1.0.0-rc.1
```

`kit upgrade`, `kit downgrade` and `kit list` refuse inside the image and say why: the image
ships the kit *layout*, not a git checkout (the build removes `.git` deliberately), so there
is nothing for them to move — and rewriting a filesystem the next `docker run` throws away
would only look like it worked. The refusal names `docker pull` and prints the version the
image carries.

### Build the kit image yourself

```bash
docker build -f Dockerfile --target kit \
  --build-arg BOOTGLY_VERSION=1.0.0-rc.1 \
  -t bootgly.kit:1.0.0-rc.1 .
```

Run it from a clone of the [`bootgly.kit`](https://github.com/bootgly/bootgly.kit)
repository. The build takes **nothing** from the build context: it git-clones the kit at its
release tag with submodules, so one tag pins framework + Console + Web and the image
reproduces from the tag alone. Two consequences: the build needs network, and it always
builds a *pushed* ref — uncommitted work never lands in the image. To build another ref:

```bash
docker build -f Dockerfile --target kit \
  --build-arg BOOTGLY_VERSION=1.0.0-rc.1 \
  --build-arg BOOTGLY_KIT_REF=main \
  -t bootgly.kit:main .
```

## Build on the framework image

`bootgly/bootgly` is the framework and nothing else — the ingredient you compose with. Use
it when you ship your own image and do not want the kit's platforms or its project registry.

`<version>` below is a placeholder for a real tag, and it has to be one published **after**
this split: everything up to `1.0.0-rc.1` is the old, product-shaped image, and those tags are
never rewritten. There is no moving alias to fall back on — this repository publishes no
`latest`, and `:rc` / `:beta` follow pre-releases only. Pick the version you want from
[the tag list](https://hub.docker.com/r/bootgly/bootgly/tags).

```dockerfile
# syntax=docker/dockerfile:1
FROM bootgly/bootgly:<version>

COPY . /bootgly/projects/MyApp/

# The registry is the allow-list: an unregistered path never starts.
COPY <<'PHP' /bootgly/projects/Bootgly.projects.php
<?php

return [
   'MyApp' => ['interfaces' => ['WPI']],
];
PHP

EXPOSE 8082
CMD ["project", "MyApp", "start", "-f"]
```

```bash
docker build -t myapp .
docker run --rm -p 8082:8082 myapp
```

Pin an exact version in `FROM`; once a stable release exists you can pin the major instead
(`bootgly/bootgly:1`), which moves forward with every 1.x release.

Writing that file replaces the framework's own registry, so the shipped `Demo/*` projects
stop resolving — which is exactly what you want in an application image. Keep `CMD` as the
argument list: the `bootgly` CLI is the image entrypoint, so everything you pass goes
straight to it.

### Run the framework's suites

The framework image is also where the framework tests itself:

```bash
docker run --rm bootgly/bootgly:<version> test 16      # one suite, by index
docker run --rm bootgly/bootgly:<version> test 16 1    # one case in a suite
docker run --rm -e AI_AGENT=1 bootgly/bootgly:<version> test 16   # machine-readable output
```

> **Run suites by index inside a container.** A full run deadlocks there: a suite that spawns a
> server leaves it holding the runner's output pipe, and the runner blocks reading it — for good.
> The container does not exit, so `--rm` never fires either; you get it back with `docker stop`.
> Every suite passes on its own, so the reliable shape in a container is one index at a time. The
> Auto-TLS suites add a second reason: the image runs as root, and Auto-TLS refuses to touch
> credential storage as root without a `user` in the server Configs. The full run belongs to the
> framework's CI on a host.


A run reports **every** failure by default; `--fail-fast` stops at the first one. A few
suites assume a non-root user (for example, that `/sbin` is not writable) — those
assumptions do not hold in a clean container, and the failures they produce are a property
of those tests, not of the image.

In the **kit** image the scope is resolved from the working directory instead, so name it
explicitly there: `test --bootgly`, `--console` or `--web`.

### Build the framework image yourself

From the `bootgly` repository root — the build context is the repository itself:

```bash
docker build -f Dockerfile --target framework -t bootgly:framework .
```

### Docker Compose

The `bootgly` repository ships a Compose file with two profiles, both building that same
framework image once:

```bash
docker compose --profile serve up        # demo HTTP server on :8082
docker compose --profile test  up        # one suite (SUITE=16 to pick it)
```

Server state and PIDs persist in a named `storage` volume. There is no `bench` profile: the
benchmark runs from its own published image.

## Benchmark against other frameworks

`bootgly/bootgly_benchmarks` is the harness — it builds **on** `bootgly/bootgly` and adds
the contenders, PostgreSQL and the benchmark cases. Every server is spawned locally inside
the one container, so client and servers share loopback and the comparison stays fair. There
is one tag per contender:

`bootgly` · `swoole` · `workerman` · `roadrunner` · `frankenphp` · `hyperf` · `reactphp` ·
`amphp` · `laravel-octane` · `express` · `bun`

The `bootgly` tag is the harness with no opponent baked in.

```bash :toolbar="true";
docker run --rm bootgly/bootgly_benchmarks:swoole \
  test benchmark HTTP_Server_CLI \
  --opponents=bootgly,swoole --runner=tcp_client --loads=benchmark:1
```

PostgreSQL is booted and seeded by the entrypoint, so the database load sets work with zero
host setup:

```bash
docker run --rm bootgly/bootgly_benchmarks:swoole \
  test benchmark HTTP_Server_CLI \
  --opponents=bootgly,swoole --runner=tcp_client --loads=techempower:1,3
```

> `--loads=<set>:<indexes>` is mandatory. The `techempower:` set both selects the load routes
> and tells the Bootgly opponent which router to serve. Use `techempower:*` for every route,
> or list indices (`techempower:1,3`).

A full worker **sweep with charts** also runs in one `docker run` — `--server-workers`
accepts sweep values (`1..24`, `1..24:4`, `1,2,4,8`), each one an execution round, and
`--results=charts` generates the Markdown report plus native SVG charts. Mount a host
directory to keep the artifacts:

```bash
docker run --rm -v "$PWD/results:/bootgly/storage/tests/benchmarks" \
  bootgly/bootgly_benchmarks:swoole \
  test benchmark HTTP_Server_CLI \
  --opponents=bootgly,swoole --loads=techempower:1,2 \
  --server-workers=1..24:4 --results=charts
```

Other cases: `TCP_Server_CLI`, `UDP_Server_CLI`, `WS_Server_CLI`, `Template_Engine`, `Cache`
and `Progress_Bar`.

### Build one yourself

From a clone of [`bootgly_benchmarks`](https://github.com/bootgly/bootgly_benchmarks), one
build ARG per opponent:

```bash
docker build -f Dockerfile \
  --build-arg BOOTGLY_FRAMEWORK_IMAGE=bootgly/bootgly:<version> \
  --build-arg WITH_SWOOLE=1 \
  -t bootgly_benchmarks:swoole .
```

The base image is **required** — there is no default, on purpose: `bootgly/bootgly` publishes
no moving stable alias, so any default would freeze on a pre-release the day a stable ships and
quietly benchmark unreleased code.

## Reference

### Images

```text
bootgly/bootgly.kit          the product — framework + Console + Web + the kit entry
                             base: php:8.4-cli-bookworm · built by the bootgly.kit repo
bootgly/bootgly              the framework alone — the ingredient
                             base: php:8.4-cli-bookworm · built by the bootgly repo
bootgly/bootgly_benchmarks   the cross-framework benchmark harness
                             base: bootgly/bootgly · built by the bootgly_benchmarks repo
```

### Tag scheme

The version **is** the tag; there is no variant suffix to confuse it with.

| Release | `bootgly/bootgly.kit` (the product) | `bootgly/bootgly` (the ingredient) |
|---------|-------------------------------------|------------------------------------|
| Stable `1.2.3` | `1.2.3`, `1.2`, `1`, `latest` | `1.2.3`, `1.2`, `1` |
| Pre-release `1.0.0-rc.1` | `1.0.0-rc.1`, `rc` | `1.0.0-rc.1`, `rc` |
| Pre-release `1.0.0-beta.4` | `1.0.0-beta.4`, `beta` | `1.0.0-beta.4`, `beta` |

**Only the kit image gets `latest`.** `docker pull bootgly/bootgly` with no tag would otherwise
hand you the framework alone — no Console, no Web, no `kit` command — which is exactly the
confusion this split exists to end. The framework image is always pulled by an explicit tag.

A pre-release **never** moves `latest`, nor the major/minor aliases — otherwise
`docker pull bootgly/bootgly.kit` would hand unreleased code to every user. The channel
aliases (`rc`, `beta`) are moving tags you opt into deliberately. `latest` therefore appears
only once a stable release is published; while Bootgly is in pre-release, pull the channel
alias or an exact version.

The benchmark images are tagged by contender instead (`:swoole`, `:bun`, …) and are rebuilt
against each freshly published framework image.

### Architectures

```text
bootgly/bootgly.kit          linux/amd64, linux/arm64
bootgly/bootgly              linux/amd64, linux/arm64
bootgly/bootgly_benchmarks   linux/amd64
```

The benchmark images stay amd64 because the opponents ship amd64-only binaries — FrankenPHP
is pinned by an amd64 image digest, and RoadRunner and Bun bring their own binaries.

### Ports

The kit image exposes the ports of the shipped example servers; your own project publishes
its own.

| Server | Project | Default port |
|--------|---------|--------------|
| HTTP      | `Demo/HTTP_Server_CLI`  | 8082 |
| HTTPS     | `Demo/HTTPS_Server_CLI` | 443  |
| TCP       | `Demo/TCP_Server_CLI`   | 8080 |
| WebSocket | `Demo/WS_Server_CLI`    | 8083 |
| UDP       | `Demo/UDP_Server_CLI`   | 9999/udp |

The framework image exposes the same set plus `8084` (the benchmark pair `8083`/`8084`).

### Volumes and paths

```text
/bootgly/projects   VOLUME (kit image) — your projects + the .initialized marker
/bootgly/storage    VOLUME (kit image) — logs, PIDs, cache, locks, queues, temp, tests
/bootgly            WORKDIR · symlinked to /usr/local/bin/bootgly
/bootgly/Bootgly    the framework, inside the kit image
/bootgly_benchmarks the benchmark cases (benchmark images only)
/usr/local/etc/php/conf.d/zz-bootgly.ini   opcache + JIT tuning
```

### Environment variables

```text
PORT              Overrides a server's listening port
AI_AGENT          Any non-empty value selects machine-readable test output
BOOTGLY_DOCKER    Set to 1 by both published images; it only changes the wording of the
                  `kit` refusal (releases are image tags here). Nothing else reads it —
                  which image you are in is decided by the layout on disk, so setting
                  it by hand cannot make a test or a refusal say something untrue
DB_HOST DB_PORT   Benchmark images only — default to the container's local
DB_NAME DB_USER   PostgreSQL, overridable with `docker run -e`
DB_PASS
```

### Build arguments

```text
PHP_IMAGE            Base image (default: php:8.4-cli-bookworm)
BOOTGLY_VERSION      Version label — also the default kit ref (v${BOOTGLY_VERSION})
BOOTGLY_KIT_REF      Kit image only: the branch or tag to clone and build (a bare
                     commit is rejected — `git clone --branch` takes a ref name)
BOOTGLY_FRAMEWORK_*  Source provenance recorded in the image (sha, dirty flag, hashes)

BOOTGLY_FRAMEWORK_IMAGE   Benchmark images: the framework image to build FROM
WITH_SWOOLE  WITH_WORKERMAN  WITH_ROADRUNNER  WITH_FRANKENPHP  WITH_HYPERF
WITH_REACTPHP  WITH_AMPHP  WITH_LARAVEL_OCTANE  WITH_EXPRESS  WITH_BUN
```

The framework image can also record its exact source tuple, which the build context cannot
carry because it excludes `.git`:

```bash
docker build \
  $(php Bootgly/ACI/Tests/Benchmark/provenance.php . ../bootgly_benchmarks --docker-build-args) \
  -f Dockerfile --target framework -t bootgly:framework .
```

### Labels

Both images carry the standard OCI labels — `org.opencontainers.image.title`,
`.description`, `.version`, `.revision` (the framework commit), `.licenses` (MIT) and
`.source`, `.vendor`, `.url` and `.documentation`. The kit and framework images carry the full
set; the benchmark images carry none.

### PHP extensions and tuning

Built in: `pcntl`, `sockets`, `shmop`, `sysvshm`, `sysvsem`, `opcache` and `mbstring`, plus
`openssl`, `posix` and `readline` from the base image. `zz-bootgly.ini` enables opcache for
the CLI SAPI and the tracing JIT (256 MB buffer), with a 256 MB memory limit. Override any
value at run time with `-d`.

### Notes

```text
User       The image runs as root on purpose: binding :80/:443 — Auto-TLS' HTTP-01
           challenge included — needs it, and the server demotes its own workers
           through the `user`/`group` server Configs. `--user` is not a drop-in
           override: projects/ and storage/ are created root-owned, so a non-root
           run needs both mounted from the host, owned by that uid, and binds no
           privileged port.
Stop       STOPSIGNAL is SIGTERM and the server drains in flight work, so
           `docker stop` is a graceful shutdown.
Coverage   Disable opcache for accurate coverage runs. The entrypoint IS the
           `bootgly` CLI, so reach PHP by replacing it:
           docker run --rm --entrypoint php bootgly/bootgly:<version> \
             -d opcache.enable_cli=0 /bootgly/bootgly test --coverage 102
```
