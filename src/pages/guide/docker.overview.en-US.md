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
> | `bootgly/bootgly:rc` / `:beta` | `bootgly/bootgly.kit` (the stable line) — or `bootgly/bootgly.kit:rc` / `:beta` to keep following pre-releases |
> | `bootgly/bootgly:full` | `bootgly/bootgly` (framework + its suites) or `bootgly/bootgly_benchmarks` |
> | `FROM bootgly/bootgly:<version>` in an image of your own | unchanged — that is exactly what this image is for |
>
> Tags already published are never rewritten: `bootgly/bootgly:1.0.0-rc.1` keeps the bytes it
> shipped with, and both release workflows refuse to overwrite an exact version tag. The
> **moving** tags are the ones to watch — `latest`, `1` and `1.0` on the kit follow the stable
> line, and `:rc` / `:beta` follow the newest pre-release of whatever their repository
> publishes today — so pin an exact version if you need an image to stay put. `:slim`, `:full`
> and every `*-full` were **deleted** on 2026-09-04 and no longer resolve at all — a pull
> against one now fails outright rather than quietly handing over a variant that means the
> opposite of its name.
>
> Why the variant names are gone: in every other image on Docker Hub `slim` means a smaller OS
> base, not less software — and Bootgly's `slim` was the product while `full` was the
> benchmark harness, so the names said the opposite of the truth.

> **`latest` follows the stable line.** Plain `bootgly/bootgly.kit` is `bootgly/bootgly.kit:latest`,
> which moves forward with every stable release — it is what every command on this page uses,
> and the framework image never gets one (see the tag scheme). Pinning a version is what makes
> a deploy immutable: `bootgly/bootgly.kit:1.0.0` never changes, and `bootgly/bootgly.kit:1`
> moves only within the 1.x line. See [Tag scheme](#tag-scheme).

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

### Back into the kit

The wizard closes when it is done and, with `--rm`, the container is deleted with it. Nothing
is lost — your projects and your data live in the two mounted directories on the host, not in
the container — but there is no container to "go back into". **Every return is a new container
over the same mounts**, and the mounts are what make it the same kit.

Re-running the bare command does *not* reopen the wizard: the first run leaves a
`projects/.initialized` marker, which is on the volume, so from then on a plain `docker run`
prints the help. Every start of a prepared kit also lays the image's agent rules down again in
`projects/AGENTS.md` and `projects/.agents/rules/` when they drifted — a mounted `projects/` never
sees `kit upgrade`, so a new image is what updates them; your own files elsewhere in
`projects/.agents/` are never touched. Reach for one of these instead.

**Run a command.** Anything explicit goes straight to the `bootgly` CLI:

```bash :toolbar="true";
docker run -it --rm \
  -v "$PWD/projects:/bootgly/projects" \
  -v "$PWD/storage:/bootgly/storage" \
  bootgly/bootgly.kit projects list
```

**Open a shell inside the kit** — the closest thing to "entering" it:

```bash :toolbar="true";
docker run -it --rm \
  -v "$PWD/projects:/bootgly/projects" \
  -v "$PWD/storage:/bootgly/storage" \
  --entrypoint bash bootgly/bootgly.kit
```

You land in `/bootgly` with `bootgly` on the `PATH`.

**Create another project** — the wizard again, on purpose: append `projects create`.

**Keep one container around** instead of a fresh one each time. Drop `--rm`, give it a name,
and it survives until you remove it:

```bash :toolbar="true";
docker run -dit --name bootgly \
  -v "$PWD/projects:/bootgly/projects" \
  -v "$PWD/storage:/bootgly/storage" \
  -p 8080:8080 \
  --entrypoint bash bootgly/bootgly.kit

docker exec -it bootgly bash     # enter it, as many times as you like
docker stop bootgly              # stop it
docker start -ai bootgly         # start and re-enter it
docker rm -f bootgly             # throw it away (projects/ and storage/ stay)
```

Prefer the throwaway `--rm` form for one-off commands and the named container when you want a
long-lived workspace. Either way the state that matters is in the two directories.

### Keep your work — volumes

`/bootgly/projects` and `/bootgly/storage` are declared `VOLUME`s. Bind-mount them and your
projects, logs, PIDs and cache live on the host:

```bash :toolbar="true";
docker run --rm -it \
  -v "$PWD/projects:/bootgly/projects" \
  -v "$PWD/storage:/bootgly/storage" \
  bootgly/bootgly.kit projects list
```

Create the two directories yourself before the first run (`mkdir -p projects storage`). Docker
creates a missing bind-mount source as root; a directory you created is yours, and what the
image writes into `projects/` — the project the wizard scaffolds, the stocked examples and the
project registry — is handed to you when the command finishes, so your editor and your `git`
can touch it without `sudo`. `storage/` is the runtime's: what the servers write there stays
owned by root and by the `bootgly` account.

The workers of an HTTP server write the session key and records under `storage/sessions` as
`bootgly`. On a root launch, the server creates that directory when it is missing and hands
it to `bootgly`, owner-only (`0700`). One that already exists and is not a plain directory of
`bootgly`'s that only its owner can write — left by an older run as root, created by you, a
link, or group- or world-writable — is never given away: the server refuses to start and says which one and how
to fix it:

```
Server not started: storage/sessions is not bootgly's and was left as found: make it bootgly's
yourself. The workers run as bootgly and write there: `chown -R bootgly: /bootgly/storage/sessions`
before starting.
```

Run that command once, inside the container (`docker run --rm --entrypoint chown … -R
bootgly: /bootgly/storage/sessions`), and start again. The kit image ships `storage/sessions`
already owned by `bootgly`; a storage volume created from an older image has none, and the
server creates it on its first root launch. `storage/cache` stays root's: root-run commands
read what it holds. The workers keep their own cache tree instead — compiled templates and
default file caches — in `storage/cache-<uid>` (`0700`), which the server creates and hands to
`bootgly` on a root launch under the same rules (when it cannot, it says so and the workers
cache in a private temporary directory instead of refusing to start). With a `storage/` you
created on the host, neither root nor `bootgly` can trust the tree, so both keep their caches
in a private `bootgly-<uid>/` directory of the container's temporary directory.

The session store also refuses a path whose ancestors another account could replace — a
directory owned by neither root nor `bootgly`, or writable by its group or by everyone. A
`storage/` you created on the host belongs to your host account, so on a root launch the
server starts but warns that every session access will fail. If your HTTP project uses
sessions, give the mounted directory to root inside the container (`docker run --rm
--entrypoint chown … root: /bootgly/storage`) — and drop any group/world write bit
(`chmod go-w`) — or let Docker keep the volume (no bind mount). The warning names the
ancestor and the one command that clears it.

Once the wizard has run, that lists your projects and the stocked examples.

Two consequences worth stating plainly:

- **A `docker pull` of a newer version keeps everything that lives in a volume.** Upgrading
  replaces the image — the framework, the platforms, the CLI — and never the volume.
- **Work written inside a container with no volume dies with it.** Without `-v`, Docker
  seeds an *anonymous* volume from the image, and `--rm` deletes it when the container
  exits. The wizard will happily create a project you will never see again.

The first-run marker is `projects/.initialized`, so it lives in the volume too: mount
`projects/` and the wizard opens once, on the first run; later bare runs print the CLI help.

### A volume the platform mounts as root

Hosting platforms and orchestrators ignore the `VOLUME` declarations of an image and mount a
volume of their own over `/bootgly/storage`: empty, and owned by root. The layout the image
created at build time stays under the mount, out of reach.

From 1.3.0 on, the entrypoint of the kit image prepares that directory on every start as root,
before the command runs:

```text
/bootgly/storage                                   root      0755   as mounted — never changed
├── cache/ locks/ pids/ queues/ schedule/ temp/ tests/   root      0755
├── logs/                                                bootgly   0755
└── sessions/                                            bootgly   0700
```

So the only thing to configure is the mount path. To see it on your machine, mount a volume
Docker does not seed from the image (`nocopy`):

```bash :toolbar="true";
docker run --rm -p 8082:8082 \
  -v storage:/bootgly/storage:nocopy \
  bootgly/bootgly.kit project Demo/HTTP_Server_CLI start -f
```

What the preparation does, and what it never does:

- **It creates only what is missing.** A directory that already exists is left as found —
  owner, mode and contents — so a second start changes nothing.
- **Only `logs/` and `sessions/` go to `bootgly`**, the account the workers run as, and only
  when the entrypoint has just created them. Nothing changes owner recursively and nothing
  through a link: the workers own what is inside those two directories.
- **It mirrors the kit image, for the kit's account.** The mount ends up as the image's own
  `storage/` is. A project whose server Configs demote to another `user:` then meets a
  `sessions/` that is not that account's, and the server refuses to start over it — as it
  does over the image's own `storage/`. Up to 1.2.0 the server created both directories
  itself on an empty mount, so that configuration started there. An image layer never
  reaches a mount: hand the two directories over on the volume itself, once (here to
  `www-data`):

```bash
docker run --rm -v storage:/bootgly/storage --entrypoint sh bootgly/bootgly.kit -c \
  'cd /bootgly/storage && mkdir -p logs && mkdir -p -m 0700 sessions && chown www-data: logs sessions'
```

- **An image without a `bootgly` account gets nothing prepared** — the framework image: its
  server creates what it needs for the account its project names.
- **The storage root, `pids/` and `cache/` stay root's** — root-run code reads what `cache/`
  holds.
- **A link or a file where a directory is expected stops the container**, before anything is
  created, and says which one:

```
bootgly: storage is not prepared: symbolic link: /bootgly/storage/sessions
```

- **It prepares only a storage root that root owns and that its group and others cannot
  write.** Any other — a host directory of your own, bind-mounted as in the previous
  section — is left as it is and behaves as described there. A bind source Docker had to
  create is root's, and is prepared like a volume.
- **It is skipped under `--user`.** A container that does not start as root cannot give a
  directory away: mount a storage that uid already owns.

### Move the storage directory

When a volume cannot be mounted at `/bootgly/storage`, name its path in the
`BOOTGLY_STORAGE_DIR` environment variable:

```bash :toolbar="true";
docker run --rm -p 8082:8082 \
  -e BOOTGLY_STORAGE_DIR=/data/storage \
  -v storage:/data/storage \
  bootgly/bootgly.kit project Demo/HTTP_Server_CLI start -f
```

The entrypoint prepares that directory the same way — once the framework has accepted it —
and logs, PIDs, sessions, locks and cache all move there. The variable is the framework's, not the image's: every `bootgly` command reads
it, in a container or on a host.

The directory is validated at boot, before anything else runs. It must be:

- an **absolute, canonical path** — no `.` or `..` segment, no doubled separator, no symbolic
  link anywhere in it (one trailing `/` is accepted);
- an **existing real directory** — it is never created for you, so a mistyped path cannot
  become a directory that dies with the container;
- **owned by root or by the user the process runs as**, and not writable by its group or by
  others;
- **under ancestors nobody else can use to replace it**: each one owned by root or by that
  user, and not writable by its group or by others unless it is sticky.

A value that fails a check stops the boot with exit status `1` and one line on stderr that
names the check and the path. It never falls back to the default directory:

```
Bootgly: BOOTGLY_STORAGE_DIR from the environment is refused: group/world-writable (0775): /data/storage
```

An empty value is refused too: a `${VARIABLE}` a Compose file could not resolve would
otherwise send the data, in silence, to the container's own filesystem.

> **Why so strict.** A server launched as root writes its process state there, and root-run
> commands load compiled templates from it — so a directory another local account controls,
> or can replace, is that account's code running as root. For the same reason, mind where a
> privileged launch gets its environment from. `sudo` drops the variable by default: do not
> add it to `env_keep`, and do not grant `SETENV`, for an account you would not hand root to.
> In a systemd unit, set it with `Environment=` in the unit root owns, never through an
> `EnvironmentFile` another account can write.

**Every command needs the same value.** A command started without the variable looks at the
default directory: `stop`, `status` or `reload` then find no server, and a second `start`
keeps its own state apart. Three places lose it without a word:

- **`docker exec`** keeps the variables the container was created with (`-e`, Compose
  `environment:`), not the ones a shell exported later;
- **`sudo`** drops it — name it on the command itself:
  `sudo env BOOTGLY_STORAGE_DIR=/data/storage bootgly project MyApp stop`;
- **a service** starts with none of your shell's variables. `project <Name> startup` writes
  the variable into the units it generates when the boot took it from the environment; a unit
  of your own needs its `Environment=` line.

A launcher that defines the `BOOTGLY_STORAGE_DIR` or `BOOTGLY_STORAGE_BASE` constant before
the framework boots still wins: the variable is then not read. Every refusal is listed in
[Storage directory refusals](#storage-directory-refusals).

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
docker pull bootgly/bootgly.kit:1.0.0
```

Pull an exact version to land on one specific release; a plain `docker pull bootgly/bootgly.kit`
(or `:1`) moves to the newest stable instead.

`kit upgrade` and `kit downgrade` refuse inside the image and say why: the image ships the
kit *layout*, not a git checkout (the build removes `.git` deliberately), so there is nothing
for them to move — and rewriting a filesystem the next `docker run` throws away would only
look like it worked. `kit list` answers instead of refusing: the image *is* the release, and
the other releases are image tags. The refusal names `docker pull` and prints the version the
image carries.

### Build the kit image yourself

```bash
docker build -f Dockerfile --target kit \
  --build-arg BOOTGLY_VERSION=1.0.0 \
  -t bootgly.kit:1.0.0 .
```

Run it from a clone of the [`bootgly.kit`](https://github.com/bootgly/bootgly.kit)
repository. The build takes **nothing** from the build context: it git-clones the kit at its
release tag with submodules, so one tag pins framework + Console + Web and the image
reproduces from the tag alone. Two consequences: the build needs network, and it always
builds a *pushed* ref — uncommitted work never lands in the image. To build another ref:

```bash
docker build -f Dockerfile --target kit \
  --build-arg BOOTGLY_VERSION=1.0.0 \
  --build-arg BOOTGLY_KIT_REF=main \
  -t bootgly.kit:main .
```

## Deploy to production

In production the code is part of the image and only the runtime state lives in a volume. Four
pieces: an image of your own built on the kit, the storage volume, the migrations as a step of
the deploy, and the health probe.

### Build your image

Keep the `projects/` directory of your kit — the project registry `Bootgly.projects.php` and
the project folders — next to a `Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
FROM bootgly/bootgly.kit:1.3.0

# The code is baked in: production mounts no volume over /bootgly/projects
COPY projects/ /bootgly/projects/

# The health probe the orchestrator reads (see below)
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s \
  CMD curl -fsS "http://127.0.0.1:${PORT:-8080}/health" || exit 1

# The server, in the foreground
CMD ["project", "MyApp", "start", "-f"]
```

```bash
docker build -t my-app .
```

Pin an exact kit version: a deploy must not change because `latest` moved. Keep secrets out
of the image — leave every `.env` file and every repository out of the build context with a
`.dockerignore` beside the `Dockerfile`, and set the same keys as environment variables at
run time: a config reads the process environment before any `.env` file.

```
**/.env*
**/.git
```

### Mount the storage volume

Sessions, logs, locks and queues must survive a redeploy, so `storage/` is the one volume:

```bash
docker run -d --name my-app -p 8080:8080 \
  -v my-app-storage:/bootgly/storage \
  my-app
```

On a platform, mount its volume at `/bootgly/storage` — it arrives empty and root-owned, and
the entrypoint prepares it (see [A volume the platform mounts as
root](#a-volume-the-platform-mounts-as-root)). Mount the real volume there, never a link to
it: the framework refuses a storage directory that is a symbolic link. If the platform only
mounts elsewhere, set `BOOTGLY_STORAGE_DIR` to that path.

### Run the migrations before the deploy

Migrations are a step of the deploy, not of the server start: every replica would race to
apply them. Run them once, with the image that is about to be deployed, and start the servers
only when the command exits `0`:

```bash
docker run --rm \
  -e DB_HOST=db.internal -e DB_NAME=app -e DB_USER=app -e DB_PASS \
  my-app project MyApp migrate up
```

That is the *pre-deploy* (or *release*) command of a hosting platform, an init container in
Kubernetes, or a one-off service the server `depends_on` with
`condition: service_completed_successfully` in Compose. The workflow itself is in
**[Database migrations](/guide/database-migrations/overview/)**.

### Wire the health probe

Turn on the built-in health endpoint in the server Configs of the project — it answers before
any middleware, so rate limiting or authentication can never fail a probe:

```php
new Configs(
   host: '0.0.0.0',
   port: getenv('PORT') ? (int) getenv('PORT') : 8080,
   user: 'bootgly',
   group: 'bootgly',
   health: '/health',
)
```

The `HEALTHCHECK` of the Dockerfile above then reports the container as `healthy` once the
server answers, and a platform probe takes the same path:

```bash
curl -s http://127.0.0.1:8080/health
# {"status":"ok"}
```

See **[Observability](/guide/observability/overview/)** for what the endpoint answers and
when.

### A PostgreSQL client, when you need one

The kit image ships no database client: an application talks to its database through the
framework. If your deploy needs `psql` — a one-time role or schema bootstrap, an operations
shell — add one line to your image:

```dockerfile
RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client \
 && rm -rf /var/lib/apt/lists/*
```

## Build on the framework image

`bootgly/bootgly` is the framework and nothing else — the ingredient you compose with. Use
it when you ship your own image and do not want the kit's platforms or its project registry.

`<version>` below is a placeholder for a real tag — `1.0.0` is the first one published
**after** this split: everything up to `1.0.0-rc.1` is the old, product-shaped image, and those
tags are never rewritten. This repository publishes no `latest`, so `FROM` always names a tag:
an exact version (`bootgly/bootgly:1.0.0`) or the major (`bootgly/bootgly:1`), which follows
the 1.x stable line; `:rc` / `:beta` follow pre-releases only. Pick the version you want from
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

Pin an exact version in `FROM` (`bootgly/bootgly:1.0.0`) when the image must reproduce byte
for byte; pin the major (`bootgly/bootgly:1`) to move forward with every 1.x release without
touching the Dockerfile.

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
no `latest`, and a version baked into the Dockerfile would go stale and quietly benchmark an
older framework than the one you meant to measure. Naming the tag is what makes a run say which
Bootgly it raced.

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

A pre-release **never** moves `latest`, nor the major/minor aliases — otherwise a plain
`docker pull bootgly/bootgly.kit` would hand pre-release code to every user. `latest`, `1` and
`1.0` follow the stable line; an exact version (`1.0.0`) never moves. The channel aliases
(`rc`, `beta`) are moving tags you opt into deliberately: each follows the newest pre-release
of its kind and stays put when a stable ships — after `1.0.0`, `:rc` still names `1.0.0-rc.1`
until the next release candidate is published.

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
/bootgly/storage    VOLUME (kit image) — logs, PIDs, cache, locks, queues, temp, tests;
                    moved by BOOTGLY_STORAGE_DIR
/bootgly            WORKDIR · symlinked to /usr/local/bin/bootgly
/bootgly/Bootgly    the framework, inside the kit image
/bootgly_benchmarks the benchmark cases (benchmark images only)
/usr/local/etc/php/conf.d/zz-bootgly.ini   opcache + JIT tuning
```

### Environment variables

```text
PORT              Overrides a server's listening port
AI_AGENT          Any non-empty value selects machine-readable test output
BOOTGLY_STORAGE_DIR  Moves the storage directory (default: <kit>/storage). Read by the
                  framework at boot — in or out of a container — and by the entrypoint.
                  An absolute, canonical path to an existing real directory that root
                  or the running user owns and nobody else can write or replace; an
                  unsafe or empty value stops the boot, with no fallback. A constant
                  of the same name defined before the boot wins
BOOTGLY_DOCKER    Set to 1 by both published images; it only changes the wording of the
                  `kit` refusal (releases are image tags here). Nothing else reads it —
                  which image you are in is decided by the layout on disk, so setting
                  it by hand cannot make a test or a refusal say something untrue
DB_HOST DB_PORT   Benchmark images only — default to the container's local
DB_NAME DB_USER   PostgreSQL, overridable with `docker run -e`
DB_PASS
```

### Storage directory refusals

What a boot with `BOOTGLY_STORAGE_DIR` in the environment prints after `Bootgly:
BOOTGLY_STORAGE_DIR from the environment is refused:`, in the order the checks run. The first
check that fails ends the boot.

| Refusal | The value |
|---|---|
| `empty value` | is set, and empty |
| `not an absolute path: <value>` | does not start with `/` |
| `the filesystem root: <value>` | is `/` |
| ``not canonical (an empty, `.` or `..` segment): <value>`` | has a `.` or `..` segment, a doubled separator or more than one trailing `/` |
| `its owner cannot be verified (the posix extension is missing): <path>` | cannot be checked by this PHP |
| `does not exist or cannot be inspected: <path>` | names nothing, or something under a directory the process cannot search |
| `symbolic link: <path>` | names a link |
| `not a directory: <path>` | names a file |
| `not canonical (resolves to <target>): <path>` | goes through a symbolic link |
| `owner <uid> is neither the effective user (<uid>) nor root: <path>` | belongs to another account |
| `group/world-writable (<mode>): <path>` | can be written by its group or by others |
| `ancestor cannot be inspected: <ancestor>` | sits under a directory the process cannot inspect |
| `ancestor owner <uid> is neither the effective user (<uid>) nor root: <ancestor>` | sits under a directory of another account — in a user namespace, any account it does not map, the host's root included |
| `ancestor group/world-writable without the sticky bit (<mode>): <ancestor>` | sits under a directory its group or others can write |

The entrypoint of the kit image stops a root start with `bootgly: storage is not prepared:`
followed by `symbolic link: <path>`, `not a directory: <path>`, `cannot be inspected: <path>`,
`cannot create: <path>` or `cannot give to bootgly: <path>`.

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
  $(php @/__docker__/provenance.php . ../bootgly_benchmarks --docker-build-args) \
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
           challenge included — needs it, and the servers demote their workers to
           the `bootgly` account the image ships: a project scaffolded by the
           wizard names it in its `user`/`group` server Configs, and a project with
           none configured takes it by default on a root launch. What root writes
           into a mounted projects/ is handed to the directory's owner; storage/
           stays the runtime's, and a root start prepares one that was mounted
           empty and root-owned. `--user` is not a drop-in override: a non-root run
           needs both mounted from the host, owned by that uid, and binds no
           privileged port.
Stop       STOPSIGNAL is SIGTERM and the server drains in flight work, so
           `docker stop` is a graceful shutdown.
Coverage   Disable opcache for accurate coverage runs. The entrypoint IS the
           `bootgly` CLI, so reach PHP by replacing it:
           docker run --rm --entrypoint php bootgly/bootgly:<version> \
             -d opcache.enable_cli=0 /bootgly/bootgly test --coverage 102
```
