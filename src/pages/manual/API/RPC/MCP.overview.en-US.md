# MCP server

`Bootgly\API\RPC\MCP` is the core of a Model Context Protocol server: it answers what an AI
client asks — `initialize`, `ping`, the tools and, when you give them, resources and prompts —
over the **[JSON-RPC](/manual/API/RPC/JSON/overview/)** dispatcher. Your application supplies
closures that list and run its tools; the class handles the protocol around them. Like the
dispatcher, it takes a raw payload and returns the JSON to send, so the transport is yours — and
what belongs to one call, such as the client's session or identity, goes in as that call's
context and reaches each of your closures as its last argument.

## A server with one tool

Give the server a name, a version, a `Lister` that returns the tools and a `Caller` that runs
one:

```php
use Bootgly\API\RPC\JSON;
use Bootgly\API\RPC\JSON\Fault;
use Bootgly\API\RPC\MCP;

$MCP = new MCP(
   name: 'Weather',
   version: '1.0.0',
   Lister: fn (): array => [
      [
         'name' => 'forecast',
         'description' => "Tomorrow's forecast for a city.",
         'inputSchema' => [
            'type' => 'object',
            'properties' => ['city' => ['type' => 'string']],
            'required' => ['city']
         ]
      ]
   ],
   Caller: function (string $name, array $arguments): array {
      // ? An unknown tool is a protocol error
      if ($name !== 'forecast') {
         throw new Fault(JSON::INVALID_PARAMS, "Unknown tool: {$name}");
      }

      $city = $arguments['city'] ?? null;

      // ? A failing call is a tool result the model can read
      if (is_string($city) === false || $city === '') {
         return [
            'content' => [['type' => 'text', 'text' => 'Tell me which city.']],
            'isError' => true
         ];
      }

      return [
         'content' => [['type' => 'text', 'text' => "Sunny in {$city}, 24 °C."]],
         'isError' => false
      ];
   },
   instructions: 'Call forecast for any weather question.'
);
```

A client opens the conversation with `initialize`. The server answers the protocol revision it
will speak, its capabilities, its `serverInfo` and, when given, the `instructions` for the
client's model:

```php
echo $MCP->handle('{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "Client", "version": "1.0"}}}');
// {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"Weather","version":"1.0.0"},"instructions":"Call forecast for any weather question."}}

var_dump($MCP->handle('{"jsonrpc": "2.0", "method": "notifications/initialized"}'));
// NULL
```

Then it lists the tools and calls them:

```php
echo $MCP->handle('{"jsonrpc": "2.0", "id": 2, "method": "tools/list"}');
// {"jsonrpc":"2.0","id":2,"result":{"tools":[{"name":"forecast","description":"Tomorrow's forecast for a city.","inputSchema":{"type":"object","properties":{"city":{"type":"string"}},"required":["city"]}}]}}

echo $MCP->handle('{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "forecast", "arguments": {"city": "Lisbon"}}}');
// {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"Sunny in Lisbon, 24 °C."}],"isError":false}}

echo $MCP->handle('{"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "forecast", "arguments": {}}}');
// {"jsonrpc":"2.0","id":4,"result":{"content":[{"type":"text","text":"Tell me which city."}],"isError":true}}

echo $MCP->handle('{"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "radar"}}');
// {"jsonrpc":"2.0","id":5,"error":{"code":-32602,"message":"Unknown tool: radar"}}
```

`tools/list` wraps what the `Lister` returns as `tools`; `tools/call` sends what the `Caller`
returns as the result, unchanged. Keep the two kinds of failure apart:

- A tool that ran and failed — bad arguments, an API that is down — returns a result with
  `isError: true`. The model reads it and can try again.
- A call the server cannot route — an unknown tool — throws a `JSON\Fault`, which becomes a
  JSON-RPC error.

`tools/call` itself refuses a call without a string `name` or with `arguments` that are not an
object, with `-32602 Invalid params`. Missing `arguments` reach the `Caller` as `[]`.

## Protocol revisions

`MCP::VERSIONS` holds the revisions the server speaks, newest first. A client that asks for one
of them gets it; any other request — an unknown revision, or none — gets the newest.
`MCP::negotiate()` makes that choice, and `initialize` uses it:

```php
use Bootgly\API\RPC\MCP;

echo MCP::negotiate('2025-03-26'); // 2025-03-26
echo MCP::negotiate('2099-01-01'); // 2025-11-25
echo MCP::negotiate(null);         // 2025-11-25

print_r(MCP::VERSIONS);
// Array
// (
//     [0] => 2025-11-25
//     [1] => 2025-06-18
//     [2] => 2025-03-26
//     [3] => 2024-11-05
// )
```

## Sessions and identity: the context

The server keeps no per-client state: what belongs to one client — its session, its identity —
is the transport's, and travels with each call as its context, the second argument of
`handle()`. Every closure you give receives it as its last argument: `Lister($context)`,
`Caller($name, $arguments, $context)`, `Initializer($revision, $params, $context)`, and so on
(see the **[Reference](#reference)**). A closure that does not need it leaves that parameter out.

### Store the revision in the session

The revision agreed at `initialize` is the transport's to keep. Pass an `Initializer` —
`fn (string $revision, array $params, mixed $context): void`. It is told the revision answered
at `initialize` and the client's params, with the call's context — so it stores them into the
session it receives:

```php
use Bootgly\API\RPC\MCP;

// ! The transport's sessions, by `Mcp-Session-Id`
$Sessions = [
   'c0ffee' => new ArrayObject(),
   'decaf' => new ArrayObject()
];

$MCP = new MCP(
   name: 'Weather',
   version: '1.0.0',
   Lister: fn (): array => [],
   Caller: fn (string $name, array $arguments, ArrayObject $Session): array => [
      'content' => [['type' => 'text', 'text' => "Speaking {$Session['revision']} with {$Session['client']}."]],
      'isError' => false
   ],
   Initializer: function (string $revision, array $params, ArrayObject $Session): void {
      $Session['revision'] = $revision;
      $Session['client'] = $params['clientInfo']['name'] ?? 'unknown';
   }
);

// @ The transport, for each message: find its session and pass it as the context
echo $MCP->handle('{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26", "clientInfo": {"name": "Inspector", "version": "1.0"}}}', $Sessions['c0ffee']);
// {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-03-26","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"Weather","version":"1.0.0"}}}

echo $MCP->handle('{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-11-25", "clientInfo": {"name": "Desktop", "version": "2.0"}}}', $Sessions['decaf']);
// {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"Weather","version":"1.0.0"}}}

echo $MCP->handle('{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "status"}}', $Sessions['c0ffee']);
// {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"Speaking 2025-03-26 with Inspector."}],"isError":false}}

print_r($Sessions['c0ffee']->getArrayCopy());
// Array
// (
//     [revision] => 2025-03-26
//     [client] => Inspector
// )
```

The session must be an object (here an `ArrayObject`) for the `Initializer` to write into it: a
PHP array passed as the context is a copy. Later messages of that session can then be checked
against the stored revision — for example the `MCP-Protocol-Version` header that Streamable HTTP
clients send on the requests after `initialize`, from revision `2025-06-18` on.

Do not select the session through shared state instead — a variable the closures capture by
reference, or a property set before each `handle()`. One server instance serves every client of
a worker, and their requests interleave: while one call waits on I/O inside a Fiber, another
request can run and overwrite that shared value, and the first call then writes into, or reads
from, the other client's session. The context of a call cannot change under it.

### Authorize by identity

The identity works the same way. Pass the authenticated principal as the context, and let the
`Lister` show, and the `Caller` run, only what that caller may use:

```php
use Bootgly\API\RPC\MCP;
use Bootgly\API\Security\Identity;

$MCP = new MCP(
   name: 'Orders',
   version: '1.0.0',
   Lister: fn (Identity $Identity): array => $Identity->check('orders:write') === false ? [] : [
      ['name' => 'cancel', 'description' => 'Cancel an order.', 'inputSchema' => ['type' => 'object', 'properties' => ['order' => ['type' => 'integer']]]]
   ],
   Caller: function (string $name, array $arguments, Identity $Identity): array {
      // ? Listing a tool is not enough: check the caller again on every call
      if ($Identity->check('orders:write') === false) {
         return ['content' => [['type' => 'text', 'text' => 'Not allowed.']], 'isError' => true];
      }

      return ['content' => [['type' => 'text', 'text' => "Order {$arguments['order']} cancelled by {$Identity->id}."]], 'isError' => false];
   }
);

$Ada = new Identity('ada', scopes: ['orders:write']);
$Bob = new Identity('bob');

echo $MCP->handle('{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}', $Bob);
// {"jsonrpc":"2.0","id":1,"result":{"tools":[]}}

echo $MCP->handle('{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "cancel", "arguments": {"order": 42}}}', $Bob);
// {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"Not allowed."}],"isError":true}}

echo $MCP->handle('{"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "cancel", "arguments": {"order": 42}}}', $Ada);
// {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text","text":"Order 42 cancelled by ada."}],"isError":false}}
```

When the closures need both, pass one object that holds the session and the identity. Over HTTP,
the route hands `$Request->identity` — the principal an authentication guard exposed — or such
an object to `handle()`, as the
**[HTTP recipe](/manual/API/RPC/JSON/overview/#serve-it-over-http)** of the JSON-RPC page does.

## Resources and prompts

Resources and prompts are optional. Each pair turns on only when both of its closures are given:

- `Resources` (the list) **and** `Reader` (read one) add `resources/list`,
  `resources/templates/list` and `resources/read`, and the `resources` capability. `Templates`,
  the resource templates, is optional: without it, `resources/templates/list` answers an empty
  list.
- `Prompts` (the list) **and** `Prompter` (build one) add `prompts/list` and `prompts/get`, and
  the `prompts` capability.

Give only one closure of a pair and its methods stay out: the client gets `Method not found`.

```php
use Bootgly\API\RPC\JSON;
use Bootgly\API\RPC\JSON\Fault;
use Bootgly\API\RPC\MCP;

$notes = [
   'notes://welcome' => 'Welcome to the team!',
   'notes://deploy' => 'Deploys run on Fridays.'
];

$MCP = new MCP(
   name: 'Notes',
   version: '1.0.0',
   Lister: fn (): array => [],
   Caller: fn (string $name, array $arguments): array => throw new Fault(JSON::INVALID_PARAMS, "Unknown tool: {$name}"),
   Resources: fn (): array => [
      ['uri' => 'notes://welcome', 'name' => 'welcome', 'mimeType' => 'text/plain'],
      ['uri' => 'notes://deploy', 'name' => 'deploy', 'mimeType' => 'text/plain']
   ],
   Templates: fn (): array => [
      ['uriTemplate' => 'notes://{slug}', 'name' => 'note', 'mimeType' => 'text/plain']
   ],
   Reader: function (string $URI) use ($notes): array {
      // ?
      if (isSet($notes[$URI]) === false) {
         throw new Fault(MCP::RESOURCE_NOT_FOUND, 'Resource not found', ['uri' => $URI]);
      }

      return [
         ['uri' => $URI, 'mimeType' => 'text/plain', 'text' => $notes[$URI]]
      ];
   },
   Prompts: fn (): array => [
      [
         'name' => 'summarize',
         'description' => 'Summarize one note.',
         'arguments' => [['name' => 'slug', 'required' => true]]
      ]
   ],
   Prompter: function (string $name, array $arguments): array {
      // ?
      if ($name !== 'summarize' || is_string($arguments['slug'] ?? null) === false) {
         throw new Fault(JSON::INVALID_PARAMS, "Unknown prompt or missing slug: {$name}");
      }

      return [
         'description' => 'Summarize one note.',
         'messages' => [
            [
               'role' => 'user',
               'content' => ['type' => 'text', 'text' => "Summarize the note notes://{$arguments['slug']}."]
            ]
         ]
      ];
   }
);

echo $MCP->handle('{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-11-25"}}');
// {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-11-25","capabilities":{"tools":{"listChanged":false},"resources":{"listChanged":false,"subscribe":false},"prompts":{"listChanged":false}},"serverInfo":{"name":"Notes","version":"1.0.0"}}}

echo $MCP->handle('{"jsonrpc": "2.0", "id": 4, "method": "resources/read", "params": {"uri": "notes://deploy"}}');
// {"jsonrpc":"2.0","id":4,"result":{"contents":[{"uri":"notes://deploy","mimeType":"text/plain","text":"Deploys run on Fridays."}]}}

echo $MCP->handle('{"jsonrpc": "2.0", "id": 5, "method": "resources/read", "params": {"uri": "notes://missing"}}');
// {"jsonrpc":"2.0","id":5,"error":{"code":-32002,"message":"Resource not found","data":{"uri":"notes://missing"}}}

echo $MCP->handle('{"jsonrpc": "2.0", "id": 7, "method": "prompts/get", "params": {"name": "summarize", "arguments": {"slug": "deploy"}}}');
// {"jsonrpc":"2.0","id":7,"result":{"description":"Summarize one note.","messages":[{"role":"user","content":{"type":"text","text":"Summarize the note notes://deploy."}}]}}
```

The server wraps the lists — `resources`, `resourceTemplates`, `prompts` — and the `Reader`'s
answer as `contents`; the `Prompter` returns the whole `prompts/get` result (`description`,
`messages`). For an unknown URI, raise `MCP::RESOURCE_NOT_FOUND`; for an unknown prompt or
missing arguments, `JSON::INVALID_PARAMS`. `resources/read` itself refuses a missing or empty
`uri`, and `prompts/get` a missing `name` or `arguments` that are not an object, with
`-32602 Invalid params`.

## Empty results

An empty MCP result is a JSON object on the wire. When a protocol method or one of your closures
returns exactly `[]` or `null` as the whole result, the server sends `{}`. Only those two values
change: any other result — `0`, `false`, a string, a non-empty list — is sent as it is:

```php
use Bootgly\API\RPC\MCP;

$MCP = new MCP(
   name: 'Weather',
   version: '1.0.0',
   Lister: fn (): array => [],
   Caller: fn (string $name, array $arguments): mixed => match ($name) {
      'count' => 0,
      'cities' => ['Lisbon', 'Porto'],
      default => []
   }
);

echo $MCP->handle('{"jsonrpc": "2.0", "id": 1, "method": "ping"}');
// {"jsonrpc":"2.0","id":1,"result":{}}

echo $MCP->handle('{"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "anything"}}');
// {"jsonrpc":"2.0","id":2,"result":{}}

echo $MCP->handle('{"jsonrpc": "2.0", "id": 3, "method": "tools/list"}');
// {"jsonrpc":"2.0","id":3,"result":{"tools":[]}}

echo $MCP->handle('{"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "count"}}');
// {"jsonrpc":"2.0","id":4,"result":0}

echo $MCP->handle('{"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "cities"}}');
// {"jsonrpc":"2.0","id":5,"result":["Lisbon","Porto"]}
```

A `tools/call` result should still be the object MCP defines (`content`, `isError`): the server
does not fix a result that is not one. The rule covers the whole result only. A nested empty array still encodes as `[]`, so a tool
without arguments declares its schema's `properties` as a `stdClass`:

```php
'inputSchema' => ['type' => 'object', 'properties' => new stdClass]
// "inputSchema":{"type":"object","properties":{}}
```

## Internal errors and batches

The server builds its `JSON` dispatcher with your `Reporter` and `batch`, so they work as on the
**[JSON-RPC](/manual/API/RPC/JSON/overview/)** page: an unexpected `Throwable` in a closure becomes
`-32603 Internal error` for the client and reaches the Reporter for your logs, with the call's
context — `fn (Throwable $Throwable, array $request, mixed $context): void`.

```php
use Bootgly\API\RPC\MCP;

$MCP = new MCP(
   name: 'Weather',
   version: '1.0.0',
   Lister: fn (): array => [],
   Caller: fn (string $name, array $arguments): array => throw new RuntimeException('upstream API key rejected'),
   Reporter: function (Throwable $Throwable, array $request, mixed $context): void {
      $session = $context['session'] ?? '-';

      error_log("MCP {$request['method']} [{$session}]: {$Throwable->getMessage()}");
   }
);

echo $MCP->handle('{"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "forecast"}}', ['session' => 'c0ffee']);
// logged:  MCP tools/call [c0ffee]: upstream API key rejected
// {"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"Internal error"}}
```

The Reporter must not throw: an exception it raises is dropped, so the response still goes out.

Batches are accepted up to `batch` requests (100 by default). The MCP revision `2025-03-26`
allows JSON-RPC batches and later revisions removed them; `batch: 0` refuses every batch.
`initialize` is never accepted inside a batch: a batch that carries it is refused whole, before
any method runs, with a single Invalid Request:

```php
echo $MCP->handle('[
   {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26"}},
   {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}
]');
// {"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"Invalid Request"}}
```

`notifications/initialized` and `notifications/cancelled` are accepted and answer nothing.

## What stays outside

The class is the protocol core only. The application, or the transport around it, owns:

- **The transport.** Streamable HTTP or stdio: reading messages, writing answers, and the
  transport's own rules (session ids, `Origin` checks, streams). `handle()` returns `null` when
  nothing is owed — an HTTP transport answers `202`, stdio writes nothing; the
  **[HTTP recipe](/manual/API/RPC/JSON/overview/#serve-it-over-http)** of the JSON-RPC page shows
  that shape.
- **Sessions.** The server keeps no per-client state; pass the transport's session as the
  context, and let the `Initializer` store the revision into it.
- **Authentication and authorization.** Check who is calling before the payload reaches
  `handle()`, pass that identity as the context, and decide inside the `Lister` and the `Caller`
  which tools that caller may see and run.

Because it keeps no per-client state, one instance can serve every client of a worker.

## Reference

### MCP

```php
public function __construct (
   string $name,
   string $version,
   Closure $Lister,
   Closure $Caller,
   null|string $instructions = null,
   null|Closure $Resources = null,
   null|Closure $Templates = null,
   null|Closure $Reader = null,
   null|Closure $Prompts = null,
   null|Closure $Prompter = null,
   null|Closure $Initializer = null,
   null|Closure $Reporter = null,
   int $batch = 100
)
```

Creates the server and its `JSON` dispatcher. `$name` and `$version` are sent as `serverInfo`;
`$instructions`, when given, as `instructions`. The closures — each receives the call's
`$context` as its last argument, and may leave it out:

| Closure | Shape | Answers |
|---|---|---|
| `Lister` | `fn (mixed $context): array` | The tools, each `['name' => …, 'description' => …, 'inputSchema' => …]`; sent as `tools`. |
| `Caller` | `fn (string $name, array $arguments, mixed $context): mixed` | The `tools/call` result (`content`, `isError`). |
| `Resources` | `fn (mixed $context): array` | The resources (`uri`, `name`, …); sent as `resources`. Needs `Reader`. |
| `Templates` | `fn (mixed $context): array` | The resource templates (`uriTemplate`, …); sent as `resourceTemplates`. |
| `Reader` | `fn (string $URI, mixed $context): array` | The contents of one resource; sent as `contents`. Needs `Resources`. |
| `Prompts` | `fn (mixed $context): array` | The prompts (`name`, `arguments`, …); sent as `prompts`. Needs `Prompter`. |
| `Prompter` | `fn (string $name, array $arguments, mixed $context): mixed` | The `prompts/get` result (`messages`, …). Needs `Prompts`. |
| `Initializer` | `fn (string $revision, array $params, mixed $context): void` | Told the agreed revision and the client's params at `initialize`, to store in the session it receives. |

`$Reporter` and `$batch` are passed to the `JSON` dispatcher unchanged — the Reporter is called
as `fn (Throwable $Throwable, array $request, mixed $context): void` and must not throw; a
negative `$batch` throws `InvalidArgumentException`.

```php
public function handle (string $payload, mixed $context = null): null|string
```

Answers a raw MCP payload (JSON-RPC 2.0). `$context` is what belongs to this call — the client's
session, its identity — and is handed to every application closure and to the Reporter; nothing
of it is stored. Returns the JSON response, or `null` when only notifications came in. A result
of `[]` or `null` is sent as `{}`; a batch that carries `initialize` answers a single Invalid
Request and runs no method.

```php
public static function negotiate (mixed $requested): string
```

Returns the revision to speak for the `protocolVersion` a client sent: the same one when it is
in `MCP::VERSIONS`, the newest otherwise.

```php
public const array VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
```

The protocol revisions this server speaks, newest first.

```php
public const int RESOURCE_NOT_FOUND = -32002;
```

MCP's error code for an unknown resource URI, for the `Reader` to raise in a `JSON\Fault`.

```php
public private(set) string $name;
```

The server name, sent as `serverInfo.name`.

```php
public private(set) string $version;
```

The server version, sent as `serverInfo.version`.

```php
public private(set) null|string $instructions;
```

The instructions sent at `initialize`, or `null` when none were given.

```php
public private(set) JSON $JSON;
```

The JSON-RPC dispatcher the protocol methods are registered on, for introspection — for example,
`$MCP->JSON->batch` is the batch limit. Answer payloads through `$MCP->handle()`, never
`$MCP->JSON->handle()`: only the former refuses what MCP forbids, such as `initialize` inside a
batch.

### Methods answered

| Method | Present | Result |
|---|---|---|
| `initialize` | always | `protocolVersion`, `capabilities`, `serverInfo`, `instructions` |
| `notifications/initialized` | always | nothing (notification) |
| `notifications/cancelled` | always | nothing (notification) |
| `ping` | always | `{}` |
| `tools/list` | always | `tools` |
| `tools/call` | always | the `Caller`'s result |
| `resources/list` | `Resources` and `Reader` | `resources` |
| `resources/templates/list` | `Resources` and `Reader` | `resourceTemplates` |
| `resources/read` | `Resources` and `Reader` | `contents` |
| `prompts/list` | `Prompts` and `Prompter` | `prompts` |
| `prompts/get` | `Prompts` and `Prompter` | the `Prompter`'s result |
