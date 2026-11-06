# JSON-RPC

`Bootgly\API\RPC\JSON` é um dispatcher JSON-RPC 2.0. Você registra métodos por nome; ele recebe
um payload raw e devolve o JSON a enviar — requisições únicas, batches e notificações, com os
códigos de erro padrão. Ele nunca lê um socket nem escreve um header: a mesma instância responde
por uma rota HTTP, um WebSocket ou o stdio, e o transporte decide como a resposta sai.

## Registrar métodos e responder um payload

Um método é uma closure `fn (array $params, mixed $context): mixed`, registrada sob o nome que os
clientes chamam. Um método que não precisa do contexto da chamada (veja
**[Contexto por chamada](#contexto-por-chamada)**) deixa esse parâmetro de fora — uma closure pode,
porque o PHP descarta o argumento extra. Uma função do PHP não: registre
`fn (array $params) => array_sum($params)`, não `array_sum(...)`, que recusa o segundo argumento:

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

`handle()` decodifica o payload, executa o método e codifica o objeto de resposta com o `id` da
requisição. O id volta como o PHP o decodificou: uma string, um inteiro ou `null` voltam como
foram enviados, mas um inteiro além de `PHP_INT_MAX` ou um id fracionário é um float, e pode não
voltar dígito por dígito:

```php
echo $RPC->handle('{"jsonrpc": "2.0", "id": 9223372036854775808, "method": "sum", "params": [1]}');
// {"jsonrpc":"2.0","id":9.223372036854776e+18,"result":1}

echo $RPC->handle('{"jsonrpc": "2.0", "id": "9223372036854775808", "method": "sum", "params": [1]}');
// {"jsonrpc":"2.0","id":"9223372036854775808","result":1}
```

Clientes que precisam de ids grandes devem enviá-los como strings; a especificação desaconselha
ids fracionários.

## Params e resultados

Os params chegam decodificados como arrays PHP, qualquer que seja o formato JSON deles: um objeto
JSON vira um array associativo, um array JSON vira uma lista, e `params` ausentes chegam como
`[]`. Um objeto vazio `{}` também chega como `[]`, então não dá para distingui-lo de uma lista
vazia:

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

O valor retornado é codificado como o `result`. Um array PHP vazio vira `[]`; quando o cliente
precisa receber um objeto vazio, retorne um `stdClass`:

```php
echo $RPC->handle('{"jsonrpc": "2.0", "id": 5, "method": "settings"}');
// {"jsonrpc":"2.0","id":5,"result":{}}

echo $RPC->handle('{"jsonrpc": "2.0", "id": 6, "method": "tags"}');
// {"jsonrpc":"2.0","id":6,"result":[]}
```

## Notificações e batches

Uma requisição sem `id` é uma notificação: o método executa e nada é respondido — nem mesmo um
erro. Quando só chegaram notificações, `handle()` retorna `null`:

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

Um array JSON de objetos de requisição é um batch. Cada um executa em ordem, e a resposta é um
array com uma resposta por requisição que tem `id` — notificações não deixam entrada:

```php
echo $RPC->handle('[
   {"jsonrpc": "2.0", "id": 1, "method": "sum", "params": [1, 2]},
   {"jsonrpc": "2.0", "method": "track", "params": {"event": "summed"}},
   {"jsonrpc": "2.0", "id": 2, "method": "missing"}
]');
// [{"jsonrpc":"2.0","id":1,"result":3},{"jsonrpc":"2.0","id":2,"error":{"code":-32601,"message":"Method not found"}}]
```

Um batch feito só de notificações retorna `null`, como uma notificação única. Então `null` sempre
significa "nada é devido": um transporte HTTP o responde com `202 Accepted` e sem corpo, um
transporte stdio não escreve nada.

Um payload só é um batch quando o primeiro caractere depois de qualquer espaço em branco (espaço,
tab, line feed, carriage return) é `[`. Um objeto JSON é sempre uma requisição, quaisquer que
sejam as chaves dele — um objeto com chaves `"0"`, `"1"`… não é um batch, então é um Invalid
Request:

```php
echo $RPC->handle('{"0": {"jsonrpc": "2.0", "id": 1, "method": "sum", "params": [1, 2]}}');
// {"jsonrpc":"2.0","id":null,"error":{"code":-32600,"message":"Invalid Request"}}
```

## Erros padrão

O dispatcher responde sozinho ao tráfego malformado, com os códigos da especificação (também
disponíveis como constantes de `JSON`):

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

Um objeto de requisição precisa de `"jsonrpc": "2.0"` e de um `method` string; `params`, quando
presente, precisa ser um objeto ou um array. Um id que não é string, número nem `null` é um
Invalid Request com `id: null` — assim como um número além do alcance do float, como `1e999`, que
o PHP decodifica como `INF` e não poderia ser devolvido.

## Erros planejados com Fault

Quando um método recusa uma chamada de propósito, ele lança `JSON\Fault` com um código, uma
mensagem e dados opcionais. Os três chegam ao cliente como o `error` da resposta:

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

O dispatcher só confere que `params` é estruturado; conferir o que tem dentro é trabalho do
método, e `JSON::INVALID_PARAMS` é o código para isso. Para erros da sua própria aplicação, escolha
códigos fora de `-32768..-32000`, a faixa que a especificação reserva. `data` fica fora do erro
quando é `null`.

## Contexto por chamada

O que pertence a uma chamada — a sessão do cliente, a identidade dele, um id de trace para os
seus logs — viaja como o contexto dessa chamada: o segundo argumento de `handle()`. O dispatcher
o entrega a todo método que executa para aquele payload, como o segundo argumento do método, e ao
Reporter. Ele não guarda nada: o contexto só vive enquanto a chamada dura.

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

Toda requisição de um batch recebe o mesmo contexto. Sem um, o contexto é `null`.

O contexto é o único jeito seguro de levar estado por cliente. Um dispatcher atende todas as
requisições de um worker, e essas requisições se intercalam: um método que espera I/O dentro de
uma Fiber deixa outra requisição executar antes de retomar. Um valor que o transporte escreve em
uma variável compartilhada — uma propriedade, ou uma variável que os métodos capturam por
referência — antes de chamar `handle()` pode ser sobrescrito pela próxima requisição enquanto a
primeira ainda executa, e a primeira passa a ler a sessão do segundo cliente. O contexto de uma
chamada não muda debaixo dela.

## Erros internos ficam escondidos

Qualquer outra coisa que um método lance é uma falha interna. O cliente recebe
`-32603 Internal error` para o mesmo id, e nada da exceção: nem mensagem, nem classe, nem trace.
Para guardar essas falhas nos seus logs, passe um Reporter —
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
// no log:  RPC balance [req-7f3a]: RuntimeException: connection to 10.0.0.5:5432 refused
// {"jsonrpc":"2.0","id":1,"error":{"code":-32603,"message":"Internal error"}}

echo $RPC->handle('{"jsonrpc": "2.0", "id": 2, "method": "label"}', ['trace' => 'req-7f3b']);
// no log:  RPC label [req-7f3b]: JsonException: Malformed UTF-8 characters, possibly incorrectly encoded
// {"jsonrpc":"2.0","id":2,"error":{"code":-32603,"message":"Internal error"}}
```

O Reporter é chamado em duas falhas: um `Throwable` inesperado de um método, e uma resposta que
não pode ser codificada — UTF-8 inválido, um resource, uma estrutura recursiva, ou um
`jsonSerialize()` ou property hook que lança durante a codificação. Essa resposta é trocada por
um Internal error para o mesmo id. O Reporter recebe o objeto de requisição de onde a falha veio
e o contexto da chamada. Um `Fault` nunca é reportado: ele é a resposta que você planejou. Sem
Reporter, as falhas internas são apenas escondidas.

O Reporter não deve lançar. Uma exceção que ele lança é descartada, então a resposta sai mesmo
assim — e um batch ainda executa as requisições restantes —, mas a falha que ele reportava se
perde.

## Limitar batches

Um batch pode levar no máximo `batch` requisições — 100 por padrão. Um batch maior é recusado
inteiro, antes de qualquer método executar, com um único Invalid Request e `id: null`:

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

`batch: 0` recusa todo batch, enquanto as requisições únicas continuam funcionando. Um limite
negativo lança `InvalidArgumentException` no construtor. Dimensione o limite pelo que um payload
pode custar a você: cada requisição de um batch executa dentro da mesma chamada de `handle()`.

## Servir sobre HTTP

O dispatcher não guarda estado por requisição, então construa-o uma vez e deixe toda requisição
do worker compartilhá-lo. Em um conjunto de rotas do `HTTP_Server_CLI`, construa-o no escopo do
arquivo — o arquivo executa uma vez, quando o
**[Router](/manual/WPI/HTTP/HTTP_Server_CLI/Router/overview/)** o carrega — e entregue o corpo raw
a `handle()`, com o que pertence à requisição como o contexto:

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

`$Request->input` é o corpo raw (veja **[Request](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/)**).
`$Request->identity` é o principal que um guard de autenticação expôs — `null` nesta rota, que
não tem nenhum, então `whoami` responde `guest` (veja
**[Autenticação](/manual/WPI/HTTP/HTTP_Server_CLI/Authentication/overview/)**). Passe
`$Request->Session` no lugar, ou um objeto que guarde os dois, quando os métodos precisam da
sessão.

O que um guard expõe depende do guard: o `JWT`, uma `Identity`; o `Bearer` e o `Basic`, o que o
resolver deles devolve — o token raw ou o nome de usuário quando devolve `true`; os guards de sessão,
o valor guardado. Verifique o que o seu guard entrega e nunca registre o contexto como está no log:
ele pode conter um bearer token.
Erros de protocolo — Parse error, Invalid Request — também são respostas JSON-RPC, então também
saem como `200` com o objeto de erro deles. Autenticação, CORS e limites de taxa pertencem à rota,
com os **[Middlewares](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/overview/)** do servidor; o
dispatcher só fala JSON-RPC.

## Referência

### JSON

```php
public function __construct (array $Methods, null|Closure $Reporter = null, int $batch = 100)
```

Cria um dispatcher. `$Methods` mapeia o nome de cada método para
`fn (array $params, mixed $context): mixed`. `$Reporter`, quando dado, é chamado como
`fn (Throwable $Throwable, array $request, mixed $context): void` com toda falha interna — um
`Throwable` inesperado de um método, ou uma resposta que não pode ser codificada —, o objeto de
requisição de onde ela veio e o contexto da chamada; ele não deve lançar, já que uma exceção que
ele lança é descartada. `$batch` é o máximo de requisições que um batch pode levar (`0` recusa
todo batch). Lança `InvalidArgumentException` quando `$batch` é negativo.

```php
public function handle (string $payload, mixed $context = null): null|string
```

Responde um payload JSON-RPC raw: um objeto de requisição ou um batch deles. `$context` é
entregue a todo método executado para o payload e ao Reporter. Retorna a resposta JSON — um
objeto, ou um array para um batch — ou `null` quando só chegaram notificações. O payload só é um
batch quando o primeiro caractere que não é espaço em branco é `[`. JSON inválido responde um
Parse error; um batch além do limite responde um único Invalid Request com `id: null`; um array
vazio `[]` é um Invalid Request.

```php
public function execute (mixed $request, mixed $context = null): null|array
```

Executa um objeto de requisição já decodificado, como `json_decode()` com `associative: true` o
retorna, entregando `$context` ao método e ao Reporter. Retorna o objeto de resposta como array — `['jsonrpc' => '2.0', 'id' => …, 'result' => …]`,
ou com `error` no lugar de `result` — ou `null` para uma notificação. Ele não codifica a resposta
e não trata uma lista como batch (uma lista é um Invalid Request): as duas coisas pertencem a
`handle()`.

```php
public private(set) int $batch;
```

O limite de batch dado ao construtor: o máximo de requisições que um batch pode levar.

| Constante | Código | Significado |
|---|---|---|
| `JSON::PARSE_ERROR` | `-32700` | O payload não é JSON válido. |
| `JSON::INVALID_REQUEST` | `-32600` | Não é um objeto de requisição válido — ou é um batch recusado. |
| `JSON::METHOD_NOT_FOUND` | `-32601` | Nenhum método está registrado com esse nome. |
| `JSON::INVALID_PARAMS` | `-32602` | `params` não é objeto nem array, ou um método o recusou. |
| `JSON::INTERNAL_ERROR` | `-32603` | Uma falha interna; o cliente não vê nada dela. |

### JSON\Fault

```php
public function __construct (int $code, string $message, mixed $data = null)
```

Um erro planejado, lançado por um método: o `$code`, a `$message` e os `$data` dele chegam ao
cliente como o `error` da resposta. `Fault` estende `RuntimeException`, então `getCode()` e
`getMessage()` retornam o código e a mensagem. Use um código padrão como `JSON::INVALID_PARAMS`,
ou um código de aplicação fora de `-32768..-32000`.

```php
public private(set) mixed $data;
```

O detalhe estruturado opcional, enviado como `error.data`; o membro fica de fora quando é `null`.
