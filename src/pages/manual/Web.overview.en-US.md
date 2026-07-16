# Web Platform

The Web platform (`bootgly/bootgly-web`) is Bootgly's **opinionated web layer** over the WPI interface: an application shell for MVC projects ([App](/manual/Web/App)) and a set of REST conventions ([API](/manual/Web/API)).

WPI itself stays deliberately low-level — the platform is where the opinions live: controllers, resource routing, problem+json errors, static assets and view conventions. Everything it wires remains plain WPI underneath.

It ships as an optional git submodule of the starter kit — the project wizard offers it in the **Platforms** multiselect (see [Getting started](/guide/getting-started)).

## Installing the platform

The canonical installer already offers it — it asks which platforms to set up, and picking **Web** initializes the submodule right away:

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash
```

Didn't pick it at install time? Add it later to an existing kit:

```bash :toolbar="true";
git submodule update --init Web
```

Or through the wizard, non-interactively:

```bash :toolbar="true";
php bootgly project create --platform=web
```

## How it boots

The kit boots the optional platforms **before** the Bootgly platform, so Web projects find the platform autoloader already registered. `Web/autoboot.php` defines the platform constants (`WEB_ROOT_DIR`, `WEB_WORKING_DIR`, `WEB_VERSION`), registers the `Web\` autoloader and boots the platform singleton:

```php
const Web = new Web;
Web->autoboot();
```

The platform is a **class library** over `Bootgly\WPI`: there are no process-wide workables — each app boots per project, through its `.project.php` signature.

## Web projects

A Web project is a regular Bootgly project bound to the `WPI` interface. Register it in the consumer `projects/Bootgly.projects.php`:

```php
return [
   'Site' => ['interfaces' => ['WPI']],
];
```

And give it a `.project.php` signature whose `boot` closure runs the [App shell](/manual/Web/App):

```php
use function getenv;

use Bootgly\API\Endpoints\Server\Modes;
use Bootgly\API\Projects\Project;
use Web\App;


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
         ->configure(port: getenv('PORT') ? (int) getenv('PORT') : 8088)
         ->load(__DIR__ . '/router')
         ->start();
   }
);
```

Start it as any project:

```bash :toolbar="true";
php bootgly project Site start
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

Boots the Web platform singleton (the global `Web` constant). Guarded: booting twice throws an `Exception`. The platform itself registers no workables — apps boot per project.
