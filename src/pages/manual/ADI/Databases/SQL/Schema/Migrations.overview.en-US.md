# Migrations

A migration is one file that says "make this change to the database" and "how to undo it".
You create migrations as your app grows; running them brings any database up to date.

> The end-to-end CLI walkthrough is in the
> **[Database migrations](/guide/database-migrations/overview/)** guide. This page explains
> the file you edit, what the runner records and how to read what happened.

## The flow

```bash
bootgly project <name> migrate create "Create Users Table"  # 1. make a file
# edit the file (next section)
bootgly project <name> migrate up                           # 2. apply every pending file
bootgly project <name> migrate status                       # 3. see the state
bootgly project <name> migrate down 1                       # undo the last one
```

- `migrate` with no action runs `status`.
- `migrate up 2` applies at most the next two pending files. For now the count is cut to a whole
  number — `up 2.5` applies two —, and one that is not a number (`up 2x`) or is below 1 (`up 0`,
  `up 0.5`, `up -1`, whose `-1` the CLI reads as an option) applies every pending file. The
  command's `--help` does not list the limit yet.
- `migrate down` needs its count, cut the same way: `down 1.9` reverts one. Without a number — a
  bare `migrate down`, `down 2x`, or `down -1`, read as an option — it stops with
  `Migration down requires a numeric step count.`, and below 1 (`down 0`, `down 0.5`) with
  `Migration down requires a positive step count.`
- `migrate sync` rewrites the history without running anything — see
  [Syncing history with the files](#syncing-history-with-the-files).

Every action except `create` opens the project's database from its `database` config scope:
**[Configure the database](/guide/database-migrations/overview/#1-configure-the-database)** lists
what the command needs.

## The file you edit

`create` drops a timestamped stub in `<project>/database/migrations/` — creating the folder when
it is missing — for example `20260515120000_create_users_table.php`. The file returns a
`Migration` built from two closures, and each closure receives `$Schema`:

```php
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Types;
use Bootgly\ADI\Databases\SQL\Schema\Blueprint;
use Bootgly\ADI\Databases\SQL\Schema\Migrating;
use Bootgly\ADI\Databases\SQL\Schema\Migration;

return new Migration(
   // Up = the change you want
   Up: fn (Migrating $Schema) => $Schema->create('users', function (Blueprint $Table): void {
      $Table->add('id', Types::BigInteger)->generate()->constrain(Keys::Primary);
      $Table->add('email', Types::String)->limit(190)->constrain(Keys::Unique);
   }),

   // Down = exactly how to undo Up
   Down: fn (Migrating $Schema) => $Schema->drop('users')
);
```

`$Schema` is the database's **[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/)** —
the object `$Database->structure()` returns (see
**[Entry points](/manual/ADI/Databases/SQL/overview/#entry-points)**). Its type in the closure,
`Migrating`, is the interface with the seven Schema Builder methods a migration composes with:
`create`, `alter`, `drop`, `rename`, `index`, `unindex` and `unconstrain`. Each one returns a
compiled `Query`; nothing runs until the runner executes what the closure returned.

Rules of thumb:

- **`Down` undoes `Up`.** Created a table in `Up`? Drop it in `Down`. This is what makes
  `migrate down` work.
- **Never edit a file that ran.** The runner applies each file once; ship a change to the
  schema as a new migration.

### What Up and Down return

| The closure returns | What runs |
|---|---|
| `null` | nothing — the migration is still recorded (on `up`) or removed (on `down`) |
| a `Query`, which every `$Schema` method returns | that statement, with its parameters |
| a SQL string | that statement as written, with no parameters |
| a `Builder` | the statement it compiles |
| an array of those, nested arrays included | each one in order; a `null` inside is skipped |

A table and its index, for example, go in one list:

```php
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Types;
use Bootgly\ADI\Databases\SQL\Schema\Blueprint;
use Bootgly\ADI\Databases\SQL\Schema\Migrating;
use Bootgly\ADI\Databases\SQL\Schema\Migration;

return new Migration(
   Up: fn (Migrating $Schema) => [
      $Schema->create('posts', function (Blueprint $Table): void {
         $Table->add('id', Types::BigInteger)->generate()->constrain(Keys::Primary);
         $Table->add('slug', Types::String)->limit(120);
      }),
      $Schema->index('posts', 'slug', unique: true),
   ],

   // Dropping the table drops its index with it
   Down: fn (Migrating $Schema) => $Schema->drop('posts')
);
```

- An index needs `$Schema->index()` in the list, as above. For now, `$Table->index()` inside a
  `create()` or `alter()` closure is dropped: the statement compiles without the index, and an
  `alter()` with nothing else throws `ALTER TABLE requires at least one schema action.` (see
  **[Blueprint](/manual/ADI/Databases/SQL/Schema/Blueprint/overview/)**).
- A string holds one statement. With two, PostgreSQL runs both, MySQL refuses the string with
  `1064` and SQLite runs only the first (see
  **[One statement per query](/manual/ADI/Databases/SQL/Drivers/overview/#one-statement-per-query)**):
  return a list instead.
- Any other value — a number, an object that is neither a `Builder` nor a `Query` — stops the
  run with `Migration must return null, string, Builder, Query, or an array of those.`, and an
  empty or blank string with `SQL cannot be empty.`. Both are checked before any statement of
  that migration runs.

### The migration's name

The file name without `.php` is the migration's name and its place in the order: the runner
sorts the files by name, the `YmdHis` timestamp `create` writes keeps them in creation order, and
the history table stores that name.

- `create` builds the rest of the name from your text: lowercase, every run of characters
  other than `a-z` and `0-9` becomes `_`, and an empty result becomes `migration`. Letters outside
  ASCII count as other characters (`"São Paulo"` → `s_o_paulo`), and for now so does the text
  `0`, which also becomes `migration`. Two `create` calls that end up with the same name in the
  same second write the same file: the second replaces the first.
- **Keep the name within 191 characters**, timestamp included — `create` writes 15 before your
  text. That is the size of the history table's `migration` column on PostgreSQL and MySQL, and
  for now nothing checks it: a longer name makes PostgreSQL fail with
  `value too long for type character varying(191)` and roll the migration back, and MySQL fail
  with `1406: Data too long for column 'migration' at row 1` after the migration's statements ran,
  so the next run fails on what they created. SQLite accepts any length.
- **Don't rename a file that ran.** The history keeps the old name, so the file shows up as
  pending and the old name as a DB only row ([Reading the status](#reading-the-status)).
- **Leave `Migration`'s third argument, `name:`, out.** For now the history records that name
  while the runner keeps matching files by their file name: the migration is reported pending
  and DB only at once, the next `up` runs it again, and `down` stops with
  `Migration file not found: <migration>.`

## Reading the status

```bash
bootgly project <name> migrate status
```

```text
┌ Migration Status ───────────────────────────────┐
│ Applied      4                                  │
│ Local only   2                                  │
│ DB only      1                                  │
│ Next         20260515120000_create_tags_table   │
│ Remove       20260410090000_create_drafts_table │
└─────────────────────────────────────────────────┘
```

| Row | Meaning |
|---|---|
| Applied | every row of the history table, the DB only ones included |
| Local only | pending files: `migrate up` applies them |
| DB only | history rows whose file is gone, deleted or renamed |
| Next | the first pending file, the next one `up` applies; shown when there is one |
| Remove | the first DB only row; shown when there is one |

A DB only row stops `migrate down` when it reaches it, with
`Migration file not found: <migration>.`: put the file back, or remove the row with
[migrate sync](#syncing-history-with-the-files).

> **Status writes too.** For now, `status` — like `Runner::report()` and every other action
> except `create` — first runs `CREATE TABLE IF NOT EXISTS` for the history table, even when the
> table exists. So:
>
> - the database user needs permission to create tables: a role that can only read the
>   history fails with `permission denied for schema public` on PostgreSQL and
>   `1142: CREATE command denied to user …` on MySQL, and a read-only PostgreSQL session with
>   `cannot execute CREATE TABLE in a read-only transaction`;
> - `status` takes no lock: on a PostgreSQL database that has no history table yet, a `status`
>   started at the same moment as `migrate up` can make one of them fail with
>   `duplicate key value violates unique constraint "pg_type_typname_nsp_index"` — run it again;
> - `migrate sync` creates the table before it asks, so the table exists even when you answer
>   no.

## Syncing history with the files

`migrate sync` makes the history match the files without running any `Up` or `Down`:

- it deletes every DB only row;
- it records every Local only file as applied, under a new batch.

The second effect is the trap: a pending migration becomes "applied" although it never ran. Run
`migrate up` first, unless adopting the files is the point — a database whose tables already
exist, created by other means.

The command shows its check first, then asks:

```text
┌ Migration Sync Check ───────────────────────────┐
│ Applied      4                                  │
│ Add          2                                  │
│ Delete       1                                  │
│ Add first    20260515120000_create_tags_table   │
│ Delete first 20260410090000_create_drafts_table │
└─────────────────────────────────────────────────┘

❯ Apply migration sync to _bootgly_migrations? [y/N] [y/N]
```

`y` or `yes`, in any letter case, goes ahead, and the command reports `Migration Sync Applied`
with its `Added` and `Deleted` counts. `n`, `no`, Enter or the end of the input cancel it with
`Migration sync cancelled.`; any other answer asks again on a terminal and cancels without one.
A script confirms through its input: `echo y | bootgly project <name> migrate sync`. With nothing
to change, it prints `Migration history is already synchronized.` and asks nothing. The `[y/N]`
hint is printed twice for now.

## The history table

The runner records every applied migration in one table, `_bootgly_migrations` unless you name
another. It creates the table, with `CREATE TABLE IF NOT EXISTS`, the first time a runner reads
the history:

| Column | PostgreSQL | MySQL | SQLite | Holds |
|---|---|---|---|---|
| `migration` | `VARCHAR(191)` | `VARCHAR(191)` | `TEXT` | the migration's name — the primary key |
| `batch` | `INTEGER` | `INT` | `INTEGER` | the batch that applied it |
| `created_at` | `TIMESTAMP` | `TIMESTAMP` | `TEXT` | when, from `DEFAULT CURRENT_TIMESTAMP` |

Every column is `NOT NULL`. To use another table, set the SQL config key `migrations` (see
**[Config keys](/manual/ADI/Databases/SQL/overview/#config-keys)**), or pass the runner's `table:`
argument, which wins over the key:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Schema\Runner;

$Database = new SQL([
   'driver' => 'sqlite',
   'database' => __DIR__ . '/database/app.sqlite',
   'migrations' => 'schema_history',
]);

$Runner = new Runner($Database, __DIR__ . '/database/migrations', __DIR__ . '/database/app.migrations.lock');
$Runner->Repository->table; // 'schema_history'

$Runner = new Runner($Database, __DIR__ . '/database/migrations', __DIR__ . '/database/app.migrations.lock', table: 'deploy_history');
$Runner->Repository->table; // 'deploy_history'
```

`bootgly project <name> migrate` always uses `_bootgly_migrations`: the project's `database`
scope has no node for this key (see
**[How the scope becomes a connection](/guide/database-dbal/overview/#how-the-scope-becomes-a-connection)**).
A project that names another table runs its migrations from code —
[at boot](#run-migrations-at-boot), for example — and the CLI does not see that history.

## Batches and rolling back

Each `up` stamps every migration it applies with one batch number — the highest one recorded,
plus one — and `sync` does the same for the files it adopts. `down` walks the history newest
first, highest batch first and, inside a batch, the latest name first: for each migration it runs
`Down`, then deletes its row.

```bash
bootgly project <name> migrate down 1    # revert the last applied migration
bootgly project <name> migrate down 3    # revert the last 3, whatever their batches
```

The count is required, and it counts migrations, not batches: `migrate down 0` stops with
`Migration down requires a positive step count.`. To undo the whole last deploy from the CLI,
give the number of rows of its batch — the `batch` column of the history table. From code,
`down()` also takes the batch:

```php
$Runner->down(PHP_INT_MAX, batch: 3); // every migration of batch 3, newest first
$Runner->down(1, batch: 3);           // only the newest one of batch 3
```

It reaches any batch, not only the last one, and does not check whether a later batch depends on
it. A batch without migrations reverts nothing, and a batch of `0` or less throws
`Migration down requires a positive batch number.`

On PostgreSQL and SQLite, which run DDL inside transactions, each migration runs in a transaction
of its own together with its history row: a failure rolls that migration back and stops the run,
and the migrations before it stay done. MySQL commits every DDL statement as it runs: when a
statement fails, the ones before it in that migration stay applied, and its history row is not
written (on `up`) or not deleted (on `down`). So write a MySQL `Down` that can run twice:
`drop()` uses `IF EXISTS`, but for now `unindex()` and `unconstrain()` ignore `exists:` on MySQL
and fail again on a retry — dropping the table drops its indexes with it.

`down` also stops at a history row whose file is gone, with
`Migration file not found: <migration>.`, after reverting the migrations before it.

## Locking

Two locks keep two runs from overlapping. `up()`, `down()` and `sync()` take both and release
both when they return or throw; `report()`, behind `migrate status`, takes none.

1. **A lock file**, at the path you give the runner. The CLI uses
   `storage/locks/migrations/<name>.lock` in the kit, with a `/` of the project name written as
   `~` and a `.` as `%2E` — `Demo/HTTP_Server_CLI` locks `Demo~HTTP_Server_CLI.lock`. The runner
   creates the folder, writes its PID into the file and deletes the file on release; the
   `<lock>.guard` file beside it stays by design. A lock file whose PID no longer runs is taken
   over. One held by a live process — or one without a `pid=` line — stops the run with
   `Migration lock is already active.`: delete it by hand only when no run is in progress.
2. **An advisory lock**, on PostgreSQL (`pg_try_advisory_lock`) and MySQL (`GET_LOCK`); SQLite
   has none. Its key comes from the migrations path — the first 15 hex digits of its SHA-256 —
   so two runs over the same path exclude each other whatever process or machine they start
   from, within one database on PostgreSQL and across the server on MySQL, while runs over
   different paths never do. It does not wait: when another session holds it, the run stops at
   once with `Migration advisory lock is already active.`. The runner computes the key on every
   engine, so a 32-bit PHP stops every run, SQLite included, with
   `Migration advisory lock hashing requires 64-bit PHP.`

The advisory lock belongs to the database session that took it, and for now the runner releases
it through whichever pooled session is free at that moment. On a fresh handle that is the same
session, because the runner sends one statement at a time. A handle that already holds several
idle sessions, or that sends reads to `replicas` — the release is a read, which goes there at once
when `routing.sticky` is `0` —, can release it on another session: the lock then stays held until
the first session closes, and every run over that path fails with
`Migration advisory lock is already active.` meanwhile. Give the runner a fresh handle, or one
with `pool.max` at `1` (see **[Pool size](/manual/ADI/Database/Config/overview/#pool-size)**), and
in both cases no `replicas`.

The CLI and [Run migrations at boot](#run-migrations-at-boot) build a fresh handle from the
project's `database` scope. When that scope declares `replicas`, the lock can outlive the run: the
CLI's until the command exits, the boot's until its handle closes. The seed runner takes and
releases its advisory lock the same way.

## Events

The runner announces each migration on the event bus before running it (see
**[ADI — SQL database](/guide/events/overview/#adi--sql-database)** in the events guide):

```php
use Bootgly\ABI\Events\Emission;
use Bootgly\ABI\Events\Emitter;
use Bootgly\ADI\Databases\SQL\Schema\Migration\Events;

Emitter::$Instance->listen(Events::Up, function (Emission $Emission) {
   [$Migration, $batch] = $Emission->payload;

   error_log("applying {$Migration->name} in batch {$batch}");
});
```

- `Up` and `Down` fire before the migration's statements and outside its transaction, so a
  listener also hears about a migration that then fails.
- `Down` carries batch `0` for now, not the batch being reverted.
- A listener that throws stops the run before that migration's first statement, and its exception
  reaches the caller — the CLI prints its message.

## Run migrations at boot

To bring the database up to date every time the project starts, run the runner in the boot
function of `<Name>.Project.php`, on the `database` config scope the CLI reads:

```php
<?php

use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Schema\Runner;
use Bootgly\API\Environment\Configs\DatabaseConfig;
use Bootgly\API\Projects\Project;


return new Project(
   name: 'Blog',
   exportable: true,
   boot: function (array $arguments = [], array $options = []): void
   {
      // @ Migrate first: a failure stops the boot before anything starts
      $Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
      new Runner($Database, __DIR__ . '/database/migrations', BOOTGLY_STORAGE_DIR . 'locks/migrations/Blog.lock')->up();

      // @ Then configure and start the server or the console app
   }
);
```

- In a server project, keep these lines before `start()`. `start()` forks the workers, and this
  handle must not reach the routes, which use `$Response->Database` (see
  **[Use it in a script or command](/guide/database-dbal/overview/#use-it-in-a-script-or-command)**).
- With nothing pending, a start only takes the locks, checks the history table and reads it.
- A failing migration throws out of the boot function: the project does not start, and the
  exception is printed.
- The lock file is the one `bootgly project Blog migrate` takes: in the kit's
  `storage/locks/migrations/`, named after the project's path, with each `/` of a nested one
  written as `~` (see [Locking](#locking)). So a boot and a CLI run of the project exclude each
  other on every engine, SQLite included: whichever comes second fails at once, and a boot that
  comes second does not start the project. With a lock file of your own, only the advisory lock
  keeps them apart, and SQLite has none.
- The handle is fresh, as the advisory lock needs — unless the project's `database` scope
  declares `replicas` (see [Locking](#locking)).
- Seeders run the same way, after the migrations: see
  **[Seeders](/manual/ADI/Databases/SQL/Seed/overview/)**.

The **[Guestbook](/cookbook/web/guestbook/overview/)** (SQLite) and
**[Polls](/cookbook/web/polls/overview/)** (PostgreSQL) cookbooks migrate at boot in whole
projects, each with a lock file of its own in the project folder.

## Errors

| Message | Thrown by | Cause |
|---|---|---|
| `Migration down requires a positive step count.` | `down()` | `$steps` is `0` or less — `migrate down 0` |
| `Migration down requires a positive batch number.` | `down()` | `$batch` is `0` or less |
| `Migration file must return a Migration object.` | `up()`, `down()` | A migration file returns something else |
| `Migration must return null, string, Builder, Query, or an array of those.` | `up()`, `down()` | An `Up` or `Down` closure returns another value |
| `SQL cannot be empty.` | `up()`, `down()` | A closure returns an empty or blank string |
| A Schema Builder compile error, e.g. `SQLite schema dialect lacks capability: AlterColumnType.` | `up()`, `down()` | A closure builds a statement the dialect refuses; nothing of that migration runs |
| `Migration file not found: <migration>.` | `down()` | The history row to revert has no file |
| `Migration history row is missing the migration name.` | `down()` | A history row without a name — from a custom `Repository` |
| `Migration lock is already active.` | `up()`, `down()`, `sync()` | The lock file belongs to a live process |
| `Migration advisory lock is already active.` | `up()`, `down()`, `sync()` | Another session holds the advisory lock |
| `Migration advisory lock hashing requires 64-bit PHP.` | `up()`, `down()`, `sync()` | PHP is a 32-bit build |
| The server's error, e.g. `relation "users" already exists` | `up()`, `down()`, `sync()`, `report()` | A statement failed |

The first six are `InvalidArgumentException`s and the rest `RuntimeException`s. When PostgreSQL
drops the connection in the middle of a migration, the error you get can be the failed rollback's,
`PostgreSQL socket closed.`, instead of the cause; nothing of that migration is committed.

The CLI catches what the runner throws — every error above —, prints its message and exits with
status `1`. It adds its own messages: `Migration down requires a numeric step count.` for a
`down` without a number, `Invalid migration action: <action>` for an unknown action, and the
project and config checks of
**[Configure the database](/guide/database-migrations/overview/#1-configure-the-database)**. What
fails outside the runner is not caught: an invalid database config — such as
`Unsupported database TLS mode: <mode>.` — or a `create` that cannot write its file prints the
uncaught exception and exits with status `255`.

## Reference

### Runner

`Bootgly\ADI\Databases\SQL\Schema\Runner` runs the migrations of one folder on one database. The
CLI builds one per command.

```php
__construct (SQLDatabase $Database, string $path, string $lock, null|string $table = null, null|Repository $Repository = null)
```

Builds a runner over the migration files in `$path`, with `$lock` as its lock file.
`SQLDatabase` is the `Bootgly\ADI\Databases\SQL` facade. The history table is `$table`, or the
database's `migrations` config key when it is `null`. `$Repository` replaces the history's query
factory, `Schema\Repository` — its `create()`, `fetch()`, `peek()`, `insert()` and `delete()`
statements — and `$table` is then unused. Nothing is read, written or dialed yet.

```php
report (): array
```

Creates the history table when this runner has not checked it yet, then compares the history
with the files and returns `['applied' => …, 'pending' => …, 'missing' => …, 'files' => …]`:
`applied` holds the history rows (`migration`, `batch`, `created_at`), newest first; `pending`
the names with a file and no row, in file order; `missing` the names with a row and no file; and
`files` maps every file's name to its path. `created_at` comes back as the driver decodes it: a
`DateTimeImmutable` on PostgreSQL and MySQL, a string on SQLite. Takes no lock.

```php
up (int $limit = 0): array
```

Applies the pending migrations in file order, as one new batch, under both locks, and returns
their names. A `$limit` above `0` applies at most that many; `0` or less applies them all.

```php
down (int $steps, null|int $batch = null): array
```

Reverts up to `$steps` applied migrations, newest first — only those of `$batch` when it is
given — under both locks, and returns their names. `$steps` or `$batch` at `0` or less throws
before any lock is taken.

```php
sync (): array
```

Deletes the history rows that have no file and records every pending file as applied under a new
batch, under both locks, without running any `Up` or `Down`. Returns
`['added' => [...], 'deleted' => [...]]`, both lists of names.

```php
create (string $name): string
```

Writes a migration stub through `Migrations::create()` and returns its path.

```php
public private(set) SQLDatabase $Database;
```

The database the runner was built with.

```php
public private(set) Migrating $Schema;
```

What every closure receives: `$Database->structure()`.

```php
public private(set) Dialect $Dialect;
```

The Schema Builder dialect; its `transactions` flag decides whether each migration runs in a
transaction.

```php
public private(set) Guard $Guard;
```

The two locks, as a `Schema\Guard`; its `Lock` property is the lock file, a
`Bootgly\ADI\Databases\SQL\Lock`.

```php
public private(set) Migrations $Migrations;
```

The files: discovery, loading and stubs.

```php
public private(set) Repository $Repository;
```

The history's query factory; `$Runner->Repository->table` is the history table's name.

### Migrations

`Bootgly\ADI\Databases\SQL\Schema\Migrations` reads and writes the migration files of one folder.

```php
__construct (string $path)
```

Takes the folder; nothing is read until a method needs it.

```php
discover (): array
```

Returns every `*.php` file of the folder, sorted by name, as `name => path`, the name being the
file name without `.php`. A missing folder gives `[]`.

```php
load (string $file): Migration
```

Requires the file and returns its `Migration`, named after the file unless it already carries a
name. Throws `InvalidArgumentException` with `Migration file must return a Migration object.` when
the file returns anything else.

```php
create (string $name): string
```

Writes the stub to `<YmdHis>_<slug>.php`, creating the folder when it is missing, and returns the
file's path. The slug follows [The migration's name](#the-migrations-name); a file
of the same name is overwritten.

```php
resolve (string $file): string
```

Returns the migration name of a file path: its base name without `.php`.

```php
public private(set) string $path;
```

The folder of the migration files.

### Migration

`Bootgly\ADI\Databases\SQL\Schema\Migration` is what a migration file returns.

```php
__construct (Closure $Up, Closure $Down, string $name = '')
```

Takes the two closures, each called with the `Migrating` schema. Leave `$name` empty: `load()`
names the migration after its file, and for now a custom name breaks the history (see
[The migration's name](#the-migrations-name)).

```php
up (Migrating $Schema): mixed
```

Calls `Up` and returns what it returned, without executing it.

```php
down (Migrating $Schema): mixed
```

Calls `Down` and returns what it returned, without executing it.

```php
rename (string $name): self
```

Sets `$name`; `load()` calls it to name a migration after its file.

```php
public private(set) Closure $Up;
```

The closure that applies the migration.

```php
public private(set) Closure $Down;
```

The closure that reverts it.

```php
public private(set) string $name;
```

The migration's name, which the history table stores.

### Migrating

`Bootgly\ADI\Databases\SQL\Schema\Migrating` is the interface of `$Schema` in a migration file.
The **[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/#reference)** implements it, and
it declares the seven methods that builder documents — `create`, `alter`, `drop`, `rename`,
`index`, `unindex` and `unconstrain` — with the same signatures. Each compiles one statement and
returns it as a `Query`. The runner always passes `$Database->structure()`; nothing else on the
builder, such as its `Dialect`, is part of the interface.
