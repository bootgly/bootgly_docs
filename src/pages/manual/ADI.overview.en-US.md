# Data in Bootgly

To make an app run, you need somewhere to store data and a way to shape it. Bootgly gives
you a SQL database plus **migration** and **seeding** workflows — that is all you touch day
to day.

## What you actually need to know

1. **Connect** — a project keeps its database settings in the `database` config scope
   (`configs/database/database.Config.php`, PostgreSQL by default; the
   **[Database DBAL](/guide/database-dbal/overview/)** guide shows how to write it). In an
   `HTTP_Server_CLI` route, use the per-worker `$Response->Database` resource
   (**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**).
   In the project's boot function, a command or a script that runs inside the project, open
   it with:

   ```php
   use Bootgly\ADI\Databases\SQL;
   use Bootgly\API\Environment\Configs\DatabaseConfig;

   $Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
   ```

   This line needs that scope: without a `configs/` directory, `BOOTGLY_PROJECT->Configs` is
   `null`. Outside a project, pass the connection as an array:
   `new SQL(['driver' => 'pgsql', 'host' => '127.0.0.1', 'port' => 5432, 'database' => 'app', 'username' => 'app', 'password' => 'secret'])`.
   A bare `new SQL` reads no config at all: it uses the built-in local defaults (PostgreSQL
   at `127.0.0.1:5432`, database `bootgly`, user `postgres`, empty password), which also
   fill every key an array leaves out, whatever its `driver`.

2. **Shape it with migrations** — you never write raw `CREATE TABLE` by hand. You create a
   migration, describe the table, and apply it:

   ```bash
   bootgly project <name> migrate create "Create Users Table"
   bootgly project <name> migrate up
   ```

3. **Seed data** — after the tables exist, fill demo or lookup rows with rerunnable
   seeders:

   ```bash
   bootgly project <name> seed create "Demo Users"
   bootgly project <name> seed run
   ```

4. **Query it** — read and write rows with the **[Database queries](/guide/database-queries/overview/)**
   guide and the **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)**:
   `$Database->table(...)` builds, `$Database->query(...)` runs.

That is the whole loop: **connect → migrate → seed → query**.

## Start here

- **[Database migrations](/guide/database-migrations/overview/)** — the full step-by-step
  flow (create a migration, apply it, see what happened). **Read this first.**
- **[Database DBAL](/guide/database-dbal/overview/)** — use the async DBAL from
  `HTTP_Server_CLI` routes without exposing low-level readiness loops.
- **[Database queries](/guide/database-queries/overview/)** — the next day-to-day flow:
  build a query, run it, inspect `Operation->rows`.
- **[Database transactions](/guide/database-transactions/overview/)** — commit or roll
  back several SQL statements on one pooled connection.
- **[Database seeders](/guide/database-seeders/overview/)** — fill tables with
  rerunnable project data using Query Builder and deterministic fakers.
- **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — the DML builder for
  `SELECT`, `INSERT`, `UPDATE` and `DELETE`.
- **[DBAL core](/manual/ADI/Database/overview/)** — low-level config, connection, pool,
  operation, result and driver lifecycle.
- **[Transactions](/manual/ADI/Databases/SQL/Transaction/overview/)** — `begin`,
  `commit`, `rollback` and nested savepoints.
- **[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/)** — the table operations
  you call inside a migration (`create`, `alter`, `drop`, …).
- **[Defining tables](/manual/ADI/Databases/SQL/Schema/Blueprint/overview/)** — how to
  describe columns: ids, text, booleans, dates, foreign keys.
- **[Migrations](/manual/ADI/Databases/SQL/Schema/Migrations/overview/)** — the migration
  file, `up`/`down`, and reading migration status.
- **[Seeders](/manual/ADI/Databases/SQL/Seed/overview/)** — the seeder file, `Seed`
  context, and `Runner`.
- **[Dialects](/manual/ADI/Databases/SQL/Schema/Dialects/overview/)** — what changes if you
  use MySQL or SQLite instead of PostgreSQL.

## Reference

ADI (Abstract Data Interface) is the data layer of Bootgly's I2P architecture, in the
one-way chain `ABI → ACI → ADI → API → CLI → WPI`. It ships two database facades: `SQL`
(`Bootgly\ADI\Databases\SQL`) for relational databases and `KV`
(`Bootgly\ADI\Databases\KV`) for key-value commands on Redis, which routes use through
`$Response->KV`
(**[Async Redis on the event loop](/guide/cache/overview/#async-redis-on-the-event-loop)**,
**[Register the KV resource](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#register-the-kv-resource)**).
The `SQL` facade exposes query execution, transactions and two builders:

- `$Database->table(...)` — Query Builder (DML: `SELECT`/`INSERT`/`UPDATE`/`DELETE`).
- `$Database->query(...)` — execution entrypoint for raw SQL, a builder or a compiled
  `Query`.
- `$Database->begin()` — a transaction pinned to one pooled connection.
- `$Database->structure()` — Schema Builder (DDL + migrations), a cached `Schema` instance
  bound to the database dialect (same instance on every call).

In HTTP routes, WPI adds
**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)** so
the route can await DBAL operations through `$Response->Database` while still sending HTTP
through the normal `Response` API.
