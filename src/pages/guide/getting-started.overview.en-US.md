# Getting started

Bootgly has **one canonical way** to start: a single command that installs everything and opens the **project wizard**.

```bash
curl -fsSL https://bootgly.com/install | bash
```

The installer:

1. Checks your environment (`git` + PHP **8.4+**);
2. Clones the [bootgly.kit](https://github.com/bootgly/bootgly.kit) starter template into `./bootgly.kit` (pass another name with `curl -fsSL https://bootgly.com/install | bash -s -- mydir`);
3. Initializes the **Bootgly platform** (git submodule) and other selected Platforms like `Console` and `Web`;
4. Boot initial [resources dirs](https://docs.bootgly.com/manual/Bootgly/basic/directory_structure/overview/#resource-dirs) (`bootgly boot`);
5. Optionally installs the **Bootgly CLI globally** (`php bootgly setup`) — so every command works as `bootgly ...` instead of `php bootgly ...`;
6. Opens the **project wizard** (`php bootgly project create`).

A freshly cloned kit (`git clone` — or using the GitHub template) contains only the kit files — every platform submodule is **empty** until installed:

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
├── composer.json
└── index.php           ← the Web front controller
```

The installer initializes the required base platform (`git submodule update --init Bootgly`); the wizard's first run initializes the chosen platform submodules and runs `bootgly boot` to install your own resource folders:

```text
bootgly.kit/
├── Bootgly/            ← base platform (installed submodule)
│   ├── &/              ← internal framework resources
│   ├── @/              ← framework meta resources (certificates, static analysis, ...)
│   ├── Bootgly/        ← the framework itself — the I2P interfaces, in dependency order:
│   │   ├── ABI/        ← Configs/ Data/ Debugging/ Differ/ Events/ IO/ Resources/ Syntax/ Templates/
│   │   ├── ACI/        ← Events/ Fakers/ Logs/ Observability/ Process/ Queues/ Schedule/ Tests/
│   │   ├── ADI/        ← Database/ Databases/ Table/
│   │   ├── API/        ← Endpoints/ Environment/ Projects/ Security/ Workables/
│   │   ├── CLI/        ← Commands/ Terminal/ UI/
│   │   ├── WPI/        ← Connections/ Endpoints/ Events/ Interfaces/ Modules/ Nodes/ Queues/
│   │   └── commands/   ← built-in CLI commands (boot, demo, project, test, ...)
│   ├── configs/        ← framework configs
│   ├── docs/           ← framework docs assets
│   ├── projects/       ← author-level projects — the import sources (Benchmark/, Demo/, Example/)
│   ├── public/         ← resource template used by `bootgly boot`
│   ├── scripts/        ← resource template used by `bootgly boot`
│   ├── storage/        ← resource template used by `bootgly boot`
│   ├── tests/          ← resource template used by `bootgly boot`
│   ├── Bootgly.php     ← the framework root entity
│   ├── autoboot.php    ← framework autoboot (required by the kit launcher)
│   ├── bootgly         ← the framework's own CLI launcher
│   ├── composer.json
│   └── index.php
├── Console/            ← Console platform (installed by the wizard)
├── Web/                ← Web platform (installed when chosen)
├── projects/           ← YOUR projects — installed by `bootgly boot`
│   ├── Benchmark/      ← exportable: false — hidden from the import picker
│   ├── Demo/           ← exportable: true — importable / refreshable by the wizard
│   ├── Example/
│   └── Bootgly.projects.php   ← the consumer registry (allow-list, machine-managed)
├── public/             ← installed by `bootgly boot`
├── scripts/            ← installed by `bootgly boot`
├── storage/            ← installed by `bootgly boot` (cache/, logs/, pids/)
├── tests/              ← installed by `bootgly boot`
├── .gitignore
├── .gitmodules
├── LICENSE
├── README.md
├── bootgly             ← now autoboots Bootgly + Console (+ Web) through the conditional chain
├── composer.json
└── index.php
```

Everything you own lives at the workspace level — `projects/`, `public/`, `storage/` — while the platforms stay untouched inside their submodules. When a project exists both in your `projects/` and in a platform's, **your copy wins on load**: that is why re-importing a platform project simply refreshes your copy.

## The project wizard

The wizard guides you from an empty kit to a running project:

1. **Platforms** — the **Bootgly base platform** is always included: unopinionated, it ships the `CLI` and `WPI` interfaces. Here you multi-select the **extra platforms** with the opinionated dependencies — `Console` (CLI extras — TUI apps) and/or `Web` (WPI extras) — or none, staying base-only. The wizard initializes the matching platform submodules (`Console/`, `Web/`);
2. **Resources** — it runs `bootgly boot` to install the resource folders (`projects/`, `public/`, `scripts/`, `storage/`, `tests/`) into your kit;
3. **Mode** — create **from scratch**, **import from Platform projects** (like the Demos shipped with the framework) or **import from a Git remote** (any repository carrying the Bootgly project signature);
4. **Project** — from scratch: pick the project path (e.g. `App` or `App/API`), interface (`CLI` or `WPI`), port, description, version and author. From Platform projects: just multi-select the projects (Space marks, Enter confirms) — each one is copied under its own platform path, no questions asked; existing copies are flagged `(overwrite)` and refreshed. From a Git remote: type the repository URL, the target path and the interface — the repository is cloned and validated (`*.project.php` signature);
5. **Confirm** — review the summary (mode, imports with their platform of origin, overwrites) and confirm. Projects land in `projects/<Path>/` and are registered in `projects/Bootgly.projects.php`.

Then boot it:

```bash
php bootgly project list
php bootgly project MyApp start
```

You can rerun the wizard anytime with `php bootgly project create` — everything already set up is skipped.

### Non-interactive (CI / scripts / AI agents)

All wizard inputs are available as flags — with `--yes` (or piped input) nothing is asked:

```bash
php bootgly project create App/API --platform=web --from=scratch --interfaces=WPI --port=8080 --yes
```

Use `--from=Demo/HTTP_Server_CLI` to start from a platform project instead of from scratch. See the [Reference](#reference) below for all flags.

## Execute the Bootgly CLI

To make sure everything was loaded correctly, run the initial screen of the Bootgly CLI from your kit directory:

```bash
php bootgly
```

## Install Bootgly CLI globally

To use `bootgly` as a global command (and with `sudo` for privileged ports), run the setup command:

```bash
sudo php bootgly setup
```

This creates a wrapper script at `/usr/local/bin/bootgly` with the absolute path to your PHP binary, so it works correctly with `sudo` (which resets PATH).

After setup, you can use `bootgly` directly from any directory:

```bash
bootgly help
```

To uninstall:

```bash
sudo bootgly setup --uninstall
```

## Anatomy of a project

In Bootgly, **Projects** bootstrap your apps and servers. Each project is a folder inside `projects/` with a `<Leaf>.project.php` file at its root — that file is the **Bootgly project signature** — returning a configured `Project` instance:

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

## Importing projects

Any git repository carrying the project signature (`*.project.php` at its root) can be imported directly:

```bash
php bootgly project import https://github.com/foo/project1 Project1
```

The project is cloned, validated, copied into `projects/Project1/` and registered.

> [!WARNING]
> Imported projects run third-party code when started — the command asks for confirmation (skip with `--yes`).

## Binding to privileged ports (80, 443)

Ports below 1024 require special permissions on Linux. There are two approaches:

### Option A: Using sudo

After running `sudo php bootgly setup`, you can start the server with sudo:

```bash
sudo bootgly project MyApp start
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

```bash
sudo php bootgly setup --capabilities
```

This runs `setcap cap_net_bind_service=+ep` on the PHP binary. After that, any `bootgly` server can bind to ports like 80 or 443 without sudo.

> [!WARNING]
> This applies to ALL PHP scripts on the system, not just Bootgly.

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

```bash
sudo bootgly project Demo/HTTPS_Server_CLI start
```
