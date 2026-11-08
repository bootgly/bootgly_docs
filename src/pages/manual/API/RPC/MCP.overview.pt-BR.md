# Servidor MCP

`Bootgly\API\RPC\MCP` é o núcleo de um servidor Model Context Protocol: ele responde o que um
cliente de IA pede — `initialize`, `ping`, as tools e, quando você as dá, resources e prompts —
sobre o dispatcher **[JSON-RPC](/manual/API/RPC/JSON/overview/)**. A sua aplicação fornece closures
que listam e executam as tools dela; a classe cuida do protocolo em volta delas. Como o
dispatcher, ela recebe um payload raw e devolve o JSON a enviar, então o transporte é seu — e o
que pertence a uma chamada, como a sessão ou a identidade do cliente, entra como o contexto dessa
chamada e chega a cada uma das suas closures como o último argumento dela.

## Um servidor com uma tool

Dê ao servidor um nome, uma versão, um `Lister` que retorna as tools e um `Caller` que executa
uma delas:

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

Um cliente abre a conversa com `initialize`. O servidor responde a revisão do protocolo que vai
falar, as capabilities, o `serverInfo` e, quando dadas, as `instructions` para o modelo do
cliente:

```php
echo $MCP->handle('{"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "Client", "version": "1.0"}}}');
// {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"Weather","version":"1.0.0"},"instructions":"Call forecast for any weather question."}}

var_dump($MCP->handle('{"jsonrpc": "2.0", "method": "notifications/initialized"}'));
// NULL
```

Depois ele lista as tools e as chama:

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

`tools/list` embrulha o que o `Lister` retorna como `tools`; `tools/call` envia o que o `Caller`
retorna como o resultado, sem mudança. Mantenha os dois tipos de falha separados:

- Uma tool que executou e falhou — argumentos ruins, uma API fora do ar — retorna um resultado
  com `isError: true`. O modelo o lê e pode tentar de novo.
- Uma chamada que o servidor não consegue rotear — uma tool desconhecida — lança um `JSON\Fault`,
  que vira um erro JSON-RPC.

O próprio `tools/call` recusa uma chamada sem um `name` string ou com `arguments` que não são um
objeto, com `-32602 Invalid params`. `arguments` ausentes chegam ao `Caller` como `[]`.

## Revisões do protocolo

`MCP::VERSIONS` guarda as revisões que o servidor fala, da mais nova para a mais antiga. Um
cliente que pede uma delas a recebe; qualquer outro pedido — uma revisão desconhecida, ou
nenhuma — recebe a mais nova. `MCP::negotiate()` faz essa escolha, e o `initialize` a usa:

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

## Sessões e identidade: o contexto

O servidor não guarda estado por cliente: o que pertence a um cliente — a sessão, a identidade
dele — é do transporte, e viaja com cada chamada como o contexto dela, o segundo argumento de
`handle()`. Toda closure que você dá o recebe como o último argumento: `Lister($context)`,
`Caller($name, $arguments, $context)`, `Initializer($revision, $params, $context)`, e assim por
diante (veja a **[Referência](#referência)**). Uma closure que não precisa dele deixa esse
parâmetro de fora.

### Guardar a revisão na sessão

A revisão acordada no `initialize` fica com o transporte. Passe um `Initializer` —
`fn (string $revision, array $params, mixed $context): void`. Ele é avisado da revisão
respondida no `initialize` e dos params do cliente, com o contexto da chamada — então ele os
guarda na sessão que recebe:

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

A sessão precisa ser um objeto (aqui um `ArrayObject`) para o `Initializer` escrever nela: um
array PHP passado como contexto é uma cópia. As mensagens seguintes dessa sessão podem então ser
conferidas contra a revisão guardada — por exemplo o header `MCP-Protocol-Version` que os
clientes Streamable HTTP enviam nas requisições depois do `initialize`, da revisão `2025-06-18`
em diante.

Não selecione a sessão por estado compartilhado no lugar disso — uma variável que as closures
capturam por referência, ou uma propriedade definida antes de cada `handle()`. Uma instância do
servidor atende todos os clientes de um worker, e as requisições deles se intercalam: enquanto
uma chamada espera I/O dentro de uma Fiber, outra requisição pode executar e sobrescrever esse
valor compartilhado, e a primeira chamada passa a escrever na sessão do outro cliente, ou a ler
dela. O contexto de uma chamada não muda debaixo dela.

### Autorizar pela identidade

A identidade funciona do mesmo jeito. Passe o principal autenticado como contexto, e deixe o
`Lister` mostrar, e o `Caller` executar, só o que esse chamador pode usar:

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

Quando as closures precisam dos dois, passe um objeto que guarde a sessão e a identidade. Sobre
HTTP, a rota entrega a `handle()` o `$Request->identity` — o principal que um guard de
autenticação expôs — ou um objeto assim, como faz a
**[receita HTTP](/manual/API/RPC/JSON/overview/#servir-sobre-http)** da página JSON-RPC.

## Resources e prompts

Resources e prompts são opcionais. Cada par só liga quando as duas closures dele são dadas:

- `Resources` (a lista) **e** `Reader` (ler um) adicionam `resources/list`,
  `resources/templates/list` e `resources/read`, e a capability `resources`. `Templates`, os
  templates de resource, é opcional: sem ele, `resources/templates/list` responde uma lista
  vazia.
- `Prompts` (a lista) **e** `Prompter` (montar um) adicionam `prompts/list` e `prompts/get`, e a
  capability `prompts`.

Dê só uma closure de um par e os métodos dele ficam de fora: o cliente recebe `Method not found`.

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

O servidor embrulha as listas — `resources`, `resourceTemplates`, `prompts` — e a resposta do
`Reader` como `contents`; o `Prompter` retorna o resultado inteiro do `prompts/get`
(`description`, `messages`). Para uma URI desconhecida, lance `MCP::RESOURCE_NOT_FOUND`; para um
prompt desconhecido ou argumentos faltando, `JSON::INVALID_PARAMS`. O próprio `resources/read`
recusa uma `uri` ausente ou vazia, e o `prompts/get` um `name` ausente ou `arguments` que não são
um objeto, com `-32602 Invalid params`.

## Resultados vazios

Um resultado MCP vazio é um objeto JSON na rede. Quando um método do protocolo ou uma das suas
closures retorna exatamente `[]` ou `null` como o resultado inteiro, o servidor envia `{}`. Só
esses dois valores mudam: qualquer outro resultado — `0`, `false`, uma string, uma lista não
vazia — é enviado como está:

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

Um resultado de `tools/call` ainda deve ser o objeto que o MCP define (`content`, `isError`): o
servidor não corrige um resultado que não é um. A regra cobre só o resultado inteiro. Um array vazio aninhado continua virando `[]`, então uma
tool sem argumentos declara os `properties` do schema dela como um `stdClass`:

```php
'inputSchema' => ['type' => 'object', 'properties' => new stdClass]
// "inputSchema":{"type":"object","properties":{}}
```

## Erros internos e batches

O servidor monta o dispatcher `JSON` dele com o seu `Reporter` e o seu `batch`, então eles
funcionam como na página **[JSON-RPC](/manual/API/RPC/JSON/overview/)**: um `Throwable` inesperado
em uma closure vira `-32603 Internal error` para o cliente e chega ao Reporter para os seus logs,
com o contexto da chamada — `fn (Throwable $Throwable, array $request, mixed $context): void`.

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
// no log:  MCP tools/call [c0ffee]: upstream API key rejected
// {"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"Internal error"}}
```

O Reporter não deve lançar: uma exceção que ele lança é descartada, então a resposta sai mesmo
assim.

Batches são aceitos até `batch` requisições (100 por padrão). A revisão MCP `2025-03-26` permite
batches JSON-RPC e as revisões seguintes os removeram; `batch: 0` recusa todo batch. O
`initialize` nunca é aceito dentro de um batch: um batch que o leva é recusado inteiro, antes de
qualquer método executar, com um único Invalid Request:

```php
echo $MCP->handle('[
   {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-03-26"}},
   {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}
]');
// {"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"Invalid Request"}}
```

`notifications/initialized` e `notifications/cancelled` são aceitas e não respondem nada.

## Transportes

O Bootgly traz os dois transportes MCP em volta deste núcleo, então a aplicação só escreve as
suas closures:

- **Streamable HTTP** — `Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\MCP`, um route handler:
  `$Router->route('/mcp', new MCP($Server), [GET, POST, DELETE])`. Ele emite e confere o
  `Mcp-Session-Id` (sessões compartilhadas entre workers, vinculadas ao principal autenticado),
  confere `MCP-Protocol-Version` e `Origin`, responde em JSON ou event stream conforme o
  `Accept`, e atende o stream de escuta via `GET` e o `DELETE`. O contexto de cada chamada é o
  `Request`. Veja **[MCP via HTTP](/manual/WPI/HTTP/HTTP_Server_CLI/MCP/overview/)**.
- **stdio** — `Bootgly\CLI\MCP`, para um servidor que o cliente MCP inicia como processo filho:
  uma mensagem por linha no stdin, uma resposta por linha no stdout, todo o resto no stderr.
  Veja **[MCP via stdio](/manual/CLI/MCP/overview/)**.

## O que fica de fora

A classe é só o núcleo do protocolo. A aplicação, ou o transporte em volta dela, cuida de:

- **O transporte.** Streamable HTTP ou stdio: ler mensagens, escrever respostas e as regras do
  próprio transporte (ids de sessão, conferência de `Origin`, streams) — os
  **[transportes](#transportes)** acima fazem isso. `handle()` retorna `null` quando nada é
  devido — um transporte HTTP responde `202`, o stdio não escreve nada.
- **Sessões.** O servidor não guarda estado por cliente; passe a sessão do transporte como o
  contexto, e deixe o `Initializer` guardar a revisão nela.
- **Autenticação e autorização.** Confira quem está chamando antes de o payload chegar a
  `handle()`, passe essa identidade como o contexto, e decida dentro do `Lister` e do `Caller`
  quais tools esse chamador pode ver e executar.

Como não guarda estado por cliente, uma instância pode servir todos os clientes de um worker.

## Referência

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

Cria o servidor e o dispatcher `JSON` dele. `$name` e `$version` são enviados como `serverInfo`;
`$instructions`, quando dado, como `instructions`. As closures — cada uma recebe o `$context` da
chamada como o último argumento, e pode deixá-lo de fora:

| Closure | Formato | Responde |
|---|---|---|
| `Lister` | `fn (mixed $context): array` | As tools, cada uma `['name' => …, 'description' => …, 'inputSchema' => …]`; enviadas como `tools`. |
| `Caller` | `fn (string $name, array $arguments, mixed $context): mixed` | O resultado do `tools/call` (`content`, `isError`). |
| `Resources` | `fn (mixed $context): array` | Os resources (`uri`, `name`, …); enviados como `resources`. Precisa do `Reader`. |
| `Templates` | `fn (mixed $context): array` | Os templates de resource (`uriTemplate`, …); enviados como `resourceTemplates`. |
| `Reader` | `fn (string $URI, mixed $context): array` | O conteúdo de um resource; enviado como `contents`. Precisa de `Resources`. |
| `Prompts` | `fn (mixed $context): array` | Os prompts (`name`, `arguments`, …); enviados como `prompts`. Precisa do `Prompter`. |
| `Prompter` | `fn (string $name, array $arguments, mixed $context): mixed` | O resultado do `prompts/get` (`messages`, …). Precisa de `Prompts`. |
| `Initializer` | `fn (string $revision, array $params, mixed $context): void` | Avisado da revisão acordada e dos params do cliente no `initialize`, para guardar na sessão que recebe. |

`$Reporter` e `$batch` são passados ao dispatcher `JSON` sem mudança — o Reporter é chamado como
`fn (Throwable $Throwable, array $request, mixed $context): void` e não deve lançar; um `$batch`
negativo lança `InvalidArgumentException`.

```php
public function handle (string $payload, mixed $context = null): null|string
```

Responde um payload MCP raw (JSON-RPC 2.0). `$context` é o que pertence a esta chamada — a sessão
do cliente, a identidade dele — e é entregue a toda closure da aplicação e ao Reporter; nada dele
é guardado. Retorna a resposta JSON, ou `null` quando só chegaram notificações. Um resultado `[]`
ou `null` é enviado como `{}`; um batch que leva `initialize` responde um único Invalid Request e
não executa nenhum método.

```php
public static function negotiate (mixed $requested): string
```

Retorna a revisão a falar para o `protocolVersion` que um cliente enviou: a mesma quando ela está
em `MCP::VERSIONS`, a mais nova caso contrário.

```php
public const array VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
```

As revisões do protocolo que este servidor fala, da mais nova para a mais antiga.

```php
public const int RESOURCE_NOT_FOUND = -32002;
```

O código de erro do MCP para uma URI de resource desconhecida, para o `Reader` lançar em um
`JSON\Fault`.

```php
public private(set) string $name;
```

O nome do servidor, enviado como `serverInfo.name`.

```php
public private(set) string $version;
```

A versão do servidor, enviada como `serverInfo.version`.

```php
public private(set) null|string $instructions;
```

As instruções enviadas no `initialize`, ou `null` quando nenhuma foi dada.

```php
public private(set) JSON $JSON;
```

O dispatcher JSON-RPC em que os métodos do protocolo são registrados, para introspecção — por
exemplo, `$MCP->JSON->batch` é o limite de batch. Responda payloads pelo `$MCP->handle()`, nunca
pelo `$MCP->JSON->handle()`: só o primeiro recusa o que o MCP proíbe, como `initialize` dentro de
um batch.

### Métodos respondidos

| Método | Presente | Resultado |
|---|---|---|
| `initialize` | sempre | `protocolVersion`, `capabilities`, `serverInfo`, `instructions` |
| `notifications/initialized` | sempre | nada (notificação) |
| `notifications/cancelled` | sempre | nada (notificação) |
| `ping` | sempre | `{}` |
| `tools/list` | sempre | `tools` |
| `tools/call` | sempre | o resultado do `Caller` |
| `resources/list` | `Resources` e `Reader` | `resources` |
| `resources/templates/list` | `Resources` e `Reader` | `resourceTemplates` |
| `resources/read` | `Resources` e `Reader` | `contents` |
| `prompts/list` | `Prompts` e `Prompter` | `prompts` |
| `prompts/get` | `Prompts` e `Prompter` | o resultado do `Prompter` |
