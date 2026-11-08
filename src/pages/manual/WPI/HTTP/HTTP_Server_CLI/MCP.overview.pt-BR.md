# MCP via HTTP

`Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\MCP` coloca um **[servidor MCP](/manual/API/RPC/MCP/overview/)**
em uma rota do servidor HTTP, falando o transporte **Streamable HTTP** do Model Context Protocol:
o cliente faz `POST` de mensagens JSON-RPC, recebe JSON (ou um event stream) de volta, mantém uma
sessão pelo header `Mcp-Session-Id`, pode ficar escutando um stream via `GET` e encerra a sessão
com `DELETE`. Sessões, regras de headers, negociação do `Accept` e a verificação do `Origin` ficam
por conta do transporte; o seu código só escreve as tools.

## Servir MCP numa rota

Monte o núcleo do servidor com as suas tools, envolva-o no transporte e roteie `GET`, `POST` e
`DELETE` de um path para ele:

```php
use Bootgly\API\RPC;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Response;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\MCP;

return static function (Request $Request, Response $Response, Router $Router): Generator
{
   $Server = new RPC\MCP(
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
      Caller: fn (string $name, array $arguments): array => [
         'content' => [['type' => 'text', 'text' => "Sunny in {$arguments['city']}, 24 °C."]],
         'isError' => false
      ]
   );

   yield $Router->route('/mcp', new MCP($Server), [GET, POST, DELETE]);
};
```

O núcleo e o transporte são criados uma vez por worker e atendem todos os clientes dele. Aponte um
cliente MCP para `http://localhost:8080/mcp` (Streamable HTTP) e ele já consegue listar e chamar
`forecast`.

A classe se chama `MCP`, assim como o núcleo do servidor. Importe o namespace do núcleo em vez da
classe — `use Bootgly\API\RPC;` e `new RPC\MCP(…)` — e os dois nomes ficam livres de aliases.

## Uma sessão, passo a passo

`initialize` abre a sessão: a resposta traz um `Mcp-Session-Id` novo, que o cliente envia em
todos os requests seguintes.

```bash
curl -i http://localhost:8080/mcp \
   -H 'Content-Type: application/json' \
   -H 'Accept: application/json, text/event-stream' \
   -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"curl","version":"1"}}}'
# HTTP/1.1 200 OK
# Mcp-Session-Id: 4f0c5b8e2d7a91c3e6b0a4d2f8c1e937
# Content-Type: application/json
# …
# {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"Weather","version":"1.0.0"}}}
```

Em seguida o cliente confirma que está pronto — uma notificação, então a resposta é
`202 Accepted` sem corpo — e passa a trabalhar com as tools:

```bash
curl -i http://localhost:8080/mcp \
   -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
   -H 'Mcp-Session-Id: 4f0c5b8e2d7a91c3e6b0a4d2f8c1e937' -H 'MCP-Protocol-Version: 2025-06-18' \
   -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'
# HTTP/1.1 202 Accepted

curl http://localhost:8080/mcp \
   -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
   -H 'Mcp-Session-Id: 4f0c5b8e2d7a91c3e6b0a4d2f8c1e937' -H 'MCP-Protocol-Version: 2025-06-18' \
   -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"forecast","arguments":{"city":"Lisbon"}}}'
# {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text","text":"Sunny in Lisbon, 24 °C."}],"isError":false}}
```

Por fim, ele encerra a sessão:

```bash
curl -i -X DELETE http://localhost:8080/mcp -H 'Mcp-Session-Id: 4f0c5b8e2d7a91c3e6b0a4d2f8c1e937'
# HTTP/1.1 204 No Content
```

## Sessões

- O id tem 128 bits aleatórios (32 caracteres hexadecimais minúsculos) e só é emitido por um
  `initialize` bem-sucedido. Um id que o cliente envie no `initialize` é ignorado — nunca adotado.
- Todo outro request precisa carregá-lo: sem ele, a resposta é `400`; com um id malformado,
  desconhecido, encerrado, expirado ou aberto por outro principal (veja abaixo), `404`. Um
  cliente que recebe `404` recomeça com `initialize`.
- `MCP-Protocol-Version`, quando o cliente o envia, precisa ser igual à revisão acordada no
  `initialize`; qualquer outro valor é `400`. Um cliente que não o envia (revisão `2025-03-26`)
  é atendido.
- Uma sessão expira depois de `TTL` segundos sem request (`3600` por padrão); cada request a
  renova. Até o primeiro request depois do `initialize` ela é provisória e dura no máximo 60
  segundos, então sessões que um cliente abre e nunca usa saem do armazenamento em um minuto.

As sessões ficam num **[Cache](/guide/cache/overview/)** da ABI. Por padrão é um segmento de
memória compartilhada de 1 MiB só delas no host (o driver `shared`, com chaves prefixadas por `mcp:`) —
nunca o segmento que outros caches, como o RateLimit, compartilham —, então uma sessão aberta
num worker é retomada em qualquer outro worker do mesmo host. Quando os workers estão
espalhados por vários hosts, dê ao transporte um Cache que todos eles alcancem:

```php
use Bootgly\ABI\Resources\Cache;

$MCP = new MCP(
   $Server,
   Cache: new Cache(['driver' => 'redis', 'host' => '10.0.0.5', 'prefix' => 'mcp:']),
   TTL: 900
);
```

O segmento de memória compartilhada tem tamanho fixo (1 MiB, cerca de 3.500 sessões), e
`initialize` é o único request que dispensa sessão. Quando o armazenamento não comporta mais
uma sessão, o `initialize` é respondido com `503`. Varrer as sessões expiradas de um
armazenamento cheio segura o lock dele — e trava todo worker que o lê nesse meio-tempo —, então
um armazenamento é varrido por um worker de cada vez, no máximo uma vez a cada 4 a 5 segundos, e
o `initialize` volta a ser atendido assim que uma varredura libera espaço. Nada mais o varre: os
streams abertos ficam dentro dos registros de sessão e nunca acrescentam uma entrada ao
armazenamento. Um cliente que continua enviando `initialize`
sem usá-los consegue manter o armazenamento cheio, e as sessões novas recusadas, enquanto
continuar: num endpoint aberto a clientes não confiáveis, coloque um guard de autenticação e um
**[RateLimit](/manual/WPI/HTTP/HTTP_Server_CLI/Middlewares/overview/)** na frente da rota. Um
cliente com direito a 60 requests por minuto mantém no máximo cerca de 60 sessões que nunca usa,
então cerca de 60 clientes assim lotam o armazenamento. Uma sessão usada vive o `TTL` inteiro,
então dimensione o `TTL` pelo tempo que seus clientes realmente ficam ociosos. Para mais
sessões, dê ao transporte um Cache Redis em vez de um segmento compartilhado maior: o custo da
varredura cresce com o quadrado do tamanho do segmento. Um segmento mantém o tamanho com que foi
criado até ser removido (`ipcrm`) ou o host reiniciar.

## Quem está chamando

Coloque um guard de autenticação na frente da rota. O transporte vincula cada sessão ao
principal que a abriu — `$Request->identity`, do jeito que o guard o expôs —, então um session id
sozinho não pode ser reaproveitado por outro usuário: um request para essa sessão vindo de
qualquer outra pessoa é `404`.

```php
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authenticating;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Router\Middlewares\Authentication\Bearer;

$Guard = new Authentication(new Authenticating(
   new Bearer(Resolver: fn (string $token): null|string => Tokens::find($token)?->user)
));

yield $Router->route('/mcp', new MCP($Server), [GET, POST, DELETE], middlewares: [$Guard]);
```

O principal é comparado por fingerprint (SHA-256): uma `API\Security\Identity` pelo seu `id`, uma
identity string ou inteira pelo seu valor, qualquer outro valor pela sua forma serializada, e a
ausência de identity como o principal anônimo.

Cada chamada chega às suas closures com o **`Request`** como contexto — o último argumento do
`Lister`, do `Caller` e dos demais —, então uma tool consegue ler quem está chamando:

```php
use Bootgly\API\Security\Identity;
use Bootgly\WPI\Nodes\HTTP_Server_CLI\Request;

$Server = new RPC\MCP(
   name: 'Orders',
   version: '1.0.0',
   Lister: fn (Request $Request): array => $Request->identity instanceof Identity
      && $Request->identity->check('orders:write') ? [/* … */] : [],
   Caller: function (string $name, array $arguments, Request $Request): array {
      // ? Verifique quem está chamando de novo a cada chamada
      // …
   }
);
```

A chamada roda como **[trabalho deferred](/manual/WPI/HTTP/HTTP_Server_CLI/Response/overview/)**:
uma tool pode aguardar I/O assíncrono — um pool de banco de dados, um cliente HTTP — sem bloquear
o worker. O `Request` que ela recebe é o snapshot desse trabalho.

Para que um cliente de navegador (ou o MCP Inspector) consiga ler os headers de sessão e de
challenge, adicione o middleware `CORS` expondo `Mcp-Session-Id`, como em
**[Protegendo um endpoint MCP](/manual/WPI/HTTP/HTTP_Server_CLI/Authentication/overview/)**.

## Respostas: JSON ou stream

Um `POST` precisa ser `Content-Type: application/json` (senão, `415`) e caber em `body` bytes
(`1048576` por padrão; senão, `413`). O formato da resposta segue o `Accept` do cliente:

| `Accept` | Resposta |
|---|---|
| `application/json` (ou `*/*`, ou sem `Accept`) | `200`, `Content-Type: application/json` |
| `text/event-stream` | `200`, um evento `message` com a resposta, e então o stream termina |
| ambos | o que o cliente preferir (`q`); em caso de empate, o primeiro listado |
| nenhum dos dois | `406` |

Um corpo só com notificações é respondido com `202 Accepted`, sem corpo. Em HTTP/1.0 a resposta
não pode ser enviada como stream: ela é JSON quando o cliente aceita JSON, e `406` caso
contrário.

## O stream de escuta

Um `GET` com `Accept: text/event-stream` e o session id abre o stream de escuta da sessão: um
`text/event-stream` que fica aberto, mantido vivo por comentários de heartbeat. O núcleo do
servidor não envia mensagens iniciadas pelo servidor, então hoje o stream não carrega mais nada;
ele fecha quando o cliente sai ou em cerca de cinco segundos depois que a sessão termina.

Uma sessão pode manter até `streams` streams abertos ao mesmo tempo (`1` por padrão), contados
entre todos os workers; um a mais é `409 Conflict`. Cada vaga é mantida num lease de 15
segundos que o stream aberto renova, então um stream cortado sem fechar (um worker morto, o
servidor reiniciado, um cliente que sumiu) libera a vaga em até 15 segundos. As vagas ficam no registro da sessão, então um armazenamento
cheio demais para comportar mais uma vaga responde o `GET` com `503`. Com `streams: 0`, o
endpoint fica só JSON e responde `GET` com `405`; um `GET` em HTTP/1.0 é `505`, pois essa versão
não mantém um stream aberto.

## Navegadores e DNS rebinding

Uma página web maliciosa pode fazer o navegador de quem a visita enviar requests a um servidor na
máquina ou na rede dessa pessoa — por exemplo, fazendo o rebinding do próprio nome de domínio para
`127.0.0.1`. Navegadores sempre enviam um header `Origin` nesses requests `POST` e `DELETE`, então
o transporte o verifica em todo request:

- um `Origin` que está em `origins` é atendido;
- qualquer outro `Origin` — inclusive `null` e o próprio `Host` do servidor — é recusado com `403`;
- um request sem `Origin` é atendido: ele vem de um cliente que não é navegador (uma IDE, uma CLI,
  um SDK), e um `GET` ainda precisa de um session id.

`origins` é uma allowlist explícita de origins serializados, `scheme://host[:port]`; ela nunca é
derivada do request, porque o `Origin` de uma página de rebinding bate com o `Host` que ela mira.
Deixe-a vazia quando nenhum navegador deve chamar o endpoint:

```php
$MCP = new MCP($Server, origins: ['https://app.example.com', 'http://localhost:6274']);
```

Para um servidor usado só por clientes locais, faça também o bind em `127.0.0.1` em vez de
`0.0.0.0` e liste os nomes a que ele responde em
**[`Request::$allowedHosts`](/manual/WPI/HTTP/HTTP_Server_CLI/Request/overview/)**.

## Recusas

Toda recusa carrega um erro JSON-RPC sem `id`, com código `-32000` e uma mensagem que diz o
motivo:

```json
{"jsonrpc":"2.0","id":null,"error":{"code":-32000,"message":"Bad Request: Mcp-Session-Id header is required"}}
```

| Status | Quando |
|---|---|
| `400` | Sem `Mcp-Session-Id` depois do `initialize`; `MCP-Protocol-Version` diferente da revisão acordada |
| `403` | Um `Origin` fora de `origins` |
| `404` | Uma sessão malformada, desconhecida, encerrada ou expirada — ou de outro principal |
| `405` | Um método que não seja `GET`, `POST`, `DELETE`; `GET` com `streams: 0` (o `Allow` lista os métodos) |
| `406` | Um `Accept` que exclui os dois formatos de resposta (`POST`) ou o event stream (`GET`); um `POST` em HTTP/1.0 que só aceita stream |
| `409` | Um stream de escuta a mais do que `streams` |
| `413` | Um corpo maior que `body` |
| `415` | Um corpo de `POST` que não é `application/json` |
| `503` | O armazenamento de sessões não comporta uma sessão nova (`initialize`) ou uma nova vaga de stream (`GET`) |

## Referência

```php
public function __construct (
   RPC\MCP $Server,
   array $origins = [],
   null|Cache $Cache = null,
   int $TTL = 3600,
   int $body = 1_048_576,
   int $streams = 1
)
```

Cria o transporte para um núcleo de servidor. `$origins` são os origins de navegador autorizados
a chamar (`scheme://host[:port]`, normalizados em minúsculas e sem barra final); `$Cache` é o
armazenamento de sessões (por padrão, um Cache `shared` num segmento de 1 MiB só dele, com
chaves prefixadas por `mcp:`); `$TTL`, os segundos que uma sessão sobrevive sem request (uma sessão
ainda não retomada dura no máximo 60); `$body`, o maior corpo de request em
bytes; `$streams`, quantos streams de escuta uma sessão pode manter abertos (`0` desabilita o
`GET`). Lança `InvalidArgumentException` para um origin com path, wildcard ou sem scheme, para
`$TTL` ou `$body` abaixo de `1` e para `$streams` negativo.

```php
public function __invoke (Request $Request, Response $Response): Response
```

Responde a um request ao endpoint — o transporte é o próprio handler da rota. `POST` passa a
mensagem pelo núcleo do servidor como trabalho deferred; `GET` abre o stream de escuta; `DELETE`
encerra a sessão.

```php
public private(set) RPC\MCP $Server;
```

O núcleo de servidor que este endpoint aciona.

```php
public private(set) array $origins;
```

Os origins de navegador autorizados, normalizados.

```php
public private(set) int $TTL;
```

Segundos que uma sessão sobrevive sem request.

```php
public private(set) int $body;
```

O maior corpo de request aceito, em bytes.

```php
public private(set) int $streams;
```

Streams de escuta que uma sessão pode manter abertos ao mesmo tempo.

```php
public const int TRANSPORT_ERROR = -32000;
```

O código de erro JSON-RPC de toda recusa do transporte.
