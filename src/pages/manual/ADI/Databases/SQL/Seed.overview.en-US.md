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

- Return one query-like value, an array of query-like values, or `null`.
- Query-like values may be a `Builder`, compiled `Query`, or SQL string.
- Use `$Seed->fake($kind, seed: ...)` for deterministic fake data; it reuses
  `Bootgly\ACI\Fakers`.
- Keep seeder files return-only. Do not declare top-level `class` or `function` symbols in
  them, because a runner may require the same file more than once in one PHP process.
- Write idempotency into the seeder with `upsert`, guarded deletes or cleanup. Seeders have
  no history table.
- `Runner::preview()` and `seed run --dry-run` skip execution of returned SQL only; seeders
  that call `$Database->query(...)` directly inside the closure still touch the database.

## Reference

### Programmatic API

```php
use Bootgly\ADI\Databases\SQL\Seed\Runner;

$Runner = new Runner($Database, '/path/database/seeders', '/path/locks/app.lock');

$Runner->create('Demo Users'); // write a stub
$Runner->discover();           // ['demo_users' => '/path/demo_users.php']
$Runner->preview();            // compile SQL without executing it
$Runner->run();                // run all seeders
$Runner->run('demo_users');    // run one seeder
```

Supporting classes:

- `Seed` — seeding context with `fake($kind, $seed)`.
- `Seeder` — returned by seeder files; owns the `Run` closure and resolved name.
- `Seeders` — discovers, loads and creates seeder files.
- `Runner` — previews, locks, loads and executes seeders; transactional per seeder when
  supported.

### Errors

- Creating a duplicate slug -> `InvalidArgumentException`.
- A seeder file not returning a `Seeder` -> `InvalidArgumentException`.
- Running a missing named seeder -> `RuntimeException`.
- Lock already held -> `RuntimeException` ("Seeder lock is already active.").

### Related ORM docs

- **[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)** - entity metadata for seeded tables.
- **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)** - hydrate seeded data into entities.
