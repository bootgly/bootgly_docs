# ORM pagination

Repositories paginate in two modes. **Page mode** slices with `LIMIT`/`OFFSET` and always dispatches one pipelined `COUNT(*)` for the total. **Cursor mode** slices with a keyset predicate derived from an opaque token, never counts, and detects the next page by probing one row beyond the limit.

Both modes append the primary key as the final `ORDER BY` tiebreak automatically, so page boundaries are stable even when the user ordering has duplicates.

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
$Users = $Response->Database->map(User::class);

$Page = $Response->Database->paginate(
   $Users,
   $Users->select()
      ->filter(new Identifier('active'), Operators::Equal, true)
      ->order(Orders::Asc, new Identifier('name'))
);

return $Response->Negotiation->send($Page);
```

## Walk with cursors

A present `cursor` key selects keyset mode — an empty value starts the walk:

```http
GET /users?cursor=&limit=50
```

```http
HTTP/1.1 200 OK
Link: </users?limit=50&cursor=WyJCb2IiLDdd>; rel="next"
Content-Type: application/json

{"items":[...],"limit":50,"next":"WyJCb2IiLDdd"}
```

Clients follow `next` (or the `Link` header) until it is `null`. Cursor mode emits no `X-Total-Count` and no `prev` relation — keysets walk forward.

## Handle invalid cursors

Cursor tokens are client input and are validated strictly. A malformed token raises `InvalidArgumentException` before any query is dispatched:

```php
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

In page mode the `COUNT(*)` must be finished when `hydrate()` runs: with an asynchronous driver the repository needs an await bridge (`Awaiting: $Database`, a transaction, or the HTTP database resource), otherwise `hydrate()` throws. Synchronous drivers (SQLite) never need one. On serial surfaces such as transactions — which reject a second operation while one is pending — the `COUNT(*)` dispatch is deferred automatically to hydration, so page pagination works inside `Transaction::map()` too.

## Caveats

- Cursor mode requires non-nullable, plainly-ordered columns — `paginate()` rejects nullable order columns and `NULLS FIRST/LAST` ordering before any query is dispatched.
- Cursor mode never emits `prev` links; walk forward only.
- Cursor mode fetches `limit + 1` rows: the probe row resolves `more`/`next` and is trimmed before relations load.
- When both `cursor` and `page` are present in the request, `cursor` wins.
- With read replicas, the items query and the `COUNT(*)` may hit different replicas; the total can lag the items marginally.
- Entities serialize through content negotiation via public properties; keep lazy relation properties out of REST-facing entities.

## Reference

```php
public function paginate (null|Selection $Selection = null, null|Pagination $Pagination = null, null|object $Scope = null): Operation
```

`Bootgly\ADI\Databases\SQL\Repository` — dispatches the paginated items operation (plus one pipelined `COUNT(*)` in page mode) and returns the items operation. The given selection is cloned, never mutated. Pass the returned operation to `hydrate()` to resolve the outcome.

```php
public function __construct (int $limit = 10, null|int $page = null, null|string $cursor = null, null|Modes $Mode = null)
```

`Bootgly\ADI\Databases\SQL\Repository\Pagination` — the mode is inferred: a `cursor` selects `Modes::Cursor`, a `page` selects `Modes::Page`, neither defaults to `Modes::Page` unless `$Mode` says otherwise. Contradictory inputs (page + cursor, or an explicit mode against the inferred one) throw `InvalidArgumentException`.

```php
public static function encode (array $values): string
```

Encodes ordered keyset values (order columns first, primary key last) into one opaque base64url token. Null or non-scalar values throw.

```php
public function decode (int $arity): array
```

Decodes this pagination's cursor into keyset values, validating structure, arity and scalar types strictly. Any violation throws `InvalidArgumentException`.

```php
public function resolve (null|int $total = null, null|int $pages = null, bool $more = false, null|string $next = null, null|string $previous = null): static
```

Writes the pagination outcome (`total`, `pages`, `more`, `next`, `previous`). Called by the repository during `hydrate()`.

```php
public function seek (array $orders, array $values): static
```

`Bootgly\ADI\Databases\SQL\Repository\Selection` — restricts the selection to rows strictly after one keyset position. Orders and values are positional pairs (`['column' => ..., 'order' => Orders::...]` plus one value each); the last pair is the unique tiebreak. Column names must be resolved SQL columns — the repository resolves mapped properties before seeking.

```php
public function count (): Query
```

`Bootgly\ADI\Databases\SQL\Repository\Selection` — compiles a `SELECT COUNT(*) AS "total"` query replaying only restriction predicates (filters and matches); order, limit, offset and locks are dropped.

```php
public function paginate (string|Repository $Entity, null|Selection $Selection = null): array
```

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database` — paginates one mapped entity through the request query parameters, emits `X-Total-Count` (page mode) and `Link` headers, and returns the negotiable body array. Accepts an entity class name or an already-mapped repository.

```php
public function bind (Response $Response): static
```

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Response\Resources\Database` — binds the response context; called automatically when the resource is mounted on a response.

### Modes

`Bootgly\ADI\Databases\SQL\Repository\Pagination\Modes`:

| Case | Behavior |
| ------ | ---------- |
| `Page` | `LIMIT`/`OFFSET` slice + pipelined `COUNT(*)` total |
| `Cursor` | Keyset predicate + `limit + 1` probe, no count |
