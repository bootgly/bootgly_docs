# Configuration

Bootgly provides a scoped configuration system for framework and project settings. A config scope is a small tree of `Config` nodes loaded from a trusted PHP file and optionally backed by `.env` files.

Use it for values such as database connections, feature flags, server options and project-specific overrides.

## Directory layout

Each scope lives in its own directory:

```text
configs/
└── database/
    ├── .env
    ├── .env.production
    └── database.config.php
```

The directory name and the PHP file name must match the scope name. For the example above, the scope is `database` and the executable config file is `database.config.php`.

Project configs use the same layout under a project config directory, for example:

```text
projects/MyApp/configs/
└── database/
    ├── .env
    └── database.config.php
```

## Creating a config file

A `<scope>.config.php` file returns a `Bootgly\API\Environment\Configs\Config` object.

```php
use Bootgly\API\Environment\Configs\Config;
use Bootgly\API\Environment\Configs\Config\Types;

return new Config(scope: 'database')
   ->Default->bind(key: 'DB_CONNECTION', default: 'mysql')
   ->Connections
      ->MySQL
         ->Driver->bind(key: '', default: 'mysql')
         ->Host->bind(key: 'DB_HOST', default: 'localhost')
         ->Port->bind(key: 'DB_PORT', default: 3306, cast: Types::Integer)
         ->Database->bind(key: 'DB_NAME', default: 'bootgly')
         ->Username->bind(key: 'DB_USER', default: 'root')
         ->Password->need(key: 'DB_PASS')
         ->Charset->bind(key: '', default: 'utf8mb4');
```

`bind()` returns the parent node, so the tree can be declared fluently. A node value is read with `get()`.

## Loading a scope

```php
use Bootgly\API\Environment\Configs;

$Configs = new Configs(__DIR__ . '/configs/');
$Database = $Configs->get('database');

$host = $Database->Connections->MySQL->Host->get();
$port = $Database->Connections->MySQL->Port->get();
```

`Configs::get()` accepts only a scope name. Dot-notation is intentionally not supported. Nested values must be accessed with object navigation:

```php
$Database->Connections->MySQL->Host->get();
```

## Environment resolution

When a scope is loaded, Bootgly reads:

1. `.env`
2. `.env.<BOOTGLY_ENV>` when `BOOTGLY_ENV` is set to a valid name
3. `<scope>.config.php`

For every `bind()`, resolution order is:

1. Real process environment (`getenv()`)
2. The scope-local `.env` map
3. The default value passed to `bind()`

This means runtime-provided env vars always win, but `.env` files do not mutate the global process environment.

Example:

```ini
DB_HOST=localhost
DB_PORT=3306
DB_PASS=secret
```

```bash
BOOTGLY_ENV=production php bootgly
```

With that environment, Bootgly also tries `.env.production` after `.env`.

## Required values

Use `need()` or `bind(required: true)` for secrets and values that must exist:

```php
$Config->JWT->Secret->need('JWT_SECRET');

$Config->Database->Password->bind(
   key: 'DB_PASS',
   required: true
);
```

Required values fail closed: missing values and empty strings throw an exception. Defaults are not used when `required: true` is enabled.

## Strict type casting

Use `Types` to parse scalar values explicitly:

```php
$Config->Server->Port->bind('SERVER_PORT', 8080, Types::Integer);
$Config->Features->Debug->bind('APP_DEBUG', false, Types::Boolean);
```

Supported casts:

| Type | Accepted examples | Invalid examples |
| --- | --- | --- |
| `Types::Boolean` | `true`, `false`, `1`, `0`, `yes`, `no`, `on`, `off` | `maybe`, `enabled` |
| `Types::Integer` | `8080`, `-1` | `123abc`, `1.2` |
| `Types::Float` | `10.5`, `1e3`, `.25` | `1.2.3`, `ten` |
| `Types::String` | Any scalar value | — |

Invalid boolean, integer and float values throw instead of being coerced silently.

## Project overlay

Project configs can overlay framework configs. Project values win; framework values fill missing nodes.

```php
use Bootgly\API\Environment\Configs as FrameworkConfigs;
use Bootgly\API\Projects\Configs as ProjectConfigs;

$Framework = new FrameworkConfigs(BOOTGLY_ROOT_BASE . '/configs/');
$Project = new ProjectConfigs($projectPath . 'configs/');

$Project->overlay($Framework, 'database');

$Database = $Project->get('database');
```

The overlay process keeps `.env` values local to each loader, so framework/project `.env` files do not leak into `getenv()`.

## Security model

Bootgly hardens config loading with several rules:

- Scope and environment names must match `[A-Za-z0-9_-]+`.
- Paths are contained with `File::guard()` before `.env` reads or `.config.php` execution.
- `.env` values are local to the loader instance and are not exported with `putenv()`.
- Dot-notation is not supported by `Configs::get()`.
- Required secrets can fail closed with `need()` or `bind(required: true)`.
- `.config.php` files are trusted PHP code and must be reviewed like source code.

> [!WARNING]
> Never let a user, tenant, upload or admin form write a `.config.php` file. For untrusted configuration, use a declarative format such as JSON, INI or YAML and convert it to `Config` from trusted application code.
