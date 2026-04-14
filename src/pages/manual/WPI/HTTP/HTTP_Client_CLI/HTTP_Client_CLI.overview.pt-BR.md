# HTTP Client CLI

O HTTP Client CLI é o cliente HTTP nativo do Bootgly PHP Framework. Ele é construído sobre a infraestrutura do TCP Client CLI com uma arquitetura totalmente event-driven e non-blocking — 100% PHP puro, sem cURL, sem extensões.

## Recursos

| Recurso | Descrição |
|---|---|
| **Métodos HTTP** | GET, POST, PUT, DELETE, PATCH, HEAD, OPTIONS |
| **Decodificação RFC 9112** | Chunked transfer-encoding, content-length, close-delimited |
| **100-Continue** | Requisição em duas fases: headers primeiro, body após aceitação do servidor |
| **1xx Informacional** | Tratamento completo de respostas informacionais |
| **Codificação do Body** | Raw, JSON, form-urlencoded |
| **Headers** | Headers de resposta multi-valor, trimming de OWS por RFC 7230 |
| **Keep-Alive** | Reutilização automática de conexão (`Connection: keep-alive`) |
| **Pipelining** | Enfileirar múltiplas requisições por conexão |
| **Modo Batch** | `batch()` + múltiplos `request()` + `drain()` |
| **Event-Driven** | Modo async via hooks `on()` com rastreamento de requisição por socket |
| **SSL/TLS** | Suporte completo a HTTPS |
| **Redirects** | Seguimento automático até limite configurável |
| **Timeouts** | Timeout de conexão e de resposta |
| **Retries** | Retry automático em falha (métodos idempotentes) |
| **Multi-Worker** | Geração de carga baseada em fork para benchmarking |

## Início Rápido

### Requisição GET Simples

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI;


$Client = new HTTP_Client_CLI;
$Client->configure(host: 'example.com', port: 80);

$Response = $Client->request(method: 'GET', URI: '/');

echo $Response->code;   // 200
echo $Response->body;   // '<!doctype html>...'
```

### POST com Body JSON

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI;


$Client = new HTTP_Client_CLI;
$Client->configure(host: 'api.example.com', port: 443, ssl: []);

$Response = $Client->request(
   method: 'POST',
   URI: '/users',
   headers: ['Accept' => 'application/json'],
   body: ['name' => 'Bootgly', 'role' => 'framework']
);

echo $Response->code;                       // 201
$data = $Response->Body->decode('json');     // ['id' => 1, ...]
```

### POST com Dados de Formulário

```php
$Response = $Client->request(
   method: 'POST',
   URI: '/login',
   headers: ['Content-Type' => 'application/x-www-form-urlencoded'],
   body: 'username=admin&password=secret'
);
```

## Configuração

O método `configure()` aceita os seguintes parâmetros:

| Parâmetro | Tipo | Padrão | Descrição |
|---|---|---|---|
| `host` | `string` | — | Host alvo para conexão. |
| `port` | `int` | — | Porta alvo. |
| `workers` | `int` | `0` | Número de processos worker (para benchmarking). |
| `ssl` | `array\|null` | `null` | Opções de contexto de stream SSL. Use `[]` para TLS padrão. Auto-configura `peer_name` para verificação de hostname. |

### Propriedades do Client

| Propriedade | Tipo | Padrão | Descrição |
|---|---|---|---|
| `maxRedirects` | `int` | `10` | Máximo de redirects a seguir (0 = desabilitado). |
| `connectTimeout` | `int\|float` | `30` | Timeout de conexão em segundos. |
| `timeout` | `int\|float` | `30` | Timeout de resposta em segundos. |
| `maxRetries` | `int` | `0` | Máximo de retries em falha (0 = desabilitado). |
| `retryDelay` | `int\|float` | `1.0` | Delay entre retries em segundos. |

```php
$Client = new HTTP_Client_CLI;
$Client->configure(host: 'api.example.com', port: 443, ssl: []);

// ? Configure
$Client->maxRedirects = 5;
$Client->timeout = 10;
$Client->maxRetries = 3;
$Client->retryDelay = 0.5;
```

## SSL/TLS (HTTPS)

Ative HTTPS passando o parâmetro `ssl` para `configure()`:

```php
// @ Configurações TLS padrão (verificação automática de peer_name)
$Client->configure(host: 'secure.example.com', port: 443, ssl: []);

// @ Opções SSL customizadas
$Client->configure(host: 'secure.example.com', port: 443, ssl: [
   'peer_name' => 'secure.example.com',
   'verify_peer' => true,
   'verify_peer_name' => true,
]);
```

Quando `ssl` não é `null` e `peer_name` não está definido, o cliente automaticamente usa o parâmetro `host` para verificação de hostname.

## Tratamento de Redirects

O cliente segue automaticamente redirects HTTP (301, 302, 303, 307, 308) até `maxRedirects`:

```php
$Client->maxRedirects = 5;  // padrão: 10

$Response = $Client->request(method: 'GET', URI: '/old-page');
// @ Segue automaticamente o header Location
echo $Response->code;  // 200 (do destino final)
```

### Comportamento de redirect por RFC 7231

| Código | Mudança de Método | Body Preservado |
|---|---|---|
| 301, 302, 303 | Muda para GET (exceto HEAD) | Não (body limpo) |
| 307, 308 | Preservado | Sim |

## Timeouts

```php
// ? Timeout de conexão
$Client->connectTimeout = 5;  // 5 segundos

// ? Timeout de resposta
$Client->timeout = 10;        // 10 segundos

$Response = $Client->request(method: 'GET', URI: '/slow-endpoint');

if ($Response->code === 0) {
   echo $Response->status;  // 'Timeout'
}
```

## Retries

Retry automático em falha de conexão ou timeout para métodos idempotentes:

```php
$Client->maxRetries = 3;
$Client->retryDelay = 1.0;  // 1 segundo entre retries

$Response = $Client->request(method: 'GET', URI: '/unstable-endpoint');
```

Regras de retry:
- Apenas métodos idempotentes são retentados: GET, HEAD, PUT, DELETE, OPTIONS
- POST/PATCH só são retentados se a requisição nunca foi enviada (falha de conexão)
- Um delay configurável (`retryDelay`) é aplicado entre tentativas

## Modo Batch

Envie múltiplas requisições concorrentes:

```php
$Client->batch();

$Response1 = $Client->request(method: 'GET', URI: '/users');
$Response2 = $Client->request(method: 'GET', URI: '/posts');
$Response3 = $Client->request(method: 'GET', URI: '/comments');

$Client->drain();

// @ Todas as respostas agora estão populadas
echo $Response1->code;  // 200
echo $Response2->code;  // 200
echo $Response3->code;  // 200
```

## Modo Event-Driven

Registre hooks para operação totalmente assíncrona:

```php
use Bootgly\WPI\Nodes\HTTP_Client_CLI;
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Request;
use Bootgly\WPI\Nodes\HTTP_Client_CLI\Request\Response;


$Client = new HTTP_Client_CLI;
$Client->configure(host: '127.0.0.1', port: 8080);

$Client->on(
   response: function (Request $Request, Response $Response): void {
      echo "Status: {$Response->code}\n";
      echo "Body: {$Response->body}\n";
   }
);

$Client->request(method: 'GET', URI: '/');
$Client->start();
```

### Hooks Disponíveis

| Hook | Assinatura | Descrição |
|---|---|---|
| `instance` | `Closure` | Chamado na inicialização da instância do worker. |
| `connect` | `Closure($Socket, $Connection)` | Chamado quando uma conexão é estabelecida. |
| `disconnect` | `Closure` | Chamado quando uma conexão é fechada. |
| `response` | `Closure(Request, Response)` | Chamado quando uma resposta HTTP completa é recebida. |

## Suporte a 100-Continue

O cliente trata automaticamente `Expect: 100-continue` para bodies de requisição grandes:

```php
$Response = $Client->request(
   method: 'POST',
   URI: '/upload',
   headers: ['Expect' => '100-continue'],
   body: $largePayload
);
// @ Headers são enviados primeiro.
// @ Body é enviado apenas após o servidor responder com 100 Continue.
```

## Arquitetura

O HTTP Client CLI é construído sobre a infraestrutura do TCP Client CLI:

| Camada | Componente | Linhas |
|---|---|---|
| **TCP** | `TCP_Client_CLI` + Connections + Packages | ~1.200 |
| **HTTP** | `HTTP_Client_CLI` + Request + Response + Encoders/Decoders | ~2.500 |
| **Total** | Código-fonte (excluindo testes) | **~3.700** |

O mesmo event loop (`Select`) que alimenta o HTTP Server também alimenta o HTTP Client. Eles compartilham o mesmo gerenciamento de conexões e modelo de I/O non-blocking.
