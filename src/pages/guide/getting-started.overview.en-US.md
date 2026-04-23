# Getting started

To start using Bootgly from a starter kit, you should use one of [Bootgly's template](/manual/Bootgly/concepts/github-repositories/overview) repositories:

- [bootgly.console](https://github.com/bootgly/bootgly.console)
- [bootgly.web](https://github.com/bootgly/bootgly.web)

For now, the use of Composer is optional and you can use only Git to compose the "bootable" submodules of Bootgly.

## Templating

Here are tutorials to download a starter kit using only Git/Github or Composer.

### Option 1): Using Composer

If you need Composer to compose some external dependency, use the `create-project` command to download and already install all the dependencies:

#### Bootgly Console

If you only want to develop only for the CLI, download the Console starter kit:

```bash
composer create-project bootgly/bootgly.console bootgly.console
```

#### Bootgly Web

If you want to develop for the CLI and for the Web, download the Web starter kit that already comes with the Console together:

```bash
composer create-project bootgly/bootgly.web bootgly.web
```

### Option 2): Using Git

Start by using `Github Templating` to create other repositories from a template or make a `clone` directly from some template repository.

If you do not intend to use Composer yet, run the command below in your terminal to download the submodules that are listed in the `.gitmodules` file:

```bash
git submodule update --init --recursive
```

## Execute the Bootgly CLI

To make sure everything was loaded correctly, in the terminal, change the working directory to the folder that was generated and use the command below to execute the initial screen of Bootgly CLI:

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

## Start an HTTP Server

In Bootgly, **Projects** bootstrap servers. Each project is a PHP file that creates and configures a server instance.

Create a `HTTP_Server_CLI.project.php` file inside your project folder (e.g., `projects/HTTP_Server_CLI/`):

```php
use Bootgly\API\Projects\Project;
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\WPI\Nodes\HTTP_Server_CLI;

return new Project(
   name: 'HTTP Server CLI',
   boot: function (): void
   {
      $Server = new HTTP_Server_CLI(Mode: Modes::Daemon);
      $Server->configure(
         host: '0.0.0.0',
         port: 8082,
         workers: 4
      );
      $Server->on(
         requestReceived: fn ($Request, $Response) => $Response(body: 'Hello, World!'),
         serverStarted: function ($Server) {
            // Called after the server starts listening
         },
         stopped: function ($Server) {
            // Called after the server stops
         }
      );
      $Server->start();
   }
);
```

Then run the project:

```bash
bootgly project Demo-HTTP_Server_CLI start
```

The server will start listening on `0.0.0.0:8082`.

### Server Events

The `on()` method registers event callbacks:

| Event | Signature | Description |
|---|---|---|
| `requestReceived` | `fn ($Request, $Response)` | Called for each incoming HTTP request. |
| serverStarted | `fn ($Server)` | Called after the server starts listening. |
| serverStopped | `fn ($Server)` | Called after the server stops. |

### Configuration Options

The `configure()` method accepts the following parameters:

| Parameter | Type | Default | Description |
|---|---|---|---|
| `host` | `string` | — | Bind address (`'0.0.0.0'` for all interfaces). |
| `port` | `int` | — | Listen port. |
| `workers` | `int` | — | Number of forked worker processes. |
| `secure` | `?array` | `null` | Secure SSL/TLS context options. Switches scheme to `https://`. |
| `user` | `?string` | `null` | POSIX user to drop privileges to after binding. |
| `group` | `?string` | `null` | POSIX group to drop privileges to after binding. |
| `requestMaxFileSize` | `?int` | `null` | Max uploaded file size (bytes). |
| `requestMaxBodySize` | `?int` | `null` | Max request body size (bytes). |

> [!TIP]
> See the [HTTP Server CLI](/manual/WPI/HTTP/HTTP_Server_CLI) documentation for the full configuration, lifecycle, and architecture reference.

## Binding to privileged ports (80, 443)

Ports below 1024 require special permissions on Linux. There are two approaches:

### Option A: Using sudo

After running `sudo php bootgly setup`, you can start the server with sudo:

```bash
sudo bootgly project Demo-HTTP_Server_CLI start
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

A ready-to-use HTTPS project example is included at `projects/HTTPS_Server_CLI/`:

```bash
sudo bootgly project Demo-HTTPS_Server_CLI start
```
