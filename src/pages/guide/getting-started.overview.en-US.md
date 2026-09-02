# Getting started

Bootgly has **one canonical way** to start: a single command that installs everything and opens the **project wizard**.

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash
```

The installer:

1. Checks your environment (`git` + PHP **8.4+**);
2. Clones the [bootgly.kit](https://github.com/bootgly/bootgly.kit) starter template into `./bootgly.kit` (pass another name with `curl -fsSL https://bootgly.com/install | bash -s -- mydir`);
3. Initializes the **Bootgly platform** (git submodule);
4. Boot initial [resource dirs](https://docs.bootgly.com/manual/Bootgly/basic/directory_structure/overview/#resource-dirs) (`bootgly boot`);
5. Optionally installs the **Bootgly CLI globally** (`php bootgly setup`) — so every command works as `bootgly ...` instead of `php bootgly ...`;
6. Opens the **project wizard** (`php bootgly projects create`).

> **Re-running is safe.** If the installation was interrupted at any step, run the same command again: when the target directory is already a Bootgly Kit checkout, the installer **resumes** — it prints a checklist of what is done, initializes whatever is missing (submodules, resources) and re-opens the wizard (skipping it when a project is already registered). The wizard only offers the platforms not set up yet.

A freshly cloned kit (`git clone`) contains only the kit files — every platform submodule is **empty** until installed:

```text
bootgly.kit/
├── Bootgly/            ← base platform (REQUIRED git submodule — empty, not installed yet)
├── Console/            ← Console platform (optional git submodule — empty)
├── Web/                ← Web platform (optional git submodule — empty)
├── .gitignore
├── .gitmodules         ← Bootgly (required) + Console and Web (optional platforms)
├── LICENSE
├── README.md
├── bootgly             ← the CLI launcher (autoboots Bootgly + the optional platforms)
└── index.php           ← the Web front controller
```

The installer initializes the required base platform (`git submodule update --init Bootgly`); the wizard's first run initializes the chosen platform submodules and runs `bootgly boot` to install your own resource folders:

> **Platforms land on a release, not on a commit.** After initializing a submodule, the installer moves it to the newest tag reachable from the kit's pin — a stable release when one exists, the newest pre-release otherwise. It never moves *forward* past the pin, so you never get a platform the kit was not built against. When a pin has drifted off a release the run says so (`Bootgly was pinned 1 commit past v1.0.0-beta.3 — checked out the release`), and `git status` then shows that submodule as modified: that is the corrected pin, not a change of yours — leave it be. The kit is not yours to commit to; a later `git submodule update` resets the submodule to whatever the kit records, and the next installer run re-applies the correction.

```text
bootgly.kit/
├── Bootgly/            ← base platform (installed submodule)
│   ├── @/              ← framework meta resources (certificates, static analysis, ...)
│   ├── Bootgly/        ← the framework itself — the I2P interfaces, in dependency order:
│   │   ├── ABI/        ← Configs/ Data/ Debugging/ Differ/ Events/ IO/ Resources/ Syntax/ Templates/
│   │   ├── ACI/        ← Events/ Fakers/ Logs/ Observability/ Process/ Queues/ Schedule/ Tests/
│   │   ├── ADI/        ← Database/ Databases/ Table/ Validation/ Validators/
│   │   ├── API/        ← Endpoints/ Environment/ Projects/ Security/ Workables/
│   │   ├── CLI/        ← Commands/ Terminal/ UI/
│   │   ├── WPI/        ← Connections/ Endpoints/ Events/ Interfaces/ Modules/ Nodes/ Queues/
│   │   └── commands/   ← built-in CLI commands (boot, demo, project, test, ...)
│   ├── configs/        ← framework configs
│   ├── projects/       ← author-level projects — the import sources (Benchmark/, Demo/, Example/)
│   ├── scripts/        ← resource template used by `bootgly boot`
│   ├── storage/        ← resource template used by `bootgly boot`
│   ├── Bootgly.php     ← the framework root entity
│   ├── autoboot.php    ← framework autoboot (required by the kit launcher)
│   ├── bootgly         ← the framework's own CLI launcher
│   ├── composer.json
│   └── index.php
├── Console/            ← Console platform (installed by the wizard)
├── Web/                ← Web platform (installed when chosen)
├── projects/           ← 🏁 YOUR projects — each one a git repository of its own (registered in `Bootgly.projects.php`)
├── scripts/            ← installed by `bootgly boot`
├── storage/            ← installed by `bootgly boot` (cache/, logs/, pids/)
├── .gitignore
├── .gitmodules
├── LICENSE
├── README.md
├── bootgly             ← now autoboots Bootgly + Console (+ Web) through the conditional chain
└── index.php
```

Everything you own lives at the workspace level — `projects/`, `storage/` — while the platforms stay untouched inside their submodules. When a project exists both in your `projects/` and in a platform's, **your copy wins on load**: that is why re-importing a platform project simply refreshes your copy.

> **The kit is a delivery vehicle — your projects are the repositories.** You never commit to the kit: everything the tooling writes at its root (`projects/`, `scripts/`, `storage/`) is ignored by it, so `git status` there stays clean and updating is just `git -C bootgly.kit pull` followed by `git submodule update --init`. Every project you create **from scratch** is **booted** — born a git repository of its own, scaffold as the initial commit; a copy of a shipped example arrives unbooted, and `bootgly project <Name> boot` is the same hook, on demand — and **Composer is per project**: run `composer require` inside `projects/<Name>/`; the framework loads that project's `vendor/autoload.php` when it boots. The shipped examples — the framework Demos and each platform's projects — are imported automatically when the kit is prepared, as living guides for people and AI agents; they arrive unbooted (adopt one with `project <Name> boot`), and one you delete stays deleted.

## The project wizard

Its header names the build you are installing — the framework version plus the commit it came from:

```text
Bootgly — New project wizard v1.0.0-beta.1-dev (39f53a89)
```

Every `dev-main` install reports the same version, so the **commit** is what tells two installs apart. Quote that line in bug reports; when a screen looks older than the docs describe, it is the first thing to check (a kit whose submodule pin lags behind installs an older framework — fetch tags inside the platform, `git -C Bootgly fetch --tags`, and check out the newer release to move it forward; avoid `--remote`, which jumps to the branch tip and lands you on unreleased development work). The commit is read from the installation itself: the git metadata of the checkout, or the reference Composer resolved. Sources that carry neither (a release archive) show the version alone.

The wizard guides you from an empty kit to a running project:

1. **Platforms** — nothing is asked: **every platform is set up**. The **Bootgly base platform** (unopinionated, it ships the `CLI` and `WPI` interfaces) arrives with the opinionated ones — `Console` (CLI extras — TUI apps) and `Web` (WPI extras) — and the wizard initializes their submodules (`Console/`, `Web/`). Deciding what to use is your call later: what you do not want, you delete; what you might want, you leave parked;
2. **Resources** — it runs `bootgly boot` to install the resource folders (`projects/`, `scripts/`, `storage/`) into your kit, and **every shipped example is imported automatically** — the framework Demos plus each platform's projects. They are the kit's living guides: `projects/Demo/` is where you (and an AI agent reading your kit) look up how a Bootgly project is put together;
3. **Mode** — three ways to start, and the first one creates nothing: **use the projects already imported from Platforms** — the default, for reading, running or copying one — **create from scratch**, or **import from a Git remote** (any repository carrying the Bootgly project signature);
4. **Project** — from scratch: pick the project path (e.g. `App` or `App/API`), interface (`CLI` or `WPI`), port, description, version and author. From a Git remote: type the repository URL, the target path and the interface — the repository is cloned with its full history and validated (`*.Project.php` signature);
5. **Confirm** — review the summary and confirm. Projects land in `projects/<Path>/`, are registered in `projects/Bootgly.projects.php`, and a from-scratch project is **booted** — a git repository of its own, scaffold as the initial commit.

However you start, the wizard closes with a summary and the commands to run next: the project it created (path, interface, metadata, and where it came from when you imported one) named in every tip, or — when you chose to stand pat — the projects the kit already holds, grouped by the platform that ships them.

Then boot it:

```bash
php bootgly projects list
php bootgly project MyApp start
```

You can rerun the wizard anytime with `php bootgly projects create` — everything already set up is skipped.

### Non-interactive (CI / scripts / AI agents)

All wizard inputs are available as flags — with `--yes` (or piped input) nothing is asked:

```bash :toolbar="true";
php bootgly projects create App/API --platform=web --from=scratch --interfaces=WPI --port=8080 --yes
```

Use `--from=Demo/HTTP_Server_CLI` to start from a platform project instead of from scratch. See the [Reference](#reference) below for all flags.

## Execute the Bootgly CLI

To make sure everything was loaded correctly, run the initial screen of the Bootgly CLI from your kit directory:

```bash :toolbar="true";
php bootgly
```

## Install Bootgly CLI globally

To use `bootgly` as a global command, run setup as your ordinary user from the Kit directory:

```bash :toolbar="true";
php bootgly setup
```

This creates a wrapper script at `/usr/local/bin/bootgly` with the absolute path to your PHP binary. PHP and the Bootgly code remain unprivileged; setup streams the composed wrapper through an already-open private descriptor and delegates only `install -m 0755 /dev/stdin /usr/local/bin/bootgly` through sudo when required. No privileged process reopens a caller-controlled temporary path.

In an unprivileged invocation, the wrapper resolves the **nearest trusted Bootgly launcher above your working directory** and accepts a launcher owned by the current user or root, provided that its path is not replaceable by another user. If none is found, it uses the active workspace launcher recorded during setup. The global wrapper deliberately refuses effective user root — including `sudo bootgly` — with status 126 before selecting a PHP binary or launcher.

> [!WARNING]
> Do not use `sudo bootgly`: the global wrapper is an unprivileged convenience command. For a developer-owned kit, prefer Linux capabilities or a reverse proxy. A service that genuinely needs root must invoke the absolute launcher of a separate deployment whose complete executable tree is owned by root and not writable by non-root users.

After setup, you can use `bootgly` directly from any directory:

```bash :toolbar="true";
bootgly help
```

To uninstall, keep PHP unprivileged and let setup delegate only the fixed removal operation when required:

```bash :toolbar="true";
php bootgly setup --uninstall
```

## Anatomy of a project

In Bootgly, **Projects** bootstrap your apps and servers. Each project is a folder inside `projects/` with a `<Leaf>.Project.php` file at its root — that file is the **Bootgly project signature** — returning a configured `Project` instance:

```php
use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;

return new Project(
   name: 'MyApp',
   exportable: true,
   boot: function (array $arguments = [], array $options = []): void
   {
      $Server = new HTTP_Server_CLI(Mode: Modes::Daemon);
      $Server->configure(
         host: '0.0.0.0',
         port: 8080,
         workers: 2
      );
      $Server
         ->on(Events::RequestReceived, fn ($Request, $Response) => $Response(body: 'Hello, World!'))
         ->on(Events::ServerStarted, function ($Server) {
            // Called after the server starts listening
         });
      $Server->start();
   }
);
```

This is exactly what the wizard generates for a `WPI` project (plus a `router/` with a welcome route). Only project paths registered in `projects/Bootgly.projects.php` can be started — the wizard registers them for you.

## Project namespaces

A project's own classes — controllers, models, resources, games — use a **bare namespace that mirrors the project path**, with no `projects\` prefix. A class at `projects/Demo/Blog/Controllers/Posts.php` declares:

```php
namespace Demo\Blog\Controllers;

class Posts { /* ... */ }
```

and is imported from anywhere in the project as:

```php
use Demo\Blog\Controllers\Posts;
```

The first segment is the project root (`Blog`), matching the folder under `projects/`. Nested paths mirror the folders too — `projects/Demo/HTTP_Server_CLI/Models/DemoPost.php` → `namespace Demo\HTTP_Server_CLI\Models;`.

Bootgly resolves these classes through a dedicated autoloader anchored on the **booted project's absolute path** (`BOOTGLY_PROJECT->path`), so a project keeps working when it lives as its own isolated repository — cloned or imported anywhere, not only inside the monorepo `projects/`.

> [!NOTE]
> Signature files (`<Leaf>.Project.php`) and pure route files declare no class, so they carry no namespace. Only files that declare a class, function or constant do.

### Reserved names

A project path may **not** start with a reserved platform namespace root — those would shadow the framework and platform namespaces the autoloader owns:

- `Bootgly`, `Console`, `Web` — the framework and current platforms.
- `Data`, `Graphics`, `Embedded`, `Mobile` — reserved for future platforms.

`php bootgly projects create Web` (also `Web/App`, `console`, `MOBILE`, …) is rejected with a clear message — pick a distinct name like `Website` or `MyWeb`.

## Importing projects

Any git repository carrying the project signature (`*.Project.php` at its root) can be imported directly:

```bash :toolbar="true";
php bootgly projects import https://github.com/foo/project1 Project1
```

The project is cloned with its **full history**, validated and placed into `projects/Project1/` — `.git` and `origin` included, so you keep committing and pushing from there — then registered.

> [!WARNING]
> Imported projects run third-party code when started — the command asks for confirmation (skip with `--yes`).

## Binding to privileged ports (80, 443)

Ports below 1024 require special permissions on Linux. There are two approaches:

### Option A: Using sudo

If a service genuinely needs to start as root before dropping privileges, invoke the absolute launcher of a deployment owned by root and not writable by non-root users:

> [!WARNING]
> The global `bootgly` wrapper refuses EUID 0. The direct command below bypasses that convenience wrapper, so every PHP file the deployment can load—not only the launcher—must be root-controlled. Otherwise use Option B or a reverse proxy.

```bash :toolbar="true";
sudo /path/to/root-owned/php /path/to/root-owned/bootgly project MyApp start
```

For production, you can combine this with **privilege dropping** — the server binds to the port as root, then drops to a non-privileged user:

```php
$Server->configure(
   host: '0.0.0.0',
   port: 80,
   workers: 4,
   user: 'www-data', // Drop privileges after binding
);
```

### Option B: Linux capabilities (no sudo needed)

Grant PHP the ability to bind privileged ports without root:

```bash :toolbar="true";
php bootgly setup --capabilities
```

Setup delegates only the fixed `setcap cap_net_bind_service=+ep` operation. After that, any `bootgly` server can bind to ports like 80 or 443 without sudo.

> [!WARNING]
> This applies to ALL PHP scripts on the system, not just Bootgly.

A file capability also makes every PHP process **non-dumpable**: the kernel hands
`/proc/<pid>/fd` to `root`, so tools that resolve a socket back to its owning
process — `lsof -i`, `ss -p`, `fuser` — stop listing PHP servers even for the user
who started them. Bootgly is unaffected: `bootgly project <name> stop` identifies
its master through the kernel lock table (`/proc/locks`), which stays readable.

## Enabling HTTPS (SSL/TLS)

Bootgly supports TLSv1.2 and TLSv1.3 natively. Pass the `secure` parameter to `configure()`:

```php
$Server->configure(
   host: '0.0.0.0',
   port: 443,
   workers: 4,
   secure: [
      'local_cert' => '/path/to/certificate.pem',
      'local_pk'   => '/path/to/private-key.pem',
      'verify_peer' => false,
   ],
   user: 'www-data', // Drop privileges after binding
);
```

> [!NOTE]
> For local development, Bootgly includes self-signed certificates at `@/certificates/`. For production, use certificates from a trusted CA (e.g., Let's Encrypt).

A ready-to-use HTTPS project example is included at `projects/Demo/HTTPS_Server_CLI/`:

```bash :toolbar="true";
bootgly project Demo/HTTPS_Server_CLI start
```

This exact unprivileged command needs the Linux capability from Option B to bind port 443. A service manager using a separate root-controlled deployment is an operational alternative, not a permission granted to this command.
