# Type mapping between PHP and SQL

`query()` sends PHP values as the parameters of a statement and hands back rows of PHP values, and
each SQL driver maps both directions its own way: PostgreSQL by the type OID of each parameter and
column, MySQL by the protocol type of each parameter and column, SQLite by the storage class each
value is kept in. The same row, written and read the same way, therefore comes back with `true` or
`1`, with `'19.90'` or `19.9`, with a `DateTimeImmutable` or a string. This page sets the mappings
side by side and shows how to write code that runs on all three. Running a query and reading its
`Result` are on **[SQL database](/manual/ADI/Databases/SQL/overview/)**, and the connection keys on
**[Database configuration](/manual/ADI/Database/Config/overview/)**.

## Write and read one row

The same row — an integer, a boolean, a float, a decimal, a date, a timestamp and a `NULL` —
written and read back on each driver. Each example opens its database from an array; in a project
or an `HTTP_Server_CLI` route, open it as
**[Open a database](/manual/ADI/Databases/SQL/overview/#open-a-database)** shows.

### PostgreSQL

```php
use DateTimeImmutable;

use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'pgsql',
   'host' => '127.0.0.1',
   'port' => 5432,
   'database' => 'app',
   'username' => 'app',
   'password' => 'secret',
]);

$Database->await($Database->query('CREATE TABLE events (
   id integer PRIMARY KEY,
   active boolean NOT NULL,
   ratio double precision NOT NULL,
   price numeric(10,2) NOT NULL,
   held_on date NOT NULL,
   starts_at timestamp(6) NOT NULL,
   note text
)'));

$Start = new DateTimeImmutable('2026-11-05 09:30:00.123456');

$Database->await($Database->query(
   'INSERT INTO events (id, active, ratio, price, held_on, starts_at, note) VALUES ($1, $2, $3, $4, $5, $6, $7)',
   [1, true, 0.25, '19.90', $Start->format('Y-m-d'), $Start->format('Y-m-d H:i:s.uP'), null]
));

$Row = $Database->await($Database->query('SELECT * FROM events WHERE id = $1', [1]))->Result->row;

$Row['id'];        // 1
$Row['active'];    // true
$Row['ratio'];     // 0.25
$Row['price'];     // '19.90'
$Row['held_on'];   // DateTimeImmutable 2026-11-05 00:00:00
$Row['starts_at']; // DateTimeImmutable 2026-11-05 09:30:00.123456
$Row['note'];      // null
```

Every value comes back as its PHP counterpart except `numeric`, which stays a string so that none
of its digits is lost; the decimal goes in as a string for the same reason. The dates go in
formatted, since the PostgreSQL driver refuses a `DateTimeInterface` for now — see
[Dates on PostgreSQL](#dates-on-postgresql).

### MySQL

```php
use DateTimeImmutable;

use Bootgly\ADI\Databases\SQL;

$Database = new SQL([
   'driver' => 'mysql',
   'host' => '127.0.0.1',
   'port' => 3306,
   'database' => 'app',
   'username' => 'root',
   'password' => 'secret',
]);

$Database->await($Database->query('CREATE TABLE events (
   id INT PRIMARY KEY,
   active BOOLEAN NOT NULL,
   ratio DOUBLE NOT NULL,
   price DECIMAL(10,2) NOT NULL,
   held_on DATE NOT NULL,
   starts_at DATETIME(6) NOT NULL,
   note TEXT
)'));

$Start = new DateTimeImmutable('2026-11-05 09:30:00.123456');

$Database->await($Database->query(
   'INSERT INTO events (id, active, ratio, price, held_on, starts_at, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
   [1, true, 0.25, '19.90', $Start->format('Y-m-d'), $Start, null]
));

$Row = $Database->await($Database->query('SELECT * FROM events WHERE id = ?', [1]))->Result->row;

$Row['id'];        // 1
$Row['active'];    // 1
$Row['ratio'];     // 0.25
$Row['price'];     // '19.90'
$Row['held_on'];   // DateTimeImmutable 2026-11-05 00:00:00
$Row['starts_at']; // DateTimeImmutable 2026-11-05 09:30:00.123456
$Row['note'];      // null
```

MySQL has no boolean type — `BOOLEAN` is a `TINYINT(1)` — so `active` comes back as `1`.
`DECIMAL` stays a string, and the driver formats the `DateTimeInterface` itself.

### SQLite

```php
use DateTimeImmutable;

use Bootgly\ADI\Databases\SQL;

$Database = new SQL(['driver' => 'sqlite', 'database' => ':memory:']);

$Database->await($Database->query('CREATE TABLE events (
   id INTEGER PRIMARY KEY,
   active BOOLEAN NOT NULL,
   ratio REAL NOT NULL,
   price DECIMAL(10,2) NOT NULL,
   held_on DATE NOT NULL,
   starts_at DATETIME NOT NULL,
   note TEXT
)'));

$Start = new DateTimeImmutable('2026-11-05 09:30:00.123456');

$Database->await($Database->query(
   'INSERT INTO events (id, active, ratio, price, held_on, starts_at, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
   [1, true, 0.25, '19.90', $Start->format('Y-m-d'), $Start, null]
));

$Row = $Database->await($Database->query('SELECT * FROM events WHERE id = ?1', [1]))->Result->row;

$Row['id'];        // 1
$Row['active'];    // 1
$Row['ratio'];     // 0.25
$Row['price'];     // 19.9
$Row['held_on'];   // '2026-11-05'
$Row['starts_at']; // '2026-11-05 09:30:00.123456'
$Row['note'];      // null
```

SQLite returns each value as it is stored: the boolean as the integer `1`, the dates as the text
that was written, and the decimal as the float `19.9`, since a column declared `DECIMAL` stores
numbers, not text.

### Dates on PostgreSQL

PostgreSQL returns `date`, `time` and `timestamp` columns as `DateTimeImmutable`, but its driver
refuses a `DateTimeInterface` parameter for now: the operation fails with
`PostgreSQL parameter must be scalar or null.` before anything is sent — also when the SQL casts
the placeholder (`$1::timestamptz`), and when the value comes from a Query Builder `filter()`.
Format the value first. `Y-m-d H:i:s.uP` suits every date and time type, and each one keeps what it
needs of `'2026-11-05 09:30:00.123456-03:00'`:

| Column | Stores |
|---|---|
| `date` | `2026-11-05` |
| `time` | `09:30:00.123456` |
| `timetz` | `09:30:00.123456-03` |
| `timestamp` | `2026-11-05 09:30:00.123456`: the offset is dropped |
| `timestamptz` | The same instant: `2026-11-05 12:30:00.123456+00` on a server whose `TimeZone` is UTC |

A `timestamp` keeps the wall-clock time and drops the offset, so convert the value to the zone the
column stores — `setTimezone(new DateTimeZone('UTC'))` — before you format it. Filters take the
same strings. With the PostgreSQL table above:

```php
use DateTimeImmutable;

$Since = new DateTimeImmutable('2026-11-01 00:00:00');

$Recent = $Database->await($Database->query(
   'SELECT id FROM events WHERE starts_at >= $1',
   [$Since->format('Y-m-d H:i:s.uP')]
));

$Recent->Result->rows; // [['id' => 1]]
```

The ORM meets the same refusal: `save()` of an entity whose `DateTimeImmutable` property is
written fails on PostgreSQL with that message — also after `hydrate()` filled the property, since
an update writes every column the entity was hydrated with. Until the driver formats dates itself,
keep such a column out of the entity's writes (`insert: false, update: false`, as in
**[Column](/manual/ADI/Databases/SQL/Model/Attributes/overview/#column)**) and write it with a
query.

## Parameters

A driver picks how to send each value from its PHP type alone: none of them looks at the column
the value lands in. The server then converts the value to what the statement needs, or refuses it
with its own error. Values from a Query Builder are sent the same way.

| PHP value | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| `int` | `int4`, or `int8` past 32 bits | `LONGLONG`, signed | `INTEGER` |
| `bool` | `boolean` | `TINY`: `1` or `0` | `INTEGER`: `1` or `0` |
| `float` | `float8` | `DOUBLE` | `REAL` |
| `string` | No type: the server infers one from the SQL | `VAR_STRING` | `TEXT` |
| `null` | `NULL`, typed by a cast on its placeholder or by the SQL | `NULL` | `NULL` |
| `DateTimeInterface` | Refused | `VAR_STRING`: `Y-m-d H:i:s.u` | `TEXT`: `Y-m-d H:i:s.u` |
| `array`, enum, any other object | Refused | Refused | Refused |

A refused value fails the operation and is never sent. The operation's `code` is `null`, and
`await()` throws its `error` as a `RuntimeException`:

- PostgreSQL: `PostgreSQL parameter must be scalar or null.`
- MySQL: `MySQL cannot bind the parameter at position 0.` — the value's index in the array,
  counted from `0`
- SQLite: `SQLite cannot bind the parameter "0".` — the value's key in the array: its index, or the
  name of a named parameter

Pass an enum's `->value`, and format dates for PostgreSQL as shown above.

### PostgreSQL parameters

The driver declares a type — an OID — for each placeholder when it prepares the statement,
inferred from the PHP value:

- An `int` is `int4` when it fits 32 bits and `int8` otherwise; a `bool` is `boolean`, and a
  `float` is `float8`. The declared types are part of the prepared statement's identity, so the
  same SQL run with a small and with a large integer is prepared twice, and a value never goes
  through a statement prepared for a narrower type.
- A string is declared without a type, and the server infers one from the column the placeholder
  is written to or compared with, or from the operator around it: `'42'` fits an `integer` column,
  `'2026-11-05'` a `date` one. Where nothing in the SQL tells, as in `SELECT pg_typeof($1)`, the
  operation fails with `could not determine data type of parameter $1`.
- A `null` takes the type of a cast on its placeholder (`$1::int`). Without one, the server infers
  it as it does a string's, and fails the same way where it cannot — `SELECT $1 IS NULL`, say.
- A `float` is written as the shortest text that reads back as the same double, whatever PHP's
  `precision` and `serialize_precision` say: `0.1` goes as `0.1`, `1/3` as `0.3333333333333333`.
  `NAN`, `INF` and `-INF` go as `NaN`, `Infinity` and `-Infinity`, and the server stores them;
  reading them back is the problem (see [PostgreSQL results](#postgresql-results)).
- Only the order of the values counts: string keys are ignored, so `['b' => 'x', 'a' => 'y']`
  binds `'x'` to `$1`.

The first time a statement runs on a connection, every value travels as text. Once the server has
described the statement, `int4`, `boolean` and `float8` values travel in binary, while `int8`
values, strings and everything else stay text; the server reads the same value either way.

Declared types make PostgreSQL stricter than the other two drivers, which convert freely:

- A `bool` written to an integer column fails with
  `column "id" is of type integer but expression is of type boolean`, and an `int` written to a
  `boolean` column with `column "active" is of type boolean but expression is of type integer`.
  Bind a `bool` for a `boolean` column and an `int` for an integer one.
- An `int` compared with a text column fails with `operator does not exist: text = integer`: bind a
  string.
- A `float` written to a `numeric` column becomes a `float8` first, which the server rounds to 15
  significant digits: `0.1 + 0.2` is stored as `0.3`, while the string `'0.30000000000000004'` is
  stored exactly. Bind decimals as strings.

### MySQL parameters

Values go over the binary protocol of prepared statements, each tagged with the protocol type of
the table above, and the server converts each one to what the statement needs. The conversions are
loose: `true` fits an `INT` column, and `7` fits a `BOOLEAN` one, which reads back `7`. A string
that does not convert fails under the default strict `sql_mode`: `'abc'` written to an `INT`
column gives `1366: Incorrect integer value: 'abc' for column 'id' at row 1`.

- Only the order of the values counts, as on PostgreSQL.
- A `DateTimeInterface` is sent as `Y-m-d H:i:s.u` in its own time zone, with the offset dropped:
  `09:30 -03:00` is stored as `09:30`. Convert it to the zone you store first. The server rounds
  the microseconds to the column's precision, so `09:30:00.5` in a `DATETIME` with no fractional
  seconds is stored as `09:30:01`.
- A `BIGINT UNSIGNED` past `PHP_INT_MAX` cannot be a PHP `int`: bind it as a string, such as
  `'18446744073709551615'`.
- `NAN`, `INF` and `-INF` cannot be stored: writing one to a `DOUBLE` column fails with
  `1264: Out of range value for column 'ratio' at row 1`.
- A wrong number of values fails before the statement runs: `SELECT ? AS a, ? AS b` bound with
  `[1, 2, 3]` fails with `MySQL statement expects 2 parameters, 3 given.`, and bound with `[5]`
  with `MySQL statement expects 2 parameters, 1 given.` Pass exactly one value per placeholder.

The server derives each placeholder's type from the values bound to a prepared statement, and the
driver reuses one prepared statement for every `query()` with the same SQL on a connection. Where
the SQL leaves a placeholder's type open — `SELECT ?`, `JSON_OBJECT('name', ?)`, `IFNULL(?, 0)` —
a string bound after a number is converted to that number's type, for now: after `42`,
`SELECT JSON_OBJECT('name', ?)` with `'Ada'` returns `{"name": 0}`, and a write fails with
`1292: Truncated incorrect INTEGER value: 'Ada'`. Give such a placeholder its type in the SQL —
`CAST(? AS CHAR)` — or always bind it with the same PHP type.

### SQLite parameters

The driver binds each value with the `sqlite3` extension's types from the table above, and SQLite
stores it as bound unless the column's affinity converts it: a column declared `INTEGER`,
`BOOLEAN` or `DECIMAL` turns the text `'42'` into the integer `42`, a `TEXT` or `VARCHAR` column
turns the number `42` into the text `'42'`, and a value that does not convert keeps its class —
`'abc'` stays text in an `INTEGER` column.

- An integer key `k` binds the placeholder `?k+1`, so a list fills `?1`, `?2`… and plain `?`
  placeholders in order; a string key binds `:name`, with or without the colon (see
  **[Parameters](/manual/ADI/Databases/SQL/Drivers/SQLite/overview/#parameters)**).
- A `DateTimeInterface` is formatted `Y-m-d H:i:s.u` in its own time zone, with the offset
  dropped, as on MySQL.
- `NAN` is stored as `NULL`; `INF` and `-INF` are stored.
- A string is always bound as text, and text reads back only up to its first NUL byte, for now:
  `"ab\0cd"` is stored whole but reads back as `'ab'`, with no error. Write binary data through
  `CAST(?1 AS BLOB)`: a `BLOB` reads back whole.
- A placeholder that gets no value is bound as `NULL`, and the statement succeeds, for now:
  `INSERT INTO t (a, b) VALUES (:a, :b)` with `['a' => 'half']` stores `b` as `NULL`. PostgreSQL
  refuses the same mismatch with
  `bind message supplies 1 parameters, but prepared statement "bootgly_…" requires 2`, and MySQL
  with `MySQL statement expects 2 parameters, 1 given.` A value with no placeholder fails: a third value for
  two positional placeholders with `Unable to bind parameter number 3`, and a key with no matching
  name — `'c'` in that `INSERT` — with
  `SQLite cannot bind the parameter "c": the statement has no matching placeholder.`

## Results

PostgreSQL and MySQL convert each value from the type the server reports for its column; SQLite
returns each value in the class it is stored in. `NULL` is `null` on every driver.

| Column | PostgreSQL | MySQL | SQLite |
|---|---|---|---|
| Integer | `int` | `int`; a `BIGINT UNSIGNED` past `PHP_INT_MAX` is a decimal string | `int` |
| Boolean | `bool` | `int`: `BOOLEAN` is `TINYINT(1)` | `int` |
| Float | `float`; `NaN` and `Infinity` read as `0.0`, for now | `float`; a `FLOAT` reads differently with parameters | `float` |
| Decimal | `string` | `string` | `int` or `float`, rounded to a double |
| Date | `DateTimeImmutable` at midnight | `DateTimeImmutable` at midnight | `string` |
| Timestamp | `DateTimeImmutable` | `DateTimeImmutable` | `string` |
| Time of day | `DateTimeImmutable` on today's date | `string` | `string` |
| Text | `string`; `char(n)` keeps its padding | `string`; `CHAR(n)` drops trailing spaces | `string`, up to its first NUL byte |
| Binary | `string` of raw bytes | `string` of raw bytes | `string` of raw bytes |
| JSON | `string` | `string` | `string` |

### PostgreSQL results

Results always arrive as text, and the driver converts each value by its column's type OID:

| Type | OID | PHP |
|---|---|---|
| `boolean` | `16` | `bool` |
| `bytea` | `17` | `string` of the raw bytes, decoded from the server's hex |
| `smallint`, `integer`, `bigint` | `21`, `23`, `20` | `int` |
| `real`, `double precision` | `700`, `701` | `float` |
| `date`, `time`, `timestamp`, `timestamptz`, `timetz` | `1082`, `1083`, `1114`, `1184`, `1266` | `DateTimeImmutable` |
| Any other: `numeric`, `text`, `json`, `jsonb`, `uuid`, `interval`, `money`, `inet`, arrays… | — | `string`, as the server prints it: `'{1,2}'` for an `integer[]`, `'1 day 02:00:00'` for an `interval` |

- `date`, `time` and `timestamp` carry no offset, so the object takes PHP's default time zone
  (`date.timezone`). A `timestamptz` carries the offset of the session's `TimeZone` — `+00:00` on a
  UTC server — and a `timetz` its own.
- `time` and `timetz` land on today's date: `09:30:00.5` reads as today at `09:30:00.500000`.
- A date the object cannot hold stays a string: `infinity`, `-infinity` and BC dates such as
  `'0044-03-15 BC'`.
- `NaN`, `Infinity` and `-Infinity` in a `real` or `double precision` column read back as `0.0`
  for now, with no error. Where they can occur, select the column as text (`ratio::text AS ratio`)
  and convert it in PHP.
- An expression takes the type of its SQL: `count(*)` and `sum()` over an `integer` are `bigint`,
  so `int`; `sum()` over a `bigint`, `avg()` and a literal such as `1.5` are `numeric`, so strings —
  `avg()` of `5` is `'5.0000000000000000'`.
- `char(n)` keeps its padding: `'ab'` in a `char(4)` reads back as `'ab  '`.

### MySQL results

A query without parameters reads its rows over the text protocol, and one with parameters over the
binary protocol of prepared statements. The driver converts both by the column's protocol type, to
the same PHP types:

- `TINYINT`, `SMALLINT`, `MEDIUMINT`, `INT`, `BIGINT` and `YEAR` are `int` — `BOOLEAN`, a
  `TINYINT(1)`, included. A `BIGINT UNSIGNED` past `PHP_INT_MAX` is an exact decimal string (see
  **[Keys wider than a PHP int](/manual/ADI/Databases/SQL/Drivers/overview/#keys-wider-than-a-php-int)**).
- `FLOAT` and `DOUBLE` are `float`. A `FLOAT` holds single precision, which only the text protocol
  rounds back: `1.1` reads as `1.1` without parameters and as `1.100000023841858` with them. Use
  `DOUBLE` where you compare floats.
- `DECIMAL` is a string, and so is every expression of that type: `SUM()` over an `INT` column,
  `AVG()` and a literal such as `1.5`.
- `DATE`, `DATETIME` and `TIMESTAMP` are `DateTimeImmutable` in PHP's default time zone, built from
  the wall-clock time the server sends — for a `TIMESTAMP`, in the session's `time_zone`. Zero
  dates stay strings, which differ by protocol: a zero `DATE` reads as `'0000-00-00'` without
  parameters and as `'0000-00-00 00:00:00'` with them.
- `TIME` is a string, since it holds a duration that can pass 24 hours or be negative:
  `'-838:59:59'`. Its fraction depends on the protocol: without parameters it has the column's
  digits, and with them six digits, or none when it is zero — `09:30:00.5` in a `TIME(1)` column
  reads as `'09:30:00.5'` without parameters and as `'09:30:00.500000'` with them.
- `BIT`, `BLOB` and `VARBINARY` are strings of raw bytes — `b'101'` reads back as `"\x05"` — and
  `JSON`, `ENUM` and `SET` are strings.

### SQLite results

Rows come straight from `SQLite3Result::fetchArray()`: `INTEGER` values as `int`, `REAL` as
`float`, `TEXT` and `BLOB` as `string`, `NULL` as `null`. The declared type only sets the column's
affinity, which converted the value when it was written:

- `DECIMAL` and `NUMERIC` columns hold numbers: `'19.90'` reads back as `19.9`, `'12.00'` as the
  integer `12`, and a value past a double's precision is rounded — `'12345678901234567890.123'`
  reads back as `1.2345678901234567E+19`. Keep exact decimals in a `TEXT` column, or as integer
  minor units.
- `DATE`, `DATETIME` and `TIMESTAMP` columns hold what was written — text, in practice — and return
  it as a string. `CURRENT_TIMESTAMP` is a UTC string such as `'2026-11-05 12:30:00'`.
- `BOOLEAN` columns hold `1` and `0`.
- One column can mix classes: `'abc'` written to an `INTEGER` column reads back as `'abc'`.
- `SUM()` over integers is an `int`, `AVG()` a `float`, and a literal `1.5` a `float`.
- Text reads back only up to its first NUL byte (see [SQLite parameters](#sqlite-parameters)).

## Write portable code

Code that runs on all three drivers binds what the strictest one accepts and normalizes what comes
back in PHP. With `$Row` from any recipe in [Write and read one row](#write-and-read-one-row):

```php
use DateTimeImmutable;

$active = (bool) $Row['active'];
$price = is_string($Row['price']) ? $Row['price'] : number_format($Row['price'], 2, '.', '');
$HeldOn = $Row['held_on'] instanceof DateTimeImmutable ? $Row['held_on'] : new DateTimeImmutable($Row['held_on']);
$StartsAt = $Row['starts_at'] instanceof DateTimeImmutable ? $Row['starts_at'] : new DateTimeImmutable($Row['starts_at']);

$active;                            // true
$price;                             // '19.90'
$HeldOn->format('Y-m-d');           // '2026-11-05'
$StartsAt->format('Y-m-d H:i:s.u'); // '2026-11-05 09:30:00.123456'
```

- **Booleans** — bind a `bool` for a boolean column and an `int` for an integer one, since
  PostgreSQL refuses the swap, and read them with `(bool)`, since only PostgreSQL returns a `bool`.
- **Decimals** — bind them as strings. PostgreSQL and MySQL return strings and SQLite a number, so
  where SQLite is a target keep exact amounts as integer minor units (cents) or in a `TEXT` column,
  and compare decimals as strings (`bccomp()`), never as floats.
- **Dates and timestamps** — keep them in UTC end to end: PHP's `date.timezone`, the server's time
  zone and the values you bind. Bind a date as `format('Y-m-d')` and a timestamp as
  `format('Y-m-d H:i:s.u')`, which all three drivers accept, and read them back through
  `DateTimeImmutable`, as above.
- **Times of day** — PostgreSQL returns a `DateTimeImmutable` dated today, MySQL and SQLite a
  string whose fraction varies — on MySQL, with the protocol (see [MySQL results](#mysql-results)).
  Compare them as `H:i:s` strings: the first 8 characters of a string, and `format('H:i:s')` of the
  PostgreSQL object.
- **Large integers** — a MySQL `BIGINT UNSIGNED` past `PHP_INT_MAX` is a string, so type such
  values `int|string`.
- **JSON** — every driver returns the document as a string: bind `json_encode()` output, and
  `json_decode()` what you read.
- **Floats** — on MySQL, use `DOUBLE` rather than `FLOAT`, whose value depends on the protocol,
  and keep `NAN` and `INF` out of the database: MySQL refuses them, SQLite stores `NAN` as `NULL`,
  and PostgreSQL reads them back as `0.0` for now.
- **Aggregates** — `SUM()` and `AVG()` come back as `int`, `float` or string depending on the
  driver and the column, so cast them in PHP.
- **Binary data** — PostgreSQL reads a string parameter as text, so raw bytes on a `bytea` column
  fail (`invalid byte sequence for encoding "UTF8": 0x00`) or are misread, since a backslash starts
  an escape: `'\x4142'` is stored as `AB`. Bind `'\x' . bin2hex($bytes)`. On SQLite, wrap the
  placeholder in `CAST(?1 AS BLOB)`; MySQL takes the raw string. All three return the raw bytes.
- **ORM entities** — hydration assigns each value as the driver returns it, so a property must
  accept what every target driver returns: `null|DateTimeImmutable` hydrates a timestamp on
  PostgreSQL and MySQL, and throws a `TypeError` on SQLite, whose value is a string. On PostgreSQL,
  a written temporal property also fails `save()` (see [Dates on PostgreSQL](#dates-on-postgresql));
  **[ORM Model](/manual/ADI/Databases/SQL/Model/overview/)** covers entity properties.

## Reference

The mappings above have no API of their own; they follow from:

- **[SQL database](/manual/ADI/Databases/SQL/overview/)** — `query()`, `await()`, the `Result` and
  the facade's errors.
- **[Database configuration](/manual/ADI/Database/Config/overview/)** — the connection keys and
  their defaults.
- **[PostgreSQL driver](/manual/ADI/Databases/SQL/Drivers/PostgreSQL/overview/)**,
  **[MySQL driver](/manual/ADI/Databases/SQL/Drivers/MySQL/overview/)** and
  **[SQLite driver](/manual/ADI/Databases/SQL/Drivers/SQLite/overview/)** — placeholders, prepared
  statements and generated keys.
- **[SQL Drivers](/manual/ADI/Databases/SQL/Drivers/overview/)** — the capability matrix, and keys
  wider than a PHP int.
