# Data in Bootgly

To make an app run, you need somewhere to store data and a way to shape it. Bootgly gives
you a SQL database plus **migration** and **seeding** workflows — that is all you touch day
to day.

## What you actually need to know

1. **Connect** — your project already has a SQL database (PostgreSQL by default). You open
   it with one line:

   ```php
   use Bootgly\ADI\Databases\SQL;

   $Database = new SQL;
   ```

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
- **[Database queries](/guide/database-queries/overview/)** — the next day-to-day flow:
  build a query, run it, inspect `Operation->rows`.
- **[Database seeders](/guide/database-seeders/overview/)** — fill tables with
  rerunnable project data using Query Builder and deterministic fakers.
- **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — the DML builder for
  `SELECT`, `INSERT`, `UPDATE` and `DELETE`.
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
one-way chain `ABI → ACI → ADI → API → CLI → WPI`. The single entrypoint is the `SQL`
facade; it exposes two builders:

- `$Database->table(...)` — Query Builder (DML: `SELECT`/`INSERT`/`UPDATE`/`DELETE`).
- `$Database->query(...)` — execution entrypoint for raw SQL, a builder or a compiled
  `Query`.
- `$Database->structure()` — Schema Builder (DDL + migrations), a cached `Schema` instance
  bound to the database dialect (same instance on every call).
