# Getting started

Bootgly has **one canonical way** to start: a single command that installs everything and opens the **project wizard**.

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash
```

The installer:

1. Checks your environment (`git` + PHP **8.4+**);
2. Clones the [bootgly.kit](https://github.com/bootgly/bootgly.kit) starter template into `./bootgly.kit` (pass another name with `curl -fsSL https://bootgly.com/install | bash -s -- mydir`);
3. Initializes the **Bootgly platform** (git submodule);
4. Boot initial [resource dirs](https://docs.bootgly.com/manual/Bootgly/basic/directory_structure/overview/#resource-dirs) (`bootgly kit boot`);
5. Optionally installs the **Bootgly CLI globally** (`php bootgly setup`) — so every command works as `bootgly ...` instead of `php bootgly ...`;
6. Opens the **project wizard** (`php bootgly projects create`).

> [!WARNING]
> **macOS: install on a case-sensitive volume.** The kit keeps the launcher file `bootgly` beside the platform folder `Bootgly/` — two names that differ only by case. The default macOS volume (APFS) ignores case and checks out only one of them, so `php bootgly` cannot start. Create a case-sensitive volume once and install the kit inside it:
>
> ```bash
> diskutil list                     # note your "APFS Container" (disk3 on Apple Silicon, disk1 on Intel)
> diskutil apfs addVolume disk3 'Case-sensitive APFS' Code
> cd /Volumes/Code && curl -fsSL https://bootgly.com/install | bash
> ```
>
> The volume shares the container's free space, so it needs no fixed size. Windows (outside WSL2) has the same limitation; use WSL2 or Docker there.

> **Re-running is safe.** If the installation was interrupted at any step, run the same command again: when the target directory is already a Bootgly Kit checkout, the installer **resumes** — it prints a checklist of what is done, initializes whatever is missing (submodules, resources) and re-opens the wizard (skipping it when a project is already registered).

A freshly cloned kit (`git clone`) contains only the kit files — every platform submodule is **empty** until installed:

```text
bootgly.kit/
├── Bootgly/            ← base platform (REQUIRED git submodule — empty, not installed yet)
├── Console/            ← Console platform (git submodule — empty)
├── Web/                ← Web platform (git submodule — empty)
├── .gitignore
├── .gitmodules         ← Bootgly (required) + Console and Web (platforms)
├── LICENSE
├── README.md
├── bootgly             ← the CLI launcher (autoboots Bootgly + the platforms)
└── index.php           ← the Web front controller
```

The installer initializes the required base platform (`git submodule update --init Bootgly`); the wizard's first run initializes every platform submodule (no question asked) and runs `bootgly kit boot` to install your own resource folders:

> **Platforms land on a release, not on a commit.** After initializing a submodule, the installer moves it to the newest tag reachable from the kit's pin — a stable release when one exists, the newest pre-release otherwise. It never moves *forward* past the pin, so you never get a platform the kit was not built against. When a pin has drifted off a release the run says so (`Bootgly was pinned 1 commit past v1.0.0 — checked out the release`), and `git status` then shows that submodule as modified: that is the corrected pin, not a change of yours — leave it be. The kit is not yours to commit to; a later `git submodule update` resets the submodule to whatever the kit records, and the next installer run re-applies the correction.

```text
bootgly.kit/
├── Bootgly/            ← base platform (installed submodule)
│   ├── @/              ← framework meta resources (certificates, static analysis, ...)
│   ├── Bootgly/        ← the framework itself — the I2P interfaces, in dependency order:
│   │   ├── ABI/        ← Clock/ Code/ Configs/ Data/ Debugging/ Differ/ Events/ IO/ Resources/ Syntax/ Templates/
│   │   ├── ACI/        ← Events/ Fakers/ Logs/ Mail/ Observability/ Process/ Queues/ Schedule/ Tests/ VCS/
│   │   ├── ADI/        ← Casters/ Database/ Databases/ Table/ Validation/ Validators/
│   │   ├── API/        ← Endpoints/ Environment/ Platform/ Projects/ RPC/ Security/ Workables/
│   │   ├── CLI/        ← Commands/ MCP/ Terminal/ UI/ UX/
│   │   ├── WPI/        ← Connections/ Endpoints/ Events/ Interfaces/ Modules/ Nodes/ Queues/ Services/
│   │   └── commands/   ← built-in CLI commands (demo, kit, projects, project, test, ...)
│   ├── configs/        ← framework configs
│   ├── projects/       ← author-level projects (Benchmark/, Demo/) — Demo/ holds the import sources
│   ├── scripts/        ← resource template used by `bootgly kit boot`
│   ├── Bootgly.php     ← the framework root entity
│   ├── autoboot.php    ← framework autoboot (required by the kit launcher)
│   ├── bootgly         ← the framework's own CLI launcher
│   └── composer.json
├── Console/            ← Console platform (installed by the wizard)
├── Web/                ← Web platform (installed by the wizard)
├── projects/           ← 🏁 YOUR projects — each one a git repository of its own (registered in `Bootgly.projects.php`)
├── scripts/            ← installed by `bootgly kit boot`
├── storage/            ← created by `bootgly kit boot` (cache/, locks/, logs/, pids/, queues/, schedule/, temp/, tests/)
├── .gitignore
├── .gitmodules
├── LICENSE
├── README.md
├── bootgly             ← now autoboots Console + Web, then Bootgly
└── index.php
```

Everything you own lives at the workspace level — `projects/`, `storage/` — while the platforms stay untouched inside their submodules. When a project exists both in your `projects/` and in a platform's, **your copy wins on load**: that is why re-importing a platform project simply refreshes your copy.

> **The kit is a delivery vehicle — your projects are the repositories.** You never commit to the kit: everything the tooling writes at its root (`projects/`, `scripts/`, `storage/`) is ignored by it, so `git status` there stays clean and updating is `bootgly kit upgrade` (`bootgly kit downgrade` goes back). Every project you create **from scratch** is **booted** — born a git repository of its own, scaffold as the initial commit; a copy of a shipped example arrives unbooted, and `bootgly project <Name> boot` is the same hook, on demand — and **Composer is per project**: run `composer require` inside `projects/<Name>/`; the framework loads that project's `vendor/autoload.php` when it boots. The shipped examples — the framework Demos and each platform's projects — are imported automatically when the kit is prepared, as living guides for people and AI agents; they arrive unbooted (adopt one with `project <Name> boot`), and one you delete stays deleted.

## The project wizard

Its header names the build you are installing — the framework version plus the commit it came from:

```text
Bootgly — New project wizard v1.0.0 (39f53a89)
```

Every install of the same release reports the same version, so the **commit** is what tells two installs apart. Quote that line in bug reports; when a screen looks older than the docs describe, it is the first thing to check (a kit whose submodule pin lags behind installs an older framework — fetch tags inside the platform, `git -C Bootgly fetch --tags`, and check out the newer release to move it forward; avoid `--remote`, which jumps to the branch tip and lands you on unreleased development work). The commit is read from the installation itself: the git metadata of the checkout, or the reference Composer resolved. Sources that carry neither (a release archive) show the version alone.

The wizard guides you from an empty kit to a running project:

1. **Platforms** — nothing is asked: **every platform is set up**. The **Bootgly base platform** (unopinionated, it ships the `CLI` and `WPI` interfaces) arrives with the opinionated ones — `Console` (CLI extras — TUI apps) and `Web` (WPI extras) — and the wizard initializes their submodules (`Console/`, `Web/`). Deciding what to use is your call later: what you do not want, you delete; what you might want, you leave parked;
2. **Resources** — it runs `bootgly kit boot` to install the resource folders (`projects/`, `scripts/`, `storage/`) into your kit, and **every shipped example is imported automatically** — the framework Demos plus each platform's projects. They are the kit's living guides: `projects/Demo/` is where you (and an AI agent reading your kit) look up how a Bootgly project is put together;
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

Use `--from=Demo/HTTP_Server_CLI` to start from a platform project instead of from scratch. See [Projects → `projects create`](/manual/Bootgly/essential/projects/overview/) for all flags.

## Execute the Bootgly CLI

To make sure everything was loaded correctly, run the initial screen of the Bootgly CLI from your kit directory:

```bash :toolbar="true";
php bootgly
```

`php bootgly --version` (or `-V`) prints the framework and PHP versions alone — the line a
script can read.

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

In Bootgly, **Projects** bootstrap your apps and servers. Each project is a folder inside `projects/` with a `<Leaf>.Project.php` file at its root — that file is the **Bootgly project signature**. A `WPI` (HTTP) project the wizard generates looks like this:

```text
projects/MyApp/
├── MyApp.Project.php                 ← the signature: boots and configures the server
├── router/
│   ├── router.index.php              ← which route sets are active
│   └── routes/
│       └── Welcome.routes.php        ← one route set
└── configs/
    └── database/
        └── database.Config.php       ← the `database` scope (optional)
```

### The signature

The signature returns a configured `Project`. Its `boot` function builds the server, configures it, loads the routes and starts it:

```php
use const Bootgly\CLI;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs as ServerConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Events;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request\Configs as RequestConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Configs as ResponseConfigs;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database;


return new Project(
   name: 'MyApp',
   exportable: true,
   boot: function (array $arguments = [], array $options = []): void
   {
      // @ `-f` runs in the foreground, `-i` interactive, `-m` with the log monitor
      $Server = new HTTP_Server_CLI(Mode: match (true) {
         isSet($options['f']) => Modes::Foreground,
         isSet($options['i']) => Modes::Interactive,
         isSet($options['m']) => Modes::Monitor,
         default => Modes::Daemon
      });

      // @ One Configs object per concern — pass only the ones you need
      $Server->configure(
         // # Transport: address, workers, TLS, connection limits...
         new ServerConfigs(
            host: '0.0.0.0',
            port: 8080,
            workers: 2
         ),
         // # Request limits: body, uploads, header fields...
         new RequestConfigs(
            maxBodySize: 10 * 1024 * 1024
         ),
         // # Response resources: lazy services reachable as `$Response-><Name>`
         new ResponseConfigs(
            Resources: [
               'Database' => Database::provide(__DIR__ . '/configs/'),
            ]
         )
      );

      $Server
         // # Routes — loaded from router/router.index.php
         ->on(Events::RequestReceived, HTTP_Server_CLI::$Router->load(__DIR__ . '/router'))
         // # Launch banner — fired on the process that owns the terminal
         //   (on Daemon mode, the launcher). `advertise()` prints the bound endpoint.
         ->on(Events::ServerAdvertised, function ($Server) {
            CLI->Terminal->Output->render('@.;@#green:✓ MyApp started@;@.;');
            $Server->advertise();
         });

      $Server->start();
   }
);
```

`configure()` takes **typed Configs objects**, one per concern, and validates the whole set before applying any of it:

| Configs | Configures |
|---|---|
| `HTTP_Server_CLI\Configs` | Address, port, workers, `secure`/`AutoTLS` (see [Enabling HTTPS](#enabling-https-ssl-tls)), privilege drop (`user`/`group`), HTTP/2, the `/health` probe, connection limits and worker recycling |
| `Request\Configs` | Request limits: `maxBodySize`, `maxFileSize`, `maxHeaderFields` and the multipart limits |
| `Response\Configs` | `Resources` (services exposed on the Response) and `deferredTimeout` |

All three take named arguments only. Leave out the ones you don't need — every option has a default. The full option list is in the [HTTP Server CLI](/manual/WPI/HTTP/HTTP_Server_CLI) manual.

### Routes

`HTTP_Server_CLI::$Router->load(__DIR__ . '/router')` reads `router/router.index.php`, a manifest of the route sets to activate:

```php
// router/router.index.php
return [
   'Welcome',
   'Posts',
];
```

Each name resolves to `router/routes/<Name>.routes.php` — a closure that `yield`s its routes. Several sets are composed into one request handler, in the manifest order:

```php
// router/routes/Posts.routes.php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;


return static function (Request $Request, Response $Response, Router $Router): Generator
{
   yield $Router->route('/posts', function (Request $Request, Response $Response) {
      // @ Database I/O runs deferred — the worker keeps serving other requests meanwhile
      return $Response->defer(function (Response $Response): void {
         $Result = $Response->Database->fetch('SELECT id, title FROM posts');

         $Response->JSON->send($Result->rows);
      });
   }, GET);
};
```

Add a route set by creating its file and listing its name in the manifest. Parameters, groups, methods and middlewares are covered in the [Router](/manual/WPI/HTTP/HTTP_Server_CLI/Router) manual.

### The database

`$Response->Database` exists because the signature registered it in `Response\Configs`. `Database::provide()` reads the `database` scope from `configs/database/database.Config.php` and opens the connection lazily, on the first `$Response->Database` of each worker. A SQLite scope needs no server:

```php
// configs/database/database.Config.php
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;


return new Config(scope: 'database')
   ->Enabled->bind(key: 'DB_ENABLED', default: true, cast: Types::Boolean)
   ->Default->bind(key: '', default: 'sqlite')
   ->Connections
      ->SQLite
         ->Driver->bind(key: '', default: 'sqlite')
         ->Database->bind(key: 'DB_NAME', default: __DIR__ . '/../../database/app.sqlite')
         ->up()
      ->up();
```

Each `bind()` reads its `key` from the environment (or the project's `.env`) and falls back to `default`. PostgreSQL and MySQL, pools and read replicas are in the [Database DBAL](/guide/database-dbal) guide; config scopes in general are in [Configuration](/guide/configuration).

The wizard generates the signature and a `Welcome` route set; the database scope is yours to add. Only project paths registered in `projects/Bootgly.projects.php` can be started — the wizard registers them for you.

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
> Imported projects run third-party code when started (`start`, `restart`, a `startup` unit), on their `migrate`, `seed` and `schedule`, and when their tests or queues run — the command asks for confirmation (skip with `--yes`). `projects list` and `project <path> info` only read the signature. A repository whose `*.Project.php` is a symbolic link, or that carries a `bootgly` launcher or a symbolic link named `bootgly` (the global `bootgly` command would run it from inside the project), is refused. Since 1.0.10.

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
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs;


$Server->configure(
   new Configs(
      host: '0.0.0.0',
      port: 80,
      workers: 4,
      user: 'www-data', // Drop privileges after binding
   )
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

Bootgly supports TLSv1.2 and TLSv1.3 natively, and the HTTP server can manage its own certificate. Pass an `AutoTLS` config in the server `Configs` you hand to `configure()` — the server obtains a certificate from **Let's Encrypt** by itself and renews it automatically, with no certbot and no cron:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\AutoTLS;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs;


$Server->configure(
   new Configs(
      host: '0.0.0.0',
      port: 443,
      workers: 4,
      AutoTLS: new AutoTLS(
         domains: ['example.com', 'www.example.com'],
         email: 'admin@example.com',
         staging: true, // Validate against the staging CA first, then set it to false
      ),
      user: 'www-data', // Drop privileges after binding
      group: 'www-data',
   )
);
```

The server binds at once on a temporary self-signed certificate, then swaps in the issued one without a restart. Validation (`HTTP-01`) arrives on port 80, which the server answers on its own. Every WPI project scaffold already carries this block commented in its `configure()` — set your domain and uncomment it. The full flow (port 80, renewal, storage) is in the [Auto-TLS](/guide/auto-tls) guide.

### Using your own certificate

To serve a certificate you already have, set `secure` instead — it takes the SSL context array. `secure` and `AutoTLS` are mutually exclusive:

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Configs;


$Server->configure(
   new Configs(
      host: '0.0.0.0',
      port: 443,
      workers: 4,
      secure: [
         'local_cert' => '/path/to/certificate.pem',
         'local_pk'   => '/path/to/private-key.pem',
         'verify_peer' => false,
      ],
      user: 'www-data', // Drop privileges after binding
   )
);
```

> [!NOTE]
> For local development, Bootgly includes self-signed certificates at `@/certificates/`. For production, use certificates from a trusted CA (e.g., Let's Encrypt).

A ready-to-use HTTPS project example is included at `projects/Demo/HTTPS_Server_CLI/`:

```bash :toolbar="true";
bootgly project Demo/HTTPS_Server_CLI start
```

This exact unprivileged command needs the Linux capability from Option B to bind port 443. A service manager using a separate root-controlled deployment is an operational alternative, not a permission granted to this command.
