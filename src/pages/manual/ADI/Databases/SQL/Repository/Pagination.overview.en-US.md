# ORM pagination

Repositories paginate in two modes. **Page mode** slices with `LIMIT`/`OFFSET` and sends one `COUNT(*)` for the total. **Cursor mode** slices with a keyset predicate derived from an opaque token, never counts, and detects the next page by probing one row beyond the limit.

Both modes append the primary key as the final `ORDER BY` tiebreak automatically, so page boundaries are stable even when the user ordering has duplicates.

## Entity on this page

```php
use Bootgly\ADI\Databases\SQL\Model\Column;
use Bootgly\ADI\Databases\SQL\Model\Key;
use Bootgly\ADI\Databases\SQL\Model\Table;

#[Table('users')]
class User
{
   #[Key]
   public null|int $id = null;

   #[Column]
   public string $name = '';

   #[Column]
   public bool $active = true;

   #[Column(nullable: true)]
   public null|string $city = null;
}
```

The `users` table holds 23 rows, with the ids 1 to 23. How a repository reads and hydrates them is
on **[ORM Repository](/manual/ADI/Databases/SQL/Repository/overview/)**, and the selections that
restrict and order a page are on
**[ORM selections](/manual/ADI/Databases/SQL/Repository/Selection/overview/)**.

The ADI-layer examples use `$Database`, the SQL facade: in a project's boot function, command or
script, `new SQL(new DatabaseConfig(BOOTGLY_PROJECT->Configs->get('database'))->configure())`;
outside a project, `new SQL([...])` with the connection keys — see
**[Open a database](/manual/ADI/Databases/SQL/overview/#open-a-database)**. The HTTP examples run
inside an `HTTP_Server_CLI` route, through `$Response->Database`.

## Paginate an HTTP route

Inside `HTTP_Server_CLI`, the `$Response->Database` resource reads `?page`, `?limit` and `?cursor` from the request, emits the REST headers and returns a body ready for content negotiation:

```php
return $Response->Negotiation->send(
   $Response->Database->paginate(User::class)
);
```

A request like `GET /users?page=2&limit=5` produces:

```http
HTTP/1.1 200 OK
X-Total-Count: 23
Link: </users?limit=5&page=3>; rel="next", </users?limit=5&page=1>; rel="prev"
Content-Type: application/json

{"items":[...],"page":2,"pages":5,"limit":5,"total":23}
```

`limit` is clamped between `1` and `Database::$cap` (default `100`); invalid values fall back to `Database::$limit` (default `10`). Foreign query parameters (filters, search terms) are preserved in the `Link` URLs.

## Filter and order

Pass a `Selection` to restrict and order the paginated set — pagination clones it, so the same selection can be reused:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Users = $Response->Database->map(User::class);

$Page = $Response->Database->paginate(
   $Users,
   $Users->select()
      ->filter(new Identifier('active'), Operators::Equal, true)
      ->order(Orders::Asc, new Identifier('name'))
);

return $Response->Negotiation->send($Page);
```

The selection may join its predicates with `Junctions::Or`: `paginate()` keeps them together — in parentheses when a scope, a listener or a cursor keyset adds a group — and what the selection's named scopes and the repository's `Selecting` listeners add — and the keyset of a cursor page — is ANDed after them, each as a group of its own. A scope therefore restricts every page and the `X-Total-Count`, and a cursor walk over an `OR` moves forward page by page (see **[Combine predicates with OR](/manual/ADI/Databases/SQL/Repository/Selection/overview/#combine-predicates-with-or)**). Since 1.0.13.

## Walk with cursors

A present `cursor` key selects keyset mode — an empty value starts the walk:

```http
GET /users?cursor=&limit=10
```

```http
HTTP/1.1 200 OK
Link: </users?limit=10&cursor=WzEwXQ>; rel="next"
Content-Type: application/json

{"items":[...],"limit":10,"next":"WzEwXQ"}
```

Clients follow `next` (or the `Link` header) until it is `null`. Cursor mode emits no `X-Total-Count` and no `prev` relation — keysets walk forward.

## Handle invalid cursors

Cursor tokens are client input and are validated strictly. A malformed token raises `InvalidArgumentException` before any query is dispatched:

```php
use InvalidArgumentException;

try {
   $Page = $Response->Database->paginate(User::class);
}
catch (InvalidArgumentException) {
   return $Response->code(400)->Negotiation->send(['error' => 'Invalid pagination cursor.']);
}

return $Response->Negotiation->send($Page);
```

## Paginate at the ADI layer

Outside HTTP, call `Repository::paginate()` directly. Hydrating the returned operation resolves the outcome into the `Pagination` instance and onto the mapped result:

```php
use Bootgly\ADI\Databases\SQL\Repository\Pagination;

$Users = $Database->map(User::class, Awaiting: $Database);

$Pagination = new Pagination(limit: 20, page: 2);
$Mapped = $Users->hydrate($Database->await($Users->paginate(null, $Pagination)));

$Pagination->total;   // 23
$Pagination->pages;   // 2
$Mapped->Pagination;  // same instance
```

Cursor mode at this layer uses the `Modes` enum for the first page and the emitted token afterwards:

```php
use Bootgly\ADI\Databases\SQL\Repository\Pagination\Modes;

$First = new Pagination(limit: 20, Mode: Modes::Cursor);
$Mapped = $Users->hydrate($Database->await($Users->paginate(null, $First)));

$Next = new Pagination(limit: 20, cursor: $First->next);
```

To walk every page, read `next` after each one and stop when it is `null` — `more` is then `false`:

```php
$Pagination = new Pagination(limit: 10, Mode: Modes::Cursor);
$read = 0;

while (true) {
   $Mapped = $Users->hydrate($Database->await($Users->paginate(null, $Pagination)));
   $read += $Mapped->count;

   if ($Pagination->next === null) {
      break;
   }

   $Pagination = new Pagination(limit: 10, cursor: $Pagination->next);
}

$read; // 23
```

Do not pass a `null` token back: `new Pagination(cursor: null)` has no cursor, so it starts a page-mode pagination of page 1.

A selection with an `OR` walks the same way:

```php
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Junctions;
use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Operators;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

$Edges = $Users->select()
   ->filter(new Identifier('id'), Operators::Less, 3)
   ->filter(new Identifier('id'), Operators::Greater, 21, Junctions::Or);

$First = new Pagination(limit: 2, Mode: Modes::Cursor);
$Mapped = $Users->hydrate($Database->await($Users->paginate($Edges, $First)));
array_column($Mapped->entities, 'id'); // [1, 2]

$Second = new Pagination(limit: 2, cursor: $First->next);
$Mapped = $Users->hydrate($Database->await($Users->paginate($Edges, $Second)));
array_column($Mapped->entities, 'id'); // [22, 23]
$Second->next;                         // null: the walk is over
```

On PostgreSQL, the second `paginate()` sends:

```sql
SELECT "id", "name", "active", "city" FROM "users" WHERE ("id" < $1 OR "id" > $2) AND (("id" > $3)) ORDER BY "id" ASC LIMIT 3
```

The `OR` stays in parentheses and the keyset of the page — the rows after id 2 — is ANDed after it; `LIMIT 3` is the page plus the probe row.

In page mode the `COUNT(*)` must be finished when `hydrate()` runs: with an asynchronous driver (PostgreSQL, MySQL) the repository needs an await bridge (`Awaiting: $Database`, a transaction, or the HTTP database resource), otherwise `hydrate()` throws `ORM pagination count requires an await bridge.` SQLite runs each statement inside the call and never needs one. On a pooled facade, `paginate()` sends the `COUNT(*)` right behind the items query, pipelined. A transaction is a serial surface — it refuses a second statement while one is running —, so there `paginate()` sends only the items query and `hydrate()` sends the `COUNT(*)` and awaits it through the transaction; on SQLite the items query has already run by then, so `paginate()` sends both. Page pagination works inside `Transaction::map()` either way.

## Order a cursor walk

A cursor page reads the rows that sort strictly after the last row of the previous page, comparing each order column with `>` — `<` when descending —, a comparison `NULL` never passes. So cursor mode needs order columns that never hold `NULL`, and `paginate()` refuses, before it sends anything, what it can tell may hold one:

```php
use InvalidArgumentException;

use Bootgly\ADI\Databases\SQL\Builder\Auxiliaries\Orders;
use Bootgly\ADI\Databases\SQL\Builder\Identifier;

try {
   $Users->paginate(
      $Users->select()->order(Orders::Asc, new Identifier('city')),
      new Pagination(limit: 10, Mode: Modes::Cursor)
   );
}
catch (InvalidArgumentException $Exception) {
   $Exception->getMessage(); // ORM cursor pagination requires non-nullable order columns: city
}
```

- An order column whose property is marked `#[Column(nullable: true)]`, as `city` is, throws `ORM cursor pagination requires non-nullable order columns: city`.
- An order with `Nulls::First` or `Nulls::Last` throws `ORM cursor pagination does not support NULLS ordering.`

`paginate()` judges a column by that flag alone. A `null|string` property without `nullable: true` passes, and a `NULL` in its column breaks the walk after the query ran: every page after the first compares the column with the last value served, a comparison `NULL` never passes, so only the first page can hold the rows holding `NULL`. Sorted first — descending on PostgreSQL, ascending on MySQL and SQLite — they are served there; sorted last, they drop out of the walk without an error, unless the first page already reaches them. A page that ends on one makes `hydrate()` throw `InvalidArgumentException`: `ORM pagination cursor requires scalar, non-null order values.` — the exception a malformed cursor raises, so a route answers it as one. Mark every column that can hold `NULL` with `nullable: true`, so the refusal comes before any query. Page mode orders by such columns without restriction.

## Caveats

- Cursor mode never emits `prev` links; walk forward only. `previous` stays `null`: the repository never sets it.
- Cursor mode fetches `limit + 1` rows: the probe row resolves `more`/`next` and is trimmed before relations load.
- The token is the base64url-encoded JSON of the last row's order values and key — `WzEwXQ` above is `[10]`, the key alone, and a walk ordered by `name` carries the name too, as `WyJCb2IiLDdd` carries `["Bob",7]`: opaque, not secret. Do not order a cursor walk by a column the client must not read.
- `paginate()` replaces the selection's own `limit()` and `skip()` with the page's slice, runs its named scopes, and emits `Selecting` and `Selected` as `fetch()` does.
- A page past the last one has no items, and `more` is `false`.
- When both `cursor` and `page` are present in the request, `cursor` wins.
- With read replicas, the items query and the `COUNT(*)` may hit different replicas; the total can lag the items marginally.
- Entities serialize through content negotiation via public properties; keep lazy relation properties out of REST-facing entities.

## Reference

`Selection::seek()`, which builds the keyset of a cursor page, and `Selection::count()`, which compiles the page total, are in the **[ORM selections](/manual/ADI/Databases/SQL/Repository/Selection/overview/#reference)** Reference.

### Repository

```php
paginate (null|Selection $Selection = null, null|Pagination $Pagination = null, null|object $Scope = null): Operation
```

`Bootgly\ADI\Databases\SQL\Repository` — reads one page of a copy of the selection, every row without one, and returns the items operation; without a `$Pagination`, page 1 of 10 rows. In page mode it also sends one `COUNT(*)` — pipelined on a pooled facade; on a serial surface whose items query is still running, `hydrate()` sends it instead. Throws `InvalidArgumentException` before any query for a malformed cursor, for a scope the repository has not registered (`ORM scope is not registered: <name>`) and for an int-backed enum identifier (`ORM selection enum identifiers must be string-backed.`), and, in cursor mode, for a `nullable` order column or a `Nulls` order. Pass the returned operation to `hydrate()` to resolve the outcome.

### Pagination

`Bootgly\ADI\Databases\SQL\Repository\Pagination`, the request and the outcome of one page.

#### Methods

```php
__construct (int $limit = 10, null|int $page = null, null|string $cursor = null, null|Modes $Mode = null)
```

The mode is inferred: a `cursor` selects `Modes::Cursor`, a `page` selects `Modes::Page`, neither defaults to `Modes::Page` unless `$Mode` says otherwise. A `limit` or a `page` below 1, both a page and a cursor, or an explicit mode against the inferred one throw `InvalidArgumentException`.

```php
static encode (array $values): string
```

Encodes ordered keyset values (order columns first, primary key last) into one opaque base64url token. Null or non-scalar values throw.

```php
decode (int $arity): array
```

Decodes this pagination's cursor into keyset values, validating structure, arity and scalar types strictly. Any violation throws `InvalidArgumentException`.

```php
resolve (null|int $total = null, null|int $pages = null, bool $more = false, null|string $next = null, null|string $previous = null): static
```

Writes the pagination outcome (`total`, `pages`, `more`, `next`, `previous`). Called by the repository during `hydrate()`.

#### Properties

```php
public private(set) Modes $Mode
```

The mode, inferred by the constructor.

```php
public private(set) int $limit
```

The rows per page.

```php
public private(set) null|int $page
```

The page to read; `null` reads page 1 in page mode, and is always `null` in cursor mode.

```php
public private(set) null|string $cursor
```

The token of the page to read; `null` for the first page of a walk.

```php
public private(set) null|int $total = null
```

Page mode: the number of rows the selection matches, set by `hydrate()`.

```php
public private(set) null|int $pages = null
```

Page mode: the number of pages, the total divided by `limit` and rounded up.

```php
public private(set) bool $more = false
```

Whether a page follows this one.

```php
public private(set) null|string $next = null
```

Cursor mode: the token of the next page, `null` on the last one.

```php
public private(set) null|string $previous = null
```

Never set by the repository.

### Modes

`Bootgly\ADI\Databases\SQL\Repository\Pagination\Modes`:

| Case | Behavior |
| ------ | ---------- |
| `Page` | `LIMIT`/`OFFSET` slice + `COUNT(*)` total, pipelined on a pooled facade and sent by `hydrate()` inside a transaction |
| `Cursor` | Keyset predicate + `limit + 1` probe, no count |

### HTTP resource

```php
paginate (string|Repository $Entity, null|Selection $Selection = null): array
```

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database` — paginates one mapped entity through the request query parameters, emits `X-Total-Count` (page mode) and `Link` headers, and returns the negotiable body array. Accepts an entity class name or an already-mapped repository.

```php
bind (Response $Response): static
```

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database` — binds the response context; called automatically when the resource is mounted on a response.
