# Seeders

Seeders are rerunnable SQL data scripts. Use them after migrations when a project needs
demo data, lookup rows or local defaults.

> The end-to-end CLI walkthrough is in the
> **[Database seeders](/guide/database-seeders/overview/)** guide. This page explains the
> objects behind the file.

## The flow

```bash
bootgly project <name> seed create "Demo Users"  # 1. make a file
# edit the file
bootgly project <name> seed list                 # 2. see available seeders
bootgly project <name> seed run --dry-run        # 3. preview SQL
bootgly project <name> seed run                  # 4. run all
bootgly project <name> seed run demo_users       # or one
```

`seed` with no action lists the seeders. `create` and `list` work on the files alone. `run`,
with or without `--dry-run`, opens the database from the project's `configs/database/` scope
and stops with `Project has no configs directory: <name>` or
`Project has no database config scope: <name>` when the project lacks it.
**[Projects](/manual/Bootgly/essential/projects/overview/)** lists every action with its output.

## The file you edit

`create` writes a stable slug in `<project>/database/seeders/`, e.g.
`demo_users.php`. It returns a `Seeder` with one `Run` closure:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Seed;
use Bootgly\ADI\Databases\SQL\Seed\Seeder;

return new Seeder(
   Run: fn (SQL $Database, Seed $Seed) => $Database
      ->table(new Identifier('users'))
      ->insert()
      ->set(new Identifier('email'), $Seed->fake('Email', seed: 1))
);
```

Rules of thumb:

- Return `null`, a raw SQL string, a `Builder`, a compiled `Query`, or an array of those.
  Arrays may nest; their queries run in order and `null` entries are skipped. Anything else
  stops the run with `Seeder must return null, string, Builder, Query, or an array of those.`
- Keep seeder files return-only. Do not declare top-level `class` or `function` symbols in
  them, because a runner may require the same file more than once in one PHP process.
- The filename without `.php` is the seeder's name: `seed run <seeder>` selects by it and the
  runner reports it. `Seeder` also takes an optional `name:`, which only the object keeps —
  the runner never selects by it.
- Write idempotency into the seeder with `upsert`, guarded deletes, cleanup, or a read first
  (see **[When the closure runs](#when-the-closure-runs)**). Seeders have no history table.
- On PostgreSQL the runner follows each `Builder` INSERT that writes an integer value with the
  dialect's identity resync (`Dialect::resync()`), so the integer ids it writes do not leave the
  sequence behind; `preview()` lists it. Raw SQL strings, compiled `Query` objects and
  `Expression` tables or columns are not tracked. The seeding role needs `USAGE`/`SELECT` and
  `UPDATE` on those sequences — see
  **[Fixed ids on every engine](/guide/database-seeders/overview/#fixed-ids-on-every-engine)**.

## Fake values

`$Seed->fake($kind, seed: ...)` returns one value from Bootgly's own fakers
(`Bootgly\ACI\Fakers`):

| Kind | Returns | With `seed: 1` |
| --- | --- | --- |
| `Email` | a lowercase `first.last@domain` address on `example.com`, `test.org`, `mail.dev` or `demo.net` | `frank.davis@test.org` |
| `Integer` | an integer from `0` to `PHP_INT_MAX` | `9171440914760070181` |
| `Name` | a first name and a last name | `Frank Davis` |
| `Text` | five lorem ipsum words | `ut consectetur lorem labore elit` |
| `UUID` | a version 4 UUID | `25f4c16a-eb80-47ff-8c2f-67b84814bcee` |

The kind is matched without regard to case, so `'uuid'` works too. A seed makes the value
repeatable: the same kind and seed return the same value on every run, so give each row its own
seed (`seed: $i`). Without a seed, every call returns a new random value. An unknown kind throws
`LogicException` with `Faker not found: <kind>`.

Two limits matter in a seeder. Names come from 16 first names and 14 last names, so values
repeat early: seed 8 gives the same name and address as seed 5, and seeds 1 to 100 give 79
distinct ones. Do not fill a `UNIQUE` column with them; build such values from the row number
(`"user{$i}@example.test"`). And `fake()` sets no bounds: `Integer` spans `0` to `PHP_INT_MAX`,
more than a PostgreSQL or MySQL `INTEGER` column holds, and `Text` is always five words. For a
range or a length, build the faker class itself and set `min`/`max` or `words`, as
**[Fakers](/testing/deep/fakers/overview/)** shows.

## When the closure runs

The runner calls `Run` first and executes what it returns afterwards. On PostgreSQL and SQLite,
the queries a seeder returns run in one transaction of their own: when one fails, the seeder's
other returned queries are rolled back. MySQL runs them one at a time without a transaction, so
the statements before the failing one stay applied.

Seeders run one after another, in filename order. A failing seeder stops the run with its
error: the seeders before it stay applied, and the ones after it never run.

Because `Run` executes before that transaction opens, a seeder can read the database to decide
what to write. This one writes nothing when the table already has users, so running it again
is safe:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Seed;
use Bootgly\ADI\Databases\SQL\Seed\Seeder;

return new Seeder(
   Run: function (SQL $Database, Seed $Seed): array {
      $Operation = $Database->await($Database->query('SELECT count(*) AS n FROM users'));

      // ? The users are already there
      if ((int) $Operation->Result?->cell > 0) {
         return [];
      }

      return [
         $Database->table(new Identifier('users'))
            ->insert()
            ->set(new Identifier('email'), $Seed->fake('Email', seed: 1))
            ->set(new Identifier('name'), $Seed->fake('Name', seed: 1)),
      ];
   }
);
```

The same timing applies to anything the closure executes itself. A statement sent with
`$Database->query()` inside `Run` commits on its own, outside the seeder's transaction: a
returned query that fails afterwards does not undo it, and a dry run executes it too. Keep the
writes in what `Run` returns.

## Run seeders from code

The CLI wraps `Bootgly\ADI\Databases\SQL\Seed\Runner`. Build one with the database, the seeders
directory and a lock file path, then run every seeder or one by name:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Seed\Runner;

$Database = new SQL([
   'driver' => 'sqlite',
   'database' => __DIR__ . '/app.sqlite',
]);

$Runner = new Runner($Database, __DIR__ . '/database/seeders', __DIR__ . '/storage/locks/seeders.lock');

$Runner->preview();         // ['demo_users' => [['sql' => 'INSERT INTO …', 'parameters' => […]]]]
$Runner->run();             // ['demo_users']
$Runner->run('demo_users'); // ['demo_users']
```

`run()` returns the names of the seeders it ran, in order. `preview()` compiles the same
queries without executing them — the shape is in the **[Reference](#reference)**.

To seed every time the project starts, call the runner in its boot function, right after the
migrations of
**[Run migrations at boot](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#run-migrations-at-boot)**
and on the same handle, as the **[Polls](/cookbook/web/polls/overview/)** cookbook does. Every
boot runs every seeder again, so do this only with seeders that are safe to rerun:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Schema\Runner as Migrations;
use Bootgly\ADI\Databases\SQL\Seed\Runner as Seeds;
use Bootgly\API\Environment\Configs\DatabaseConfig;
use Bootgly\API\Projects\Project;

return new Project(
   name: 'App',
   exportable: false,

   boot: function (array $arguments = [], array $options = []): void
   {
      $Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
      new Migrations($Database, __DIR__ . '/database/migrations', BOOTGLY_STORAGE_DIR . 'locks/migrations/App.lock')->up();
      new Seeds($Database, __DIR__ . '/database/seeders', BOOTGLY_STORAGE_DIR . 'locks/seeders/App.lock')->run();

      // @ Start the application here
   }
);
```

The two lock files are the ones `bootgly project App migrate` and `bootgly project App seed`
use, so a boot and a CLI run of the same project exclude each other: whichever comes second
fails at once.

## Locks

`run()` takes two locks before it loads any seeder and releases both when it ends, failed or
not. Neither waits: a run that finds one taken stops at once.

- **The lock file** you pass. It holds the PID of the run that took it; a second run on the same
  file fails with `Seeder lock is already active.` A lock left behind by a process that no
  longer exists is taken over. A `<lock>.guard` file stays beside it on purpose. The CLI's lock
  file is `storage/locks/seeders/<name>.lock`, with each `/` of a nested project's name written
  as `~` (`App~API.lock`).
- **An advisory lock** in the database, on PostgreSQL (`pg_try_advisory_lock`) and MySQL
  (`GET_LOCK`), keyed on the seeders path string. A second run of the same path on the same
  database on PostgreSQL, or on the same server on MySQL — from another process, another machine
  or another lock file — fails with `Seeder advisory lock is already active.` SQLite has no
  advisory lock.

`preview()` takes neither lock, so a dry run can overlap a real run. The runner releases its
advisory lock the way the migrations runner does, so it needs the same handle — a fresh one, or
one with `pool.max` at `1`, and no `replicas`: see
**[Locking](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#locking)**.

## Reference

### Runner

```php
public function __construct (SQLDatabase $Database, string $path, string $lock, null|Seed $Seed = null)
```

`$Database` is the `Bootgly\ADI\Databases\SQL` facade (`SQLDatabase` is the alias the source
imports it under); its schema dialect decides the transactions and the advisory lock. `$path` is
the seeders directory and `$lock` the lock file path — its directory is created on the first
`run()`. `$Seed` is the context every `Run` closure receives: a plain `Seed` when omitted, or a
subclass of yours to give seeders extra helpers. Building the runner reads no file and opens no
connection. The runner keeps these as read-only properties: `$Database`, `$Seeders`, `$Seed` and
`$Guard`, the lock-and-execute helper the migrations runner uses too.

```php
public function create (string $name): string
```

Writes a stub seeder and returns its path. The file name is the slug of `$name`: lowercase, every
run of characters other than `a-z` and `0-9` turned into `_`, trimmed of `_` — `Demo Users`
becomes `demo_users.php`. Accented letters count as other characters (`Ação` becomes
`a_o.php`). A name with no letter or digit becomes `seeder.php`, and currently so does the name
`0`. The directory is created when missing. An existing file is never overwritten:
`InvalidArgumentException` with `Seeder already exists: <slug>.`

```php
public function discover (): array
```

Returns `['<seeder>' => '<file>', …]` for every `*.php` file in the directory, sorted by
filename, which is the order `run()` follows. A missing directory gives `[]`.

```php
public function preview (null|string $name = null): array
```

Calls `Run` for every seeder, or for the one named, and compiles what it returns without
executing it:

```php
[
   'demo_users' => [
      ['sql' => 'INSERT INTO "users" ("email", "name") VALUES ($1, $2)', 'parameters' => ['frank.davis@test.org', 'Frank Davis']],
   ],
   'empty' => [], // a seeder that returned null
]
```

On PostgreSQL an INSERT that writes an integer value — not the one above — is followed by its
identity resync. `preview()` takes no lock, and a statement the closure executes itself still
runs.

```php
public function run (null|string $name = null): array
```

Takes the locks, then loads and applies every seeder in filename order, or the one named, and
returns the names it ran. An unknown name fails before any seeder runs, with `RuntimeException`
`Seeder file not found: <seeder>.`

### Seeder

```php
public function __construct (Closure $Run, string $name = '')
```

`$Run` receives `(SQL $Database, Seed $Seed)` and returns what the runner executes. `$name` is
kept on the object; when it is empty, loading the file sets it to the filename.

```php
public function run (SQLDatabase $Database, Seed $Seed): mixed
```

Calls `Run` and returns its result as is; the runner validates it afterwards.

```php
public function name (string $name): void
```

Sets the name. `Seeders::load()` calls it with the filename when the file left the name empty.

### Seeders

```php
public function __construct (string $path)
```

Works on the seeder files of one directory. The runner builds one from its `$path`.

```php
public function discover (): array
```

The list behind `Runner::discover()`.

```php
public function load (string $file): Seeder
```

Requires the file — again on every call — and returns its `Seeder`. A file that returns anything
else throws `InvalidArgumentException` with `Seeder file must return a Seeder object.`

```php
public function create (string $name): string
```

The stub writer behind `Runner::create()`.

```php
public function resolve (string $file): string
```

The seeder name of a file: its base name without `.php`.

### Seed

```php
public function fake (string $kind, null|int $seed = null): mixed
```

One fake value of `$kind` — see **[Fake values](#fake-values)**.

### Errors

| Message | Class | When |
| --- | --- | --- |
| `Seeder already exists: <slug>.` | `InvalidArgumentException` | `create()` finds the file |
| `Seeder file must return a Seeder object.` | `InvalidArgumentException` | `run()` or `preview()` loads a file returning anything else |
| `Seeder must return null, string, Builder, Query, or an array of those.` | `InvalidArgumentException` | `Run` returned another value |
| `Seeder file not found: <seeder>.` | `RuntimeException` | `run($name)` or `preview($name)` with an unknown name |
| `Seeder lock is already active.` | `RuntimeException` | `run()` finds the lock file held |
| `Seeder advisory lock is already active.` | `RuntimeException` | `run()` on PostgreSQL or MySQL finds the advisory lock held |
| `Seeder advisory lock hashing requires 64-bit PHP.` | `RuntimeException` | `run()` under 32-bit PHP |
| `Faker not found: <kind>` | `LogicException` | `$Seed->fake()` with an unknown kind |

A failing query throws `RuntimeException` with the driver's message, such as
`relation "users" does not exist` on PostgreSQL. `bootgly project <name> seed` prints the
message of any of these and exits with status 1.

Currently, when the connection dies while a seeder's transaction is open, the rollback fails
too and its error replaces the original one: the run reports `PostgreSQL socket closed.`
where the server said `terminating connection due to administrator command`.

### Related ORM docs

- **[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)** - entity metadata for seeded tables.
- **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)** - hydrate seeded data into entities.
