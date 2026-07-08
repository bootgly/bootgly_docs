# Database migrations

This guide walks the full migration workflow for a Bootgly project, end to end, using the
native **[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/)** and the
`bootgly project … migrate` CLI.

## 1. Configure the database

Migrations run against the project's configured SQL database (PostgreSQL by default).
Database connection settings come from the project's environment config
(`DatabaseConfig`) — the same config the project uses at runtime. No extra setup is needed
beyond a reachable database.

Migration files live in `<project>/database/migrations/` and the runner lock in
`storage/locks/migrations/<project>.lock` (both created on demand).

## 2. Create a migration

```bash
bootgly project <name> migrate create "Create Users Table"
```

This writes a timestamped stub, e.g.
`database/migrations/20260515120000_create_users_table.php`:

```php
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

## 3. Write `Up` / `Down`

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

A closure may return one query or an array of queries (multi-statement migrations run in
order). See **[Blueprint](/manual/ADI/Databases/SQL/Schema/Blueprint/overview/)** for the
full column API.

## 4. Apply pending migrations

```bash
bootgly project <name> migrate up
```

All pending migrations apply in filename order, sharing one **batch** number. When the
database supports transactions, each migration plus its history row commit atomically and
roll back on error.

## 5. Inspect status

```bash
bootgly project <name> migrate status
```

Shows `Applied`, `Local only` (pending), `DB only` (file deleted but still recorded), and
the next migration to run.

## 6. Roll back

```bash
bootgly project <name> migrate down        # revert the last applied migration
bootgly project <name> migrate down 3      # revert the last 3
```

`down` runs each migration's `Down` closure in reverse order. A positive step count is
required.

## 7. Sync history without running migrations

```bash
bootgly project <name> migrate sync
```

`sync` reconciles the history table with the migration files **without** executing any
`Up`/`Down` — it records pending files as applied and removes history rows whose files were
deleted. Use it to adopt migrations into an already-provisioned database.

## Concurrency &amp; safety

A local file lock plus a dialect advisory lock (where supported) stop two runs from
overlapping; a stale lock whose owning process is gone is reclaimed automatically. If a lock
is genuinely held you get `Migration lock is already active.`

## Engine notes

| Engine | Migration transaction | Concurrency guard |
|--------|----------------------|-------------------|
| PostgreSQL | each migration runs in `BEGIN`/`COMMIT` | file lock + `pg_try_advisory_lock` |
| MySQL/MariaDB | no transaction (DDL commits implicitly) | file lock + `GET_LOCK` |
| SQLite | each migration runs in `BEGIN`/`COMMIT` | file lock |

Run migrations with `pool.max = 1` so the advisory lock and its release use the same
session.

## Reference

- **[Schema](/manual/ADI/Databases/SQL/Schema/overview/)** — the DDL facade.
- **[Database queries](/guide/database-queries/overview/)** — the next flow after your
  tables exist.
- **[Blueprint](/manual/ADI/Databases/SQL/Schema/Blueprint/overview/)** — columns, types, references.
- **[Migrations](/manual/ADI/Databases/SQL/Schema/Migrations/overview/)** — `Runner`, batches, history.
- **[Dialects](/manual/ADI/Databases/SQL/Schema/Dialects/overview/)** — PostgreSQL / MySQL / SQLite.
