# Data in Bootgly

ADI — the **Abstract Data Interface** — is the layer of Bootgly that stores your data and checks
it. It holds the SQL and key-value (Redis) databases, with the Query and Schema Builders,
migrations, seeders and the ORM on top of SQL; the Table dataset, which keeps rows in memory and
totals their columns; and the Validation engine with its built-in rules. The layers above it —
your API code, console commands and HTTP routes — reach data through these same classes.

## Start here

- **Open a database and run a query** — set up the project's `database` scope and open it in a
  script, a command or a route with **[Database DBAL](/guide/database-dbal/overview/)**, then build,
  run and read a query with **[Database queries](/guide/database-queries/overview/)**.
- **Keep several writes together** — commit or roll back statements on one pooled connection:
  **[Database transactions](/guide/database-transactions/overview/)**.
- **Send reads to replicas** — route safe reads to replica pools while writes, transactions and
  builder `lock()` queries stay on the primary:
  **[Database read replicas](/guide/database-read-replicas/overview/)**.
- **Work with entities instead of rows** — map rows to plain PHP classes through repositories:
  **[Database ORM](/guide/database-orm/overview/)**.
- **Create and change tables** — version the schema with
  **[Database migrations](/guide/database-migrations/overview/)**, and fill it with demo or lookup
  rows with **[Database seeders](/guide/database-seeders/overview/)**.
- **Send Redis commands** — open Redis and run its commands over a pool of its own, the same kind
  of non-blocking pool the SQL drivers use: **[KV database](/manual/ADI/Databases/KV/overview/)**.
- **Validate a request** — run rules on a request before the handler with the `Validator`
  middleware: **[Request Validation](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/#request-validation)**.
  To check any other array — a command's input, a job payload — follow the
  **[Validation](/guide/validation/overview/)** guide.
- **Total the rows of a terminal table** — keep the header, body and footer rows the CLI Table
  draws, and sum a column for the footer: **[Table dataset](/manual/ADI/Table/overview/)**.

## Connect, migrate, seed, query

That is the whole loop: **connect → migrate → seed → query**.

### 1. Connect

A project keeps its database settings in the `database` config scope
(`configs/database/database.Config.php`, PostgreSQL by default; the
**[Database DBAL](/guide/database-dbal/overview/)** guide shows how to write it). In an
`HTTP_Server_CLI` route, use the per-worker `$Response->Database` resource
(**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**).
In the project's boot function, a command or a script that runs inside the project, open it
with:

```php
use Bootgly\ADI\Databases\SQL;
use Bootgly\API\Environment\Configs\DatabaseConfig;

$Database = new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure());
```

This line needs that scope: without a `configs/` directory, `BOOTGLY_PROJECT->Configs` is
`null` (see **[From the project config](/manual/ADI/Database/Config/overview/#from-the-project-config)**).
Outside a project, pass the connection as an array:
`new SQL(['driver' => 'pgsql', 'host' => '127.0.0.1', 'port' => 5432, 'database' => 'app', 'username' => 'app', 'password' => 'secret'])`.
A bare `new SQL` reads no config at all: it uses the built-in local defaults (PostgreSQL at
`127.0.0.1:5432`, database `bootgly`, user `postgres`, empty password), which also fill every
key an array leaves out, whatever its `driver`.

### 2. Shape it with migrations

Describe each table with the Schema Builder instead of writing `CREATE TABLE` by hand. Create a
migration, describe the table in it, and apply it:

```bash
bootgly project <name> migrate create "Create Users Table"
bootgly project <name> migrate up
```

### 3. Seed data

After the tables exist, fill demo or lookup rows with rerunnable seeders:

```bash
bootgly project <name> seed create "Demo Users"
bootgly project <name> seed run
```

### 4. Query it

Read and write rows with the **[Database queries](/guide/database-queries/overview/)** guide and
the **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)**: `$Database->table(...)`
builds a statement, `$Database->query(...)` turns it into an operation, and
`$Database->await(...)` drives the operation to its `Result`.

## Components

[Start here](#start-here) points to the common flows; the pages below hold the details of every
component.

### Casters

- **[Casters](/manual/ADI/Casters/overview/)** — convert one value to `int`, `float`, `bool`,
  `string` or `DateTimeImmutable`, strictly (input a person wrote) or loosely (values a driver
  produced), and refuse what the mode cannot convert without echoing it.

### Database

The transport-agnostic core both database facades extend.

- **[DBAL core](/manual/ADI/Database/overview/)** — its layers, how an operation runs and fails,
  the `Operation` states and the `Result` fields.
- **[Database configuration](/manual/ADI/Database/Config/overview/)** — the connection keys every
  facade reads and their defaults, the driver names, the operation `timeout`, the pool size and TLS
  (`secure`).
- **[Connection pool](/manual/ADI/Database/Pool/overview/)** — how operations share connections:
  sizing, synchronous waits, deadlines, cancellation, withdrawn work and session reset, and replica
  health.

### Databases

- **[Databases](/manual/ADI/Databases/overview/)** — `SQL` or `KV`: which facade to pick, how to
  open it where your code runs, and the registry that creates one by name.
- **[SQL database](/manual/ADI/Databases/SQL/overview/)** — the `SQL` facade: open a database, its
  SQL config keys, run and await queries, read the outcome, read-after-write routing, events and
  errors.
  - **[Drivers](/manual/ADI/Databases/SQL/Drivers/overview/)** — the native wire drivers side by
    side: selection, capabilities, result differences, error codes, limits and pool notes.
    - **[PostgreSQL](/manual/ADI/Databases/SQL/Drivers/PostgreSQL/overview/)** — the default
      driver: Protocol 3.0 with SCRAM authentication, TLS, the extended protocol, prepared
      statements, pipelining and cancellation.
    - **[MySQL](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/)** — MySQL and MariaDB:
      `caching_sha2_password` authentication, TLS, binary prepared statements, the command queue
      and `KILL QUERY`.
    - **[SQLite](/manual/ADI/Databases/SQL/Drivers/SQLite/overview/)** — file and `:memory:`
      databases over `ext-sqlite3`, with no setup, for tests and prototypes.
    - **[Type mapping](/manual/ADI/Databases/SQL/Drivers/Types/overview/)** — how each driver
      binds PHP parameters and returns column values, and what to normalize for portable code.
  - **[Transactions](/manual/ADI/Databases/SQL/Transaction/overview/)** — statements pinned to one
    pooled connection: commit, rollback and abort, savepoints, refusals and lifecycle events.
  - **[Query Builder](/manual/ADI/Databases/SQL/Builder/overview/)** — parameterized `SELECT`,
    `INSERT`, `UPDATE` and `DELETE` from typed names: where a builder comes from, how it compiles
    and runs, its modes and its errors.
    - **[Reading rows](/manual/ADI/Databases/SQL/Builder/Reading/overview/)** — select, filters,
      text matching, joins, aliases, grouping, aggregates, limits and row locks.
    - **[Writing rows](/manual/ADI/Databases/SQL/Builder/Writing/overview/)** — insert one or many
      rows, update and delete guards, `RETURNING` output and upserts.
    - **[Composing queries](/manual/ADI/Databases/SQL/Builder/Composing/overview/)** — dynamic
      identifiers, trusted expressions, nested filters, subqueries, derived tables and CTEs.
    - **[Query dialects](/manual/ADI/Databases/SQL/Builder/Dialects/overview/)** — what the same
      builder compiles to on PostgreSQL, MySQL and SQLite: quoting, placeholders and capabilities.
  - **[Schema Builder](/manual/ADI/Databases/SQL/Schema/overview/)** — portable `CREATE`, `ALTER`,
    `DROP`, index and constraint DDL, compiled for your engine, usually inside a migration.
    - **[Defining tables](/manual/ADI/Databases/SQL/Schema/Blueprint/overview/)** — columns,
      defaults, keys, checks, foreign keys and indexes with a `Blueprint`, and changing them later.
    - **[Migrations](/manual/ADI/Databases/SQL/Schema/Migrations/overview/)** — the migration file,
      `Up` and `Down`, the status, batches, the history table, locking and migrations at boot.
    - **[Dialects](/manual/ADI/Databases/SQL/Schema/Dialects/overview/)** — what PostgreSQL, MySQL
      and SQLite can and cannot do when a schema compiles.
  - **[Seeders](/manual/ADI/Databases/SQL/Seed/overview/)** — rerunnable data scripts: the seeder
    file, fake values, running them from the CLI or from code, and locks.
  - **[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)** — what makes a class an entity, how
    its mapping is compiled and cached, the mapping errors, and how its properties are typed and
    built.
    - **[ORM Model Attributes](/manual/ADI/Databases/SQL/Model/Attributes/overview/)** — `Table`,
      `Key`, `Column` and `Relation`: generated and assigned keys, column flags and relation kinds.
  - **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)** — find, fetch, save and
    delete entities as operations you await, then hydrate the result.
    - **[ORM Repository Pagination](/manual/ADI/Databases/SQL/Repository/Pagination/overview/)** —
      pages with a `COUNT(*)` total or keyset cursors, in HTTP routes and at the ADI layer.
    - **[ORM Repository Relations](/manual/ADI/Databases/SQL/Repository/Relations/overview/)** —
      has-one, has-many, belongs-to and many-to-many relations, loaded as operations you await,
      during hydration or lazily on first access.
    - **[ORM Repository Selection](/manual/ADI/Databases/SQL/Repository/Selection/overview/)** —
      which rows a repository reads: filters, `OR`, text matching, order, slices, row locks,
      relations and named scopes.
    - **[ORM Repository Hydration](/manual/ADI/Databases/SQL/Repository/Hydration/overview/)** —
      how finished operations become typed entities, the identity map, and the keys written back
      into saved entities.
    - **[ORM Repository Hooks](/manual/ADI/Databases/SQL/Repository/Hooks/overview/)** — the eight
      lifecycle hooks of a repository, and how listeners steer or refuse its work.
- **[KV database](/manual/ADI/Databases/KV/overview/)** — the `KV` facade: run Redis commands and
  read their replies, pipeline them, timeouts, cancel and withdraw, errors and limits.
  - **[Redis](/manual/ADI/Databases/KV/Drivers/Redis/overview/)** — the native driver: non-blocking
    dial, `AUTH`/`SELECT`, TLS, RESP3 push frames, pipelining and cancellation.

### Table

- **[Table dataset](/manual/ADI/Table/overview/)** — header, body and footer rows kept in memory,
  with `sum()`, `subtract()`, `multiply()`, `divide()` and `find()` over a body column: the data the
  CLI **[Table](/manual/CLI/UI/Components/Table/overview/)** draws, not a database table.

### Validation

- **[Validation](/manual/ADI/Validation/overview/)** — the engine: run rules against an array, read
  `valid` and `errors`, blank values and implicit rules, messages and their translation, and custom
  rules.
- **[Validators](/manual/ADI/Validators/overview/)** — the 14 built-in rules: what each one accepts
  and rejects, its arguments, its default message and its caveats.

## Reference

ADI (Abstract Data Interface) is the data layer of Bootgly's I2P architecture, in the one-way chain
`ABI → ACI → ADI → API → CLI → WPI`: it builds only on ABI and ACI, and the API, CLI and WPI build
on it. Its six root components, in dependency (alphabetical) order:

- `Bootgly\ADI\Casters` — the scalar casting vocabulary (an enum of target types) and its
  `Casters\Modes` (`Strict`, `Loose`).
- `Bootgly\ADI\Database` — the abstract DBAL core: the connection config, the connection, the
  pools, the operations and their results, and the driver contract and registry.
- `Bootgly\ADI\Databases` — the paradigm registry, which creates a facade by name (only `sql` is
  registered), and the two facades that extend the core: `Databases\SQL` for PostgreSQL,
  MySQL/MariaDB and SQLite, and `Databases\KV` for Redis.
- `Bootgly\ADI\Table` — the in-memory dataset, with its `Header`, `Body` and `Footer` sections.
- `Bootgly\ADI\Validation` — the validation engine; `Validation\Condition` is the abstract base of
  every rule.
- `Bootgly\ADI\Validators` — the base an application extends to write its own rule; the 14
  built-in rules live in `Bootgly\ADI\Validators\*`.

Both facades drive an operation with `await()`, `advance()`, `cancel()` and `withdraw()`. `KV` sends
Redis commands with `command()`; `SQL` opens the rest of the SQL stack:

- `$Database->query(...)` — execution entrypoint for raw SQL, a builder or a compiled `Query`.
- `$Database->table(...)` — Query Builder (DML: `SELECT`/`INSERT`/`UPDATE`/`DELETE`).
- `$Database->begin()` — a transaction pinned to one pooled connection.
- `$Database->transact(...)` — a closure run inside a transaction: committed when it returns,
  rolled back when it throws.
- `$Database->structure()` — Schema Builder (DDL + migrations), a cached `Schema` instance bound
  to the database dialect (same instance on every call).
- `$Database->map(...)` — an ORM repository for one entity class.

In HTTP routes, WPI adds
**[Response Resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/)**: once the
project registers the `Database` and `KV` resources
(**[Register project resources](/manual/WPI/HTTP/HTTP_Server_CLI/Response/Resources/overview/#register-project-resources)**),
the route awaits SQL and KV operations through `$Response->Database` and `$Response->KV` while
still sending HTTP through the normal `Response` API. WPI also adds the
**[Validator](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/overview/#validator)** middleware, which
runs a `Validation` on the request before the handler. In the console, the CLI
**[Table](/manual/CLI/UI/Components/Table/overview/)** component draws a `Table` dataset.
