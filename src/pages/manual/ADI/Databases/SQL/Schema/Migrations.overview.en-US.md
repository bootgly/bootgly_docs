# Migrations

A migration is one file that says "make this change to the database" and "how to undo it".
You create migrations as your app grows; running them brings any database up to date.

> The end-to-end CLI walkthrough is in the
> **[Database migrations](/guide/database-migrations/overview/)** guide. This page explains
> the file you edit and how to read what happened.

## The flow

```bash
bootgly project <name> migrate create "Create Users Table"  # 1. make a file
# edit the file (next section)
bootgly project <name> migrate up                           # 2. apply pending
bootgly project <name> migrate status                       # 3. see state
bootgly project <name> migrate down                          # undo the last one
```

## The file you edit

`create` drops a timestamped stub in `<project>/database/migrations/`, e.g.
`20260515120000_create_users_table.php`. It returns a `Migration` with two closures:

```php
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Defaults;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\Keys;
use Bootgly\ADI\Databases\SQL\Schema\Auxiliaries\References;
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

Rules of thumb:

- **`Down` undoes `Up`.** Created a table in `Up`? Drop it in `Down`. This is what makes
  `migrate down` work.
- Need several statements? Return an **array** — they run in order.
- The filename (without `.php`) is the migration's name and its order. Don't rename applied
  files.

## Reading `migrate status`

```
Applied      4      ← already in the database
Local only   2      ← files you have, not applied yet  (run: migrate up)
DB only      0      ← recorded as applied but the file is gone
Next         20260515120000_create_users_table
```

- **Local only** = pending. `migrate up` applies them.
- **DB only** = the database remembers a migration whose file was deleted. `migrate sync`
  cleans the record (it does not run anything).

## Undoing

```bash
bootgly project <name> migrate down      # revert the last applied migration
bootgly project <name> migrate down 3    # revert the last 3
```

Each `migrate up` run tags its migrations with one **batch** number, so a botched deploy
can be rolled back as a unit. If the database supports transactions, each migration applies
all-or-nothing.

## Reference

### Programmatic API

The CLI wraps `Bootgly\ADI\Databases\SQL\Schema\Runner`. You rarely instantiate it directly:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\ADI\Databases\SQL\Schema\Runner;

$Runner = new Runner($Database, '/path/database/migrations', '/path/locks/app.lock');

$Runner->report();      // status data (see shape below)
$Runner->up();          // apply pending; optional int $limit
$Runner->down(1);       // revert N applied; optional batch filter
$Runner->sync();        // reconcile history with files, runs no up()/down()
$Runner->create($name); // write a stub (delegates to Migrations::create())
```

Supporting classes: `Migration` (the returned object: `Up`/`Down` closures, `Migrating`
type), `Migrations` (`discover`/`load`/`create`/`resolve` files), `Repository` (the history
table, default name from `SQLConfig->migrations`, bootstrapped automatically), `Lock` (local
file lock; plus a dialect advisory lock where supported; a stale lock whose owner PID is
dead is reclaimed).

### `report()` shape

```php
[
   'applied' => [ ['migration'=>'…','batch'=>1,'created_at'=>'…'], … ],
   'pending' => ['20260515120000_create_users_table', …], // local, not applied
   'missing' => ['…'],                                     // in DB, file deleted
   'files'   => ['name' => '/abs/path.php', …],
]
```

### Errors

- `down(0)` or a negative step count → `InvalidArgumentException`.
- A migration file not returning a `Migration` → `InvalidArgumentException`.
- `down` hitting a history row whose file is gone → `RuntimeException`.
- Lock already held → `RuntimeException` ("Migration lock is already active.").
