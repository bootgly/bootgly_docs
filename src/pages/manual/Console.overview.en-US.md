# Console Platform

The Console platform (`bootgly/bootgly-console`) is Bootgly's **opinionated TUI layer** over the CLI interface: an application shell for full-screen terminal apps ([App](/manual/Console/App)) and a module for terminal games ([Games](/manual/Console/Games)).

It ships as an optional git submodule of the starter kit — the project wizard offers it in the **Platforms** multiselect (see [Getting started](/guide/getting-started)).

## Installing the platform

The canonical installer already offers it — it asks which platforms to set up, and picking **Console** initializes the submodule right away:

```bash
curl -fsSL https://bootgly.com/install | bash
```

Didn't pick it at install time? Add it later to an existing kit:

```bash
git submodule update --init Console
```

Or through the wizard, non-interactively:

```bash
php bootgly project create --platform=console
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

`Console/autoboot.php` defines the platform constants (`CONSOLE_ROOT_DIR`, `CONSOLE_WORKING_DIR`, `CONSOLE_VERSION`), registers the `Console\` autoloader and boots the platform singleton:

```php
const Console = new Console;
Console->autoboot();
```

The platform is a **class library** over `Bootgly\CLI`: there are no process-wide workables — each app boots per project, through its `.project.php` signature.

## Console projects

A Console project is a regular Bootgly project bound to the `CLI` interface. Register it in the consumer `projects/Bootgly.projects.php`:

```php
return [
   'Snake' => ['interfaces' => ['CLI']],
];
```

And give it a `.project.php` signature whose `boot` closure runs the app:

```php
use Bootgly\API\Projects\Project;

use projects\Snake\Snake;


return new Project(
   name: 'Snake',
   description: 'Classic Snake game — Console platform Games module demo',
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

```bash
php bootgly project Snake start
```

The platform ships **exportable projects** under `Console/projects/` — the wizard's *Import projects from Platforms* picker surveys them (the Snake and Pong games ship there).

---

## Reference

```php
public function autoboot (): void
```

Boots the Console platform singleton (the global `Console` constant). Guarded: booting twice throws an `Exception`. The platform itself registers no workables — apps boot per project.
