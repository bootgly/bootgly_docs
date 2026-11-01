# Database migrations

This guide walks the full migration workflow for a Bootgly project, end to end, using the
native **[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/)** and the
`bootgly project … migrate` CLI. The **[Migrations](/manual/ADI/Databases/SQL/Schema/Migrations/overview/)**
page covers each piece in depth.

## 1. Configure the database

Migrations run against the project's SQL database — the connection its `database` config scope
describes in `configs/database/database.Config.php`, the same one the project uses at runtime
(see **[Configure the database](/guide/database-dbal/overview/#configure-the-database)**).
Every `migrate` action checks, in order:

| Missing | The command stops with |
|---|---|
| the project in `projects/Bootgly.projects.php` | `Project not registered: <name>` |
| its folder | `Project not found: <name>` |
| its `<Name>.Project.php` file | `No project file found for <name>.` |
| a `configs/` directory | `Project has no configs directory: <name>` |
| a `database` scope in it | `Project has no database config scope: <name>` |

`create` checks only the first two: it writes a file and opens no database.

The command keeps its files in three places:

- the migrations in `<project>/database/migrations/`, a folder `create` makes on demand;
- the history in the `_bootgly_migrations` table of that database — the CLI always uses this
  name (see **[The history table](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#the-history-table)**);
- the lock in `storage/locks/migrations/<name>.lock` in the kit, with a `/` of the project name
  written as `~` (`Demo~Blog.lock`) and a `.guard` file beside it that stays after each run.

## 2. Create a migration

```bash
bootgly project <name> migrate create "Create Users Table"
```

This writes a timestamped stub, e.g.
`database/migrations/20260515120000_create_users_table.php`:

```php
<?php

use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Defaults;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\References;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Types;
use Bootgly\ADI\Databases\SQL\Schema\Blueprint;
use Bootgly\ADI\Databases\SQL\Schema\Migrating;
use Bootgly\ADI\Databases\SQL\Schema\Migration;


return new Migration(
   Up: function (Migrating $Schema) {
      return $Schema->create('example', function (Blueprint $Table): void {
         // @ Define columns here.
      });
   },
   Down: function (Migrating $Schema) {
      return $Schema->drop('example');
   }
);
```

The name is your text in lowercase, with every run of characters other than `a-z` and `0-9`
turned into `_`, after a `YmdHis` timestamp that keeps the files in creation order. The file name
is the migration's identity: never rename a file that ran (see
**[The migration's name](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#the-migrations-name)**).

## 3. Write Up and Down

Define the forward change in `Up` and its exact inverse in `Down`:

```php
use Bootgly\ADI\Databases\SQL\Builder\Expression;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Types;
use Bootgly\ADI\Databases\SQL\Schema\Blueprint;
use Bootgly\ADI\Databases\SQL\Schema\Migrating;
use Bootgly\ADI\Databases\SQL\Schema\Migration;

return new Migration(
   Up: fn (Migrating $Schema) => $Schema->create('users', function (Blueprint $Table): void {
      $Table->add('id', Types::BigInteger)->generate()->constrain(Keys::Primary);
      $Table->add('email', Types::String)->limit(190)->constrain(Keys::Unique);
      $Table->add('created_at', Types::Timestamp)->default = new Expression('CURRENT_TIMESTAMP');
   }),
   Down: fn (Migrating $Schema) => $Schema->drop('users')
);
```

A closure returns what to run: one `$Schema` call, a list of them run in order — a table and
its index, for example — a SQL string, or `null` for nothing. The whole contract, with the error
for anything else, is in
**[What Up and Down return](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#what-up-and-down-return)**.
See **[Blueprint](/manual/ADI/Databases/SQL/Schema/Blueprint/overview/)** for the full column
API.

## 4. Apply pending migrations

```bash
bootgly project <name> migrate up       # every pending migration
bootgly project <name> migrate up 2     # at most the next two
```

The pending migrations apply in file-name order, sharing one **batch** number. On PostgreSQL
and SQLite, each migration plus its history row commit together or roll back together; MySQL
commits its DDL statement by statement. The run stops at the first failure, and the migrations
before it stay applied. For now the limit is cut to a whole number — `up 2.5` applies two —, and
one that is not a number (`up 2x`) or is below 1 (`up 0`, `up -1`) applies every pending
migration.

## 5. Inspect status

```bash
bootgly project <name> migrate status
bootgly project <name> migrate          # the same: status is the default action
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

`Local only` counts the pending files, `DB only` the history rows whose file is gone, `Next` names
the next file to apply and `Remove` the first DB only row (see
**[Reading the status](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#reading-the-status)**).
For now, `status` creates the history table when it is missing, like every action except
`create`: the database user needs permission to create tables even for a status check.

## 6. Roll back

```bash
bootgly project <name> migrate down 1      # revert the last applied migration
bootgly project <name> migrate down 3      # revert the last 3
```

`down` runs each migration's `Down` closure, newest first, and deletes its history row. The count
is required and counts migrations, not batches: a bare `migrate down` stops with
`Migration down requires a numeric step count.`, and `migrate down 0` with
`Migration down requires a positive step count.`. Rolling back one batch — from code —
is in **[Batches and rolling back](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#batches-and-rolling-back)**.

## 7. Sync history without running migrations

```bash
bootgly project <name> migrate sync
```

`sync` reconciles the history table with the migration files **without** executing any
`Up`/`Down` — it records pending files as applied and removes history rows whose files were
deleted. Use it to adopt migrations into an already-provisioned database; to only clean a deleted
file's row, run `migrate up` first, or the pending files are adopted too. It shows what it will
add and delete, then asks `[y/N]`: `y` or `yes` applies it, `n`, `no` or Enter cancels it, and a
script answers through its input, as in `echo y | bootgly project <name> migrate sync`. Every
answer is in
**[Syncing history with the files](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#syncing-history-with-the-files)**.

## 8. Run them at boot

A project can bring its database up to date every time it starts: build the database from its
`database` scope in the boot function of `<Name>.Project.php` and call the runner's `up()` before
anything starts — before `start()` in a server project. The recipe is in
**[Run migrations at boot](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#run-migrations-at-boot)**,
and the **[Guestbook](/cookbook/web/guestbook/overview/)** and
**[Polls](/cookbook/web/polls/overview/)** cookbooks do it in whole projects.

## 9. Test your migrations

Every migration should apply, revert and apply again on a fresh database: a `Down` that leaves its
table, column or index behind makes the next `up()` of that migration fail. A test case can check
that against an in-memory SQLite database, with a lock path of its own run, so it never touches
the project's database. Put it in one of the project's suites, next to the suite's
`autoboot.php` — for example `projects/<Name>/tests/project/1.3-migrations.Test.php` — and list
`'1.3-migrations'` in that suite's `tests`:

```php
<?php

use Bootgly\ACI\Tests\Suite\Test;
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Schema\Runner;


return new Test(
   description: 'Migrations: every file applies, reverts and applies again on a fresh database',
   test: function () {
      // ! A throwaway in-memory database and a lock path of this run only
      $Database = new SQL(['driver' => 'sqlite', 'database' => ':memory:']);
      $lock = sys_get_temp_dir() . '/migrations-test.' . bin2hex(random_bytes(6)) . '.lock';
      $Runner = new Runner($Database, __DIR__ . '/../../database/migrations', $lock);

      try {
         $applied = $Runner->up();

         // @@ Newest first: revert one, apply it again — anything its Down left behind makes
         //    this up() throw — and revert it for good
         $reverted = [];
         $reapplied = [];
         for ($left = count($applied); $left > 0; $left--) {
            $reverted[] = $Runner->down(1)[0];
            $reapplied[] = $Runner->up(1)[0];
            $Runner->down(1);
         }
      }
      finally {
         // @ The runner deletes its lock file but keeps the .guard file beside it
         foreach ([$lock, "{$lock}.guard"] as $file) {
            if (is_file($file)) {
               unlink($file);
            }
         }
      }

      yield assert(
         assertion: $applied === array_keys($Runner->Migrations->discover()),
         description: 'every migration file applies'
      );
      yield assert(
         assertion: $reverted === array_reverse($applied),
         description: 'every migration reverts, newest first'
      );
      yield assert(
         assertion: $reapplied === $reverted,
         description: 'every migration applies again after its Down'
      );
   }
);
```

```bash
cd projects/<Name> && php ../../bootgly test
```

SQLite runs fewer `alter()` actions than PostgreSQL and MySQL — a column type change, for example,
stops with `SQLite schema dialect lacks capability: AlterColumnType.` (see
**[Dialects](/manual/ADI/Databases/SQL/Schema/Dialects/overview/)**). When your migrations use
one, point the test at a throwaway database of the engine you deploy to instead. How suites are
registered and run is in **[Testing](/testing/about/testing/overview/)**, and the Guestbook
cookbook shows a whole project suite.

## Concurrency and safety

A run takes a lock file — the CLI's, which the boot recipe of step 8 takes too — and, on
PostgreSQL and MySQL, an advisory lock keyed on the migrations path. Two runs over the same
migrations are kept apart by the shared lock file on every engine, and by the advisory lock on
PostgreSQL and MySQL even when their lock files differ; a lock file left by a process that no
longer runs is reclaimed. A run never waits for a lock: it stops at once with
`Migration lock is already active.` or `Migration advisory lock is already active.`. `status`
takes no lock. See **[Locking](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#locking)**.

## Engine notes

| Engine | Migration transaction | Concurrency guard |
|--------|----------------------|-------------------|
| PostgreSQL | each migration runs in `BEGIN`/`COMMIT` | lock file + `pg_try_advisory_lock` |
| MySQL/MariaDB | no transaction (DDL commits implicitly) | lock file + `GET_LOCK` |
| SQLite | each migration runs in `BEGIN`/`COMMIT` | lock file |

The advisory lock must be released on the session that took it: give the runner a fresh handle,
or one with `pool.max` at `1`, and in both cases no `replicas`.
**[Locking](/manual/ADI/Databases/SQL/Schema/Migrations/overview/#locking)** explains why, and
what happens to the CLI and to a boot run when the project's `database` scope declares replicas.

## Reference

- **[Schema](/manual/ADI/Databases/SQL/Schema/overview/)** — the DDL facade.
- **[Database queries](/guide/database-queries/overview/)** — the next flow after your
  tables exist.
- **[Database seeders](/guide/database-seeders/overview/)** — fill the tables after migrating.
- **[Blueprint](/manual/ADI/Databases/SQL/Schema/Blueprint/overview/)** — columns, types, references.
- **[Migrations](/manual/ADI/Databases/SQL/Schema/Migrations/overview/)** — the file contract, the
  history table, batches, locking, events and the `Runner` API.
- **[Dialects](/manual/ADI/Databases/SQL/Schema/Dialects/overview/)** — PostgreSQL / MySQL / SQLite.
- **[Events](/guide/events/overview/#adi--sql-database)** — `Migration\Events::Up` and `Down`, fired
  before each migration runs.
