# Getting started

Bootgly has **one canonical way** to start: a single command that installs everything and opens the **project wizard**.

```bash
curl -fsSL https://bootgly.com/install | bash
```

The installer:

1. Checks your environment (`git` + PHP **8.4+**);
2. Clones the [bootgly.kit](https://github.com/bootgly/bootgly.kit) starter template into `./bootgly.kit` (pass another name with `curl -fsSL https://bootgly.com/install | bash -s -- mydir`);
3. Initializes the **Bootgly platform** (git submodule);
4. Opens the **project wizard** (`php bootgly project create`).

## The project wizard

The wizard guides you from an empty kit to a running project:

1. **Platform** — choose `Console` (CLI / TUI apps) or `Web` (includes Console). The wizard initializes the matching platform submodules (`Console/`, `Web/`);
2. **Resources** — it runs `bootgly boot` to install the resource folders (`projects/`, `public/`, `scripts/`, `storage/`, `tests/`) into your kit;
3. **Mode** — create **from scratch** or **import a platform project** (like the Demos shipped with the framework);
4. **Project** — pick the project path (e.g. `App` or `App/API`), interface (`CLI` or `WPI`), port, description, version and author;
5. **Confirm** — review the summary and confirm. The project is generated in `projects/<Path>/` and registered in `projects/Bootgly.projects.php`.

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

## Manual setup (git submodules)

Prefer to do it by hand? Use [bootgly.kit](https://github.com/bootgly/bootgly.kit) as a GitHub template (or clone it), then:

```bash
git clone https://github.com/bootgly/bootgly.kit
cd bootgly.kit
git submodule update --init Bootgly
php bootgly project create
```

The kit keeps the platforms as git submodules — `Bootgly/` (the framework), `Console/` and `Web/` — and the wizard initializes the optional ones on demand.

## Using Composer (alternative)

If you need Composer to manage external dependencies:

```bash
composer create-project bootgly/bootgly.kit --stability=dev
cd bootgly.kit
php bootgly project create
```

Dependencies are installed into `./@imports/` and loaded by the same `bootgly` launcher.

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

## Reference

### Installer

```bash
curl -fsSL https://bootgly.com/install | bash [-s -- <dir>]
```

Checks `git` + PHP 8.4+, clones `bootgly.kit` into `<dir>` (default `bootgly.kit`), initializes the `Bootgly` submodule and opens the project wizard on interactive terminals.

### `bootgly project create`

```bash
bootgly project create [<Name>] [options]
```

Creates a project. On interactive terminals the wizard fills the missing inputs; with `--yes` (or piped input) everything comes from the flags.

| Option | Description |
|---|---|
| `--platform=console\|web` | Platform to set up on the kit's first run (submodules + resources). |
| `--from=scratch\|<source>` | Creation source: from scratch (default) or a platform project (e.g. `Demo/HTTP_Server_CLI`). |
| `--interfaces=CLI\|WPI` | Interface bound to the new project (from scratch; default `CLI`). |
| `--port=<port>` | Server port token for `WPI` projects (default `8080`). |
| `--description=`, `--version=`, `--author=` | Project metadata (from scratch). |
| `--default` | Flag the project as the Web (WPI) autoboot default. |
| `--yes` | Skip confirmations (non-interactive). |

### `bootgly project import`

```bash
bootgly project import <url> [<Name>] [--interfaces=CLI|WPI] [--default] [--yes]
```

Clones `<url>` (system git), validates the Bootgly project signature (`*.project.php` at the repository root), copies it into `projects/<Name>/` (default: the repository name) and registers it.
