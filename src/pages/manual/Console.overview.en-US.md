# Console Platform

The Console platform (`bootgly/bootgly-console`) is Bootgly's **opinionated TUI layer** over the CLI interface: an application shell for full-screen terminal apps ([App](/manual/Console/App)) and a module for terminal games ([Game](/manual/Console/Game)).

It ships as an optional git submodule of the starter kit — the project wizard offers it in the **Platforms** multiselect (see [Getting started](/guide/getting-started)).

## Installing the platform

The canonical installer already offers it — it asks which platforms to set up, and picking **Console** initializes the submodule right away:

```bash :toolbar="true";
curl -fsSL https://bootgly.com/install | bash
```

Didn't pick it at install time? Add it later to an existing kit:

```bash :toolbar="true";
git submodule update --init Console
```

Or through the wizard, non-interactively:

```bash :toolbar="true";
php bootgly projects create --platform=console
```

## How it boots

The kit boots the optional platforms **before** the Bootgly platform, because command routing (e.g. `project <Name> start`) happens inside the Bootgly autoboot — Console projects need the platform autoloader already registered:

```php
// <kit>/bootgly (excerpt)
foreach (['Console', 'Web'] as $platform) {
   if (is_file(__DIR__ . "/{$platform}/autoboot.php") === true) {
      @include __DIR__ . "/{$platform}/autoboot.php";
   }
}

$booted =
   (@include __DIR__ . '/@imports/autoload.php') ||
   (@include __DIR__ . '/Bootgly/autoboot.php');
```

`Console/autoboot.php` defines the platform constants (`CONSOLE_ROOT_DIR`, `CONSOLE_WORKING_DIR`, `CONSOLE_VERSION`) and registers the `Console\` autoloader — with no Bootgly dependency, since Bootgly is not loaded yet. The platform root, the `Console` class, implements `Bootgly\API\Platform`, so it can only exist once Bootgly's own autoloader does: `Bootgly::autoboot()` creates it right after, before routing any command, defines the global `Console` constant and boots it:

```php
// inside Bootgly::autoboot(), for each installed platform
define('Console', new Console);   // class Console implements Bootgly\API\Platform
Console->autoboot();
```

When `Console/autoboot.php` runs after Bootgly instead — Composer loads a dependency's `files` before the package's own, so `vendor/autoload.php` alone (static analysis, a script) boots Bootgly first — the file mounts the root itself, through the same step:

```php
if (defined('Bootgly') === true) {
   Bootgly::mount('Console');
}
```

That order is too late for commands: Bootgly routes the command while it boots, before the platform's `autoboot.php` runs. A launcher that runs commands includes the platform's `autoboot.php` before Bootgly, as the platform and kit launchers do. A Bootgly older than 1.1 has no `mount()`, so the platform refuses it with a `LogicException`.

A platform whose `autoboot.php` did not run (not installed) is skipped, a `Console` constant that already exists is left alone (a platform release older than 1.1.0 still creates its own root; that allowance goes in 2.0.0), and a root class that cannot be loaded or does not implement `Bootgly\API\Platform` stops the boot with an `Exception` that names it.

The platform is a **class library** over `Bootgly\CLI`: there are no process-wide workables — each app boots per project, through its `.Project.php` signature.

## Console projects

A Console project is a regular Bootgly project bound to the `CLI` interface. Register it in the consumer `projects/Bootgly.projects.php`:

```php
return [
   'Snake' => ['interfaces' => ['CLI']],
];
```

And give it a `.Project.php` signature whose `boot` closure runs the app:

```php
use Bootgly\API\Projects\Project;

use Demo\Snake\Snake;


return new Project(
   name: 'Snake',
   description: 'Classic Snake game — Console platform Game module demo',
   version: '1.0.0',
   author: 'Bootgly',
   exportable: true,
   boot: function (array $arguments = [], array $options = []): void
   {
      $Snake = new Snake;
      $Snake->run();
   }
);
```

Start it as any project:

```bash :toolbar="true";
php bootgly project Demo/Snake start
```

The platform ships **exportable projects** under `Console/projects/` — the wizard's *Import projects from Platforms* picker surveys them (the Snake and Pong games ship there).

---

## Reference

```php
public function autoboot (): void
```

Boots the Console platform singleton (the global `Console` constant) — the one method of the `Bootgly\API\Platform` contract, called by `Bootgly::autoboot()`. Guarded: booting twice throws an `Exception`. The platform itself registers no workables — apps boot per project.
