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
    └── database.Config.php
```

The directory name, PHP file name and returned `Config::$scope` must all match. For the example above, the directory is `database/`, the executable file is `database.Config.php`, and that file must return `new Config(scope: 'database')`.

Project configs use the same layout under a project config directory, for example:

```text
projects/MyApp/configs/
└── database/
    ├── .env
    └── database.Config.php
```

## Creating a config file

A `<scope>.Config.php` file returns a `Bootgly\API\Environment\Configs\Config` object.

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
         ->Password->bind(key: 'DB_PASS', required: true)
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

Object navigation creates a missing child. Use `Config::check()` when you need to test direct-child membership without changing the tree:

```php
if ($Database->Connections->check('SQLite')) {
   $path = $Database->Connections->SQLite->Database->get();
}
```

Call `check()` before navigating to that child. It returns whether the direct child was declared and never creates it.

`Configs::load('database')` returns `false` if `database.Config.php` declares another scope. The mismatched tree is not registered under either name and cannot replace an existing scope. Lazy `get('database')` calls latch that mismatch and do not execute the same invalid file repeatedly. After correcting the file in a running process, call `load('database')` explicitly to retry; a successful explicit load clears the latch.

## Environment resolution

When a scope is loaded, Bootgly reads:

1. `.env`
2. `.env.<BOOTGLY_ENV>` when `BOOTGLY_ENV` is set to a valid name
3. `<scope>.Config.php`

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

```bash :toolbar="true";
BOOTGLY_ENV=production php bootgly
```

With that environment, Bootgly also tries `.env.production` after `.env`.

## Writing process variables

`.env` files stay local to the loader — they never mutate the process environment. When a value must actually *be* in the process environment (because resolution reads it first, or because a child process has to inherit it), write it with `Bootgly\API\Environment`:

```php
use Bootgly\API\Environment;
use Bootgly\API\Environment\Configs;

// @ Write before the scope loads: the process environment beats the scope-local .env
Environment::put('DB_HOST', 'db.internal');

$Configs = new Configs(__DIR__ . '/configs/');
$Database = $Configs->get('database');

echo $Database->Connections->MySQL->Host->get();   // db.internal
```

`put()` is `putenv()` with the configured prefix and suffix applied, so the value becomes visible to `getenv()` — step 1 of the `bind()` resolution order above — and to every process spawned afterwards. Order matters: a node resolves its value once, while `<scope>.Config.php` runs, so a `put()` made after the scope loaded does not change what `get()` already returns. Use it for values a deployment step computes (a resolved host, a discovered port) before the application boots.

## Local `.env` policy

Local `.env` variable names must match `[A-Z_][A-Z0-9_]*`. If a loaded `.env` or `.env.<BOOTGLY_ENV>` file contains an invalid key, the scope load fails and the scope is not registered.

Use `allow()` to define exactly which local `.env` keys a scope accepts:

```php
use Bootgly\API\Environment\Configs;

$Configs = new Configs(__DIR__ . '/configs/')
   ->allow('database', [
      'DB_HOST',
      'DB_PORT',
      'DB_NAME',
      'DB_USER'
   ]);
```

When an allowlist exists, typos and cross-scope keys fail closed. For example, `DB_HOSTT` or `SERVER_HOST` in the `database` scope would fail the load unless explicitly allowed.

Use `lock()` for keys that must not come from local `.env` files:

```php
$Configs = new Configs(__DIR__ . '/configs/')
   ->allow('database', [
      'DB_HOST',
      'DB_PORT',
      'DB_NAME',
      'DB_USER'
   ])
   ->lock('database', [
      'DB_PASS'
   ]);
```

A locked key may still be provided by the real process environment, so deployment platforms can inject secrets at runtime. The local `.env` files simply cannot provide that key.

## Required values

Use `bind(required: true)` for secrets and values that must exist:

```php
$Config->JWT->Secret->bind(
   key: 'JWT_SECRET',
   required: true
);

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
- Paths are contained with `File::guard()` before `.env` reads or `.Config.php` execution.
- `.env` values are local to the loader instance and are not exported with `putenv()`.
- `.env` keys must match `[A-Z_][A-Z0-9_]*`.
- `allow()` can restrict local `.env` keys per scope.
- `lock()` can reserve sensitive keys for the real runtime environment.
- Dot-notation is not supported by `Configs::get()`.
- Required secrets can fail closed with `bind(required: true)`.
- `.Config.php` files are trusted PHP code and must be reviewed like source code.

> [!WARNING]
> Never let a user, tenant, upload or admin form write a `.Config.php` file. For untrusted configuration, use a declarative format such as JSON, INI or YAML and convert it to `Config` from trusted application code.

## Reference

The `Bootgly\API\Environment` class is the process-environment side of configuration: it reads and writes the real environment `bind()` consults first. Every key is composed as `Environment::$prefix . $key . Environment::$suffix` — both are public static strings, empty by default — **except** in `del()`, which takes the key verbatim.

```php
public static function load ($file): bool
```

Parses an INI-style file and writes every pair into the process environment through `put()` (so the prefix/suffix apply). Returns `false` when the file does not exist, `true` otherwise — including when the file exists but cannot be parsed. Typed as `string` by PHPDoc. This is the imperative counterpart of the per-scope `.env` reading described above: unlike a scope `.env`, what `load()` reads **does** become global process state.

```php
public static function save (string $file): bool
```

Writes the environment to `$file` as `KEY=value` lines, one per variable, returning `false` only when the write fails. It dumps `list()` — the **entire** process environment, not just the keys Bootgly wrote — so treat its output as secret material and never point it at a path inside a served directory.

```php
public static function list (): array
```

Returns the whole process environment as `array<string,string>`, exactly what `getenv()` returns. Keys are verbatim: the prefix and suffix are not stripped.

```php
public static function get (string $key, null|string|false $default = null): false|string
```

Reads one variable. Returns the value as a string, or `$default` when the variable is unset and a non-`null` default was given, or `false` when it is unset and no default was given. Because the missing case is `false`, compare with `===` rather than testing for emptiness — `'0'` is a valid value.

```php
public static function match (int $type): bool
```

Tests the running environment against one of the class constants: `Environment::CI_CD` (true when `GITHUB_ACTIONS`, `TRAVIS`, `CIRCLECI` or `GITLAB_CI` is set) or `Environment::AI_AGENT` (true when the process is detected as an AI agent). Any other value returns `false`.

```php
public static function put (string $key, string|int $value): bool
```

Writes one variable into the real process environment via `putenv()`, returning whether the write succeeded. An `int` is stringified, so `get()` always reads a string back. The value is visible to `getenv()`, to `bind()` resolution and to processes spawned afterwards — it is **not** written to any `.env` file, and it does not reach processes that are already running.

```php
public static function del (string $key): bool
```

Unsets one variable, returning whether the removal succeeded. It is the one method that does **not** compose the prefix and suffix: pass the full, real variable name — `Environment::del('BOOTGLY_DB_HOST')`, not `Environment::del('DB_HOST')`, when a prefix is configured.
