# Scripts

Scripts are the executable files allowed to boot and use the Bootgly runtime. They play two roles:

- **a security gate** — at boot, the CLI validates that the running script is registered; an unknown entry script is refused;
- **a task runner** — reusable task scripts (deploys, reports, maintenance) live in `scripts/` directories and can be executed on demand.

## Registering scripts

The registry is the `scripts/@.php` bootstrap file. Bootgly loads its own (framework root) and, when you run from a project, yours (working directory). It returns the allowed filenames grouped by where they live:

```php
<?php
// scripts/@.php

return [
   'scripts' => [
      'built-in' => [ # Relative to scripts/ (Bootgly's root directory)
         'observability-ship.php',
      ],
      'imported' => [ # Relative to the working directory (your root directory)
         'vendor/bin/phpstan'
      ],
      'user' => [ # Relative to scripts/ (your working directory)
         'deploy.php',
      ]
   ]
];
```

The groups resolve to different base paths:

| Group | Resolved against | Typical use |
|---|---|---|
| `bootstrap` | absolute / global / relative `bootgly` binary | the framework launcher itself (always registered) |
| `built-in` | Bootgly's `scripts/` directory | scripts shipped with the framework |
| `imported` | your working directory | third-party binaries, e.g. `vendor/bin/phpstan` |
| `user` | your project's `scripts/` directory | your own task scripts |

## The validation gate

When the CLI boots, it validates the script that PHP is executing:

```bash
php scripts/deploy.php
```

If `deploy.php` is registered under `user`, the boot proceeds. If it is not, the boot throws:

```text
Invalid script: script `scripts/deploy.php` not registered in bootstrap file!
Please, register it in `scripts/@.php`.
```

Registered non-`bootgly` scripts run in **external script mode**: the framework boots (autoloader, Terminal, projects) but does not route commands — your script drives the flow.

## Running a task script from code

`Scripts::execute()` runs a registered task script by filename, looking first in your project's `scripts/` and then in Bootgly's:

```php
use Bootgly\CLI\Scripts;

Scripts::execute('observability-ship.php');
```

An unknown filename throws an exception (`Script not found`).

## Reference

The scripts manager lives at `CLI->Scripts` (`Bootgly\CLI\Scripts`):

```php
public function validate (): int
```

Validates the currently executing script (`$_SERVER['SCRIPT_FILENAME']` resolved against `$_SERVER['PWD']`) against the registry. Returns `1` for a globally registered script (e.g. the `bootgly` launcher — full CLI boot with command routing), `0` for a local/external registered script (framework boots, no command routing), `-1` for an unregistered script (the CLI boot throws) and `-2` when the environment does not expose a script path at all.

```php
public static function execute (string $script): void
```

Requires the given script filename from the working `scripts/` directory, falling back to Bootgly's `scripts/` directory. Throws an exception when the file exists in neither.

After validation, three read-only properties are available: `path` (the working directory), `filename` (the normalized script filename) and `validation` (the last code returned by `validate()`).
