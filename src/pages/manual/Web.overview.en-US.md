# Web Platform

The Web platform (`bootgly/bootgly-web`) is Bootgly's **opinionated web layer** over the WPI interface: an application shell for MVC projects ([App](/manual/Web/App)) and a set of REST conventions ([API](/manual/Web/API)).

WPI itself stays deliberately low-level — the platform is where the opinions live: controllers, resource routing, problem+json errors, static assets and view conventions. Everything it wires remains plain WPI underneath.

It ships as a git submodule of the starter kit, which tracks it beside the Console platform: a fresh kit sets up every platform with no question asked (see [Getting started](/guide/getting-started)), and a later run of the project wizard sets up only the platforms `--platform=` names — `--platform=web` brings this one back to a kit it was removed from. To build a first app and a REST API step by step, follow the [Web Platform](/guide/web-platform) guide; this manual covers each piece in depth.

## Installing the platform

The canonical installer already sets it up — every platform comes initialized:

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash
```

## How it boots

The kit boots the platform submodules **before** the Bootgly platform, so Web projects find the platform autoloader already registered. `Web/autoboot.php` defines the platform constants and registers the `Web\` autoloader — with no Bootgly dependency, since Bootgly is not loaded yet:

- `WEB_ROOT_BASE` and `WEB_ROOT_DIR` — the platform folder, without and with the trailing separator. `WEB_ROOT_BASE` is what marks the platform as installed: the file returns at once when it is already defined, and `Bootgly::mount()` skips a platform that never defined it;
- `WEB_WORKING_BASE` and `WEB_WORKING_DIR` — the folder the `Web\` autoloader searches first, before the platform folder: the platform folder itself, unless a launcher defined both before including the file;
- `WEB_VERSION` — the platform release (`'1.2.0'`).

The platform root, the `Web` class, implements `Bootgly\API\Platform`, so it can only exist once Bootgly's own autoloader does: `Bootgly::autoboot()` creates it right after, before routing any command, defines the global `Web` constant and boots it:

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

A Web project is a regular Bootgly project bound to the `WPI` interface. Register it in the consumer `projects/Bootgly.projects.php`, keyed by its path under `projects/`:

```php
return [
   'Demo/Site' => ['interfaces' => ['WPI']],
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

Start it as any project, by that path:

```bash :toolbar="true";
php bootgly project Demo/Site start
```

The platform ships these **example projects** in `Web/projects/Demo/`, and a fresh kit imports every one of them into `projects/Demo/` automatically — living guides, for people and AI agents alike:

- **Auth** (`:8087`) — a session/cookie authentication scaffold: registration, e-mail verification, login with remember-me, password reset, SQLite.
- **Blog** (`:8080`) — the full MVC loop: controllers, ORM models, views, Session + CSRF forms, SQLite (zero setup).
- **Chat** (`:8085`) — realtime rooms over the WebSocket server; the client page is served on the same port.
- **Site** (`:8088`) — landing pages: controller-dispatched views, layouts and inline statics, no database.
- **SPA** (`:8092`) — the same task list as a React and a Vue Vite build, each served by `Web\App\SPA` on its own prefix (`/react/`, `/vue/`), over a JSON API with SQLite; the start builds them when Node.js and npm are on the `PATH`.
- **Tasks** (`:8090`) — a REST API: resources, problem+json errors, JWT-protected mutations, pagination.

## Agent skill

The platform ships a skill for AI coding agents, `bootgly-build-web`, in `Web/templates/projects/.agents/skills/bootgly-build-web/`. Its `SKILL.md` takes an agent through a Web project the way this manual does — boot a `Web\App`, register routes, map controllers, render views, serve statics, guard forms with CSRF, test over HTTP — and `references/REST.md` adds the JSON API conventions of `Web\API`. It extends the framework's own `bootgly-build` skill.

`bootgly kit boot` lays it down in `<kit>/projects/.agents/skills/`, beside the framework's `bootgly-*` skills, while the Web platform is set up in the kit — and links it into `projects/.claude/skills/` for Claude Code. A fresh kit runs that step on its own; a kit that sets the platform up later, with `--platform=web`, gets the skill at once; `bootgly kit boot --agents` lays down only the agent rules and skills; and `kit upgrade` and `kit downgrade` bring them in line with the release they move to. The copy is machine-managed — rewritten whenever it differs from the platform's template, removed once the platform no longer ships it — so do not edit it (see [Kit CLI](/guide/kit/overview/#boot-the-resource-directories)).

---

## Reference

```php
public function autoboot (): void
```

Boots the Web platform singleton (the global `Web` constant) — the one method of the `Bootgly\API\Platform` contract, called by `Bootgly::autoboot()`. Guarded: booting twice throws an `Exception`. The platform itself registers no workables — apps boot per project.
