# JSON-RPC

`Bootgly\API\RPC\JSON` is a JSON-RPC 2.0 dispatcher. You register methods by name; it takes a raw
payload and gives back the JSON to send — single requests, batches and notifications, with the
standard error codes. It never reads a socket or writes a header: the same instance answers over
an HTTP route, a WebSocket or stdio, and the transport decides how the answer leaves.

## Register methods and answer a payload

A method is a closure `fn (array $params, mixed $context): mixed`, registered under the name
clients call. A method that does not need the call's context (see
**[Per-call context](#per-call-context)**) leaves that parameter out — a closure can, since PHP
drops the extra argument. A PHP function cannot: register `fn (array $params) => array_sum($params)`,
not `array_sum(...)`, which refuses the second argument:

```php
use Bootgly\API\RPC\JSON;

$RPC = new JSON([
   'sum' => fn (array $params): int => array_sum($params),
   'greet' => fn (array $params): string => "Hello, {$params['name']}!"
]);

echo $RPC->handle('{"jsonrpc": "2.0", "id": 1, "method": "sum", "params": [1, 2, 3]}');
// {"jsonrpc":"2.0","id":1,"result":6}

echo $RPC->handle('{"jsonrpc": "2.0", "id": "a", "method": "greet", "params": {"name": "Ada"}}');
// {"jsonrpc":"2.0","id":"a","result":"Hello, Ada!"}
```

`handle()` decodes the payload, runs the method and encodes the response object with the
request's `id`. The id comes back as PHP decoded it: a string, an integer or `null` returns as it
was sent, but an integer past `PHP_INT_MAX` or a fractional id is a float, and may not come back
digit for digit:

```php
echo $RPC->handle('{"jsonrpc": "2.0", "id": 9223372036854775808, "method": "sum", "params": [1]}');
// {"jsonrpc":"2.0","id":9.223372036854776e+18,"result":1}

echo $RPC->handle('{"jsonrpc": "2.0", "id": "9223372036854775808", "method": "sum", "params": [1]}');
// {"jsonrpc":"2.0","id":"9223372036854775808","result":1}
```

Clients that need large ids should send them as strings; the specification advises against
fractional ids.

## Params and results

Params arrive decoded as PHP arrays, whatever their JSON shape: a JSON object becomes an
associative array, a JSON array becomes a list, and missing `params` arrive as `[]`. An empty
object `{}` arrives as `[]` too, so it cannot be told apart from an empty list:

```php
use Bootgly\API\RPC\JSON;

$RPC = new JSON([
   'inspect' => fn (array $params): array => ['params' => $params, 'list' => array_is_list($params)],
   'settings' => fn (array $params): stdClass => new stdClass,
   'tags' => fn (array $params): array => []
]);

echo $RPC->handle('{"jsonrpc": "2.0", "id": 1, "method": "inspect", "params": {"page": 2}}');
// {"jsonrpc":"2.0","id":1,"result":{"params":{"page":2},"list":false}}

echo $RPC->handle('{"jsonrpc": "2.0", "id": 2, "method": "inspect", "params": [2]}');
// {"jsonrpc":"2.0","id":2,"result":{"params":[2],"list":true}}

echo $RPC->handle('{"jsonrpc": "2.0", "id": 3, "method": "inspect"}');
// {"jsonrpc":"2.0","id":3,"result":{"params":[],"list":true}}
```

The return value is encoded as the `result`. An empty PHP array encodes as `[]`; when the client
must receive an empty object, return a `stdClass`:

```php
echo $RPC->handle('{"jsonrpc": "2.0", "id": 5, "method": "settings"}');
// {"jsonrpc":"2.0","id":5,"result":{}}

echo $RPC->handle('{"jsonrpc": "2.0", "id": 6, "method": "tags"}');
// {"jsonrpc":"2.0","id":6,"result":[]}
```

## Notifications and batches

A request without an `id` is a notification: the method runs, and nothing is answered — not even
an error. When only notifications came in, `handle()` returns `null`:

```php
use Bootgly\API\RPC\JSON;

$events = [];
$RPC = new JSON([
   'sum' => fn (array $params): int => array_sum($params),
   'track' => function (array $params) use (&$events): null {
      $events[] = $params['event'];

      return null;
   }
]);

var_dump($RPC->handle('{"jsonrpc": "2.0", "method": "track", "params": {"event": "opened"}}'));
// NULL
```

A JSON array of request objects is a batch. Each one runs in order, and the answer is an array
with one response per request that has an `id` — notifications leave no entry:

```php
echo $RPC->handle('[
   {"jsonrpc": "2.0", "id": 1, "method": "sum", "params": [1, 2]},
   {"jsonrpc": "2.0", "method": "track", "params": {"event": "summed"}},
   {"jsonrpc": "2.0", "id": 2, "method": "missing"}
]');
// [{"jsonrpc":"2.0","id":1,"result":3},{"jsonrpc":"2.0","id":2,"error":{"code":-32601,"message":"Method not found"}}]
```

A batch made only of notifications returns `null`, like a single notification. So `null` always
means "nothing is owed": an HTTP transport answers it with `202 Accepted` and no body, a stdio
transport writes nothing.

A payload is a batch only when its first character after any whitespace (space, tab, line feed,
carriage return) is `[`. A JSON object is always one request, whatever its keys — an object
keyed `"0"`, `"1"`… is not a batch, so it is an Invalid Request:

```php
echo $RPC->handle('{"0": {"jsonrpc": "2.0", "id": 1, "method": "sum", "params": [1, 2]}}');
// {"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"Invalid Request"}}
```

## Standard errors

The dispatcher answers malformed traffic by itself, with the codes of the specification (also
available as constants of `JSON`):

```php
use Bootgly\API\RPC\JSON;

$RPC = new JSON(['sum' => fn (array $params): int => array_sum($params)]);

echo $RPC->handle('{"jsonrpc": "2.0", "id": 1, "method": "sum", "params": [1, 2');
// {"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}

echo $RPC->handle('{"id": 2, "method": "sum"}');
// {"jsonrpc":"2.0","id":2,"error":{"code":-32600,"message":"Invalid Request"}}

echo $RPC->handle('{"jsonrpc": "2.0", "id": 3, "method": "sum", "params": 5}');
// {"jsonrpc":"2.0","id":3,"error":{"code":-32602,"message":"Invalid params"}}

echo $RPC->handle('{"jsonrpc": "2.0", "id": 4, "method": "product"}');
// {"jsonrpc":"2.0","id":4,"error":{"code":-32601,"message":"Method not found"}}

echo $RPC->handle('[]');
// {"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"Invalid Request"}}
```

A request object needs `"jsonrpc": "2.0"` and a string `method`; `params`, when present, must be
an object or an array. An id that is not a string, a number or `null` is an Invalid Request with
`id: null` — and so is a number past the float range, such as `1e999`, which PHP decodes to
`INF` and could not send back.

## Designed errors with Fault

When a method refuses a call on purpose, it throws `JSON\Fault` with a code, a message and
optional data. All three reach the client as the response's `error`:

```php
use Bootgly\API\RPC\JSON;
use Bootgly\API\RPC\JSON\Fault;

$stock = ['apple' => 3];

$RPC = new JSON([
   'reserve' => function (array $params) use (&$stock): array {
      $item = $params['item'] ?? null;
      $quantity = $params['quantity'] ?? null;

      if (is_string($item) === false || is_int($quantity) === false || $quantity < 1) {
         throw new Fault(JSON::INVALID_PARAMS, 'Invalid params', ['item' => 'string', 'quantity' => 'integer > 0']);
      }
      if (($stock[$item] ?? 0) < $quantity) {
         throw new Fault(1001, 'Out of stock', ['item' => $item, 'available' => $stock[$item] ?? 0]);
      }

      $stock[$item] -= $quantity;

      return ['item' => $item, 'left' => $stock[$item]];
   }
]);

echo $RPC->handle('{"jsonrpc": "2.0", "id": 1, "method": "reserve", "params": {"item": "apple", "quantity": 2}}');
// {"jsonrpc":"2.0","id":1,"result":{"item":"apple","left":1}}

echo $RPC->handle('{"jsonrpc": "2.0", "id": 2, "method": "reserve", "params": {"item": "apple", "quantity": 5}}');
// {"jsonrpc":"2.0","id":2,"error":{"code":1001,"message":"Out of stock","data":{"item":"apple","available":1}}}

echo $RPC->handle('{"jsonrpc": "2.0", "id": 3, "method": "reserve", "params": {"item": "apple"}}');
// {"jsonrpc":"2.0","id":3,"error":{"code":-32602,"message":"Invalid params","data":{"item":"string","quantity":"integer > 0"}}}
```

The dispatcher only checks that `params` is structured; checking what is inside is the method's
job, and `JSON::INVALID_PARAMS` is the code for it. For errors of your own application, pick
codes outside `-32768..-32000`, the range the specification reserves. `data` is left out of the
error when it is `null`.

## Per-call context

Whatever belongs to one call — the client's session, its identity, a trace id for your logs —
travels as that call's context: the second argument of `handle()`. The dispatcher hands it to
every method it runs for that payload, as the method's second argument, and to the Reporter.
It stores nothing: the context lives only as long as the call.

```php
use Bootgly\API\RPC\JSON;
use Bootgly\API\Security\Identity;

$RPC = new JSON([
   'whoami' => fn (array $params, Identity $Identity): string => $Identity->id,
   'allowed' => fn (array $params, Identity $Identity): bool => $Identity->check($params['scope'] ?? ''),
   'sum' => fn (array $params): int => array_sum($params)
]);

$Ada = new Identity('ada', scopes: ['orders:read']);
$Bob = new Identity('bob');

echo $RPC->handle('{"jsonrpc": "2.0", "id": 1, "method": "whoami"}', $Ada);
// {"jsonrpc":"2.0","id":1,"result":"ada"}

echo $RPC->handle('{"jsonrpc": "2.0", "id": 2, "method": "whoami"}', $Bob);
// {"jsonrpc":"2.0","id":2,"result":"bob"}

echo $RPC->handle('[
   {"jsonrpc": "2.0", "id": 3, "method": "allowed", "params": {"scope": "orders:read"}},
   {"jsonrpc": "2.0", "id": 4, "method": "sum", "params": [1, 2]}
]', $Ada);
// [{"jsonrpc":"2.0","id":3,"result":true},{"jsonrpc":"2.0","id":4,"result":3}]
```

Every request of a batch gets the same context. Without one, the context is `null`.

The context is the only safe way to carry per-client state. One dispatcher serves every request
of a worker, and those requests interleave: a method that waits on I/O inside a Fiber lets another
request run before it resumes. A value the transport writes into a shared variable — a property,
or a variable the methods capture by reference — before calling `handle()` can be overwritten by
the next request while the first is still running, and the first request then reads the second
client's session. The context of a call cannot change under it.

## Internal errors stay hidden

Anything else a method throws is an internal failure. The client gets `-32603 Internal error`
for the same id, and nothing of the exception: no message, no class, no trace. To keep those
failures for your logs, pass a Reporter —
`fn (Throwable $Throwable, array $request, mixed $context): void`:

```php
use Bootgly\API\RPC\JSON;

$RPC = new JSON(
   Methods: [
      'balance' => fn (array $params): int => throw new RuntimeException('connection to 10.0.0.5:5432 refused'),
      'label' => fn (array $params): string => "\xB1 invalid UTF-8"
   ],
   Reporter: function (Throwable $Throwable, array $request, mixed $context): void {
      $method = $request['method'] ?? '?';
      $class = $Throwable::class;
      $trace = $context['trace'] ?? '-';

      error_log("RPC {$method} [{$trace}]: {$class}: {$Throwable->getMessage()}");
   }
);

echo $RPC->handle('{"jsonrpc": "2.0", "id": 1, "method": "balance"}', ['trace' => 'req-7f3a']);
// logged:  RPC balance [req-7f3a]: RuntimeException: connection to 10.0.0.5:5432 refused
// {"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"Internal error"}}

echo $RPC->handle('{"jsonrpc": "2.0", "id": 2, "method": "label"}', ['trace' => 'req-7f3b']);
// logged:  RPC label [req-7f3b]: JsonException: Malformed UTF-8 characters, possibly incorrectly encoded
// {"jsonrpc":"2.0","id":2,"error":{"code":-32603,"message":"Internal error"}}
```

The Reporter is called for two failures: a method's unexpected `Throwable`, and a response that
cannot be encoded — invalid UTF-8, a resource, a recursive structure, or a `jsonSerialize()` or
property hook that throws while it is encoded. That response is replaced by an Internal error
for the same id. The Reporter receives the request object the failure came from and the call's
context. A `Fault` is never reported: it is the answer you designed. Without a Reporter, internal
failures are only hidden.

The Reporter must not throw. An exception it raises is dropped, so the response still goes out —
and a batch still runs its remaining requests — but the failure it was reporting is lost.

## Limit batches

One batch may carry at most `batch` requests — 100 by default. A larger batch is refused whole,
before any method runs, with a single Invalid Request and `id: null`:

```php
use Bootgly\API\RPC\JSON;

$Methods = ['ping' => fn (array $params): string => 'pong'];

$RPC = new JSON($Methods, batch: 2);

echo $RPC->handle('[
   {"jsonrpc": "2.0", "id": 1, "method": "ping"},
   {"jsonrpc": "2.0", "id": 2, "method": "ping"},
   {"jsonrpc": "2.0", "id": 3, "method": "ping"}
]');
// {"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"Invalid Request"}}
```

`batch: 0` refuses every batch, while single requests keep working. A negative limit throws an
`InvalidArgumentException` from the constructor. Size the limit to what one payload may cost you:
each request of a batch runs inside the same `handle()` call.

## Serve it over HTTP

The dispatcher keeps no per-request state, so build it once and let every request of the worker
share it. In an `HTTP_Server_CLI` route set, build it at file scope — the file runs once, when
the **[Router](/manual/WPI/HTTP/HTTP_Server_CLI/Router/overview/)** loads it — and hand the raw
body to `handle()`, with what belongs to the request as the context:

```php
<?php

use Bootgly\API\RPC\JSON;
use Bootgly\API\Security\Identity;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;

// ! Built once, when the route set loads — every request of the worker shares it
$RPC = new JSON(
   Methods: [
      'sum' => fn (array $params): int => array_sum($params),
      'track' => fn (array $params): null => null,
      'whoami' => fn (array $params, mixed $Identity): string => $Identity instanceof Identity ? $Identity->id : 'guest'
   ],
   Reporter: function (Throwable $Throwable, array $request, mixed $Identity): void {
      $user = $Identity instanceof Identity ? $Identity->id : 'guest';

      error_log("RPC [{$user}]: {$Throwable->getMessage()}");
   }
);

return static function (Request $Request, Response $Response, Router $Router) use ($RPC): Generator
{
   yield $Router->route('/rpc', function (Request $Request, Response $Response) use ($RPC) {
      // @ This request's identity travels with the call, as its context
      $answer = $RPC->handle($Request->input, $Request->identity);

      // ? Only notifications came in: nothing is owed
      if ($answer === null) {
         return $Response(code: 202);
      }

      return $Response(code: 200, headers: ['Content-Type' => 'application/json'], body: $answer);
   }, POST);

   yield $Router->route('/*', function (Request $Request, Response $Response) {
      return $Response(code: 404, body: 'Not Found');
   });
};
```

```bash
curl -i -X POST http://localhost:8082/rpc -H 'Content-Type: application/json' \
   -d '{"jsonrpc": "2.0", "id": 1, "method": "sum", "params": [1, 2, 3]}'
# HTTP/1.1 200 OK
# Content-Type: application/json
#
# {"jsonrpc":"2.0","id":1,"result":6}

curl -i -X POST http://localhost:8082/rpc -H 'Content-Type: application/json' \
   -d '{"jsonrpc": "2.0", "id": 2, "method": "whoami"}'
# HTTP/1.1 200 OK
# Content-Type: application/json
#
# {"jsonrpc":"2.0","id":2,"result":"guest"}

curl -i -X POST http://localhost:8082/rpc -H 'Content-Type: application/json' \
   -d '{"jsonrpc": "2.0", "method": "track"}'
# HTTP/1.1 202 Accepted
```

`$Request->input` is the raw body (see **[Request](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/)**).
`$Request->identity` is the principal an authentication guard exposed — `null` on this route,
which has none, so `whoami` answers `guest` (see
**[Authentication](/manual/WPI/HTTP/HTTP_Server_CLI/Authentication/overview/)**). Pass
`$Request->Session` instead, or an object that holds both, when the methods need the session.

What a guard exposes depends on the guard: `JWT` an `Identity`; `Bearer` and `Basic` whatever their
resolver returns — the raw token or the username when it returns `true`; the session guards the
stored value. Check for what your guard gives, and never log the context as it is: it may hold a
bearer token.
Protocol errors — Parse error, Invalid Request — are JSON-RPC answers too, so they also go out
as `200` with their error object. Authentication, CORS and rate limits belong to the route, with
the server's **[Middlewares](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/overview/)**; the
dispatcher only speaks JSON-RPC.

## Reference

### JSON

```php
public function __construct (array $Methods, null|Closure $Reporter = null, int $batch = 100)
```

Creates a dispatcher. `$Methods` maps each method name to
`fn (array $params, mixed $context): mixed`. `$Reporter`, when given, is called as
`fn (Throwable $Throwable, array $request, mixed $context): void` with every internal failure — a
method's unexpected `Throwable`, or a response that cannot be encoded — the request object it
came from and the call's context; it must not throw, since an exception it raises is dropped.
`$batch` is the most requests one batch may carry (`0` refuses every batch). Throws
`InvalidArgumentException` when `$batch` is negative.

```php
public function handle (string $payload, mixed $context = null): null|string
```

Answers a raw JSON-RPC payload: one request object or a batch of them. `$context` is handed to
every method run for the payload and to the Reporter. Returns the JSON response — an object, or
an array for a batch — or `null` when only notifications came in. The payload is a batch only
when its first non-whitespace character is `[`. Invalid JSON answers a Parse error; a batch past
the limit answers a single Invalid Request with `id: null`; an empty array `[]` is an Invalid
Request.

```php
public function execute (mixed $request, mixed $context = null): null|array
```

Runs one request object that is already decoded, as `json_decode()` with `associative: true`
returns it, handing `$context` to the method and to the Reporter. Returns the response object as an array — `['jsonrpc' => '2.0', 'id' => …, 'result' => …]`,
or with `error` in place of `result` — or `null` for a notification. It does not encode the
response and does not treat a list as a batch (a list is an Invalid Request): both belong to
`handle()`.

```php
public private(set) int $batch;
```

The batch limit given to the constructor: the most requests one batch may carry.

| Constant | Code | Meaning |
|---|---|---|
| `JSON::PARSE_ERROR` | `-32700` | The payload is not valid JSON. |
| `JSON::INVALID_REQUEST` | `-32600` | Not a valid request object — or a refused batch. |
| `JSON::METHOD_NOT_FOUND` | `-32601` | No method is registered under that name. |
| `JSON::INVALID_PARAMS` | `-32602` | `params` is not an object or an array, or a method refused them. |
| `JSON::INTERNAL_ERROR` | `-32603` | An internal failure; the client sees nothing of it. |

### JSON\Fault

```php
public function __construct (int $code, string $message, mixed $data = null)
```

A designed error, thrown by a method: its `$code`, `$message` and `$data` reach the client as the
response's `error`. `Fault` extends `RuntimeException`, so `getCode()` and `getMessage()` return
the code and the message. Use a standard code such as `JSON::INVALID_PARAMS`, or an application
code outside `-32768..-32000`.

```php
public private(set) mixed $data;
```

The optional structured detail, sent as `error.data`; the member is left out when it is `null`.
