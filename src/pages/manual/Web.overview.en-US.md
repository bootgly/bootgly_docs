# Web Platform

The Web platform (`bootgly/bootgly-web`) is Bootgly's **opinionated web layer** over the WPI interface: an application shell for MVC projects ([App](/manual/Web/App)) and a set of REST conventions ([API](/manual/Web/API)).

WPI itself stays deliberately low-level — the platform is where the opinions live: controllers, resource routing, problem+json errors, static assets and view conventions. Everything it wires remains plain WPI underneath.

It ships as an optional git submodule of the starter kit — the project wizard offers it in the **Platforms** multiselect (see [Getting started](/guide/getting-started)).

## Installing the platform

The canonical installer already sets it up — every platform comes initialized:

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash
```

## How it boots

The kit boots the optional platforms **before** the Bootgly platform, so Web projects find the platform autoloader already registered. `Web/autoboot.php` defines the platform constants (`WEB_ROOT_DIR`, `WEB_WORKING_DIR`, `WEB_VERSION`) and registers the `Web\` autoloader — with no Bootgly dependency, since Bootgly is not loaded yet. The platform root, the `Web` class, implements `Bootgly\API\Platform`, so it can only exist once Bootgly's own autoloader does: `Bootgly::autoboot()` creates it right after, before routing any command, defines the global `Web` constant and boots it:

```php
// inside Bootgly::autoboot(), for each installed platform
define('Web', new Web);   // class Web implements Bootgly\API\Platform
Web->autoboot();
```

When `Web/autoboot.php` runs after Bootgly instead — Composer loads a dependency's `files` before the package's own, so `vendor/autoload.php` alone (static analysis, a script) boots Bootgly first — the file mounts the root itself, through the same step:

```php
if (defined('Bootgly') === true) {
   Bootgly::mount('Web');
}
```

That order is too late for commands: Bootgly routes the command while it boots, before the platform's `autoboot.php` runs. A launcher that runs commands includes the platform's `autoboot.php` before Bootgly, as the platform and kit launchers do. A Bootgly older than 1.1 has no `mount()`, so the platform refuses it with a `LogicException`.

A platform whose `autoboot.php` did not run (not installed) is skipped, a `Web` constant that already exists is left alone (a platform release older than 1.1.0 still creates its own root; that allowance goes in 2.0.0), and a root class that cannot be loaded or does not implement `Bootgly\API\Platform` stops the boot with an `Exception` that names it.

The platform is a **class library** over `Bootgly\WPI`: there are no process-wide workables — each app boots per project, through its `.Project.php` signature.

## Web projects

A Web project is a regular Bootgly project bound to the `WPI` interface. Register it in the consumer `projects/Bootgly.projects.php`:

```php
return [
   'Site' => ['interfaces' => ['WPI']],
];
```

And give it a `.Project.php` signature whose `boot` closure runs the [App shell](/manual/Web/App):

```php
use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Web\App;
use Web\App\Configs;


return new Project(
   name: 'Site',
   description: 'Landing site',
   version: '1.0.0',
   author: 'Bootgly',
   exportable: true,
   boot: function (array $arguments = [], array $options = []): void
   {
      $App = new App(Mode: match (true) {
         isset($options['f']) => Modes::Foreground,
         isset($options['i']) => Modes::Interactive,
         isset($options['m']) => Modes::Monitor,
         default => Modes::Daemon
      });

      $App
         ->configure(new Configs(port: getenv('PORT') ? (int) getenv('PORT') : 8088))
         ->load(__DIR__ . '/router')
         ->start();
   }
);
```

Start it as any project:

```bash :toolbar="true";
php bootgly project Demo/Site start
```

The platform ships **exportable projects** under `Web/projects/` — the wizard's *Import projects from Platforms* picker surveys them:

- **Blog** (`:8080`) — the full MVC loop: controllers, ORM models, views, Session + CSRF forms, SQLite (zero setup).
- **Chat** (`:8085`) — realtime rooms over the WebSocket server; the client page is served on the same port.
- **Site** (`:8088`) — landing pages: controller-dispatched views, layouts and inline statics, no database.
- **Tasks** (`:8090`) — a REST API: resources, problem+json errors, JWT-protected mutations, pagination.

---

## Reference

```php
public function autoboot (): void
```

Boots the Web platform singleton (the global `Web` constant) — the one method of the `Bootgly\API\Platform` contract, called by `Bootgly::autoboot()`. Guarded: booting twice throws an `Exception`. The platform itself registers no workables — apps boot per project.
