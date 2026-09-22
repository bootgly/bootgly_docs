# Database seeders

Seeders fill tables with project data: demo users, local defaults, lookup rows or test-like
records that make a fresh database usable. They run after migrations and use the same SQL
database config as the project.

## 1. Create a seeder

```bash
bootgly project <name> seed create "Demo Users"
```

This writes `database/seeders/demo_users.php`:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Seed;
use Bootgly\ADI\Databases\SQL\Seed\Seeder;

return new Seeder(
   Run: function (SQL $Database, Seed $Seed) {
      return null;
   }
);
```

Seeder names are stable slugs, not timestamps. Creating the same slug twice is rejected so
an existing seeder is not overwritten.

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

A seeder may return one builder/query/string, an array of them, or `null`. Arrays run in
order. Keep seeder files return-only; avoid top-level `class` or `function` declarations
because the same file may be required more than once in one PHP process.

## 3. Run seeders

```bash
bootgly project <name> seed run        # run all seeders in filename order
bootgly project <name> seed run demo_users
bootgly project <name> seed run --dry-run
bootgly project <name> seed list
```

When the database dialect supports transactions, the queries a seeder **returns** run in a
transaction of their own. The closure itself runs **before** that transaction opens, so a
seeder is free to read the database to decide what to write — and any `$Database->query(...)`
it issues directly is a statement of its own, outside that transaction and not undone when a
returned query fails.
A local seeders lock plus a dialect advisory lock where supported stops overlapping runs.
Use `--dry-run` before a rerun to compile the returned SQL and parameters without sending
the statements to the database. Dry-run skips execution of returned SQL only; seeders that
call `$Database->query(...)` directly inside the closure still touch the database.

## Rerunnable by design

Seeders are not recorded in a `_bootgly_seeders` table. Running the same seeder again runs
the file again. Use `seed run --dry-run` to inspect the statements first, and make a seeder
idempotent when needed by using `upsert`, guarded deletes, or table cleanup before inserting
demo data.

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
