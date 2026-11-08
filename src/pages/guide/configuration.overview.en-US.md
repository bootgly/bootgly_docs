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

## Declaring a schema

A chain of `bind()` calls stops at the first problem: a missing password throws, you fix it, restart, and only then learn the port is not a number. To see every problem of a scope at once, declare the scope with a `Schema` and return what it builds:

```php
use Bootgly\ADI\Validators\In;
use Bootgly\ADI\Validators\Maximum;
use Bootgly\ADI\Validators\Minimum;
use Bootgly\API\Environment\Configs\Config\Types;
use Bootgly\API\Environment\Configs\Schema;
use Bootgly\API\Environment\Configs\Schema\Field;

return new Schema(scope: 'database', Fields: [
   'Default' => new Field(key: 'DB_CONNECTION', default: 'mysql', Rules: [
      new In(['mysql', 'pgsql', 'sqlite']),
   ]),
   'Connections.MySQL.Host' => new Field(key: 'DB_HOST', default: 'localhost'),
   'Connections.MySQL.Port' => new Field(key: 'DB_PORT', default: 3306, cast: Types::Integer, Rules: [
      new Minimum(1),
      new Maximum(65535),
   ]),
   'Connections.MySQL.Username' => new Field(key: 'DB_USER', default: 'root'),
   'Connections.MySQL.Password' => new Field(key: 'DB_PASS', required: true),
   'Connections.MySQL.Charset' => new Field(default: 'utf8mb4'),
])->build();
```

Each key is a path of node names: `Connections.MySQL.Port` is the node you read as `$Database->Connections->MySQL->Port->get()`. A `Field` takes the same inputs as `bind()` — `key`, `default`, `cast`, `required` — and resolves the same way (process environment, then the scope `.env`, then the default), plus `Rules`: ADI validators run on the resolved, cast value. Rules see every resolved value of the scope, so a cross-field rule such as `Confirmed` can compare two fields. `build()` returns the scope's `Config` root, so the rest of the application reads it exactly as before.

When anything is wrong, `build()` binds and checks every field first and then throws one `Schema\Failure` that lists all of them, in declaration order:

```text
Invalid config scope `database` (3 failures):
- Default: Default must be one of the allowed values.
- Connections.MySQL.Port: Invalid integer config value.
- Connections.MySQL.Password: Required config value is missing: DB_PASS
```

Because the file runs when the scope loads, the failure surfaces from `Configs::load()` or the first `Configs::get()`, and the scope is not registered. Return the result of `build()`, not the `Schema` itself: a scope file that returns an unbuilt `Schema` makes the load throw a `RuntimeException` instead of silently skipping the validation. Load the scopes your application needs while it boots, so a broken deployment stops there instead of on the first request:

```php
use Bootgly\API\Environment\Configs;
use Bootgly\API\Environment\Configs\Schema\Failure;

$Configs = new Configs(__DIR__ . '/configs/');

try {
   $Configs->load('database');
}
catch (Failure $Failure) {
   fwrite(STDERR, "{$Failure->getMessage()}\n");
   exit(1);
}
```

`$Failure->scope` names the scope and `$Failure->failures` holds the reasons keyed by path, for a log or a health check.

The report never contains a configured value — not the rejected one, not the default — so it is safe to log even when the field holds a password or a token. The built-in validators name the field, never its value; keep the same rule in the message of a custom `Condition` you add to `Rules`. A rule that throws is reported as `A rule of this field could not run.` for its field, and its exception is dropped. The rule messages follow the `validation` translation catalogs of the active language, while the bind and cast reasons stay in English.

A few declarations are refused when the `Schema` or a `Field` is constructed, because they are bugs in the file rather than in the deployment (they throw `InvalidArgumentException`):

- a scope that is not a scope name (`[A-Za-z0-9_-]+`);
- a node name that is not a PHP identifier (`My-SQL`, `1Host`, an empty segment) or that is a `Config` property (`scope`, `name`, `parent`, `value`, …), since object navigation could not read it;
- a wildcard (`Connections.*`): every field binds one node;
- a path that is the container of another (`Database` and `Database.Host`): a node holds a value or children, not both;
- a `Field` whose key holds a control character or `=`, a required `Field` without a key (it could never resolve), or a rule that is not a `Condition`.

`bind()` keeps working unchanged, and both styles produce the same tree: move a scope to a `Schema` when you want the aggregated report.

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

## Local .env policy

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
- A `Schema` reports every invalid key of a scope at once, and its report never contains a configured value.
- `.Config.php` files are trusted PHP code and must be reviewed like source code.

> [!WARNING]
> Never let a user, tenant, upload or admin form write a `.Config.php` file. For untrusted configuration, use a declarative format such as JSON, INI or YAML and convert it to `Config` from trusted application code.

## Reference

The `Bootgly\API\Environment` class is the process-environment side of configuration: it reads and writes the real environment `bind()` consults first. Every key you pass — to `get()`, `put()` and `del()`, or in a file `load()` reads — is composed as `Environment::$prefix . $key . Environment::$suffix`; both are public static strings, empty by default. `list()` and `save()` work on the real names.

```php
public static function load (string $file): bool
```

> [!IMPORTANT]
> **Deprecated since 1.1.0, removed in 2.0.0.** Read `.env` files through `Environment\Configs` (a scope `.env`: scoped, validated, never exported); when a child process needs a value in its environment, export that one value with `put()`.

Parses an INI-style file and hands every pair to `put()`, so the prefix and suffix apply and a variable that is already set is overwritten — the file wins over the real environment, the opposite of `bind()`. Returns `false`, applying nothing, when the file is missing, is not a regular file (a directory, a FIFO), cannot be read or parsed, holds a NUL byte or holds an array key (`KEY[]=`, `KEY[name]=`), and also when `Environment::$prefix` or `Environment::$suffix` holds a `=` or a NUL byte, since `put()` would refuse every composed name; otherwise it returns `true`. This is the imperative counterpart of the per-scope `.env` reading described above: unlike a scope `.env`, what `load()` reads **does** become global process state.

> [!WARNING]
> `load()` exports every name the file holds — `PATH`, `LD_PRELOAD` and `PHP_INI_SCAN_DIR` like any other — and every process the application spawns afterwards inherits them: whoever writes the file chooses which binaries those processes find, which libraries they preload and which `php.ini` directives they read. Never load a file another account can write. To read a `.env` file, use `Configs`, the canonical reader described above: it keeps the values local to the scope, accepts only `[A-Z_][A-Z0-9_]*` names, honors `allow()` and `lock()`, and exports nothing.

```php
public static function save (string $file): bool
```

> [!IMPORTANT]
> **Deprecated since 1.1.0, removed in 2.0.0.** Persisting the whole process environment is not supported: write the values a deployment needs to a file your application owns, at `0600`, and read them back through a scope `.env`.

Writes the **entire** process environment — every variable `getenv()` returns — to `$file`, one `KEY=value` line per variable: the bare form `docker --env-file` and similar readers expect. A value the bare line would not carry intact through `load()` is written quoted instead, as `KEY="value"` — for example one that holds a `;`, starts or ends with a space or a tab, or is wrapped in double quotes. A reader that takes lines literally, such as `docker --env-file`, keeps those quotes as part of the value. Every line is checked to read back as exactly its pair before anything is written.

The write is atomic and private: the lines go to a randomly named temporary file beside `$file`, which is set to `0600` before its first byte is written — also in a directory whose default ACL would grant more — then synced to disk and renamed over `$file`. Whatever was at `$file` is replaced, never written through: a new file owned by the caller takes its place, so the owner, group, mode, ACL, SELinux label and hard links of the old file do not carry over (another hard link to the old file keeps the old content), and a link is replaced instead of followed, so its target is never touched. In a sticky directory such as `/tmp`, only an entry's owner, the directory's owner or root may replace an entry: a link another account planted at `$file` makes `save()` return `false` and stays as it was, unless the caller owns the directory or is root — then the link itself is replaced.

Returns `false`, leaving `$file` untouched, when:

- `$file` is not a local path — a stream wrapper such as `php://filter` or `compress.zlib://`;
- a variable has no line that reads back as its pair — a line break in its value (an exported shell function, a multi-line certificate) or a name the INI format cannot carry (`NULL`, `YES`, `A~B`). This makes `save()` always return `false` on 64-bit Windows, where every process holds `ProgramFiles(x86)`;
- the temporary file cannot be made private (`0600`);
- the write fails — for example because the directory of `$file` is not writable, even if `$file` itself is, or because `$file` is a mount point: a single file bind-mounted into a container (`docker run -v ./app.env:/app/.env`, a Kubernetes `subPath` mount) cannot be replaced, so mount its directory instead.

Names `getenv()` leaves out (see `list()`) are not written. The lines carry the real names, so loading the file back with a prefix or suffix set composes each name again: with the prefix `APP_`, `APP_TOKEN` comes back as `APP_APP_TOKEN` and `PATH` as `APP_PATH`.

> [!WARNING]
> `save()` dumps the **entire** process environment, not just the keys Bootgly wrote — inherited tokens and credentials included. Treat the file as secret material and never point it at a path inside a served directory.

```php
public static function list (): array
```

> [!IMPORTANT]
> **Deprecated since 1.1.0, removed in 2.0.0.** Use `getenv()`, which returns the same array.

Returns the whole process environment as `array<string,string>`, exactly what `getenv()` returns. Keys are verbatim: the prefix and suffix are not stripped. `getenv()` leaves out every name that contains a `.`, a space or a `[` — such a variable is still set, `get()` still reads it and child processes still inherit it, but it is missing from this list and from the file `save()` writes.

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

Writes one variable into the real process environment via `putenv()`, returning whether the write succeeded. An `int` is stringified, so `get()` always reads a string back. Returns `false`, writing nothing, when `$key` is empty, the composed name (prefix, key and suffix) holds a `=` or a NUL byte, or `$value` holds a NUL byte — `putenv()` would otherwise act on another variable or cut the value short. The value is visible to `getenv()`, to `bind()` resolution and to processes spawned afterwards — it is **not** written to any `.env` file, and it does not reach processes that are already running.

```php
public static function del (string $key): bool
```

Unsets one variable, composing the prefix and suffix like `get()` and `put()`: with `Environment::$prefix = 'BOOTGLY_'`, `Environment::del('DB_HOST')` removes `BOOTGLY_DB_HOST` and leaves a plain `DB_HOST` alone. Returns `true` once the variable is unset — also when it was not set — and `false`, removing nothing, when `$key` is empty or the composed name holds a `=` or a NUL byte (`putenv()` would act on another variable: `del('NAME=value')` would *set* `NAME`).


```php
new Schema (string $scope, array $Fields)
```

`Bootgly\API\Environment\Configs\Schema` declares one scope. `$Fields` maps node paths (`Host`, `Connections.MySQL.Port`) to `Field` objects; both are kept, in declaration order, as the read-only `scope` and `Fields` properties. Throws `InvalidArgumentException` for a scope that is not a scope name (`[A-Za-z0-9_-]+`), a key that is not a non-empty string, a value that is not a `Field`, a node name that is not a PHP identifier or is a `Config` property, a wildcard, or a path that is the container of another path.

```php
public function build (): Config
```

Binds every field into a new `Config` root of the scope — the same resolution, defaults, strict casts and required semantics as `bind()` — then runs each field's `Rules` with ADI `Validation` over every resolved value of the scope. Returns the root when everything passes. Otherwise throws one `Schema\Failure` with every failure: an absent or empty required value, a value its `cast` refuses, each rule that failed, and `A rule of this field could not run.` for a field whose rule threw (its exception is not kept). A field whose bind fails is reported once and its rules are not run. Each call builds a fresh tree.

```php
new Field (string $key = '', mixed $default = null, null|Types $cast = null, bool $required = false, array $Rules = [])
```

`Bootgly\API\Environment\Configs\Schema\Field` is one declared key. `key`, `default`, `cast` and `required` mean what they mean for `bind()`; `Rules` is a list of ADI `Condition` objects (validators such as `Minimum`, `In`, `Regex`) run on the resolved value. Optional blank values skip every rule except the implicit ones (`Required`), as in ADI `Validation`. All five inputs are read-only public properties. Throws `InvalidArgumentException` when the key holds a control character or `=`, when `required` is set without a key, or when a rule is not a `Condition`.

```php
final class Failure extends RuntimeException
```

`Bootgly\API\Environment\Configs\Schema\Failure` is the aggregated report. `scope` is the scope name and `failures` is `array<string,array<int,string>>`: the reasons keyed by node path, in declaration order. The message is ``Invalid config scope `<scope>` (<n> failures):`` (`failure` when there is one) followed by one `- <path>: <reason>` line per reason. Neither the message nor `failures` contains a configured value.
