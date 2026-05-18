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

When the database dialect supports transactions, each seeder runs in its own transaction.
A local seeders lock plus a dialect advisory lock where supported stops overlapping runs.
Use `--dry-run` before a rerun to compile the returned SQL and parameters without sending
the statements to the database. Dry-run skips execution of returned SQL only; seeders that
call `$Database->query(...)` directly inside the closure still touch the database.

## Rerunnable by design

Seeders are not recorded in a `_bootgly_seeders` table. Running the same seeder again runs
the file again. Use `seed run --dry-run` to inspect the statements first, and make a seeder
idempotent when needed by using `upsert`, guarded deletes, or table cleanup before inserting
demo data.

## Reference

- **[Database migrations](/guide/database-migrations/overview/)** — create the tables first.
- **[Database queries](/guide/database-queries/overview/)** — Query Builder DML used inside seeders.
- **[Seeders](/manual/ADI/Databases/SQL/Seed/overview/)** — `Seed`, `Seeder`, `Seeders` and `Runner`.
