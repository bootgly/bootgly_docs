# Database seeders

Seeders fill tables with project data: demo users, local defaults, lookup rows or test-like
records that make a fresh database usable. They run after migrations and use the same SQL
database config as the project.

## Before you start

`seed run` opens the database through the project's `database` config scope, the same one the
project's code and `migrate` use, so the project needs `configs/database/database.Config.php`
(see **[Configure the database](/guide/database-dbal/overview/#configure-the-database)**).
Without it, `seed run` stops with `Project has no configs directory: <name>` or
`Project has no database config scope: <name>`; `seed create` and `seed list` work without a
database. Run the **[migrations](/guide/database-migrations/overview/)** first: seeders write
into the tables they create.

## 1. Create a seeder

```bash
bootgly project <name> seed create "Demo Users"
```

This writes `database/seeders/demo_users.php`, creating the directory on the first run:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Seed;
use Bootgly\ADI\Databases\SQL\Seed\Seeder;


// ? Keep seeder files return-only. Avoid top-level class/function declarations
// ? because seeder files may be required more than once in one process.
return new Seeder(
   Run: function (SQL $Database, Seed $Seed) {
      // @ Return one query, a list of queries, or null.
      return null;
   }
);
```

Seeder names are stable slugs, not timestamps: the name is lowercased and every run of
characters other than `a-z` and `0-9` becomes `_`, so `Demo Users` is `demo_users`. Creating
the same slug twice is rejected with `Seeder already exists: demo_users.`, so an existing
seeder is not overwritten.

## 2. Write the data

The closure receives the SQL facade and a `Seed` context. Use `$Database->table(...)` for
portable DML and `$Seed->fake(...)` for deterministic fake values from Bootgly's existing
ACI faker stack.

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
      ->set(new Identifier('name'), $Seed->fake('Name', seed: 1))
);
```

`fake()` knows five kinds — `Email`, `Integer`, `Name`, `Text` and `UUID` — and the same kind
and `seed` always give the same value, so a rerun writes the same data. Names and addresses
repeat early (seed 8 gives the same as seed 5), so do not fill a `UNIQUE` column with them.
**[Fake values](/manual/ADI/Databases/SQL/Seed/overview/#fake-values)** lists what each kind
returns and its limits; **[Fakers](/testing/deep/fakers/overview/)** covers the faker classes
behind it.

A seeder may return one builder/query/string, an array of them, or `null`. Arrays run in
order. Any other value stops the run with
`Seeder must return null, string, Builder, Query, or an array of those.` Keep seeder files
return-only; avoid top-level `class` or `function` declarations because the same file may be
required more than once in one PHP process.

## 3. Run seeders

```bash
bootgly project <name> seed run        # run all seeders in filename order
bootgly project <name> seed run demo_users
bootgly project <name> seed run --dry-run
bootgly project <name> seed list       # also what `seed` alone does
```

`seed run` reports how many seeders ran — `Seeders run: 1` with the one seeder above.
`--dry-run` prints the SQL and the parameters each seeder would send instead — here
`seed run --dry-run demo_users` on PostgreSQL:

```
┌ Seeder Dry Run ────────────────────────────────────────────────────┐
│ Seeders      1                                                     │
│ Seeder       demo_users                                            │
│ SQL 1        INSERT INTO "users" ("email", "name") VALUES ($1, $2) │
│ Parameters   ["frank.davis@test.org","Frank Davis"]                │
└────────────────────────────────────────────────────────────────────┘

 ATTENTION  Dry run only; no seeder SQL was executed.
```

When the database dialect supports transactions — PostgreSQL and SQLite — the queries a seeder
**returns** run in a transaction of their own. MySQL runs them one at a time without one, so a
failure leaves the statements before it applied. The closure itself runs **before** that
transaction opens, so a seeder is free to read the database to decide what to write — and any
`$Database->query(...)` it issues directly is a statement of its own, outside that transaction
and not undone when a returned query fails. Seeders run in filename order, and the first one
that fails stops the run: the seeders before it stay applied.

A local seeders lock, `storage/locks/seeders/<name>.lock` (`/` in a nested project's name
becomes `~`), plus a dialect advisory lock on PostgreSQL and MySQL stops overlapping runs: a
second `seed run` fails at once with `Seeder lock is already active.` or
`Seeder advisory lock is already active.` instead of waiting, and a lock left by a process that
no longer exists is taken over. Use `--dry-run` before a rerun to compile the returned SQL and
parameters without sending the statements to the database. A dry run takes neither lock and
still needs the `database` scope. It skips execution of returned SQL only; seeders that call
`$Database->query(...)` directly inside the closure still touch the database.

## Rerunnable by design

Seeders are not recorded in a `_bootgly_seeders` table. Running the same seeder again runs
the file again. Use `seed run --dry-run` to inspect the statements first, and make a seeder
idempotent when needed by using `upsert`, guarded deletes, table cleanup before inserting demo
data, or a read first —
**[When the closure runs](/manual/ADI/Databases/SQL/Seed/overview/#when-the-closure-runs)**
shows a seeder that writes nothing when its rows are already there.

### Fixed ids on every engine

The usual rerunnable seeder writes fixed ids and upserts on them, so the second run updates
the rows instead of failing on them:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;
use Bootgly\ADI\Databases\SQL\Seed;
use Bootgly\ADI\Databases\SQL\Seed\Seeder;

return new Seeder(
   Run: fn (SQL $Database, Seed $Seed) => $Database
      ->table(new Identifier('roles'))
      ->insert()
      ->set(new Identifier('id'), 1, 2)
      ->set(new Identifier('name'), 'admin', 'editor')
      ->upsert(new Identifier('id'))
);
```

MySQL and SQLite move their auto-increment counters past explicit ids by themselves. A
PostgreSQL identity column does not: its sequence stays where it was, so the application's
first generated insert would reuse id 1. The runner closes that gap. On PostgreSQL, every
INSERT a seeder returns through the Query Builder is followed by a statement that moves the
column's sequence past the highest explicit key — only when the sequence is behind it, so a
sequence already ahead when the statement runs is left untouched. `seed run --dry-run` lists
that statement right after its INSERT.

Only INSERTs a seeder returns as builders, into a named table, are tracked — with keys given
as integers or canonical integer strings (`'7'`, not `'007'` or `7.0`). Raw SQL strings,
compiled `Query` objects, `Expression` tables or columns, and statements issued with
`$Database->query(...)` inside the closure are not; move the sequence yourself after those.

Seed while nothing else inserts into the seeded tables: the statement reads the sequence and
moves it in two steps, and a concurrent insert can slip in between. Keep sentinel rows at id 0
or below — a seeded key at the column type's maximum leaves no ids for generated rows.

> [!WARNING]
> On PostgreSQL the seeding role needs `USAGE` (or `SELECT`) and `UPDATE` on the identity
> sequences — the role that ran the migrations owns them. Without those privileges `seed run`
> fails with `permission denied for sequence …`, even when nothing needs to move, and the
> seeder's writes are rolled back.

## Reference

- **[Database migrations](/guide/database-migrations/overview/)** — create the tables first.
- **[Database queries](/guide/database-queries/overview/)** — Query Builder DML used inside seeders.
- **[Database ORM](/guide/database-orm/overview/)** — map seeded tables back to entities in application code.
- **[Seeders](/manual/ADI/Databases/SQL/Seed/overview/)** — `Seed`, `Seeder`, `Seeders` and `Runner`.
- **[Projects](/manual/Bootgly/essential/projects/overview/)** — every `seed` action, option and output.
- **[Fakers](/testing/deep/fakers/overview/)** — the faker classes behind `$Seed->fake()`.
